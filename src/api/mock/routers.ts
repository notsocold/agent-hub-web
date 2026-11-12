import type { AdminAgentUpdateRequest, WorkflowStep } from '@/types'
import { SECRET_NAME_PATTERN, type AuthTokens } from '@/types'

import { MockAdminRuleError, mockDb } from './db'

export interface MockRequest {
  method: string
  path: string
  query: URLSearchParams
  body: unknown
  headers: Record<string, string>
}

export interface MockResult {
  status: number
  data: unknown
}

const KNOWLEDGE_MAX_UPLOAD_BYTES = 10 * 1024 * 1024
const KNOWLEDGE_ALLOWED_EXTENSIONS = ['md', 'markdown', 'txt', 'pdf', 'csv', 'json']

function ok(data: unknown, status = 200): MockResult {
  return { status, data }
}

function fail(
  status: number,
  code: string,
  message: string,
  details?: Record<string, unknown>,
): MockResult {
  return {
    status,
    data: {
      error: {
        code,
        message,
        request_id: `mock-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        ...(details ? { details } : {}),
      },
    },
  }
}

function unknownKeys(body: Record<string, unknown>, allowed: string[]): string[] {
  return Object.keys(body).filter((key) => !allowed.includes(key))
}

/** M8：把 mockDb 的规则错误转换成统一错误信封。 */
function guarded(fn: () => MockResult): MockResult {
  try {
    return fn()
  } catch (error) {
    if (error instanceof MockAdminRuleError) {
      return fail(error.status, error.code, error.message, error.details)
    }
    throw error
  }
}

function tokens(): AuthTokens {
  return {
    access_token: `mock-access-${crypto.randomUUID()}`,
    refresh_token: `mock-refresh-${crypto.randomUUID()}`,
    token_type: 'bearer',
    expires_in: 3600,
  }
}

function bodyOf(req: MockRequest): Record<string, unknown> {
  if (req.body && typeof req.body === 'object') {
    return req.body as Record<string, unknown>
  }
  return {}
}

/** mock adapter 把 FormData 归一化成 `{__mockForm, fields, file}`。 */
function formOf(body: Record<string, unknown>): {
  file: { name: string; type: string; size: number } | null
  fields: Record<string, string>
} | null {
  if (body.__mockForm !== true) return null
  return {
    file: (body.file as { name: string; type: string; size: number } | null) ?? null,
    fields: (body.fields as Record<string, string> | undefined) ?? {},
  }
}

function numberParam(query: URLSearchParams, key: string): number | undefined {
  const raw = query.get(key)
  if (raw === null) return undefined
  const value = Number(raw)
  return Number.isFinite(value) ? value : undefined
}

function stringParam(query: URLSearchParams, key: string): string | undefined {
  return query.get(key) ?? undefined
}

function hasAuth(req: MockRequest): boolean {
  return (req.headers.authorization ?? '').startsWith('Bearer ')
}

function requireAuth(req: MockRequest): MockResult | null {
  return hasAuth(req) ? null : fail(401, 'unauthorized', '请先登录')
}

/** 真实后端 McpCheckResult 字段名；前端 api/mcp.ts 负责归一化。 */
function rawCheckResult(
  id: string,
  result: {
    health_status: string
    latency_ms: number | null
    tool_count: number
    checked_at: string | null
    error: string | null
  },
): Record<string, unknown> {
  return {
    id,
    health_status: result.health_status,
    latency_ms: result.latency_ms,
    message: result.error,
    tools_discovered: result.tool_count,
    last_checked_at: result.checked_at,
  }
}

function pageQuery(query: URLSearchParams): { limit?: number; cursor?: string } {
  return { limit: numberParam(query, 'limit'), cursor: stringParam(query, 'cursor') }
}

export async function handleMockRequest(req: MockRequest): Promise<MockResult> {
  const { method, path } = req
  const body = bodyOf(req)

  // ---------- 认证 ----------
  if (method === 'POST' && path === '/auth/login') {
    const email = String(body.email ?? '').trim()
    const password = String(body.password ?? '')
    if (!email.includes('@')) {
      return fail(422, 'validation_error', '邮箱格式不正确')
    }
    if (password.length < 8) {
      return fail(422, 'validation_error', '密码至少 8 位')
    }
    if (password === 'wrong-password') {
      return fail(401, 'invalid_credentials', '邮箱或密码错误')
    }
    // mock 沙盒：admin@example.com 登录后按管理员渲染设置页管理分区；
    // 同时记住会话身份，整页加载后 /auth/me 保持同一用户（与真实后端 token 语义一致）。
    mockDb.setSessionEmail(email)
    mockDb.user.last_login_at = new Date().toISOString()
    return ok(tokens())
  }

  if (method === 'POST' && path === '/auth/register') {
    const email = String(body.email ?? '').trim()
    const password = String(body.password ?? '')
    const displayName = String(body.display_name ?? '').trim()
    if (!email.includes('@')) {
      return fail(422, 'validation_error', '邮箱格式不正确')
    }
    if (password.length < 8) {
      return fail(422, 'validation_error', '密码至少 8 位')
    }
    if (!displayName) {
      return fail(422, 'validation_error', '请输入展示名')
    }
    if (email === mockDb.user.email) {
      return fail(409, 'email_exists', '该邮箱已注册')
    }
    mockDb.user.email = email
    mockDb.user.display_name = displayName
    mockDb.user.last_login_at = new Date().toISOString()
    // 注册即登录：同样记住会话身份（默认 role=user）。
    mockDb.setSessionEmail(email)
    return ok(tokens(), 201)
  }

  if (method === 'POST' && path === '/auth/refresh') {
    const refreshToken = String(body.refresh_token ?? '')
    if (!refreshToken.startsWith('mock-refresh-')) {
      return fail(401, 'invalid_refresh_token', '刷新令牌无效')
    }
    return ok(tokens())
  }

  if (method === 'POST' && path === '/auth/logout') {
    // 登出清除会话身份：重载后回到全新沙盒（you@example.com / role=user）。
    mockDb.setSessionEmail(null)
    return ok(null, 204)
  }

  if (method === 'POST' && path === '/auth/change-password') {
    const unauthorized = requireAuth(req)
    if (unauthorized) return unauthorized
    const currentPassword = String(body.current_password ?? '')
    const newPassword = String(body.new_password ?? '')
    if (!currentPassword) {
      return fail(422, 'validation_error', '请输入当前密码')
    }
    if (newPassword.length < 8) {
      return fail(422, 'validation_error', '新密码至少 8 位')
    }
    if (newPassword === currentPassword) {
      return fail(422, 'validation_error', '新密码不能与旧密码相同')
    }
    // mock 不保存密码明文：与登录一致，用 `wrong-password` 代表旧密码错误。
    if (currentPassword === 'wrong-password') {
      return fail(400, 'invalid_password', '当前密码错误')
    }
    return ok(null, 204)
  }

  if (method === 'GET' && path === '/auth/me') {
    const unauthorized = requireAuth(req)
    if (unauthorized) return unauthorized
    return ok(mockDb.user)
  }

  if (method === 'PATCH' && path === '/auth/me') {
    const unauthorized = requireAuth(req)
    if (unauthorized) return unauthorized
    const displayName = String(body.display_name ?? '').trim()
    if (!displayName || displayName.length > 64) {
      return fail(422, 'validation_error', '展示名需为 1–64 个字符')
    }
    mockDb.user.display_name = displayName
    return ok(mockDb.user)
  }

  const unauthorized = requireAuth(req)
  if (unauthorized) return unauthorized

  // ---------- 会话 ----------
  if (method === 'GET' && path === '/conversations') {
    return ok(
      mockDb.listConversations({
        q: stringParam(req.query, 'q'),
        status: stringParam(req.query, 'status'),
        ...pageQuery(req.query),
      }),
    )
  }

  if (method === 'POST' && path === '/conversations') {
    const title = String(body.title ?? '').trim() || '新会话'
    return ok(mockDb.createConversation(title), 201)
  }

  const messagesMatch = /^\/conversations\/([^/]+)\/messages$/.exec(path)
  if (method === 'GET' && messagesMatch) {
    const result = mockDb.listMessages(messagesMatch[1]!, pageQuery(req.query))
    return result ? ok(result) : fail(404, 'not_found', '会话不存在')
  }

  const conversationMatch = /^\/conversations\/([^/]+)$/.exec(path)
  if (conversationMatch) {
    const id = conversationMatch[1]!
    if (method === 'GET') {
      const conversation = mockDb.getConversation(id)
      return conversation ? ok(conversation) : fail(404, 'not_found', '会话不存在')
    }
    if (method === 'PATCH') {
      const title = body.title === undefined ? undefined : String(body.title).trim()
      const status =
        body.status === 'archived' ? 'archived' : body.status === 'active' ? 'active' : undefined
      if (title !== undefined && (title.length < 1 || title.length > 200)) {
        return fail(422, 'validation_error', '标题需为 1–200 个字符')
      }
      const updated = mockDb.updateConversation(id, { title, status })
      return updated ? ok(updated) : fail(404, 'not_found', '会话不存在')
    }
    if (method === 'DELETE') {
      const deleted = mockDb.deleteConversation(id)
      return deleted ? ok(null, 204) : fail(404, 'not_found', '会话不存在')
    }
  }

  // ---------- M8 管理台 ----------
  if (path.startsWith('/admin/')) {
    if (!hasAuth(req)) return fail(401, 'unauthorized', '请先登录')
    if (mockDb.user.role !== 'admin') {
      return fail(403, 'forbidden', '需要管理员权限', { required_role: 'admin' })
    }
  }

  if (method === 'GET' && path === '/admin/users') {
    return ok(
      mockDb.adminListUsers({
        q: stringParam(req.query, 'q'),
        role: stringParam(req.query, 'role'),
        status: stringParam(req.query, 'status'),
        limit: numberParam(req.query, 'limit'),
        cursor: stringParam(req.query, 'cursor'),
      }),
    )
  }

  const adminUserMatch = /^\/admin\/users\/([^/]+)$/.exec(path)
  if (adminUserMatch) {
    const userId = adminUserMatch[1]!
    if (method === 'GET') {
      const user = mockDb.adminGetUser(userId)
      return user ? ok(user) : fail(404, 'not_found', '用户不存在')
    }
    if (method === 'PATCH') {
      const extra = unknownKeys(body, ['role', 'status'])
      if (extra.length > 0) {
        return fail(422, 'validation_error', `字段不可编辑：${extra.join(', ')}`)
      }
      return guarded(() => {
        const updated = mockDb.adminUpdateUser(userId, {
          role: body.role as 'user' | 'admin' | undefined,
          status: body.status as 'active' | 'disabled' | undefined,
        })
        return updated ? ok(updated) : fail(404, 'not_found', '用户不存在')
      })
    }
  }

  if (method === 'GET' && path === '/admin/overview') {
    return ok(mockDb.adminOverview())
  }

  if (path === '/admin/settings/instruction') {
    if (method === 'GET') return ok(mockDb.adminGetInstruction())
    if (method === 'PUT') {
      if (!('content' in body)) {
        return fail(422, 'validation_error', 'content 为必填字段')
      }
      const content = body.content
      if (content !== null && typeof content !== 'string') {
        return fail(422, 'validation_error', 'content 必须为字符串或 null')
      }
      return guarded(() => ok(mockDb.adminSaveInstruction(content)))
    }
  }

  if (method === 'GET' && path === '/admin/skills') {
    return ok(mockDb.adminListSkills(stringParam(req.query, 'q')))
  }

  const adminSkillEnabledMatch = /^\/admin\/skills\/([^/]+)\/enabled$/.exec(path)
  if (method === 'PUT' && adminSkillEnabledMatch) {
    if (typeof body.enabled !== 'boolean') {
      return fail(422, 'validation_error', 'enabled 必须为布尔值')
    }
    return guarded(() => {
      const skill = mockDb.adminSetSkillEnabled(adminSkillEnabledMatch[1]!, body.enabled as boolean)
      return skill ? ok(skill) : fail(404, 'not_found', '系统技能不存在')
    })
  }

  const adminSkillForceMatch = /^\/admin\/skills\/([^/]+)\/force-disable$/.exec(path)
  if (method === 'PUT' && adminSkillForceMatch) {
    if (typeof body.force_disabled !== 'boolean') {
      return fail(422, 'validation_error', 'force_disabled 必须为布尔值')
    }
    return guarded(() => {
      const skill = mockDb.adminSetSkillForceDisabled(
        adminSkillForceMatch[1]!,
        body.force_disabled as boolean,
      )
      return skill ? ok(skill) : fail(404, 'not_found', '系统技能不存在')
    })
  }

  if (path === '/admin/mcp/servers') {
    if (method === 'GET') return ok(mockDb.adminListMcpServers())
    if (method === 'POST') {
      return guarded(() => {
        if (typeof body.name !== 'string' || !body.name.trim()) {
          return fail(422, 'validation_error', 'name 不能为空')
        }
        if (typeof body.slug !== 'string' || !/^[a-z0-9][a-z0-9-]{1,63}$/.test(body.slug)) {
          return fail(422, 'validation_error', 'slug 格式不合法')
        }
        return ok(
          mockDb.adminCreateMcpServer({
            name: body.name,
            slug: body.slug,
            description: typeof body.description === 'string' ? body.description : undefined,
            transport: body.transport as 'streamable_http' | 'sse' | 'stdio' | undefined,
            url: typeof body.url === 'string' ? body.url : undefined,
            headers:
              body.headers && typeof body.headers === 'object'
                ? (body.headers as Record<string, string>)
                : undefined,
          }),
          201,
        )
      })
    }
  }

  const adminMcpMatch = /^\/admin\/mcp\/servers\/([^/]+)$/.exec(path)
  if (adminMcpMatch) {
    const serverId = adminMcpMatch[1]!
    if (method === 'PATCH') {
      const readOnly = unknownKeys(body, [
        'name',
        'description',
        'url',
        'headers',
        'auto_inject',
        'enabled',
        'force_disabled',
      ])
      if (readOnly.length > 0) {
        return fail(422, 'validation_error', `字段不可编辑：${readOnly.join(', ')}`)
      }
      return guarded(() => {
        const server = mockDb.adminUpdateMcpServer(serverId, {
          name: typeof body.name === 'string' ? body.name : undefined,
          description: typeof body.description === 'string' ? body.description : undefined,
          url: typeof body.url === 'string' ? body.url : undefined,
          headers:
            body.headers && typeof body.headers === 'object'
              ? (body.headers as Record<string, string>)
              : undefined,
          auto_inject: typeof body.auto_inject === 'boolean' ? body.auto_inject : undefined,
          enabled: typeof body.enabled === 'boolean' ? body.enabled : undefined,
          force_disabled:
            typeof body.force_disabled === 'boolean' ? body.force_disabled : undefined,
        })
        return server ? ok(server) : fail(404, 'not_found', '系统 MCP 不存在')
      })
    }
    if (method === 'DELETE') {
      return mockDb.adminDeleteMcpServer(serverId)
        ? ok(null, 204)
        : fail(404, 'not_found', '系统 MCP 不存在')
    }
  }

  if (method === 'GET' && path === '/admin/agents') {
    return ok(
      mockDb.adminListAgents({
        health_status: stringParam(req.query, 'health_status'),
        enabled: stringParam(req.query, 'enabled'),
        q: stringParam(req.query, 'q'),
        limit: numberParam(req.query, 'limit'),
        cursor: stringParam(req.query, 'cursor'),
      }),
    )
  }

  const adminAgentMatch = /^\/admin\/agents\/([^/]+)$/.exec(path)
  if (method === 'PATCH' && adminAgentMatch) {
    const readOnly = unknownKeys(body, ['name', 'enabled', 'requires_approval', 'auth', 'headers'])
    if (readOnly.length > 0) {
      return fail(422, 'validation_error', `字段不可编辑：${readOnly.join(', ')}`)
    }
    return guarded(() => {
      const agent = mockDb.adminUpdateAgent(adminAgentMatch[1]!, {
        name: typeof body.name === 'string' ? body.name : undefined,
        enabled: typeof body.enabled === 'boolean' ? body.enabled : undefined,
        requires_approval:
          typeof body.requires_approval === 'boolean' ? body.requires_approval : undefined,
        auth:
          body.auth && typeof body.auth === 'object'
            ? (body.auth as AdminAgentUpdateRequest['auth'])
            : undefined,
        headers:
          body.headers && typeof body.headers === 'object'
            ? (body.headers as Record<string, string>)
            : undefined,
      })
      return agent ? ok(agent) : fail(404, 'not_found', 'Agent 不存在')
    })
  }

  // ---------- 运行 ----------
  const runEventsMatch = /^\/runs\/([^/]+)\/events$/.exec(path)
  if (method === 'GET' && runEventsMatch) {
    const result = mockDb.listRunEvents(runEventsMatch[1]!, {
      ...pageQuery(req.query),
      after_seq: numberParam(req.query, 'after_seq'),
      types: stringParam(req.query, 'types'),
      q: stringParam(req.query, 'q'),
    })
    return result ? ok(result) : fail(404, 'not_found', '运行不存在')
  }

  const runCancelMatch = /^\/runs\/([^/]+)\/cancel$/.exec(path)
  if (method === 'POST' && runCancelMatch) {
    const run = mockDb.getRun(runCancelMatch[1]!)
    if (!run) return fail(404, 'not_found', '运行不存在')
    const canceled = mockDb.cancelRun(run.id)
    return canceled
      ? ok(canceled)
      : fail(409, 'run_not_cancelable', '该运行已结束，无法取消', { status: run.status })
  }

  const runMatch = /^\/runs\/([^/]+)$/.exec(path)
  if (method === 'GET' && runMatch) {
    const run = mockDb.getRun(runMatch[1]!)
    return run ? ok(run) : fail(404, 'not_found', '运行不存在')
  }

  // ---------- 审批 ----------
  if (method === 'GET' && path === '/approvals') {
    return ok(
      mockDb.listApprovals({
        status: stringParam(req.query, 'status'),
        conversation_id: stringParam(req.query, 'conversation_id'),
        run_id: stringParam(req.query, 'run_id'),
        ...pageQuery(req.query),
      }),
    )
  }

  const approvalDetailMatch = /^\/approvals\/([^/]+)$/.exec(path)
  if (method === 'GET' && approvalDetailMatch) {
    const unauthorized = requireAuth(req)
    if (unauthorized) return unauthorized
    const approval = mockDb.approvals.find((item) => item.id === approvalDetailMatch[1])
    return approval ? ok(approval) : fail(404, 'not_found', '审批不存在')
  }

  const approvalDecisionMatch = /^\/approvals\/([^/]+)\/decision$/.exec(path)
  if (method === 'POST' && approvalDecisionMatch) {
    const decision = body.decision === 'reject' ? 'reject' : 'approve'
    try {
      const approval = mockDb.resolveApproval(
        approvalDecisionMatch[1]!,
        decision,
        String(body.note ?? ''),
      )
      if (!approval) return fail(404, 'not_found', '审批不存在')
      const remaining = mockDb.listApprovals({
        status: 'pending',
        run_id: approval.run_id,
        limit: 1,
      })
      const resumed = remaining.items.length === 0
      return ok({
        id: approval.id,
        status: approval.status,
        run_id: approval.run_id,
        resumed,
        resume_error: resumed ? null : '本轮还有其他审批待处理',
      })
    } catch {
      return fail(409, 'approval_already_decided', '该审批已处理')
    }
  }

  // ---------- 审计日志 ----------
  if (method === 'GET' && (path === '/audit-logs' || path === '/admin/audit-logs')) {
    const unauthorized = requireAuth(req)
    if (unauthorized) return unauthorized
    const scope = path === '/admin/audit-logs' ? 'all' : 'own'
    if (scope === 'all' && mockDb.user.role !== 'admin') {
      return fail(403, 'forbidden', '仅管理员可查看全局审计')
    }
    return ok(
      mockDb.listAuditLogs(
        {
          action: stringParam(req.query, 'action'),
          resource_type: stringParam(req.query, 'resource_type'),
          actor_type: stringParam(req.query, 'actor_type'),
          actor_id: stringParam(req.query, 'actor_id'),
          resource_id: stringParam(req.query, 'resource_id'),
          start: stringParam(req.query, 'start'),
          end: stringParam(req.query, 'end'),
          ...pageQuery(req.query),
        },
        scope,
      ),
    )
  }

  // ---------- 平台密钥 ----------
  if (method === 'GET' && path === '/admin/secrets') {
    const unauthorized = requireAuth(req)
    if (unauthorized) return unauthorized
    if (mockDb.user.role !== 'admin') return fail(403, 'forbidden', '仅管理员可管理平台密钥')
    const rawEnabled = req.query.get('enabled')
    return ok({
      items: mockDb.listSecrets(rawEnabled === null ? undefined : rawEnabled === 'true'),
    })
  }

  if (method === 'POST' && path === '/admin/secrets') {
    const unauthorized = requireAuth(req)
    if (unauthorized) return unauthorized
    if (mockDb.user.role !== 'admin') return fail(403, 'forbidden', '仅管理员可管理平台密钥')
    const name = String(body.name ?? '').trim()
    const value = String(body.value ?? '')
    const description = String(body.description ?? '')
    if (!SECRET_NAME_PATTERN.test(name)) {
      return fail(422, 'validation_error', '密钥名称需以字母或下划线开头，仅含字母/数字/下划线')
    }
    if (!value) return fail(422, 'validation_error', '密钥值不能为空')
    if (description.length > 200) return fail(422, 'validation_error', '描述不能超过 200 字')
    const created = mockDb.createSecret({ name, description })
    if (!created) return fail(409, 'secret_exists', '同名密钥已存在')
    return ok(created, 201)
  }

  const secretMatch = /^\/admin\/secrets\/([^/]+)$/.exec(path)
  if (secretMatch) {
    const unauthorized = requireAuth(req)
    if (unauthorized) return unauthorized
    if (mockDb.user.role !== 'admin') return fail(403, 'forbidden', '仅管理员可管理平台密钥')
    const name = decodeURIComponent(secretMatch[1]!)
    if (method === 'PATCH') {
      const description = body.description === undefined ? undefined : String(body.description)
      const enabled = typeof body.enabled === 'boolean' ? body.enabled : undefined
      const value = body.value === undefined ? undefined : String(body.value)
      if (value !== undefined && !value) return fail(422, 'validation_error', '密钥值不能为空')
      if (description !== undefined && description.length > 200) {
        return fail(422, 'validation_error', '描述不能超过 200 字')
      }
      if (description === undefined && enabled === undefined && value === undefined) {
        return fail(422, 'validation_error', '至少提供一个要修改的字段')
      }
      const updated = mockDb.updateSecret(name, { description, enabled })
      return updated ? ok(updated) : fail(404, 'not_found', '密钥不存在')
    }
    if (method === 'DELETE') {
      return mockDb.deleteSecret(name) ? ok(null, 204) : fail(404, 'not_found', '密钥不存在')
    }
  }

  // ---------- 系统信息 ----------
  if (method === 'GET' && path === '/system/info') {
    return ok(mockDb.getSystemInfo())
  }

  // ---------- 智能体 ----------
  if (method === 'GET' && path === '/agents') {
    return ok(
      mockDb.listAgents({
        health_status: stringParam(req.query, 'health_status'),
        enabled: stringParam(req.query, 'enabled'),
        q: stringParam(req.query, 'q'),
        ...pageQuery(req.query),
      }),
    )
  }

  const agentHealthMatch = /^\/agents\/([^/]+)\/health$/.exec(path)
  if (method === 'POST' && agentHealthMatch) {
    const result = mockDb.checkAgentHealth(agentHealthMatch[1]!)
    return result ? ok(result) : fail(404, 'not_found', '智能体不存在')
  }

  if (method === 'POST' && path === '/agents/preview') {
    const url = String(body.url ?? '').trim()
    if (!/^https?:\/\//.test(url)) {
      return fail(422, 'agent_url_not_allowed', 'Agent URL 必须是 http(s) 地址')
    }
    return ok(
      mockDb.previewAgent({
        url,
        slug: String(body.slug ?? ''),
        auth: body.auth as { type: 'none' | 'api_key'; secret_ref?: string } | undefined,
      }),
    )
  }

  if (method === 'POST' && path === '/agents') {
    const url = String(body.url ?? '').trim()
    if (!/^https?:\/\//.test(url)) {
      return fail(422, 'agent_url_not_allowed', 'Agent URL 必须是 http(s) 地址')
    }
    return ok(
      mockDb.createAgent({
        url,
        slug: String(body.slug ?? ''),
        name: body.name === undefined ? undefined : String(body.name),
        auth: body.auth as { type: 'none' | 'api_key'; secret_ref?: string } | undefined,
      }),
      201,
    )
  }

  const agentRefreshMatch = /^\/agents\/([^/]+)\/refresh$/.exec(path)
  if (method === 'POST' && agentRefreshMatch) {
    const result = mockDb.refreshAgent(agentRefreshMatch[1]!)
    return result ? ok(result) : fail(404, 'not_found', '智能体不存在')
  }

  const agentMatch = /^\/agents\/([^/]+)$/.exec(path)
  if (agentMatch) {
    const id = agentMatch[1]!
    if (method === 'GET') {
      const agent = mockDb.getAgentDetail(id)
      return agent ? ok(agent) : fail(404, 'not_found', '智能体不存在')
    }
    if (method === 'PATCH') {
      const agent = mockDb.updateAgent(id, {
        name: body.name === undefined ? undefined : String(body.name),
        enabled: typeof body.enabled === 'boolean' ? body.enabled : undefined,
        auth: body.auth as { type: 'none' | 'api_key'; secret_ref?: string } | undefined,
      })
      return agent ? ok(agent) : fail(404, 'not_found', '智能体不存在')
    }
    if (method === 'DELETE') {
      return mockDb.deleteAgent(id) ? ok(null, 204) : fail(404, 'not_found', '智能体不存在')
    }
  }

  // ---------- 任务 ----------
  if (method === 'GET' && path === '/tasks') {
    return ok(
      mockDb.listTasks({
        state: stringParam(req.query, 'state'),
        q: stringParam(req.query, 'q'),
        agent_id: stringParam(req.query, 'agent_id'),
        ...pageQuery(req.query),
      }),
    )
  }

  const taskActionMatch = /^\/tasks\/([^/]+)\/(cancel|resume|authorize|reject)$/.exec(path)
  if (method === 'POST' && taskActionMatch) {
    const id = taskActionMatch[1]!
    const action = taskActionMatch[2] as 'cancel' | 'resume' | 'authorize' | 'reject'
    if (action === 'resume') {
      const input = String(body.input ?? '').trim()
      if (!input) return fail(422, 'validation_error', '补充信息不能为空')
      if (input.length > 2000) return fail(422, 'validation_error', '补充信息过长')
      const task = mockDb.resumeTask(id, input)
      return task
        ? ok({ task, run: { id: task.run_id, status: 'running' } })
        : fail(409, 'task_not_resumable', '任务当前状态不允许补充信息')
    }
    if (action === 'cancel') {
      const task = mockDb.cancelTask(id)
      return task ? ok(task) : fail(409, 'task_not_cancelable', '任务当前状态不允许取消')
    }
    if (action === 'authorize') {
      const task = mockDb.authorizeTask(id)
      return task ? ok(task) : fail(409, 'task_not_authorizable', '任务当前状态不允许授权')
    }
    const task = mockDb.rejectTask(id, String(body.reason ?? ''))
    return task ? ok(task) : fail(409, 'task_not_rejectable', '任务当前状态不允许拒绝')
  }

  const taskMatch = /^\/tasks\/([^/]+)$/.exec(path)
  if (method === 'GET' && taskMatch) {
    const task = mockDb.getTaskDetail(taskMatch[1]!)
    return task ? ok(task) : fail(404, 'not_found', '任务不存在')
  }

  // ---------- 附件 ----------
  if (method === 'POST' && path === '/attachments') {
    const form = formOf(body)
    if (!form?.file) return fail(422, 'validation_error', '请选择要上传的文件')
    if (form.file.size > 20 * 1024 * 1024) {
      return fail(413, 'attachment_too_large', '附件不能超过 20 MB')
    }
    const allowed =
      form.file.type.startsWith('text/') ||
      ['application/json', 'application/pdf', 'application/xml', 'text/markdown'].includes(
        form.file.type,
      )
    if (!allowed) return fail(422, 'attachment_type_not_allowed', '该文件类型不允许上传')
    const attachment = mockDb.createAttachment({
      filename: form.file.name,
      mime_type: form.file.type,
      size_bytes: form.file.size,
      conversation_id: form.fields.conversation_id ?? null,
      purpose: form.fields.purpose ?? 'chat',
      content: `mock uploaded file: ${form.file.name}\n`,
    })
    return ok(attachment, 201)
  }

  if (method === 'GET' && path === '/attachments') {
    return ok(
      mockDb.listAttachments({
        conversation_id: stringParam(req.query, 'conversation_id'),
        ...pageQuery(req.query),
      }),
    )
  }

  const attachmentDownloadMatch = /^\/attachments\/([^/]+)\/download$/.exec(path)
  if (method === 'GET' && attachmentDownloadMatch) {
    const attachment = mockDb.getAttachment(attachmentDownloadMatch[1]!)
    if (!attachment) return fail(404, 'not_found', '附件不存在')
    return ok(
      new Blob([mockDb.attachmentContent(attachment.id) ?? ''], {
        type: attachment.mime_type,
      }),
    )
  }

  const attachmentMatch = /^\/attachments\/([^/]+)$/.exec(path)
  if (attachmentMatch) {
    const id = attachmentMatch[1]!
    if (method === 'GET') {
      const attachment = mockDb.getAttachment(id)
      return attachment ? ok(attachment) : fail(404, 'not_found', '附件不存在')
    }
    if (method === 'DELETE') {
      return mockDb.deleteAttachment(id) ? ok(null, 204) : fail(404, 'not_found', '附件不存在')
    }
  }

  // ---------- 指令 ----------
  if (method === 'GET' && path === '/instructions') {
    return ok(mockDb.getInstruction())
  }

  if (method === 'PUT' && path === '/instructions') {
    // 契约字段是 content；兼容早期草稿里的 value，避免联调时静默 422。
    const value = body.content !== undefined ? body.content : body.value
    if (value !== null && typeof value !== 'string') {
      return fail(422, 'validation_error', 'content 必须是字符串或 null')
    }
    if (typeof value === 'string' && value.length > mockDb.getInstruction().max_chars) {
      return fail(422, 'instruction_too_long', '指令超过字符上限')
    }
    return ok(mockDb.saveInstruction(value as string | null))
  }

  // ---------- 记忆 ----------
  if (method === 'GET' && path === '/memories') {
    return ok(
      mockDb.listMemories({
        kind: stringParam(req.query, 'kind'),
        status: stringParam(req.query, 'status'),
        q: stringParam(req.query, 'q'),
        ...pageQuery(req.query),
      }),
    )
  }

  if (method === 'POST' && path === '/memories') {
    const title = String(body.title ?? '').trim()
    const content = String(body.content ?? '').trim()
    const kind = String(body.kind ?? 'fact')
    if (!title) return fail(422, 'validation_error', '记忆标题不能为空')
    if (!content) return fail(422, 'validation_error', '记忆内容不能为空')
    if (!['profile', 'preference', 'fact'].includes(kind)) {
      return fail(422, 'validation_error', 'kind 不合法')
    }
    return ok(
      mockDb.createMemory({
        kind: kind as 'profile' | 'preference' | 'fact',
        title,
        content,
        pinned: body.pinned === true,
      }),
      201,
    )
  }

  if (method === 'GET' && path === '/memories/export') {
    // 真实后端字段：{version, exported_at, items}。
    return ok({
      version: 1,
      exported_at: new Date().toISOString(),
      items: mockDb.listMemories({ limit: 100 }).items,
    })
  }

  if (method === 'DELETE' && path === '/memories') {
    if (req.query.get('confirm') !== 'true') {
      return fail(422, 'validation_error', '清空全部记忆需要 confirm=true')
    }
    return ok({ deleted: mockDb.clearMemories() })
  }

  const memoryMatch = /^\/memories\/([^/]+)$/.exec(path)
  if (memoryMatch) {
    const id = memoryMatch[1]!
    if (method === 'GET') {
      const memory = mockDb.getMemory(id)
      return memory ? ok(memory) : fail(404, 'not_found', '记忆不存在')
    }
    if (method === 'PATCH') {
      const memory = mockDb.updateMemory(id, {
        kind: body.kind as 'profile' | 'preference' | 'fact' | undefined,
        title: body.title === undefined ? undefined : String(body.title),
        content: body.content === undefined ? undefined : String(body.content),
        pinned: typeof body.pinned === 'boolean' ? body.pinned : undefined,
        status: body.status === 'archived' ? 'archived' : body.status === 'active' ? 'active' : undefined,
      })
      return memory ? ok(memory) : fail(404, 'not_found', '记忆不存在')
    }
    if (method === 'DELETE') {
      return mockDb.deleteMemory(id) ? ok(null, 204) : fail(404, 'not_found', '记忆不存在')
    }
  }

  // ---------- 技能 ----------
  if (method === 'GET' && path === '/skills') {
    const page = mockDb.listSkills({
      scope: stringParam(req.query, 'scope'),
      enabled:
        req.query.get('enabled') === null ? undefined : req.query.get('enabled') === 'true',
      q: stringParam(req.query, 'q'),
    })
    // 与真实后端一致：技能列表不分页，只返回 {items, stats}。
    return ok({ items: page.items, stats: page.stats })
  }

  if (method === 'POST' && path === '/skills') {
    const name = String(body.name ?? '').trim()
    const slug =
      String(body.slug ?? '').trim() ||
      name.toLowerCase().replace(/[^a-z0-9_-]+/g, '-') ||
      `skill-${Date.now()}`
    const content = String(body.content ?? '').trim()
    if (!name || !content) {
      return fail(422, 'validation_error', 'name 与 content 为必填')
    }
    return ok(
      mockDb.createSkill({
        slug,
        name,
        description: String(body.description ?? ''),
        content,
      }),
      201,
    )
  }

  if (method === 'POST' && path === '/skills/import') {
    const form = formOf(body)
    if (!form?.file) return fail(422, 'skill_invalid', '请上传 zip 技能包')
    if (!form.file.name.toLowerCase().endsWith('.zip')) {
      return fail(422, 'skill_invalid', '技能包必须是 zip 文件')
    }
    const imported = mockDb.importSkill(form.file.name)
    return ok({ ...imported.skill, imported: true, ignored: imported.warnings }, 201)
  }

  if (method === 'GET' && path === '/skills/catalog') {
    return ok({
      items: mockDb.listSkillCatalog().map((skill) => ({
        id: skill.id,
        slug: skill.slug,
        name: skill.name,
        description: skill.description,
        scope: skill.scope,
        estimated_tokens: skill.estimated_tokens,
        enabled: mockDb.skillEnabled(skill),
      })),
    })
  }

  const skillFilesMatch = /^\/skills\/([^/]+)\/files$/.exec(path)
  if (method === 'GET' && skillFilesMatch) {
    const files = mockDb.listSkillFiles(skillFilesMatch[1]!)
    return files ? ok({ items: files }) : fail(404, 'not_found', '技能不存在')
  }

  const skillFileMatch = /^\/skills\/([^/]+)\/files\/(.+)$/.exec(path)
  if (method === 'GET' && skillFileMatch) {
    const file = mockDb.readSkillFile(
      skillFileMatch[1]!,
      decodeURIComponent(skillFileMatch[2]!),
    )
    return file ? ok(file) : fail(404, 'not_found', '技能文件不存在')
  }

  const skillEnabledMatch = /^\/skills\/([^/]+)\/enabled$/.exec(path)
  if (method === 'PUT' && skillEnabledMatch) {
    if (typeof body.enabled !== 'boolean') {
      return fail(422, 'validation_error', 'enabled 必须是布尔值')
    }
    const skill = mockDb.setSkillEnabled(skillEnabledMatch[1]!, body.enabled)
    return skill ? ok(skill) : fail(404, 'not_found', '技能不存在')
  }

  const skillMatch = /^\/skills\/([^/]+)$/.exec(path)
  if (skillMatch) {
    const id = skillMatch[1]!
    if (method === 'GET') {
      const skill = mockDb.getSkill(id)
      return skill ? ok(skill) : fail(404, 'not_found', '技能不存在')
    }
    if (method === 'PATCH') {
      const skill = mockDb.updateSkill(id, {
        name: body.name === undefined ? undefined : String(body.name),
        description: body.description === undefined ? undefined : String(body.description),
        content: body.content === undefined ? undefined : String(body.content),
      })
      return skill ? ok(skill) : fail(404, 'not_found', '技能不存在或不可编辑')
    }
    if (method === 'DELETE') {
      return mockDb.deleteSkill(id) ? ok(null, 204) : fail(404, 'not_found', '技能不存在或不可删除')
    }
  }

  // ---------- MCP ----------
  if (method === 'GET' && path === '/mcp/servers') {
    const page = mockDb.listMcpServers({
      scope: stringParam(req.query, 'scope'),
      enabled:
        req.query.get('enabled') === null ? undefined : req.query.get('enabled') === 'true',
      health_status: stringParam(req.query, 'health_status'),
      q: stringParam(req.query, 'q'),
    })
    // 与真实后端一致：MCP 列表不分页，只返回 {items, stats}。
    return ok({ items: page.items, stats: page.stats })
  }

  if (method === 'POST' && path === '/mcp/servers') {
    const name = String(body.name ?? '').trim()
    const url = String(body.url ?? '').trim()
    const transport = body.transport === 'sse' ? 'sse' : 'streamable_http'
    if (!name || !url) return fail(422, 'validation_error', 'name 与 url 均为必填')
    if (!/^https?:\/\//.test(url)) return fail(422, 'validation_error', 'url 必须是 http(s) 地址')
    if (body.transport === 'stdio') {
      return fail(422, 'mcp_transport_not_allowed', '用户自建 MCP 不支持 stdio')
    }
    return ok(
      mockDb.createMcpServer({
        name,
        slug: String(body.slug ?? ''),
        url,
        transport,
        headers: body.headers as Record<string, string> | undefined,
        description: String(body.description ?? ''),
        auto_inject: body.auto_inject === true,
      }),
      201,
    )
  }

  if (method === 'GET' && path === '/mcp/available') {
    // 与真实后端一致：目录只含服务器，工具在展开时按需拉取 /mcp/servers/{id}/tools。
    return ok({ items: mockDb.availableMcp().servers })
  }

  const mcpToolMatch = /^\/mcp\/tools\/([^/]+)$/.exec(path)
  if (method === 'PATCH' && mcpToolMatch) {
    const tool = mockDb.updateMcpTool(mcpToolMatch[1]!, {
      enabled: typeof body.enabled === 'boolean' ? body.enabled : undefined,
      requires_approval:
        typeof body.requires_approval === 'boolean' ? body.requires_approval : undefined,
    })
    return tool ? ok(tool) : fail(404, 'not_found', '工具不存在')
  }

  const mcpCheckMatch = /^\/mcp\/servers\/([^/]+)\/check$/.exec(path)
  if (method === 'POST' && mcpCheckMatch) {
    const result = mockDb.checkMcpServer(mcpCheckMatch[1]!)
    return result ? ok(rawCheckResult(mcpCheckMatch[1]!, result)) : fail(404, 'not_found', 'MCP 服务器不存在')
  }

  const mcpRefreshMatch = /^\/mcp\/servers\/([^/]+)\/refresh-tools$/.exec(path)
  if (method === 'POST' && mcpRefreshMatch) {
    const result = mockDb.checkMcpServer(mcpRefreshMatch[1]!)
    return result
      ? ok(rawCheckResult(mcpRefreshMatch[1]!, result))
      : fail(404, 'not_found', 'MCP 服务器不存在')
  }

  const mcpToolsMatch = /^\/mcp\/servers\/([^/]+)\/tools$/.exec(path)
  if (method === 'GET' && mcpToolsMatch) {
    const tools = mockDb.listMcpTools(mcpToolsMatch[1]!)
    return tools ? ok({ items: tools }) : fail(404, 'not_found', 'MCP 服务器不存在')
  }

  const mcpEnabledMatch = /^\/mcp\/servers\/([^/]+)\/enabled$/.exec(path)
  if (method === 'PUT' && mcpEnabledMatch) {
    if (typeof body.enabled !== 'boolean') {
      return fail(422, 'validation_error', 'enabled 必须是布尔值')
    }
    const server = mockDb.setMcpServerEnabled(mcpEnabledMatch[1]!, body.enabled)
    return server ? ok(server) : fail(404, 'not_found', 'MCP 服务器不存在')
  }

  const mcpServerMatch = /^\/mcp\/servers\/([^/]+)$/.exec(path)
  if (mcpServerMatch) {
    const id = mcpServerMatch[1]!
    if (method === 'GET') {
      const server = mockDb.getMcpServer(id)
      return server ? ok(server) : fail(404, 'not_found', 'MCP 服务器不存在')
    }
    if (method === 'PATCH') {
      const server = mockDb.updateMcpServer(id, {
        name: body.name === undefined ? undefined : String(body.name),
        url: body.url === undefined ? undefined : String(body.url),
        auto_inject: typeof body.auto_inject === 'boolean' ? body.auto_inject : undefined,
        headers: body.headers as Record<string, string> | undefined,
      })
      return server ? ok(server) : fail(404, 'not_found', 'MCP 服务器不存在')
    }
    if (method === 'DELETE') {
      return mockDb.deleteMcpServer(id)
        ? ok(null, 204)
        : fail(404, 'not_found', 'MCP 服务器不存在或不可删除')
    }
  }

  // ---------- 知识库 ----------
  if (path === '/knowledge/documents') {
    const unauthorized = requireAuth(req)
    if (unauthorized) return unauthorized

    if (method === 'POST') {
      const form = formOf(body)
      if (!form?.file) return fail(422, 'validation_error', '请选择要上传的文件')
      const filename = form.file.name
      const size = form.file.size
      if (size > KNOWLEDGE_MAX_UPLOAD_BYTES) {
        return fail(413, 'payload_too_large', `上传文件超过大小上限（${KNOWLEDGE_MAX_UPLOAD_BYTES} 字节）`)
      }
      const extension = filename.includes('.') ? filename.split('.').pop()!.toLowerCase() : ''
      if (!KNOWLEDGE_ALLOWED_EXTENSIONS.includes(extension)) {
        return fail(422, 'validation_error', '仅支持 Markdown、TXT、PDF、CSV 与 JSON')
      }
      if (filename.length > 255) return fail(422, 'validation_error', '文件名不能超过 255 个字符')

      const title = form.fields.title?.trim() ?? ''
      const category = form.fields.category?.trim() ?? ''
      const scope = form.fields.scope ?? 'user'
      if (title.length > 200) return fail(422, 'validation_error', '标题不能超过 200 个字符')
      if (category.length > 64) return fail(422, 'validation_error', '分类不能超过 64 个字符')
      if (scope !== 'user' && scope !== 'system') {
        return fail(422, 'validation_error', '无效的归属范围')
      }
      if (scope === 'system' && mockDb.user.role !== 'admin') {
        return fail(403, 'forbidden', '系统文档仅管理员可上传')
      }

      const result = mockDb.uploadKnowledgeDocument({
        filename,
        size_bytes: size,
        title,
        category,
        scope,
      })
      return ok(result.document, result.created ? 201 : 200)
    }

    if (method === 'GET') {
      const ownerScope = stringParam(req.query, 'owner_scope') === 'all' ? 'all' : 'visible'
      if (ownerScope === 'all' && mockDb.user.role !== 'admin') {
        return fail(403, 'forbidden', '仅管理员可查看全部文档')
      }
      const status = stringParam(req.query, 'status')
      if (status && !['pending', 'indexing', 'ready', 'failed'].includes(status)) {
        return fail(422, 'validation_error', '无效的文档状态')
      }
      return ok(
        mockDb.listKnowledgeDocuments({
          q: stringParam(req.query, 'q'),
          category: stringParam(req.query, 'category'),
          status,
          owner_scope: ownerScope,
          ...pageQuery(req.query),
        }),
      )
    }
  }

  if (method === 'POST' && path === '/knowledge/search') {
    const unauthorized = requireAuth(req)
    if (unauthorized) return unauthorized
    const query = String(body.query ?? '').trim()
    if (!query) return fail(422, 'validation_error', '检索内容不能为空')
    if (query.length > 500) return fail(422, 'validation_error', '检索内容长度不能超过 500 个字符')
    const rawTopK = Number(body.top_k)
    const topK = Number.isFinite(rawTopK) ? Math.min(Math.max(rawTopK, 1), 20) : 6
    const filters = (body.filters ?? {}) as { category?: unknown }
    const category = typeof filters.category === 'string' ? filters.category.trim() : ''
    const started = performance.now()
    const hits = mockDb.searchKnowledge(query, topK, category || undefined)
    return ok({ hits, elapsed_ms: Math.max(0, Math.round(performance.now() - started)) })
  }

  if (method === 'POST' && path === '/knowledge/rebuild') {
    const unauthorized = requireAuth(req)
    if (unauthorized) return unauthorized
    if (mockDb.user.role !== 'admin') return fail(403, 'forbidden', '仅管理员可重建索引')
    const scope = String(body.scope ?? '')
    if (scope !== 'all' && scope !== 'system' && scope !== 'own') {
      return fail(422, 'validation_error', '无效的重建范围')
    }
    return ok(mockDb.rebuildKnowledgeIndex(scope))
  }

  const knowledgeRetryMatch = /^\/knowledge\/documents\/([^/]+)\/retry$/.exec(path)
  if (method === 'POST' && knowledgeRetryMatch) {
    const unauthorized = requireAuth(req)
    if (unauthorized) return unauthorized
    const document = mockDb.getKnowledgeDocument(knowledgeRetryMatch[1]!)
    if (!document || !mockDb.canReadKnowledgeDocument(document)) {
      return fail(404, 'not_found', '知识库文档不存在')
    }
    if (!mockDb.canWriteKnowledgeDocument(document)) {
      return fail(403, 'forbidden', '无权操作该文档')
    }
    return ok(mockDb.retryKnowledgeDocument(document.id))
  }

  const knowledgeDocumentMatch = /^\/knowledge\/documents\/([^/]+)$/.exec(path)
  if (knowledgeDocumentMatch) {
    const unauthorized = requireAuth(req)
    if (unauthorized) return unauthorized
    const document = mockDb.getKnowledgeDocument(knowledgeDocumentMatch[1]!)
    if (!document || !mockDb.canReadKnowledgeDocument(document)) {
      return fail(404, 'not_found', '知识库文档不存在')
    }
    if (method === 'GET') return ok(document)
    if (method === 'DELETE') {
      if (!mockDb.canWriteKnowledgeDocument(document)) {
        return fail(403, 'forbidden', '无权操作该文档')
      }
      return mockDb.deleteKnowledgeDocument(document.id)
        ? ok(null, 204)
        : fail(404, 'not_found', '知识库文档不存在')
    }
  }

  // ---------- 工作流（M9 七端点，与真实后端同形状） ----------
  if (method === 'GET' && path === '/workflows') {
    return ok(mockDb.listWorkflows(pageQuery(req.query)))
  }

  if (method === 'POST' && path === '/workflows') {
    return guarded(() => {
      if (typeof body.name !== 'string' || !body.name.trim()) {
        return fail(422, 'validation_error', 'name 为必填字段')
      }
      if (!Array.isArray(body.steps)) {
        return fail(422, 'workflow_steps_invalid', 'steps 必须是数组')
      }
      return ok(
        mockDb.createWorkflow({
          name: body.name,
          description: typeof body.description === 'string' ? body.description : undefined,
          steps: body.steps as WorkflowStep[],
        }),
        201,
      )
    })
  }

  const workflowRunsMatch = /^\/workflows\/([^/]+)\/runs$/.exec(path)
  if (method === 'GET' && workflowRunsMatch) {
    return guarded(() => {
      const page = mockDb.listWorkflowRuns(workflowRunsMatch[1]!, pageQuery(req.query))
      return page ? ok(page) : fail(404, 'not_found', '工作流不存在')
    })
  }

  const workflowEnabledMatch = /^\/workflows\/([^/]+)\/enabled$/.exec(path)
  if (method === 'PUT' && workflowEnabledMatch) {
    if (typeof body.enabled !== 'boolean') {
      return fail(422, 'validation_error', 'enabled 必须是布尔值')
    }
    return guarded(() => {
      const workflow = mockDb.setWorkflowEnabled(workflowEnabledMatch[1]!, body.enabled as boolean)
      return workflow ? ok(workflow) : fail(404, 'not_found', '工作流不存在')
    })
  }

  const workflowMatch = /^\/workflows\/([^/]+)$/.exec(path)
  if (workflowMatch) {
    const id = workflowMatch[1]!
    if (method === 'GET') {
      const workflow = mockDb.getWorkflow(id)
      return workflow ? ok(workflow) : fail(404, 'not_found', '工作流不存在')
    }
    if (method === 'PATCH') {
      return guarded(() => {
        const workflow = mockDb.updateWorkflow(id, {
          name: body.name === undefined ? undefined : String(body.name),
          description: body.description === undefined ? undefined : String(body.description),
          steps: Array.isArray(body.steps) ? (body.steps as WorkflowStep[]) : undefined,
        })
        return workflow ? ok(workflow) : fail(404, 'not_found', '工作流不存在')
      })
    }
    if (method === 'DELETE') {
      return mockDb.deleteWorkflow(id)
        ? ok(null, 204)
        : fail(404, 'not_found', '工作流不存在')
    }
  }

  return fail(404, 'not_found', `Mock 未实现：${method} ${path}`)
}
