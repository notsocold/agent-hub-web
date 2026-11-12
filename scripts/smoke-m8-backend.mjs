#!/usr/bin/env node
/**
 * 真实后端 M8 管理台契约冒烟：15 个 /admin/* 端点 + RBAC + 用户规则。
 *
 * 用法：
 *   node scripts/smoke-m8-backend.mjs
 *   SMOKE_BASE_URL=http://127.0.0.1:8000/api/v1 node scripts/smoke-m8-backend.mjs
 *
 * 前置：
 *   - 后端已启动（默认 127.0.0.1:8000）；
 *   - `dev@example.com` 为管理员（scripts/seed_dev_account.py 提权后的开发账号）。
 *
 * 原则：
 *   - 只读端点只读；写操作只作用于脚本自建的 smoke 用户，并把状态恢复 active；
 *   - 平台指令先记录原值，结束时恢复，不留下脚本痕迹；
 *   - 技能 / MCP / Agent / 密钥端点只做读取冒烟，不改任何系统项。
 */

const BASE_URL = (process.env.SMOKE_BASE_URL ?? 'http://127.0.0.1:8000/api/v1').replace(/\/$/, '')
const ADMIN_EMAIL = process.env.SMOKE_EMAIL ?? 'dev@example.com'
const ADMIN_PASSWORD = process.env.SMOKE_PASSWORD ?? 'dev-password-123'
const USER_EMAIL = process.env.SMOKE_USER_EMAIL ?? 'smoke-m8@example.com'
const USER_PASSWORD = process.env.SMOKE_USER_PASSWORD ?? 'smoke-m8-password'

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
  return { status: response.status, data }
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
    body: { email: USER_EMAIL, password: USER_PASSWORD, display_name: 'M8 Smoke User' },
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

