#!/usr/bin/env node
/**
 * Agent Hub Web：Nginx SSE 反代行为验证 / deploy/nginx.conf 语法检查。
 *
 * 背景（2026-11-11 实测约束）：
 * - 本机 dev_nginx 的 /etc/nginx 是宿主目录只读 bind mount，不能改 conf.d、不能 reload 注入；
 * - 主 nginx 没有 server 配置，实际不监听 80，因此容器内 80 可用于临时实例；
 * - 宿主只能通过映射端口（默认 127.0.0.1:18088）访问容器 80；
 * - 宿主设置了 HTTP_PROXY 与 NODE_OPTIONS=--use-env-proxy，必须绕过代理。
 *
 * 方案：
 *   1. 容器 /tmp/agent-hub-sse-verify/ 写独立 nginx 配置与假 SSE 源脚本；
 *   2. busybox nc -lk -p 18999 -e serve.sh 提供 5 帧、每秒 1 帧的 text/event-stream；
 *   3. nginx -c /tmp/.../sse.conf 启动临时实例（独立 pid/error_log），不触碰主 nginx；
 *   4. 宿主 Node fetch（NO_PROXY=*）分别读取 /sse（关闭缓冲）与 /sse-buffered（默认缓冲），
 *      记录每帧到达时间并断言；
 *   5. finally 清理临时 nginx/nc/目录，并确认端口释放。
 *
 * 用法：
 *   node scripts/verify-nginx-sse.mjs
 *   node scripts/verify-nginx-sse.mjs --check-deploy
 *
 * 环境变量：
 *   NGINX_CONTAINER    容器名，默认 dev_nginx
 *   NGINX_HOST_PORT    宿主映射端口；默认从 docker port 自动读取，回退 18088
 *   NGINX_SOURCE_PORT  容器内假 SSE 源端口，默认 18999
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { performance } from 'node:perf_hooks'

// 宿主设置了 HTTP_PROXY / NODE_OPTIONS=--use-env-proxy；显式绕过后再发请求。
process.env.NO_PROXY = '*'
process.env.no_proxy = '*'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = dirname(SCRIPT_DIR)
const DEPLOY_CONF = join(REPO_ROOT, 'deploy', 'nginx.conf')

const CONTAINER = (process.env.NGINX_CONTAINER || 'dev_nginx').trim()
const SOURCE_PORT = Number(process.env.NGINX_SOURCE_PORT || 18999)
const FRAME_COUNT = 5
const REMOTE_DIR = '/tmp/agent-hub-sse-verify'
const CHECK_REMOTE_DIR = '/tmp/agent-hub-sse-verify-deploy'
const CHECK_DEPLOY = process.argv.includes('--check-deploy')

const state = {
  hostPort: Number(process.env.NGINX_HOST_PORT || 0),
  nginxPidFile: `${REMOTE_DIR}/nginx.pid`,
  sourcePidFile: `${REMOTE_DIR}/nc.pid`,
  startedNginx: false,
  startedSource: false,
  cleaned: false,
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function log(message = '') {
  console.log(message)
}

function fail(message) {
  throw new Error(message)
}

function formatMs(value) {
  return Number.isFinite(value) ? `${value.toFixed(0)} ms` : 'n/a'
}

// ---------------------------------------------------------------------------
// docker / 容器内命令
// ---------------------------------------------------------------------------

function docker(args, options = {}) {
  const result = spawnSync('docker', args, {
    encoding: 'utf8',
    input: options.input,
    timeout: options.timeout ?? 30_000,
    env: process.env,
  })
  if (result.error) {
    fail(`执行 docker ${args.join(' ')} 失败：${result.error.message}`)
  }
  return result
}

function dockerExec(script, options = {}) {
  const args = ['exec']
  if (options.detached) args.push('-d')
  else if (options.input !== undefined) args.push('-i')
  args.push(CONTAINER, 'sh', '-c', script)
  return docker(args, options)
}

function dockerExecChecked(script, options = {}) {
  const result = dockerExec(script, options)
  if (result.status !== 0) {
    fail(
      `容器内命令失败（exit ${result.status}）：${script}\n` +
        `${(result.stderr || result.stdout || '').trim()}`,
    )
  }
  return result
}

function resetRemoteDir(dir) {
  const result = dockerExec(`rm -rf '${dir}' && mkdir -p '${dir}'`)
  if (result.status !== 0) {
    fail(`无法创建容器内临时目录 ${dir}：${(result.stderr || result.stdout).trim()}`)
  }
}

function writeRemoteFile(path, content, mode = '644') {
  const result = dockerExec(`cat > '${path}' && chmod ${mode} '${path}'`, { input: content })
  if (result.status !== 0) {
    fail(`写入容器文件失败 ${path}：${(result.stderr || result.stdout).trim()}`)
  }
}

function readRemotePid(pidFile) {
  const result = dockerExec(`cat '${pidFile}' 2>/dev/null || true`)
  const value = result.stdout.trim()
  return /^\d+$/.test(value) ? Number(value) : null
}

function killRemotePid(pid, signal = 'TERM') {
  dockerExec(`kill -${signal} ${pid} 2>/dev/null || true`)
}

function remotePortListening(port) {
  const result = dockerExec(`netstat -ltn 2>/dev/null | grep -qE '[:.]${port}[[:space:]]'`)
  return result.status === 0
}

function remotePortOwner(port) {
  return dockerExec(
    `netstat -ltnp 2>/dev/null | grep -E '[:.]${port}[[:space:]]' || true`,
  ).stdout.trim()
}

function remoteDebug() {
  const errorLog = dockerExec(
    `tail -n 30 '${REMOTE_DIR}/nginx-error.log' 2>/dev/null || true`,
  ).stdout.trim()
  const processes = dockerExec(
    `ps 2>/dev/null | grep -E 'nginx|nc -lk' | grep -v grep || true`,
  ).stdout.trim()
  const parts = []
  if (errorLog) parts.push(`--- 容器内 nginx-error.log（末尾）---\n${errorLog}`)
  if (processes) parts.push(`--- 容器内相关进程 ---\n${processes}`)
  return parts.join('\n')
}

function assertPortFree(port, label) {
  if (!remotePortListening(port)) return
  const owner = remotePortOwner(port)
  fail(
    [
      `容器 ${CONTAINER} 内端口 ${port} 已被占用（${label}），拒绝继续；不会 kill 占用进程。`,
      owner ? `占用信息：\n${owner}` : '',
      '处理建议：',
      `  - 若主 nginx 已配置 listen ${port}，请先调整/停止主配置，再运行本验证；`,
      `  - 若确认是上次验证残留，可检查容器内 ${REMOTE_DIR} 下的 pid 文件并手动清理。`,
    ]
      .filter(Boolean)
      .join('\n'),
  )
}

async function waitFor(predicate, timeoutMs, intervalMs = 200) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (predicate()) return true
    await sleep(intervalMs)
  }
  return predicate()
}

async function waitForPortFree(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (!remotePortListening(port)) return true
    await sleep(200)
  }
  return !remotePortListening(port)
}

// ---------------------------------------------------------------------------
// 临时实例配置
// ---------------------------------------------------------------------------

function buildServeScript() {
  // String.raw 保留 \r\n 等转义，避免 JS 模板字符串把 shell 转义提前处理掉。
  return String.raw`#!/bin/sh
# 先读掉 HTTP 请求头，再逐帧发送。
# 若 nginx 关闭上游连接时仍有未读入站数据，内核会发 RST，
# 默认缓冲路径（/sse-buffered）可能因此被 nginx 记为 502。
while IFS= read -r line; do
  line=$(printf '%s' "$line" | tr -d '\r')
  [ -z "$line" ] && break
done

printf 'HTTP/1.1 200 OK\r\n'
printf 'Content-Type: text/event-stream\r\n'
printf 'Cache-Control: no-cache\r\n'
printf 'Connection: close\r\n'
printf '\r\n'

# 5 帧，每帧间隔 1 秒；最后一帧后也 sleep，让缓冲路径在 ~5s 时才收到 EOF。
i=1
while [ "$i" -le 5 ]; do
  printf 'data: %s\n\n' "$i"
  sleep 1
  i=$((i + 1))
done
`
}

function buildSseConfig() {
  return String.raw`# 临时验证实例：只监听容器 80，独立 pid/error_log，不触碰主 nginx。
worker_processes 1;
pid ${REMOTE_DIR}/nginx.pid;
error_log ${REMOTE_DIR}/nginx-error.log warn;

events {
    worker_connections 128;
}

http {
    access_log off;
    default_type text/plain;

    server {
        listen 80;
        server_name _;

        location = /verify-nginx-health {
            return 200 "ok";
        }

        # 关闭缓冲：nginx 收到上游 chunk 就立即转发，不攒 buffer、不等 EOF。
        location = /sse {
            proxy_pass http://127.0.0.1:${SOURCE_PORT};
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header Connection "";
            proxy_buffering off;
            proxy_cache off;
            gzip off;
            proxy_read_timeout 3600s;
            proxy_send_timeout 3600s;
        }

        # 默认 proxy_buffering on：nginx 缓冲响应，直到上游关闭才把 5 帧一起下发。
        location = /sse-buffered {
            proxy_pass http://127.0.0.1:${SOURCE_PORT};
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header Connection "";
            gzip off;
            proxy_read_timeout 3600s;
            proxy_send_timeout 3600s;
        }
    }
}
`
}

// ---------------------------------------------------------------------------
// 环境检查与临时进程
// ---------------------------------------------------------------------------

function ensureEnvironment() {
  const version = docker(['version', '--format', '{{.Server.Version}}'], { timeout: 15_000 })
  if (version.status !== 0) {
    fail(
      `Docker 不可用：${(version.stderr || version.stdout || '').trim()}\n` +
        '请先启动 Docker Desktop，并确认容器已运行。',
    )
  }

  const running = docker(['inspect', '-f', '{{.State.Running}}', CONTAINER], { timeout: 15_000 })
  if (running.status !== 0) {
    fail(`容器 ${CONTAINER} 不存在；可通过 NGINX_CONTAINER 指定其他容器。`)
  }
  if (running.stdout.trim() !== 'true') {
    fail(`容器 ${CONTAINER} 未运行。`)
  }

  const tools = dockerExec(
    'command -v nginx >/dev/null && command -v nc >/dev/null && command -v netstat >/dev/null && echo ok',
  )
  if (tools.status !== 0 || !tools.stdout.includes('ok')) {
    fail(`容器 ${CONTAINER} 缺少 nginx、busybox nc 或 netstat。`)
  }

  const nginxVersion = dockerExec('nginx -v 2>&1')
    .stdout.trim()
    .replace(/^nginx version:\s*/, '')

  const port = docker(['port', CONTAINER, '80/tcp'])
  let detectedPort = null
  if (port.status === 0) {
    for (const line of port.stdout.split('\n')) {
      const match = line.trim().match(/:(\d+)$/)
      if (match) {
        detectedPort = Number(match[1])
        break
      }
    }
  }
  state.hostPort = Number(process.env.NGINX_HOST_PORT || detectedPort || 18088)
  if (!Number.isInteger(state.hostPort) || state.hostPort <= 0) {
    fail(`无法确定宿主映射端口；请设置 NGINX_HOST_PORT。`)
  }

  return { nginxVersion, dockerVersion: version.stdout.trim() }
}

