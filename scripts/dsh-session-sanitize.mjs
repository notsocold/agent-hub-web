#!/usr/bin/env node
/**
 * DSH 会话数据脱敏脚本。
 *
 * DSH 的会话有两份：
 *   1. 原生运行时存储（zstd 压缩的 JSONL 帧）：`$DSH_HOME/sessions/<workspace-slug>/<session-id>/session.v4.jsonl.zstd`
 *   2. 工作区快照（纯文本 JSONL，随 git 提交）：`<workspace>/.dsh/sessions/<session-id>/session.v4.jsonl`
 *
 * 两份内容的“事件序列”必须保持一致，否则 `dsh-workspace-session` 插件在下一次
 * 同步/轮询时会把它们判定为分叉（diverged），并备份后重建出一个新会话。
 * 所以本脚本对同一会话的两份数据使用**完全相同**的替换规则，保证脱敏后仍然相等。
 *
 * 用法（默认只扫描，不写文件）：
 *   node scripts/dsh-session-sanitize.mjs                 # 扫描 ~/.dsh/sessions 全部工作区 + 本工作区快照
 *   node scripts/dsh-session-sanitize.mjs --apply         # 就地脱敏（先备份到 $DSH_HOME/.sanitize-backup/<时间>/）
 *   node scripts/dsh-session-sanitize.mjs --check         # 有命中则退出码 1（供 pre-commit 使用）
 *   node scripts/dsh-session-sanitize.mjs --staged        # 只检查已暂存的快照 blob（pre-commit 钩子使用）
 *   node scripts/dsh-session-sanitize.mjs --workspace-only
 *   node scripts/dsh-session-sanitize.mjs --exclude-id session-xxxx   # 跳过正在写入的活动会话
 *
 * 注意：活动会话（DSH 正在写入的那个）的 zstd 日志不能改，否则会丢失正在追加的事件。
 * 请在会话结束（或停掉 dsh web）后对活动会话单独再跑一次 --apply。
 */

import { readFile, writeFile, rename, readdir, stat, mkdir, copyFile } from 'node:fs/promises'
import { join, dirname, relative, sep } from 'node:path'
import { homedir } from 'node:os'
import { zstdCompressSync, zstdDecompressSync, constants } from 'node:zlib'
import { execFileSync } from 'node:child_process'

const ZSTD_MAGIC = 0xfd2fb528
const ZSTD_OPTS = { params: { [constants.ZSTD_c_checksumFlag]: 1 } }

/** 需要脱敏的密钥形态。替换值固定，保证原生/快照两侧一致。 */
const RULES = [
  { kind: 'DS_KEY', re: /sk-[A-Za-z0-9_-]{20,}/g },
  { kind: 'ZAI_KEY', re: /\b[0-9a-f]{32}\.[A-Za-z0-9]{16}\b/g },
  { kind: 'GITHUB_TOKEN', re: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g },
  { kind: 'AWS_KEY', re: /\bAKIA[0-9A-Z]{16}\b/g },
  { kind: 'GOOGLE_KEY', re: /\bAIza[0-9A-Za-z_-]{30,}\b/g },
  { kind: 'SLACK_TOKEN', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g },
]

const args = process.argv.slice(2)
const opt = {
  apply: args.includes('--apply'),
  check: args.includes('--check'),
  staged: args.includes('--staged'),
  workspaceOnly: args.includes('--workspace-only'),
  currentWorkspace: args.includes('--current-workspace'),
  excludeIds: new Set(
    args.flatMap((arg, i) => (arg === '--exclude-id' && args[i + 1] ? [args[i + 1]] : [])),
  ),
  workspace: process.cwd(),
}

const DSH_HOME = process.env.DSH_HOME || join(homedir(), '.dsh')
const NATIVE_ROOT = join(DSH_HOME, 'sessions')
const SNAPSHOT_ROOT = join(opt.workspace, '.dsh', 'sessions')

