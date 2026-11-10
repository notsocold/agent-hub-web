#!/usr/bin/env node
/**
 * 真实后端 M4 冒烟：知识库 RAG（上传 / 列表 / 检索 / 重试 / 删除 / 重建权限）。
 *
 * 默认直连后端；也可以走 Vite 代理：
 *   SMOKE_BASE_URL=http://127.0.0.1:8000/api/v1 pnpm smoke:m4
 *   SMOKE_BASE_URL=http://127.0.0.1:5173/api/v1 pnpm smoke:m4
 *
 * 前置：
 *   - 后端已启动且 `alembic upgrade head` 已执行；
 *   - `scripts/seed_dev_account.py` 已创建开发账号（默认 dev@example.com）。
 *
 * 脚本只依赖 Node 内置 fetch/FormData/Blob，结束时删除自己创建的文档。
 * 管理员路径（rebuild、owner_scope=all）仅在账号 role=admin 时执行。
 */

const BASE_URL = (process.env.SMOKE_BASE_URL ?? 'http://127.0.0.1:8000/api/v1').replace(/\/$/, '')
const EMAIL = process.env.SMOKE_EMAIL ?? 'dev@example.com'
const PASSWORD = process.env.SMOKE_PASSWORD ?? 'dev-password-123'
const STAMP = Date.now()

let passed = 0
const failures = []
const createdIds = []

function assert(condition, message) {
  if (!condition) throw new Error(message)
  passed += 1
  console.log(`  ✓ ${message}`)
}

function log(title) {
  console.log(`\n== ${title} ==`)
}

async function readBody(response) {
  const text = await response.text()
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

async function request(method, path, { token, body, form, headers = {} } = {}) {
  const init = { method, headers: { Accept: 'application/json', ...headers } }
  if (token) init.headers.Authorization = `Bearer ${token}`
  if (form) {
    init.body = form
  } else if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json'
    init.body = JSON.stringify(body)
  }
  const response = await fetch(`${BASE_URL}${path}`, init)
  const data = await readBody(response)
  return { response, data }
}

function errorCode(data) {
  return data && typeof data === 'object' ? data.error?.code : undefined
}

async function login() {
  const { response, data } = await request('POST', '/auth/login', {
    body: { email: EMAIL, password: PASSWORD },
  })
  if (response.status !== 200) {
    throw new Error(
      `登录失败（${response.status}）：${errorCode(data) ?? ''} ${JSON.stringify(data).slice(0, 200)}`,
    )
  }
  return data.access_token
}

function knowledgeDoc(name, content) {
  const form = new FormData()
  form.append('file', new Blob([content], { type: 'text/markdown' }), name)
  form.append('title', `M4 冒烟 ${STAMP}`)
  form.append('category', '联调')
  return form
}

async function cleanup(token) {
  for (const id of createdIds) {
    try {
      await request('DELETE', `/knowledge/documents/${id}`, { token })
    } catch {
      // 清理失败不覆盖主流程结论。
    }
  }
}

