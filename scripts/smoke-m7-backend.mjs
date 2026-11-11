#!/usr/bin/env node
/**
 * 真实后端 M7 契约冒烟：事件回放 `event` 字段 / SSE 续流端点 / 写操作 RBAC。
 *
 * 用法：
 *   node scripts/smoke-m7-backend.mjs
 *   SMOKE_BASE_URL=http://127.0.0.1:8000/api/v1 node scripts/smoke-m7-backend.mjs
 *
 * 前置：
 *   - 后端已启动（默认 127.0.0.1:8000）；
 *   - `dev@example.com` 已由 scripts/seed_dev_account.py 创建（默认管理员）；
 *   - LLM Key 可以是占位：聊天会以 `llm_error` 结束，但事件仍会落库，
 *     足以验证续流的「回放 + 终态关闭」。
 *
 * 只依赖 Node 内置 fetch。脚本会创建一个普通 smoke 账号用于 403 断言；
 * 注册受 5 次/小时/IP 限流，已存在则直接登录。
 */

const BASE_URL = (process.env.SMOKE_BASE_URL ?? 'http://127.0.0.1:8000/api/v1').replace(/\/$/, '')
const EMAIL = process.env.SMOKE_EMAIL ?? 'dev@example.com'
const PASSWORD = process.env.SMOKE_PASSWORD ?? 'dev-password-123'
const USER_EMAIL = process.env.SMOKE_USER_EMAIL ?? 'smoke-m7@example.com'
const USER_PASSWORD = process.env.SMOKE_USER_PASSWORD ?? 'smoke-m7-password'
const STREAM_TIMEOUT_MS = 20_000

let passed = 0
let failed = 0
const failures = []

function assert(condition, message) {
  if (!condition) throw new Error(message)
  passed += 1
}

async function api(path, { method = 'GET', token, body } = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    // GET 不允许携带 body；oxlint unicorn/no-invalid-fetch-options 会拦截。
    ...(method !== 'GET' && body ? { body: JSON.stringify(body) } : {}),
  })
  const text = await response.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = text
  }
  return { status: response.status, data, headers: response.headers }
}

async function login(email, password) {
  const result = await api('/auth/login', { method: 'POST', body: { email, password } })
  assert(result.status === 200, `登录 ${email} 失败：${result.status} ${JSON.stringify(result.data)}`)
  return result.data.access_token
}

async function ensureOrdinaryUserToken() {
  const loginResult = await api('/auth/login', {
    method: 'POST',
    body: { email: USER_EMAIL, password: USER_PASSWORD },
  })
  if (loginResult.status === 200) return loginResult.data.access_token

  const register = await api('/auth/register', {
    method: 'POST',
    body: { email: USER_EMAIL, password: USER_PASSWORD, display_name: 'M7 Smoke User' },
  })
  if (register.status === 200 || register.status === 201) {
    return register.data.access_token
  }
  if (register.status === 429) {
    throw new Error(
      `注册限流，无法创建普通用户（需要手工 seed ${USER_EMAIL}）：${JSON.stringify(register.data)}`,
    )
  }
  throw new Error(`创建普通用户失败：${register.status} ${JSON.stringify(register.data)}`)
}

/**
 * 读一次 SSE 响应，直到终态事件或超时；返回 `{ frames, ended, timedOut }`。
 * 帧对象：`{ id, event, data }`。
 */
async function readSse(response, timeoutMs) {
  const frames = []
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  let buffer = ''
  let ended = false
  let timedOut = false
  const terminal = new Set(['message.done', 'error'])

  function consume(chunk) {
    buffer += chunk
    let index
    while ((index = buffer.indexOf('\n\n')) >= 0) {
      const block = buffer.slice(0, index)
      buffer = buffer.slice(index + 2)
      if (!block.trim() || block.startsWith(':')) continue
      const frame = { id: '', event: '', data: '' }
      for (const line of block.split('\n')) {
        if (line.startsWith('id:')) frame.id = line.slice(3).trim()
        else if (line.startsWith('event:')) frame.event = line.slice(6).trim()
        else if (line.startsWith('data:')) frame.data += line.slice(5).trim()
      }
      if (frame.event) frames.push(frame)
    }
  }

  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) {
        ended = true
        break
      }
      consume(decoder.decode(value, { stream: true }))
      if (frames.some((frame) => terminal.has(frame.event))) {
        ended = true
        break
      }
    }
  } catch (error) {
    if (controller.signal.aborted) timedOut = true
    else throw error
  } finally {
    clearTimeout(timer)
  }

  if (timedOut) await reader.cancel().catch(() => undefined)
  return { frames, ended, timedOut }
}