async function startSource() {
  log(`\n==> 启动假 SSE 源（容器内 127.0.0.1:${SOURCE_PORT}）`)
  writeRemoteFile(`${REMOTE_DIR}/serve.sh`, buildServeScript(), '755')
  writeRemoteFile(`${REMOTE_DIR}/sse.conf`, buildSseConfig(), '644')

  const syntax = dockerExec(`sh -n '${REMOTE_DIR}/serve.sh'`)
  if (syntax.status !== 0) {
    fail(`serve.sh 语法检查失败：${(syntax.stderr || syntax.stdout).trim()}`)
  }

  assertPortFree(SOURCE_PORT, '假 SSE 源')

  const start = dockerExec(
    `echo $$ > '${state.sourcePidFile}'; exec nc -lk -p ${SOURCE_PORT} -e '${REMOTE_DIR}/serve.sh'`,
    { detached: true },
  )
  if (start.status !== 0) {
    fail(`启动假 SSE 源失败：${(start.stderr || start.stdout).trim()}`)
  }

  if (!(await waitFor(() => remotePortListening(SOURCE_PORT), 5_000))) {
    fail(`假 SSE 源未能在 5s 内监听 ${SOURCE_PORT}。\n${remoteDebug()}`)
  }
  state.startedSource = true
  log(`    已监听，pid=${readRemotePid(state.sourcePidFile) ?? 'unknown'}`)
}