/** 单文件脱敏结果。 */
function redactText(text) {
  const counts = {}
  let next = text
  for (const { kind, re } of RULES) {
    re.lastIndex = 0
    next = next.replace(re, () => {
      counts[kind] = (counts[kind] ?? 0) + 1
      return `[REDACTED:${kind}]`
    })
  }
  return { text: next, counts }
}

/** 扫描 concatenated zstd 帧，返回每个完整帧的字节区间。 */
function scanFrames(buf) {
  const frames = []
  let offset = 0
  while (offset < buf.length) {
    const start = offset
    if (buf.length - offset < 4 || buf.readUInt32LE(offset) !== ZSTD_MAGIC) {
      throw new Error(`invalid zstd frame magic at byte ${offset}`)
    }
    offset += 4
    const descriptor = buf.readUInt8(offset)
    offset += 1
    const contentSizeFlag = descriptor >>> 6
    const singleSegment = (descriptor & 0x20) !== 0
    const checksum = (descriptor & 0x04) !== 0
    const dictionaryFlag = descriptor & 0x03
    const dictionaryBytes = dictionaryFlag === 3 ? 4 : dictionaryFlag
    const contentSizeBytes = contentSizeFlag === 0
      ? (singleSegment ? 1 : 0)
      : 1 << contentSizeFlag
    offset += (singleSegment ? 0 : 1) + dictionaryBytes + contentSizeBytes
    for (;;) {
      if (buf.length - offset < 3) throw new Error(`truncated zstd frame at byte ${offset}`)
      const blockHeader = buf.readUIntLE(offset, 3)
      offset += 3
      const lastBlock = (blockHeader & 1) !== 0
      const blockType = (blockHeader >>> 1) & 0x03
      const blockSize = blockHeader >>> 3
      if (blockType === 0x03) throw new Error(`reserved zstd block type at byte ${offset - 3}`)
      const payloadBytes = blockType === 0x01 ? 1 : blockSize
      if (buf.length - offset < payloadBytes) throw new Error(`truncated zstd block at byte ${offset}`)
      offset += payloadBytes
      if (lastBlock) break
    }
    if (checksum) {
      if (buf.length - offset < 4) throw new Error(`truncated zstd checksum at byte ${offset}`)
      offset += 4
    }
    frames.push(buf.subarray(start, offset))
  }
  return frames
}

/** 解码 zstd 会话日志为帧文本数组。 */
function decodeZstdFrames(buf) {
  return scanFrames(buf).map(frame => zstdDecompressSync(frame).toString('utf8'))
}

/** 把帧文本重新编码为 concatenated zstd 帧。 */
function encodeZstdFrames(texts) {
  return Buffer.concat(texts.map(text => zstdCompressSync(Buffer.from(text, 'utf8'), ZSTD_OPTS)))
}

/** 校验 JSONL 文本：首行 header，其余逐行 JSON，且 seq 从 0 连续。 */
function validateJsonl(text, label) {
  const lines = text.split('\n')
  if (lines.at(-1) === '') lines.pop()
  if (lines.length === 0) throw new Error(`${label}: empty log`)
  let expectedSeq = 0
  for (let i = 0; i < lines.length; i += 1) {
    let value
    try {
      value = JSON.parse(lines[i])
    } catch (error) {
      throw new Error(`${label}: line ${i + 1} is not JSON: ${error.message}`)
    }
    if (i === 0) {
      if (value?.type !== 'session') throw new Error(`${label}: first line is not a session header`)
      continue
    }
    if (value?.seq !== expectedSeq) {
      throw new Error(`${label}: line ${i + 1} has seq ${value?.seq}, expected ${expectedSeq}`)
    }
    expectedSeq += 1
  }
  return expectedSeq
}

