#!/usr/bin/env node
/**
 * 真实后端 M5 冒烟：审批查询 / 审计日志 / 平台密钥 CRUD / 聊天限流。
 *
 * 默认直连后端；也可以走 Vite 代理：
 *   node scripts/smoke-m5-backend.mjs
 *   SMOKE_BASE_URL=http://127.0.0.1:5173/api/v1 node scripts/smoke-m5-backend.mjs
 *
 * 前置：
 *   - 后端已启动且 `alembic upgrade head` 已执行；
 *   - `dev@example.com` 为管理员（密钥与全局审计需要 admin）；
 *   - `CAPABILITY_SECRET_KEY` 已配置（否则密钥写入返回 503）。
 *
 * 脚本只依赖 Node 内置 fetch，结束时删除自己创建的密钥与限流探测对话。
 * 聊天限流探测放在最后：它会故意触发 429，避免污染前面的管理端请求。
 */

const BASE_URL = (process.env.SMOKE_BASE_URL ?? 'http://127.0.0.1:8000/api/v1').replace(/\/$/, '')
const EMAIL = process.env.SMOKE_EMAIL ?? 'dev@example.com'
const PASSWORD = process.env.SMOKE_PASSWORD ?? 'dev-password-123'
const RATE_LIMIT_MAX = Number(process.env.SMOKE_RATE_LIMIT_MAX ?? 30)
const CHAT_TIMEOUT_MS = 10_000
const STAMP = Date.now()
const MISSING_ID = '00000000-0000-4000-8000-000000000000'
const SECRET_NAME = `SMOKE_M5_${STAMP}`

const APPROVAL_STATS = ['approved', 'canceled', 'expired', 'pending', 'rejected']
const APPROVAL_FIELDS = [
  'conversation_id',
  'conversation_title',
  'created_at',
  'decided_at',
  'decided_by',
  'decision_note',
  'executor',
  'expires_at',
  'id',
  'payload',
  'payload_preview',
  'reason',
  'risk',
  'run_id',
  'side_effect',
  'source',
  'status',
  'target',
  'tool_display_name',
  'tool_name',
]
const AUDIT_FIELDS = [
  'action',
  'actor_id',
  'actor_type',
  'created_at',
  'detail',
  'id',
  'request_id',
  'resource_id',
  'resource_type',
]
const AUDIT_STRING_FIELDS = [
  'actor_type',
  'actor_id',
  'action',
  'resource_type',
  'resource_id',
  'request_id',
  'created_at',
]
const SECRET_FIELDS = ['created_at', 'description', 'enabled', 'name', 'updated_at']

let passed = 0
let failed = 0
let token = null
let createdSecretName = null
let rateProbeStarted = false

function assert(condition, message) {
  if (!condition) throw new Error(message)
  passed += 1
  console.log(`  ✓ ${message}`)
}

function log(title) {
  console.log(`\n== ${title} ==`)
}

function sameKeySet(value, expected) {
  if (!value || typeof value !== 'object') return false
  const keys = Object.keys(value).sort()
  return keys.length === expected.length && keys.every((key, index) => key === expected[index])
}