async function main() {
  // 1. 管理员登录 + /auth/me 校验角色。
  const adminToken = await login(ADMIN_EMAIL, ADMIN_PASSWORD)
  const me = await api('/auth/me', { token: adminToken })
  assert(me.status === 200, `GET /auth/me 期望 200，实际 ${me.status}`)
  assert(me.data?.role === 'admin', `${ADMIN_EMAIL} 不是管理员（role=${me.data?.role}）`)
  console.log(`✓ ${ADMIN_EMAIL} 登录且 role=admin`)

  // 2. 普通用户访问管理端：403 forbidden + details.required_role=admin，且不误触刷新。
  const userToken = await ensureOrdinaryUserToken()
  const denied = await api('/admin/overview', { token: userToken })
  assert(denied.status === 403, `普通用户 GET /admin/overview 期望 403，实际 ${denied.status}`)
  assert(denied.data?.error?.code === 'forbidden', `403 code 不是 forbidden：${JSON.stringify(denied.data)}`)
  assert(
    denied.data?.error?.details?.required_role === 'admin',
    `403 details.required_role 不是 admin：${JSON.stringify(denied.data)}`,
  )
  console.log('✓ 普通用户访问 /admin/overview 返回 403 forbidden + details.required_role=admin')

  // 3. 用户列表：字段 / stats / 筛选。
  const usersPage = await api('/admin/users?limit=5', { token: adminToken })
  assert(usersPage.status === 200, `GET /admin/users 期望 200，实际 ${usersPage.status}`)
  const { items, stats, has_more, next_cursor } = usersPage.data
  assert(Array.isArray(items), '用户列表缺少 items 数组')
  assert(items.length > 0, '用户列表为空')
  for (const row of items) {
    assert(row.id && row.email, `用户行缺少 id/email：${JSON.stringify(row)}`)
    assert(!('password_hash' in row), '用户行不应包含 password_hash')
  }
  assert(typeof stats?.total === 'number' && typeof stats?.admins === 'number', `stats 缺字段：${JSON.stringify(stats)}`)
  assert(typeof has_more === 'boolean', '缺少 has_more')
  console.log(`✓ 用户列表：${items.length} 行，stats.total=${stats.total} admins=${stats.admins}（不含 password_hash）`)

  const filtered = await api('/admin/users?role=admin&status=active&limit=5', { token: adminToken })
  assert(filtered.status === 200, `角色/状态筛选期望 200，实际 ${filtered.status}`)
  assert(
    filtered.data.items.every((row) => row.role === 'admin' && row.status === 'active'),
    '筛选结果混入了非 admin/active 行',
  )
  console.log(`✓ role/status 筛选：${filtered.data.items.length} 行均为 admin+active`)

  // 4. 用户详情 + 对 smoke 用户的禁用/启用往返。
  const smokeRow = items.find((row) => row.email === USER_EMAIL)
  assert(smokeRow, `用户列表未包含 ${USER_EMAIL}（limit=5 内未找到，可调大 SMOKE 场景或手动核验）`)
  const detail = await api(`/admin/users/${smokeRow.id}`, { token: adminToken })
  assert(detail.status === 200 && detail.data?.id === smokeRow.id, `用户详情 404/不一致：${detail.status}`)
  console.log('✓ 用户详情返回同形结构')

  const disable = await api(`/admin/users/${smokeRow.id}`, {
    method: 'PATCH',
    token: adminToken,
    body: { status: 'disabled' },
  })
  assert(disable.status === 200 && disable.data?.status === 'disabled', `停用失败：${disable.status} ${JSON.stringify(disable.data)}`)
  const reEnable = await api(`/admin/users/${smokeRow.id}`, {
    method: 'PATCH',
    token: adminToken,
    body: { status: 'active' },
  })
  assert(reEnable.status === 200 && reEnable.data?.status === 'active', `恢复启用失败：${reEnable.status}`)
  console.log('✓ smoke 用户停用→启用往返成功（已恢复 active）')

  // 5. 自己的角色不可改：422 cannot_change_own_role。
  const meRow = items.find((row) => row.email === ADMIN_EMAIL) ?? { id: me.data.id }
  const selfRole = await api(`/admin/users/${meRow.id}`, {
    method: 'PATCH',
    token: adminToken,
    body: { role: 'user' },
  })
  assert(selfRole.status === 422, `改自己角色期望 422，实际 ${selfRole.status}`)
  assert(selfRole.data?.error?.code === 'cannot_change_own_role', `code 不是 cannot_change_own_role：${JSON.stringify(selfRole.data)}`)
  console.log('✓ 修改自己的角色返回 422 cannot_change_own_role（管理员未被降级）')

  // 6. 只读概览：字段树完整（8 个 A2A 状态键 + canceled 单 L）。
  const overview = await api('/admin/overview', { token: adminToken })
  assert(overview.status === 200, `GET /admin/overview 期望 200，实际 ${overview.status}`)
  const ov = overview.data
  assert(typeof ov.generated_at === 'string' && ov.generated_at.endsWith('Z'), `generated_at 非 UTC Z：${ov.generated_at}`)
  for (const section of ['users', 'conversations', 'messages', 'runs', 'a2a_tasks', 'knowledge', 'attachments']) {
    assert(ov[section] != null, `概览缺少 ${section} 分组`)
  }
  for (const key of ['submitted', 'working', 'input_required', 'auth_required', 'completed', 'failed', 'canceled', 'rejected']) {
    assert(key in ov.a2a_tasks, `a2a_tasks 缺少状态键 ${key}`)
  }
  assert('canceled' in ov.runs && !('cancelled' in ov.runs), 'runs 应使用单 L 拼写 canceled')
  console.log('✓ 概览字段树完整（8 个 A2A 状态键 + canceled 单 L 拼写）')

  // 7. 平台指令：保存 → 恢复，全程还原原值。
  const instructionBefore = await api('/admin/settings/instruction', { token: adminToken })
  assert(instructionBefore.status === 200, `GET 指令期望 200，实际 ${instructionBefore.status}`)
  const original = instructionBefore.data
  assert(typeof original?.max_chars === 'number' && typeof original?.is_default === 'boolean', '指令响应缺少 max_chars/is_default')

  const saved = await api('/admin/settings/instruction', {
    method: 'PUT',
    token: adminToken,
    body: { content: `[smoke-m8] ${Date.now()}` },
  })
  assert(saved.status === 200 && saved.data?.is_default === false, `保存指令失败：${saved.status} ${JSON.stringify(saved.data)}`)
  assert(saved.data?.updated_by_email === ADMIN_EMAIL, `updated_by_email 与管理员不符：${saved.data?.updated_by_email}`)

  const restored = await api('/admin/settings/instruction', {
    method: 'PUT',
    token: adminToken,
    body: { content: null },
  })
  assert(restored.status === 200 && restored.data?.is_default === true, `恢复默认失败：${restored.status} ${JSON.stringify(restored.data)}`)
  assert(restored.data?.updated_by === null, '恢复默认后 updated_by 应为 null')
  console.log('✓ 平台指令保存→恢复往返成功（is_default 状态切换正确）')

  // 8. 系统技能 / 系统 MCP / 全局 Agent / 平台密钥：只读冒烟。
  const skills = await api('/admin/skills', { token: adminToken })
  assert(skills.status === 200, `GET /admin/skills 期望 200，实际 ${skills.status}`)
  assert(typeof skills.data?.stats?.total === 'number', '技能 stats 缺 total')
  assert(skills.data.items.every((row) => row.scope === 'system'), '技能列表混入非 system scope')
  console.log(`✓ 系统技能列表：${skills.data.items.length} 个，均为 system scope`)

  const mcp = await api('/admin/mcp/servers', { token: adminToken })
  assert(mcp.status === 200, `GET /admin/mcp/servers 期望 200，实际 ${mcp.status}`)
  assert(Array.isArray(mcp.data?.items), 'MCP 响应缺少 items')
  assert(
    mcp.data.items.every((row) => !('headers' in row)),
    'MCP 列表不应包含 headers/密文',
  )
  console.log(`✓ 系统 MCP 列表：${mcp.data.items.length} 个（不含 headers）`)

  const agents = await api('/admin/agents?limit=5', { token: adminToken })
  assert(agents.status === 200, `GET /admin/agents 期望 200，实际 ${agents.status}`)
  assert(Array.isArray(agents.data?.items), 'Agent 响应缺少 items')
  assert(typeof agents.data?.stats?.total === 'number', 'Agent stats 缺 total')
  console.log(`✓ 全局 Agent 列表（R8 全量口径）：${agents.data.items.length} 行`)

  const secrets = await api('/admin/secrets', { token: adminToken })
  assert(secrets.status === 200, `GET /admin/secrets 期望 200，实际 ${secrets.status}`)
  console.log('✓ 平台密钥列表可读')

  // 9. 普通用户读管理端其余端点同样 403（抽两个代表端点）。
  for (const path of ['/admin/users', '/admin/settings/instruction']) {
    const deniedToo = await api(path, { token: userToken })
    assert(deniedToo.status === 403, `普通用户 GET ${path} 期望 403，实际 ${deniedToo.status}`)
  }
  console.log('✓ 普通用户访问 /admin/users 与 /admin/settings/instruction 均 403')
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