async function main() {
  console.log(`M4 冒烟目标：${BASE_URL}`)
  const token = await login()

  log('系统能力与 Embedding')
  const info = await request('GET', '/system/info', { token })
  assert(info.response.status === 200, 'GET /system/info 200')
  assert(info.data.capabilities?.knowledge === true, 'capabilities.knowledge=true')
  assert(
    typeof info.data.embedding?.model === 'string' && info.data.embedding.model.length > 0,
    `embedding.model=${info.data.embedding?.model}`,
  )
  assert(Number(info.data.embedding?.dim) > 0, `embedding.dim=${info.data.embedding?.dim}`)

  const me = await request('GET', '/auth/me', { token })
  assert(me.response.status === 200, 'GET /auth/me 200')
  const isAdmin = me.data.role === 'admin'

  log('上传（201 新建 / 200 幂等）')
  const filename = `m4-smoke-${STAMP}.md`
  const content = `# M4 冒烟文档 ${STAMP}\n\n退货需要保留吊牌与包装，签收后 7 天内可申请退款。\n`
  const first = await request('POST', '/knowledge/documents', {
    token,
    form: knowledgeDoc(filename, content),
  })
  assert(first.response.status === 201, `新建上传 201（实际 ${first.response.status}）`)
  const document = first.data
  createdIds.push(document.id)
  assert(Object.keys(document).sort().join(',') ===
    ['id', 'title', 'source_uri', 'category', 'status', 'chunk_count', 'size_bytes', 'owner', 'error', 'created_at', 'updated_at'].sort().join(','),
  '文档对象恰好 11 字段')
  assert(document.status === 'ready', `同步入库终态 ready（实际 ${document.status}）`)
  assert(document.chunk_count >= 1, `chunk_count=${document.chunk_count}`)
  assert(document.category === '联调', 'category=联调')

  const duplicate = await request('POST', '/knowledge/documents', {
    token,
    form: knowledgeDoc(filename, content),
  })
  assert(duplicate.response.status === 200, `同内容重复上传 200（实际 ${duplicate.response.status}）`)
  assert(duplicate.data.id === document.id, '幂等命中返回同一文档')

  const tooLarge = new FormData()
  tooLarge.append('file', new Blob([new Uint8Array(10 * 1024 * 1024 + 1)]), 'too-large.md')
  const large = await request('POST', '/knowledge/documents', { token, form: tooLarge })
  assert(large.response.status === 413, `超过 10MB 返回 413（实际 ${large.response.status}）`)
  assert(errorCode(large.data) === 'payload_too_large', '413 错误码 payload_too_large')

  const badForm = new FormData()
  badForm.append('file', new Blob(['x'], { type: 'text/plain' }), 'bad.exe')
  const bad = await request('POST', '/knowledge/documents', { token, form: badForm })
  assert(bad.response.status === 422, `不支持的扩展名 422（实际 ${bad.response.status}）`)
  assert(errorCode(bad.data) === 'validation_error', '422 错误码 validation_error')

  log('列表 / 统计 / 筛选')
  const list = await request('GET', '/knowledge/documents?limit=20', { token })
  assert(list.response.status === 200, 'GET /knowledge/documents 200')
  const stats = list.data.stats
  assert(
    ['documents', 'chunks', 'ready', 'indexing', 'pending', 'failed'].every((key) => typeof stats?.[key] === 'number'),
    'stats 恰好 6 键且都是数字',
  )
  assert(list.data.items.some((item) => item.id === document.id), '列表包含刚上传的文档')

  const searched = await request('GET', `/knowledge/documents?q=${encodeURIComponent(String(STAMP))}`, { token })
  assert(searched.response.status === 200, '按 q 搜索 200')
  assert(searched.data.items.some((item) => item.id === document.id), '按 q 能命中标题')

  const byCategory = await request('GET', `/knowledge/documents?category=${encodeURIComponent('联调')}`, { token })
  assert(byCategory.response.status === 200, '按 category 过滤 200')
  assert(byCategory.data.items.every((item) => item.category === '联调'), '分类过滤结果全部匹配')

  log('检索调试')
  const search = await request('POST', '/knowledge/search', {
    token,
    body: { query: String(STAMP), top_k: 5, filters: { category: '联调' } },
  })
  assert(search.response.status === 200, 'POST /knowledge/search 200')
  assert(Array.isArray(search.data.hits) && search.data.hits.length >= 1, '检索命中至少 1 条')
  assert(typeof search.data.elapsed_ms === 'number', 'elapsed_ms 是数字')
  const hit = search.data.hits[0]
  assert(
    ['chunk_id', 'document_id', 'title', 'document_title', 'document_filename', 'category', 'chunk_index', 'content', 'score', 'updated_at'].every(
      (key) => key in hit,
    ),
    '检索 hit 恰好 10 字段',
  )
  assert(typeof hit.score === 'number', `score=${hit.score}`)
  assert(new Date(hit.updated_at).toString() !== 'Invalid Date', 'updated_at 可解析')

  const detail = await request('GET', `/knowledge/documents/${document.id}`, { token })
  assert(detail.response.status === 200, '文档详情 200')

  log('重试 / 重建权限')
  const retry = await request('POST', `/knowledge/documents/${document.id}/retry`, { token })
  assert(retry.response.status === 200, `重试 200（实际 ${retry.response.status}）`)
  assert(retry.data.status === 'ready', '重试后 ready')

  if (isAdmin) {
    const rebuild = await request('POST', '/knowledge/rebuild', { token, body: { scope: 'own' } })
    assert(rebuild.response.status === 200, '管理员 rebuild(own) 200')
    assert(typeof rebuild.data.documents === 'number', `rebuild.documents=${rebuild.data.documents}`)
    assert(typeof rebuild.data.failed === 'number', `rebuild.failed=${rebuild.data.failed}`)
    const all = await request('GET', '/knowledge/documents?owner_scope=all&limit=5', { token })
    assert(all.response.status === 200, '管理员 owner_scope=all 200')
  } else {
    const rebuild = await request('POST', '/knowledge/rebuild', { token, body: { scope: 'all' } })
    assert(rebuild.response.status === 403, `普通用户 rebuild 403（实际 ${rebuild.response.status}）`)
    assert(errorCode(rebuild.data) === 'forbidden', '403 错误码 forbidden')
    const all = await request('GET', '/knowledge/documents?owner_scope=all', { token })
    assert(all.response.status === 403, '普通用户 owner_scope=all 403')
  }

  log('删除与 404')
  const deleted = await request('DELETE', `/knowledge/documents/${document.id}`, { token })
  assert(deleted.response.status === 204, `删除 204（实际 ${deleted.response.status}）`)
  createdIds.length = 0
  const missing = await request('GET', `/knowledge/documents/${document.id}`, { token })
  assert(missing.response.status === 404, '删除后详情 404')
  assert(errorCode(missing.data) === 'not_found', '404 错误码 not_found')
}

main()
  .then(() => {
    console.log(`\nM4 冒烟通过：${passed} 项断言`)
  })
  .catch(async (error) => {
    failures.push(error)
    console.error(`\nM4 冒烟失败：${error?.message ?? error}`)
    try {
      const token = await login()
      await cleanup(token)
    } catch {
      // ignore
    }
    process.exitCode = 1
  })