async function readBody(response) {
  const text = await response.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

async function request(method, path, { token, body, headers = {}, signal } = {}) {
  const init = { method, headers: { Accept: 'application/json', ...headers } }
  if (token) init.headers.Authorization = `Bearer ${token}`
  if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json'
    init.body = JSON.stringify(body)
  }
  if (signal) init.signal = signal
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

async function cleanupSecret() {
  if (!createdSecretName || !token) return
  const name = createdSecretName
  createdSecretName = null
  try {
    const { response } = await request('DELETE', `/admin/secrets/${encodeURIComponent(name)}`, {
      token,
    })
    if (response.status === 204 || response.status === 404) {
      console.log(`  · 已清理密钥 ${name}（HTTP ${response.status}）`)
    } else {
      console.log(`  ! 清理密钥 ${name} 返回 HTTP ${response.status}`)
    }
  } catch (error) {
    console.log(`  ! 清理密钥 ${name} 失败：${error?.message ?? error}`)
  }
}

/** 限流探测会产生测试对话；按标题前缀 best-effort 清理，失败不影响冒烟结论。 */
async function cleanupProbeConversations() {
  if (!rateProbeStarted || !token) return
  rateProbeStarted = false
  try {
    const list = await request(
      'GET',
      `/conversations?limit=100&q=${encodeURIComponent('M5 限流探测')}`,
      { token },
    )
    if (list.response.status !== 200 || !Array.isArray(list.data.items)) {
      console.log(`  ! 跳过限流探测对话清理（列表 HTTP ${list.response.status}）`)
      return
    }
    let removed = 0
    for (const item of list.data.items) {
      try {
        const deleted = await request('DELETE', `/conversations/${item.id}`, { token })
        if (deleted.response.status === 200 || deleted.response.status === 204) removed += 1
      } catch {
        // 清理失败不覆盖主流程结论。
      }
    }
    console.log(`  · 已清理 ${removed}/${list.data.items.length} 个限流探测对话`)
  } catch (error) {
    console.log(`  ! 清理限流探测对话失败：${error?.message ?? error}`)
  }
}

function assertPageShape(page, label) {
  assert(Array.isArray(page?.items), `${label}.items 是数组`)
  assert(
    page?.next_cursor === null || typeof page?.next_cursor === 'string',
    `${label}.next_cursor 为 null 或字符串`,
  )
  assert(typeof page?.has_more === 'boolean', `${label}.has_more 是布尔值`)
}

function assertApprovalStats(stats, label) {
  assert(sameKeySet(stats, APPROVAL_STATS), `${label}.stats 恰好 5 键`)
  assert(
    APPROVAL_STATS.every((key) => typeof stats[key] === 'number'),
    `${label}.stats 值均为数字`,
  )
}

function assertApprovalItems(items, label) {
  for (const [index, item] of items.entries()) {
    assert(sameKeySet(item, APPROVAL_FIELDS), `${label}.items[${index}] 字段完整`)
    assert(typeof item.id === 'string', `${label}.items[${index}].id 是字符串`)
    assert(typeof item.status === 'string', `${label}.items[${index}].status 是字符串`)
    assert(
      item.payload && typeof item.payload === 'object',
      `${label}.items[${index}].payload 是对象`,
    )
  }
}

function assertAuditPage(page, label) {
  assertPageShape(page, label)
  for (const [index, item] of page.items.entries()) {
    assert(sameKeySet(item, AUDIT_FIELDS), `${label}.items[${index}] 恰好 9 字段`)
    assert(typeof item.id === 'number', `${label}.items[${index}].id 是数字`)
    assert(
      AUDIT_STRING_FIELDS.every((key) => typeof item[key] === 'string'),
      `${label}.items[${index}] 字符串字段类型正确`,
    )
    assert(item.detail && typeof item.detail === 'object', `${label}.items[${index}].detail 是对象`)
    assert(!Number.isNaN(Date.parse(item.created_at)), `${label}.items[${index}].created_at 可解析`)
  }
}

function printUncovered() {
  console.log('\n未覆盖：审批成功恢复（真实 LLM/MCP 缺失）、普通用户 403（当前账号为 admin）')
}

async function main() {
  console.log(`M5 冒烟目标：${BASE_URL}`)
  token = await login()

  try {
    log('系统能力')
    const info = await request('GET', '/system/info', { token })
    assert(info.response.status === 200, 'GET /system/info 200')
    assert(info.data.capabilities?.approvals === true, 'capabilities.approvals=true')

    log('审批查询')
    const pending = await request('GET', '/approvals?limit=5', { token })
    assert(pending.response.status === 200, 'GET /approvals 200')
    assertPageShape(pending.data, 'GET /approvals')
    assertApprovalStats(pending.data.stats, 'GET /approvals')
    assertApprovalItems(pending.data.items, 'GET /approvals')

    const all = await request('GET', '/approvals?status=all&limit=5', { token })
    assert(all.response.status === 200, 'GET /approvals?status=all 200')
    assertPageShape(all.data, 'GET /approvals?status=all')
    assertApprovalStats(all.data.stats, 'GET /approvals?status=all')
    assertApprovalItems(all.data.items, 'GET /approvals?status=all')

    const missing = await request('GET', `/approvals/${MISSING_ID}`, { token })
    assert(missing.response.status === 404, '不存在的审批详情 404')
    assert(errorCode(missing.data) === 'not_found', '审批详情 404 错误码 not_found')

    const decision = await request('POST', `/approvals/${MISSING_ID}/decision`, {
      token,
      body: { decision: 'approve' },
    })
    assert(decision.response.status === 404, '不存在的审批决定 404')
    assert(errorCode(decision.data) === 'not_found', '审批决定 404 错误码 not_found')

    log('审计日志')
    const own = await request('GET', '/audit-logs?limit=5', { token })
    assert(own.response.status === 200, 'GET /audit-logs?limit=5 200')
    assertAuditPage(own.data, 'GET /audit-logs')

    const admin = await request('GET', '/admin/audit-logs?limit=5', { token })
    assert(admin.response.status === 200, 'GET /admin/audit-logs?limit=5 200')
    assertAuditPage(admin.data, 'GET /admin/audit-logs')

    const byAction = await request('GET', '/admin/audit-logs?action=secret.create&limit=5', {
      token,
    })
    assert(byAction.response.status === 200, 'GET /admin/audit-logs?action=secret.create 200')
    assertAuditPage(byAction.data, 'GET /admin/audit-logs?action=secret.create')
    assert(
      byAction.data.items.every((item) => item.action === 'secret.create'),
      'action=secret.create 过滤结果全部匹配',
    )

    const start = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const end = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    const ranged = await request(
      'GET',
      `/admin/audit-logs?limit=5&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`,
      { token },
    )
    assert(ranged.response.status === 200, 'GET /admin/audit-logs?start&end 200')
    assertAuditPage(ranged.data, 'GET /admin/audit-logs?start&end')

    log('平台密钥 CRUD')
    try {
      const description = `M5 冒烟 ${STAMP}`
      const created = await request('POST', '/admin/secrets', {
        token,
        body: { name: SECRET_NAME, value: 'smoke-m5-value-1', description },
      })
      assert(created.response.status === 201, `创建密钥 201（实际 ${created.response.status}）`)
      createdSecretName = SECRET_NAME
      assert(sameKeySet(created.data, SECRET_FIELDS), '创建响应恰好 5 字段')
      assert(!('value' in created.data), '创建响应不含 value 键')
      assert(!JSON.stringify(created.data).includes('smoke-m5-value-1'), '创建响应不回显明文')
      assert(created.data.name === SECRET_NAME, `创建响应名称一致（${SECRET_NAME}）`)
      assert(created.data.enabled === true, '创建后 enabled=true')
      assert(created.data.description === description, '创建响应 description 一致')

      const list = await request('GET', '/admin/secrets', { token })
      assert(list.response.status === 200, 'GET /admin/secrets 200')
      assert(
        Array.isArray(list.data.items) && list.data.items.some((item) => item.name === SECRET_NAME),
        '密钥列表包含刚创建的密钥',
      )
      assert(
        list.data.items.every((item) => !('value' in item)),
        '密钥列表项均不含 value 键',
      )

      const rotatedDescription = `M5 轮换 ${STAMP}`
      const rotated = await request('PATCH', `/admin/secrets/${encodeURIComponent(SECRET_NAME)}`, {
        token,
        body: { value: 'smoke-m5-value-2', description: rotatedDescription },
      })
      assert(rotated.response.status === 200, `轮换密钥 200（实际 ${rotated.response.status}）`)
      assert(sameKeySet(rotated.data, SECRET_FIELDS), '轮换响应恰好 5 字段')
      assert(!('value' in rotated.data), '轮换响应不含 value 键')
      assert(rotated.data.name === SECRET_NAME, '轮换响应名称一致')
      assert(rotated.data.description === rotatedDescription, '轮换后 description 已更新')
      assert(rotated.data.enabled === true, '轮换后 enabled 保持 true')

      const disabled = await request('PATCH', `/admin/secrets/${encodeURIComponent(SECRET_NAME)}`, {
        token,
        body: { enabled: false },
      })
      assert(disabled.response.status === 200, `停用密钥 200（实际 ${disabled.response.status}）`)
      assert(disabled.data.enabled === false, '停用后 enabled=false')

      const disabledList = await request('GET', '/admin/secrets?enabled=false', { token })
      assert(disabledList.response.status === 200, 'GET /admin/secrets?enabled=false 200')
      assert(
        disabledList.data.items.some((item) => item.name === SECRET_NAME),
        'enabled=false 列表包含已停用密钥',
      )

      const enabledList = await request('GET', '/admin/secrets?enabled=true', { token })
      assert(enabledList.response.status === 200, 'GET /admin/secrets?enabled=true 200')
      assert(
        !enabledList.data.items.some((item) => item.name === SECRET_NAME),
        'enabled=true 列表不含已停用密钥',
      )

      const removed = await request('DELETE', `/admin/secrets/${encodeURIComponent(SECRET_NAME)}`, {
        token,
      })
      assert(removed.response.status === 204, `删除密钥 204（实际 ${removed.response.status}）`)
      createdSecretName = null

      const afterDelete = await request(
        'PATCH',
        `/admin/secrets/${encodeURIComponent(SECRET_NAME)}`,
        { token, body: { description: 'removed' } },
      )
      assert(afterDelete.response.status === 404, '删除后 PATCH 404')
    } finally {
      await cleanupSecret()
    }

    log('聊天限流（放在最后，避免 429 影响前面的请求）')
    assert(
      Number.isInteger(RATE_LIMIT_MAX) && RATE_LIMIT_MAX > 0,
      `SMOKE_RATE_LIMIT_MAX=${RATE_LIMIT_MAX} 为正整数`,
    )
    let rateLimited = 0
    let rateLimitBody = null
    rateProbeStarted = true
    for (let index = 1; index <= RATE_LIMIT_MAX + 1; index += 1) {
      let result
      try {
        result = await request('POST', '/chat/stream', {
          token,
          headers: { Accept: 'text/event-stream' },
          body: { message: `M5 限流探测 ${index}` },
          signal: AbortSignal.timeout(CHAT_TIMEOUT_MS),
        })
      } catch (error) {
        throw new Error(
          `第 ${index} 次 /chat/stream 未在 ${CHAT_TIMEOUT_MS}ms 内完成：${error?.message ?? error}`,
        )
      }
      // SSE 的 error 事件是正常 200 响应的一部分；这里只关心 HTTP 429。
      if (result.response.status === 429) {
        rateLimited += 1
        if (!rateLimitBody) {
          rateLimitBody = result.data
          console.log(`  · 第 ${index} 次 /chat/stream 触发 429`)
        }
      }
    }
    assert(
      rateLimited >= 1,
      `连续 ${RATE_LIMIT_MAX + 1} 次聊天请求出现至少一次 429（实际 ${rateLimited} 次）`,
    )
    assert(errorCode(rateLimitBody) === 'rate_limited', '429 错误码 rate_limited')
    const retryAfter = rateLimitBody?.error?.details?.retry_after_seconds
    assert(
      typeof retryAfter === 'number' && retryAfter >= 0,
      `error.details.retry_after_seconds 是数字（${retryAfter}）`,
    )
  } finally {
    await cleanupSecret()
    await cleanupProbeConversations()
  }
}

main()
  .then(() => {
    console.log(`\nM5 冒烟通过：${passed} 项断言，失败 0 项`)
    printUncovered()
  })
  .catch((error) => {
    failed += 1
    console.error(`\nM5 冒烟失败：${error?.message ?? error}`)
    console.error(`M5 冒烟结果：通过 ${passed} 项断言，失败 ${failed} 项`)
    printUncovered()
    process.exitCode = 1
  })