async function waitForHostHealth(timeoutMs) {
  const url = `http://127.0.0.1:${state.hostPort}/verify-nginx-health`
  const deadline = Date.now() + timeoutMs
  let lastError = ''
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1_000), cache: 'no-store' })
      if (response.ok) {
        await response.text()
        return
      }
      lastError = `HTTP ${response.status}`
    } catch (error) {
      lastError = error.message
    }
    await sleep(200)
  }
  fail(
    `宿主无法访问 ${url}（${lastError}）。检查容器 80 端口映射与 Docker Desktop 转发。\n${remoteDebug()}`,
  )
}

async function startNginx() {
  log('\n==> 启动临时 nginx 实例（nginx -c /tmp/.../sse.conf，独立 pid/error_log）')
  assertPortFree(80, '临时 nginx 需要监听')

  const test = dockerExec(`nginx -t -c '${REMOTE_DIR}/sse.conf' 2>&1`)
  if (test.status !== 0) {
    fail(`临时 nginx 配置语法检查失败：\n${test.stdout.trim()}`)
  }

  const start = dockerExec(`nginx -c '${REMOTE_DIR}/sse.conf'`, { detached: true })
  if (start.status !== 0) {
    fail(`启动临时 nginx 失败：${(start.stderr || start.stdout).trim()}`)
  }

  if (!(await waitFor(() => readRemotePid(state.nginxPidFile) !== null, 10_000))) {
    fail(`临时 nginx 未启动（pid 文件未出现）。\n${remoteDebug()}`)
  }
  state.startedNginx = true

  if (!(await waitFor(() => remotePortListening(80), 10_000))) {
    fail(`临时 nginx 未监听 80。\n${remoteDebug()}`)
  }
  log(`    已监听，pid=${readRemotePid(state.nginxPidFile)}`)

  await waitForHostHealth(5_000)
  log(`    宿主健康检查通过：http://127.0.0.1:${state.hostPort}/verify-nginx-health`)
}