/** 读取明文 JSONL 并脱敏。 */
async function sanitizePlainFile(file) {
  const before = await readFile(file, 'utf8')
  const { text, counts } = redactText(before)
  const hits = Object.values(counts).reduce((a, b) => a + b, 0)
  if (hits === 0) return { file, hits: 0, counts: {}, text: before, changed: false }
  // 逐行校验（快照/备份都是纯文本 JSONL）
  validateJsonl(text, relative(opt.workspace, file) || file)
  const again = redactText(text)
  if (Object.keys(again.counts).length > 0) {
    throw new Error(`${file}: redaction is not idempotent (${JSON.stringify(again.counts)})`)
  }
  return { file, hits, counts, text, changed: true }
}

/** 读取 zstd 会话日志并脱敏。 */
async function sanitizeZstdFile(file) {
  const buf = await readFile(file)
  const frames = decodeZstdFrames(buf)
  let hits = 0
  const counts = {}
  const texts = frames.map((frameText) => {
    const result = redactText(frameText)
    hits += Object.values(result.counts).reduce((a, b) => a + b, 0)
    for (const [kind, n] of Object.entries(result.counts)) counts[kind] = (counts[kind] ?? 0) + n
    return result.text
  })
  if (hits === 0) return { file, hits: 0, counts: {}, buf: null, changed: false }
  validateJsonl(texts.join(''), relative(NATIVE_ROOT, file) || file)
  const again = redactText(texts.join(''))
  if (Object.keys(again.counts).length > 0) {
    throw new Error(`${file}: redaction is not idempotent (${JSON.stringify(again.counts)})`)
  }
  return { file, hits, counts, buf: encodeZstdFrames(texts), changed: true }
}

/** 原子写回，写前备份。 */
async function applyResult(result, backupDir) {
  const rel = relative(process.cwd(), result.file)
  const backup = join(backupDir, rel.split(sep).join('__'))
  await mkdir(dirname(backup), { recursive: true })
  await copyFile(result.file, backup)
  const tmp = `${result.file}.sanitize.tmp`
  await writeFile(tmp, result.buf ?? result.text)
  await rename(tmp, result.file)
}

/** DSH 原生存储里按 cwd 编码的目录名（例如 --home-user-proj--）。 */
function nativeSlug(cwd) {
  return `--${cwd.replace(/^\/+|\/+$/g, '').replace(/[\\/]/g, '-')}--`
}

/** 收集所有需要扫描的文件。 */
async function collectTargets() {
  const targets = []
  const onlySlug = opt.currentWorkspace ? nativeSlug(opt.workspace) : undefined
  // 原生存储：~/.dsh/sessions/<workspace-slug>/<session>/session.v4.jsonl.zstd
  if (!opt.workspaceOnly) {
    let workspaces = []
    try {
      workspaces = await readdir(NATIVE_ROOT, { withFileTypes: true })
    } catch {
      workspaces = []
    }
    for (const ws of workspaces) {
      if (!ws.isDirectory()) continue
      if (onlySlug !== undefined && ws.name !== onlySlug) continue
      const dir = join(NATIVE_ROOT, ws.name)
      const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
      for (const entry of entries) {
        if (!entry.isDirectory()) continue
        if (opt.excludeIds.has(entry.name)) continue
        const file = join(dir, entry.name, 'session.v4.jsonl.zstd')
        if (await stat(file).then(() => true).catch(() => false)) targets.push({ file, kind: 'native' })
      }
    }
  }
  // 工作区快照 + 冲突备份
  const entries = await readdir(SNAPSHOT_ROOT, { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === '.backup') continue
    if (opt.excludeIds.has(entry.name)) continue
    const file = join(SNAPSHOT_ROOT, entry.name, 'session.v4.jsonl')
    if (await stat(file).then(() => true).catch(() => false)) targets.push({ file, kind: 'snapshot' })
  }
  const backupDir = join(SNAPSHOT_ROOT, '.backup')
  const backupEntries = await readdir(backupDir, { withFileTypes: true }).catch(() => [])
  for (const ts of backupEntries) {
    if (!ts.isDirectory()) continue
    const dir = join(backupDir, ts.name)
    const sessions = await readdir(dir, { withFileTypes: true }).catch(() => [])
    for (const s of sessions) {
      if (!s.isDirectory()) continue
      if (opt.excludeIds.has(s.name)) continue
      for (const name of ['native.jsonl', 'session.v4.jsonl']) {
        const file = join(dir, s.name, name)
        if (await stat(file).then(() => true).catch(() => false)) targets.push({ file, kind: 'backup' })
      }
    }
  }
  return targets
}