async function main() {
  console.log(`\nM7 契约冒烟 → ${BASE_URL}\n`)

  // 1. 登录并确认账号
  const token = await login(EMAIL, PASSWORD)
  const me = await api('/auth/me', { token })
  assert(me.status === 200, `GET /auth/me 失败：${me.status}`)
  assert(typeof me.data.role === 'string', 'me.role 缺失')
  console.log(`✓ 登录成功：${me.data.email}（role=${me.data.role}）`)

  // 2. 创建一次运行（LLM 允许失败；重点是事件落库）
  const chatResponse = await fetch(`${BASE_URL}/chat/stream`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify({ message: 'M7 冒烟：请回复 OK', reasoning_effort: 'low' }),
  })
  assert(chatResponse.ok, `POST /chat/stream 失败：${chatResponse.status}`)
  assert(
    (chatResponse.headers.get('content-type') ?? '').includes('text/event-stream'),
    'chat/stream Content-Type 不是 text/event-stream',
  )
  const runId = chatResponse.headers.get('x-run-id')
  assert(Boolean(runId), 'chat/stream 缺少 X-Run-ID')
  const live = await readSse(chatResponse, STREAM_TIMEOUT_MS)
  assert(live.frames.length > 0, 'chat/stream 没有收到任何事件帧')
  console.log(`✓ 创建运行 ${runId}（${live.frames.length} 帧，ended=${live.ended}）`)

  // 3. GET /runs/{id} 状态
  const run = await api(`/runs/${runId}`, { token })
  assert(run.status === 200, `GET /runs/{id} 失败：${run.status}`)
  console.log(`✓ run 状态：${run.data.status}`)

  // 4. 事件回放：event 字段
  const events = await api(`/runs/${runId}/events?limit=50`, { token })
  assert(events.status === 200, `GET /runs/{id}/events 失败：${events.status}`)
  assert(Array.isArray(events.data.items) && events.data.items.length > 0, '事件回放为空')
  for (const item of events.data.items) {
    assert(typeof item.event === 'string', `事件 seq=${item.seq} 缺少字符串 event 字段`)
    assert(!('_event' in (item.payload ?? {})), `事件 seq=${item.seq} payload 泄漏 _event`)
  }
  assert(
    events.data.items.some((item) => item.event.length > 0),
    '所有回放事件的 event 都是空串，无法驱动前端 reducer',
  )
  console.log(
    `✓ 事件回放 ${events.data.items.length} 条，event 示例：${events.data.items
      .map((item) => item.event)
      .filter(Boolean)
      .slice(0, 4)
      .join(', ')}`,
  )

  // 5. SSE 续流：回放 + 终态关闭
  const streamResponse = await fetch(`${BASE_URL}/runs/${runId}/stream?after_seq=0`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' },
  })
  assert(streamResponse.status === 200, `GET /runs/{id}/stream 失败：${streamResponse.status}`)
  assert(
    (streamResponse.headers.get('content-type') ?? '').includes('text/event-stream'),
    '续流 Content-Type 不是 text/event-stream',
  )
  assert(streamResponse.headers.get('x-run-id') === runId, '续流 X-Run-ID 与 run 不一致')
  const replay = await readSse(streamResponse, STREAM_TIMEOUT_MS)
  assert(replay.frames.length > 0, '续流没有回放任何事件')
  assert(!replay.timedOut, '续流在终态 run 上没有自行关闭（是否漏了终态早关？）')
  for (const frame of replay.frames) {
    assert(/^\d+$/.test(frame.id), `续流帧 id 不是 seq：${JSON.stringify(frame)}`)
    assert(frame.event.length > 0, `续流帧缺少 event：${JSON.stringify(frame)}`)
    assert(frame.data.length > 0, `续流帧缺少 data：${JSON.stringify(frame)}`)
  }
  const replaySeq = replay.frames.map((frame) => Number(frame.id))
  assert(
    replaySeq.every((seq, index) => index === 0 || seq > replaySeq[index - 1]),
    `续流 seq 非严格递增：${replaySeq.join(',')}`,
  )
  console.log(`✓ 续流回放 ${replay.frames.length} 帧（seq 严格递增，终态关闭）`)

  // 6. after_seq 断点：只回放之后的帧
  const afterFirst = replaySeq[0]
  const resumed = await fetch(
    `${BASE_URL}/runs/${runId}/stream?after_seq=${afterFirst}`,
    { headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' } },
  )
  assert(resumed.status === 200, `after_seq 续流失败：${resumed.status}`)
  const resumedFrames = await readSse(resumed, STREAM_TIMEOUT_MS)
  assert(
    resumedFrames.frames.every((frame) => Number(frame.id) > afterFirst),
    'after_seq 续流回放了已消费事件',
  )
  console.log(`✓ after_seq=${afterFirst} 续流 ${resumedFrames.frames.length} 帧，无重复`)

  // 7. 写操作 RBAC：普通用户 403
  const userToken = await ensureOrdinaryUserToken()
  const denied = await api('/agents', {
    method: 'POST',
    token: userToken,
    body: {
      name: 'M7 Smoke Agent',
      url: 'https://example.com/a2a',
      description: 'should be forbidden',
    },
  })
  assert(denied.status === 403, `普通用户 POST /agents 期望 403，实际 ${denied.status}`)
  assert(denied.data?.error?.code === 'forbidden', `403 code 不是 forbidden：${JSON.stringify(denied.data)}`)
  assert(
    denied.data?.error?.details?.required_role === 'admin',
    `403 details.required_role 不是 admin：${JSON.stringify(denied.data)}`,
  )
  console.log('✓ 普通用户写 agents 返回 403 forbidden + details.required_role=admin')

  // 8. 普通用户读接口仍可用
  const readAllowed = await api('/agents?limit=1', { token: userToken })
  assert(readAllowed.status === 200, `普通用户 GET /agents 期望 200，实际 ${readAllowed.status}`)
  console.log('✓ 普通用户读 agents 保持 200')
}

main()
  .catch((error) => {
    failed += 1
    failures.push(error instanceof Error ? error.message : String(error))
    console.error(`\n✗ ${error instanceof Error ? error.message : error}`)
  })
  .finally(() => {
    console.log(`\n结果：${passed} 项通过，${failed} 项失败`)
    if (failures.length > 0) {
      for (const message of failures) console.error(`- ${message}`)
      process.exitCode = 1
    }
  })