// ---------------------------------------------------------------------------
// 宿主 SSE 客户端与断言
// ---------------------------------------------------------------------------

async function collectFrames(pathname, label) {
  const url = `http://127.0.0.1:${state.hostPort}${pathname}`
  log(`\n==> 采集 ${label}：${url}`)
  const startedAt = performance.now()

  let response
  try {
    response = await fetch(url, {
      headers: { Accept: 'text/event-stream', 'Cache-Control': 'no-cache' },
      cache: 'no-store',
      signal: AbortSignal.timeout(20_000),
    })
  } catch (error) {
    fail(
      `请求 ${url} 失败：${error.message}\n` +
        `提示：脚本已设置 NO_PROXY=*；请确认 ${CONTAINER} 的 80 端口映射到宿主 ${state.hostPort}。`,
    )
  }

  if (!response.ok) fail(`请求 ${url} 返回 HTTP ${response.status}`)
  if (!response.body) fail(`请求 ${url} 没有响应体`)

  const contentType = response.headers.get('content-type') || ''
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  const frames = []
  let buffer = ''
  let firstChunkAt = null
  let byteCount = 0

  try {
    while (frames.length < FRAME_COUNT) {
      const { value, done } = await reader.read()
      if (done) break
      if (firstChunkAt === null) firstChunkAt = performance.now() - startedAt
      byteCount += value.byteLength
      buffer += decoder.decode(value, { stream: true })

      let boundary = buffer.indexOf('\n\n')
      while (boundary !== -1) {
        const rawEvent = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary + 2)
        const dataLines = rawEvent
          .split(/\r?\n/)
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trimStart())
        if (dataLines.length > 0) {
          frames.push({ t: performance.now() - startedAt, data: dataLines.join('\n') })
        }
        boundary = buffer.indexOf('\n\n')
      }
    }
  } finally {
    try {
      await reader.cancel()
    } catch {
      // 主动关闭连接失败不影响已采集的计时结果。
    }
  }

  return {
    url,
    status: response.status,
    contentType,
    firstChunkAt,
    byteCount,
    frames,
    elapsed: performance.now() - startedAt,
  }
}

function evaluateStreaming(result) {
  const problems = []
  if (result.frames.length !== FRAME_COUNT) {
    problems.push(`期望 ${FRAME_COUNT} 帧，实际收到 ${result.frames.length} 帧`)
  }

  const times = result.frames.map((frame) => frame.t)
  const gaps = []
  for (let index = 1; index < times.length; index += 1) {
    gaps.push(times[index] - times[index - 1])
  }
  const minGap = gaps.length > 0 ? Math.min(...gaps) : Number.NaN
  const span = times.length > 1 ? times[times.length - 1] - times[0] : Number.NaN

  if (!(minGap >= 500)) {
    problems.push(`相邻帧最小间隔 ${formatMs(minGap)}，未达到 >= 500 ms`)
  }
  if (!(span >= 3_000)) {
    problems.push(`5 帧跨度 ${formatMs(span)}，未达到 >= 3000 ms`)
  }

  return { problems, minGap, span }
}

function evaluateBuffered(result) {
  const problems = []
  if (result.frames.length !== FRAME_COUNT) {
    problems.push(`期望 ${FRAME_COUNT} 帧，实际收到 ${result.frames.length} 帧`)
  }

  const times = result.frames.map((frame) => frame.t)
  const first = times.length > 0 ? times[0] : Number.NaN
  const spread = times.length > 1 ? times[times.length - 1] - times[0] : 0
  const ok = spread <= 1_000 || first >= 4_000
  if (!ok) {
    problems.push(
      `5 帧跨度 ${formatMs(spread)} 未在 <= 1000 ms 内，且首帧延迟 ${formatMs(first)} 未达到 >= 4000 ms`,
    )
  }

  return { problems, first, spread }
}