/** 已暂存的会话快照文件列表（相对仓库根）。 */
function stagedSnapshots() {
  const out = execFileSync('git', ['ls-files', '-z', '--cached', '--', '.dsh/sessions'], {
    cwd: opt.workspace,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  })
  return out.split('\0').filter(file => file !== '' && file.endsWith('session.v4.jsonl'))
}

/**
 * pre-commit 模式：只扫描已暂存的 blob，不碰工作区/原生存储。
 * 工作区快照被就地改写会让 dsh-workspace-session 判定为分叉，所以这里只拦截、不自动修。
 * @returns {number} 退出码，0 表示干净。
 */
function checkStaged() {
  const bad = []
  for (const file of stagedSnapshots()) {
    const blob = execFileSync('git', ['show', `:${file}`], {
      cwd: opt.workspace,
      maxBuffer: 256 * 1024 * 1024,
    })
    const { counts } = redactText(blob.toString('utf8'))
    const hits = Object.values(counts).reduce((a, b) => a + b, 0)
    if (hits > 0) bad.push({ file, hits, counts })
  }
  if (bad.length === 0) return 0
  console.error('✖ 暂存的 DSH 会话快照里仍有未脱敏的密钥：\n')
  for (const item of bad) {
    console.error(`  ${item.hits.toString().padStart(3)}  ${item.file}  ${JSON.stringify(item.counts)}`)
  }
  console.error(`
处理方式：
  1. 停掉 dsh web（或结束对应会话），运行
       node scripts/dsh-session-sanitize.mjs --current-workspace --apply
     它会同时脱敏原生 zstd 日志与工作区快照，保持两边事件序列一致；
  2. 重新 git add 后再提交。
活动会话正在被写入时不要改它的 zstd 日志，否则会丢事件。`)
  return 1
}

async function main() {
  if (opt.staged) {
    process.exitCode = checkStaged()
    return
  }
  const targets = await collectTargets()
  const changed = []
  for (const target of targets) {
    const result = target.kind === 'native'
      ? await sanitizeZstdFile(target.file)
      : await sanitizePlainFile(target.file)
    if (result.changed) changed.push({ ...result, kind: target.kind })
  }

  const totalHits = changed.reduce((sum, r) => sum + r.hits, 0)
  const kinds = {}
  for (const r of changed) {
    for (const [kind, n] of Object.entries(r.counts)) kinds[kind] = (kinds[kind] ?? 0) + n
  }
  for (const r of changed) {
    console.log(`${r.hits.toString().padStart(3)}  ${r.kind.padEnd(8)}  ${relative(process.cwd(), r.file)}  ${JSON.stringify(r.counts)}`)
  }
  console.log(`\n扫描 ${targets.length} 个文件，命中 ${changed.length} 个，密钥 ${totalHits} 处 ${JSON.stringify(kinds)}`)

  if (!opt.apply) {
    if (opt.check && changed.length > 0) process.exitCode = 1
    if (changed.length > 0) console.log('（未写入；加 --apply 执行就地脱敏）')
    return
  }

  const backupDir = join(DSH_HOME, '.sanitize-backup', new Date().toISOString().replace(/[:.]/g, '-'))
  for (const r of changed) await applyResult(r, backupDir)
  console.log(`已写入 ${changed.length} 个文件；备份在 ${backupDir}`)
}

await main()