function printTimeline(result) {
  log(`  HTTP ${result.status}，Content-Type: ${result.contentType || '(无)'}`)
  log(`  首个响应体块：${formatMs(result.firstChunkAt)}；响应体字节数：${result.byteCount}`)
  log('  逐帧时间线：')
  if (result.frames.length === 0) {
    log('    （未收到 data 帧）')
    return
  }
  for (let index = 0; index < result.frames.length; index += 1) {
    const frame = result.frames[index]
    const delta = index === 0 ? frame.t : frame.t - result.frames[index - 1].t
    log(
      `    #${index + 1}  +${frame.t.toFixed(0).padStart(5)} ms  ` +
        `Δ${delta.toFixed(0).padStart(5)} ms  data: ${frame.data}`,
    )
  }
}

// ---------------------------------------------------------------------------
// --check-deploy：校验 deploy/nginx.conf 语法 + 续流 SSE location 静态断言
// ---------------------------------------------------------------------------

function indentBlock(text, spaces) {
  const prefix = ' '.repeat(spaces)
  return text
    .split('\n')
    .map((line) => (line.trim() ? prefix + line : line))
    .join('\n')
}

function buildCheckConfig(source) {
  let config = source
  let wrapped = false
  let upstreamInjected = false

  // deploy/nginx.conf 是完整 nginx.conf；若用户改成 server 片段，这里补 events/http 外壳。
  if (!/^\s*http\s*\{/m.test(config)) {
    config = `worker_processes 1;\nevents {\n    worker_connections 128;\n}\nhttp {\n    include /etc/nginx/mime.types;\n    default_type application/octet-stream;\n\n${indentBlock(config, 4)}\n}\n`
    wrapped = true
  }

  // 补 upstream：语法检查阶段不依赖后端 DNS/可达性，统一指向 127.0.0.1:8000。
  if (!/upstream\s+agent-hub-backend\s*\{/.test(config)) {
    config = config.replace(
      /http\s*\{/,
      'http {\n    upstream agent-hub-backend {\n        server 127.0.0.1:8000;\n        keepalive 32;\n    }\n',
    )
    upstreamInjected = true
  }

  // 补 root：统一改到容器内临时目录，避免依赖部署机上的静态资源路径。
  const htmlDir = `${CHECK_REMOTE_DIR}/html`
  const rootPattern = /^(\s*)root\s+[^;]+;/m
  const rootReplaced = rootPattern.test(config)
  if (rootReplaced) {
    config = config.replace(rootPattern, (_match, indent) => `${indent}root ${htmlDir};`)
  } else {
    config = config.replace(/server\s*\{/, `server {\n        root ${htmlDir};`)
  }

  return { config, wrapped, upstreamInjected, rootReplaced, htmlDir }
}

// ---------------------------------------------------------------------------
// --check-deploy：续流 SSE location 静态断言
// ---------------------------------------------------------------------------

const RUN_STREAM_LOCATION_EXPECTED = 'location ~ ^/api/v1/runs/[0-9a-fA-F-]+/stream$'

// 续流端点与聊天流共用同一组长连接参数；缺一项都可能退化为缓冲或 60s 截断。
const RUN_STREAM_REQUIRED_DIRECTIVES = [
  { label: 'proxy_http_version 1.1', pattern: /^[ \t]*proxy_http_version[ \t]+1\.1[ \t]*;/m },
  { label: 'proxy_buffering off', pattern: /^[ \t]*proxy_buffering[ \t]+off[ \t]*;/m },
  { label: 'proxy_cache off', pattern: /^[ \t]*proxy_cache[ \t]+off[ \t]*;/m },
  { label: 'gzip off', pattern: /^[ \t]*gzip[ \t]+off[ \t]*;/m },
  {
    label: 'proxy_read_timeout 3600s',
    pattern: /^[ \t]*proxy_read_timeout[ \t]+3600s[ \t]*;/m,
  },
  {
    label: 'proxy_send_timeout 3600s',
    pattern: /^[ \t]*proxy_send_timeout[ \t]+3600s[ \t]*;/m,
  },
  {
    label: 'proxy_set_header Connection ""',
    pattern: /^[ \t]*proxy_set_header[ \t]+Connection[ \t]+(?:""|'')[ \t]*;/m,
  },
]

// 从 location 的起始花括号开始，按花括号配对截取块内文本（跳过注释与引号）。
function extractBracedBlock(source, openBraceIndex) {
  let depth = 0
  let quote = ''
  let inComment = false
  for (let index = openBraceIndex; index < source.length; index += 1) {
    const char = source[index]
    if (inComment) {
      if (char === '\n') inComment = false
      continue
    }
    if (quote) {
      if (char === quote) quote = ''
      continue
    }
    if (char === '#') {
      inComment = true
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      continue
    }
    if (char === '{') {
      depth += 1
    } else if (char === '}') {
      depth -= 1
      if (depth === 0) {
        return { text: source.slice(openBraceIndex + 1, index) }
      }
    }
  }
  return null
}

// 只认正则 location（~ / ~*）；prefix 或精确匹配无法覆盖 UUID 路径。
function findRunStreamLocation(source) {
  const locationPattern = /^[ \t]*location[ \t]+([^{\n]+?)[ \t]*\{/gm
  let match
  while ((match = locationPattern.exec(source)) !== null) {
    const header = match[1].trim()
    const tokens = header.split(/\s+/)
    const isRegex = tokens[0] === '~' || tokens[0] === '~*'
    const uri = tokens.slice(1).join(' ')
    if (!isRegex || !uri.includes('/api/v1/runs/') || !uri.includes('/stream')) continue

    const openBraceIndex = match.index + match[0].length - 1
    const block = extractBracedBlock(source, openBraceIndex)
    return {
      header,
      line: source.slice(0, match.index).split('\n').length,
      block: block ? block.text : null,
    }
  }
  return null
}

function checkDeployStaticConfig(source) {
  const problems = []

  // /api/ 若带 ^~，会先于正则 location 命中，续流就退回 60s 超时与默认缓冲。
  if (/^[ \t]*location[ \t]+\^~[ \t]+\/api(?:\/|[ \t{])/m.test(source)) {
    problems.push(
      '检测到 location ^~ /api/：^~ 前缀会优先于正则 location，续流 SSE 专用参数将不生效；请移除 ^~',
    )
  }

  const location = findRunStreamLocation(source)
  if (!location) {
    problems.push(
      `缺少续流 SSE location（期望形如：${RUN_STREAM_LOCATION_EXPECTED} { ... }，且必须是正则 location 才能优先于 /api/）`,
    )
    return problems
  }

  log(`  - 找到续流 location（第 ${location.line} 行）：location ${location.header}`)
  const normalizedHeader = location.header.replace(/[ \t]+/g, ' ').trim()
  const expectedHeader = RUN_STREAM_LOCATION_EXPECTED.replace(/^location[ \t]+/, '')
  if (normalizedHeader !== expectedHeader) {
    problems.push(
      `续流 location 正则与期望不一致（当前：${location.header}；期望：${expectedHeader}）。` +
        '必须锚定 ^...$ 且使用 UUID 字符集，过宽/漏锚定会误匹配或漏匹配',
    )
  }
  if (!location.block) {
    problems.push(`续流 location（第 ${location.line} 行）花括号不匹配，无法解析配置块`)
    return problems
  }

  for (const directive of RUN_STREAM_REQUIRED_DIRECTIVES) {
    if (directive.pattern.test(location.block)) {
      log(`    ✓ ${directive.label}`)
    } else {
      log(`    ✗ ${directive.label}`)
      problems.push(`续流 location 块内缺少 ${directive.label}`)
    }
  }

  return problems
}

async function checkDeploy() {
  log('\n==> --check-deploy：校验 deploy/nginx.conf 语法 + 续流 SSE location 静态断言')
  if (!existsSync(DEPLOY_CONF)) {
    fail(`找不到交付配置：${DEPLOY_CONF}`)
  }

  const source = readFileSync(DEPLOY_CONF, 'utf8')
  log(`  交付文件：${DEPLOY_CONF}`)

  log('  [静态断言] 续流 SSE location（/api/v1/runs/{run_id}/stream）')
  const staticProblems = checkDeployStaticConfig(source)
  if (staticProblems.length > 0) {
    log('  [FAIL] 静态断言未通过：')
    for (const problem of staticProblems) log(`    ✗ ${problem}`)
    fail(`deploy/nginx.conf 静态断言未通过（${staticProblems.length} 项）`)
  }
  log(
    `  [PASS] 续流 location 存在，${RUN_STREAM_REQUIRED_DIRECTIVES.length} 项 SSE 指令齐全，` +
      '/api/ 未使用 ^~ 抢占',
  )

  const { config, wrapped, upstreamInjected, rootReplaced, htmlDir } = buildCheckConfig(source)

  log(
    `  - ${wrapped ? '检测到 server 片段，已补 events/http 外壳' : '已是完整 nginx.conf（含 events/http）'}`,
  )
  log(
    `  - ${
      upstreamInjected
        ? '缺少 upstream agent-hub-backend，已补 server 127.0.0.1:8000'
        : 'upstream agent-hub-backend 已存在（保留原地址）'
    }`,
  )
  log(
    `  - ${
      rootReplaced
        ? `root 已替换为容器内临时目录 ${htmlDir}`
        : `缺少 root，已补容器内临时目录 ${htmlDir}`
    }`,
  )

  resetRemoteDir(CHECK_REMOTE_DIR)
  dockerExecChecked(`mkdir -p '${htmlDir}'`)
  writeRemoteFile(`${CHECK_REMOTE_DIR}/deploy-check.conf`, config)

  const test = dockerExec(`nginx -t -c '${CHECK_REMOTE_DIR}/deploy-check.conf' 2>&1`)
  const output = (test.stdout || '').trim()
  log('  nginx -t 输出：')
  for (const line of output.split('\n')) {
    if (line.trim()) log(`    ${line.trim()}`)
  }

  if (test.status !== 0) {
    fail('deploy/nginx.conf 语法检查未通过')
  }
  log(
    '\n[PASS] deploy/nginx.conf 语法检查通过，续流 SSE location 静态断言通过' +
      '（不监听端口、不连接上游）',
  )
  return 0
}

// ---------------------------------------------------------------------------
// 清理
// ---------------------------------------------------------------------------

function killLeftoverServeProcesses() {
  const result = dockerExec(
    `ps 2>/dev/null | grep -F '${REMOTE_DIR}/serve.sh' | grep -v grep || true`,
  )
  const lines = result.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  let killed = 0
  for (const line of lines) {
    const pid = Number(line.split(/\s+/)[0])
    if (Number.isInteger(pid) && pid > 1) {
      killRemotePid(pid, 'TERM')
      killed += 1
    }
  }
  return killed
}

async function cleanup() {
  if (state.cleaned) return []
  state.cleaned = true
  const problems = []

  log('\n==> 清理临时进程与文件')

  // 1. 临时 nginx（只在本次确实启动过时读 pid 文件，避免误杀上一次遗留的进程）
  try {
    if (!state.startedNginx) {
      log('  - 本次未启动临时 nginx，跳过')
    } else {
      const pid = readRemotePid(state.nginxPidFile)
      if (pid) {
      killRemotePid(pid, 'TERM')
      let freed = await waitForPortFree(80, 5_000)
      if (!freed) {
        killRemotePid(pid, 'KILL')
        await sleep(300)
        freed = await waitForPortFree(80, 2_000)
      }
        if (!freed) problems.push('临时 nginx 已终止但容器 80 端口仍在监听')
        else log('  - 临时 nginx 已停止，容器 80 端口已释放')
      } else {
        problems.push('临时 nginx 已启动但找不到 pid 文件，无法确认清理')
      }
    }
  } catch (error) {
    problems.push(`停止临时 nginx 失败：${error.message}`)
  }

  // 2. nc -e 可能派生的 serve.sh 子进程（只在启动过源时存在）
  try {
    if (state.startedSource) {
      const leftover = killLeftoverServeProcesses()
      if (leftover > 0) log(`  - 已终止残留 serve.sh 进程 ${leftover} 个`)
    }
  } catch (error) {
    problems.push(`清理 serve.sh 残留进程失败：${error.message}`)
  }

  // 3. 假 SSE 源（同样只清理本次启动的）
  try {
    if (!state.startedSource) {
      log(`  - 本次未启动假 SSE 源，跳过`)
    } else {
      const pid = readRemotePid(state.sourcePidFile)
      if (pid) {
      killRemotePid(pid, 'TERM')
      let freed = await waitForPortFree(SOURCE_PORT, 5_000)
      if (!freed) {
        killRemotePid(pid, 'KILL')
        await sleep(300)
        freed = await waitForPortFree(SOURCE_PORT, 2_000)
      }
        if (!freed) problems.push(`假 SSE 源已终止但容器 ${SOURCE_PORT} 端口仍在监听`)
        else log(`  - 假 SSE 源已停止，容器 ${SOURCE_PORT} 端口已释放`)
      } else {
        problems.push('假 SSE 源已启动但找不到 pid 文件，无法确认清理')
      }
    }
  } catch (error) {
    problems.push(`停止假 SSE 源失败：${error.message}`)
  }

  // 4. 临时目录
  try {
    dockerExec(`rm -rf '${REMOTE_DIR}' '${CHECK_REMOTE_DIR}'`)
    const existing = dockerExec(
      `for p in '${REMOTE_DIR}' '${CHECK_REMOTE_DIR}'; do [ -e "$p" ] && echo "$p"; done`,
    ).stdout.trim()
    if (existing) problems.push(`容器内临时目录未删除：${existing}`)
    else log('  - 已删除容器内临时目录 /tmp/agent-hub-sse-verify*')
  } catch (error) {
    problems.push(`删除临时目录失败：${error.message}`)
  }

  return problems
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

async function runVerify() {
  assertPortFree(80, '临时 nginx 需要监听')
  resetRemoteDir(REMOTE_DIR)

  await startSource()
  await startNginx()

  const sse = await collectFrames('/sse', '逐帧路径（proxy_buffering off）')
  const sseResult = evaluateStreaming(sse)
  log('\n--- /sse 结果 ---')
  printTimeline(sse)
  if (sseResult.problems.length === 0) {
    log(
      `  [PASS] 相邻帧最小间隔 ${formatMs(sseResult.minGap)} >= 500 ms，` +
        `5 帧跨度 ${formatMs(sseResult.span)} >= 3000 ms`,
    )
  } else {
    log('  [FAIL]')
    for (const problem of sseResult.problems) log(`    ✗ ${problem}`)
  }

  const buffered = await collectFrames('/sse-buffered', '缓冲路径（默认 proxy_buffering on）')
  const bufferedResult = evaluateBuffered(buffered)
  log('\n--- /sse-buffered 结果 ---')
  printTimeline(buffered)
  if (bufferedResult.problems.length === 0) {
    log(
      `  [PASS] 5 帧跨度 ${formatMs(bufferedResult.spread)} <= 1000 ms，` +
        `首帧延迟 ${formatMs(bufferedResult.first)}（缓冲路径集中到达）`,
    )
  } else {
    log('  [FAIL]')
    for (const problem of bufferedResult.problems) log(`    ✗ ${problem}`)
  }

  const problems = [
    ...sseResult.problems.map((problem) => `/sse：${problem}`),
    ...bufferedResult.problems.map((problem) => `/sse-buffered：${problem}`),
  ]

  log('\n=== 结论 ===')
  if (problems.length === 0) {
    log('PASS：/sse 逐帧到达，/sse-buffered 集中到达，SSE 关键指令生效。')
    return 0
  }
  log(`FAIL：${problems.length} 项断言未通过。`)
  for (const problem of problems) log(`  ✗ ${problem}`)
  return 1
}

async function main() {
  const environment = ensureEnvironment()
  log('=== Agent Hub Nginx SSE 验证 ===')
  log(`容器：${CONTAINER}（${environment.nginxVersion}）`)
  log(`宿主入口：http://127.0.0.1:${state.hostPort} -> 容器 80`)
  if (!CHECK_DEPLOY) {
    log(`临时目录：${REMOTE_DIR}`)
    log('宿主已设置 HTTP_PROXY；脚本内 NO_PROXY=*，客户端直连 127.0.0.1。')
  }

  if (CHECK_DEPLOY) {
    return checkDeploy()
  }
  return runVerify()
}

// Node 默认收到 SIGINT/SIGTERM 会直接退出、不执行 finally，这里显式清理后再退出。
let interrupted = false
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    if (interrupted) return
    interrupted = true
    console.error(`\n[中断] 收到 ${signal}，正在清理临时进程与文件...`)
    void cleanup()
      .then((problems) => {
        for (const problem of problems) console.error(`  - ${problem}`)
      })
      .catch((error) => console.error(`[WARN] 清理异常：${error?.message ?? error}`))
      .finally(() => process.exit(130))
  })
}

let exitCode = 1
try {
  exitCode = await main()
} catch (error) {
  console.error(`\n[FAIL] ${error instanceof Error ? error.message : String(error)}`)
  exitCode = 1
} finally {
  try {
    const cleanupProblems = await cleanup()
    if (cleanupProblems.length > 0) {
      console.error('\n[WARN] 清理未完成：')
      for (const problem of cleanupProblems) console.error(`  - ${problem}`)
      if (exitCode === 0) exitCode = 1
    }
  } catch (error) {
    console.error(`\n[WARN] 清理异常：${error instanceof Error ? error.message : String(error)}`)
    if (exitCode === 0) exitCode = 1
  }
}

log(`\n退出码：${exitCode}`)
process.exit(exitCode)
