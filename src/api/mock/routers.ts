import type { AuthTokens } from '@/types'

import { mockDb } from './db'

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

function ok(data: unknown, status = 200): MockResult {
  return { status, data }
}

function fail(status: number, code: string, message: string): MockResult {
  return {
    status,
    data: {
      error: {
        code,
        message,
        request_id: `mock-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      },
    },
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
    mockDb.user.email = email
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
      const status = body.status === 'archived' ? 'archived' : body.status === 'active' ? 'active' : undefined
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
      : fail(409, 'run_not_cancelable', '该运行已结束，无法取消')
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
      return ok({
        id: approval.id,
        status: approval.status,
        run_id: approval.run_id,
        resumed: decision === 'approve',
        resume_error: null,
      })
    } catch {
      return fail(409, 'approval_already_decided', '该审批已处理')
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

  const taskMatch = /^\/tasks\/([^/]+)$/.exec(path)
  if (method === 'GET' && taskMatch) {
    const task = mockDb.getTaskDetail(taskMatch[1]!)
    return task ? ok(task) : fail(404, 'not_found', '任务不存在')
  }

  // ---------- 知识库 ----------
  if (method === 'GET' && path === '/knowledge/documents') {
    return ok(
      mockDb.listKnowledgeDocuments({
        q: stringParam(req.query, 'q'),
        category: stringParam(req.query, 'category'),
        status: stringParam(req.query, 'status'),
        ...pageQuery(req.query),
      }),
    )
  }

  // ---------- 工作流 ----------
  if (method === 'GET' && path === '/workflows') {
    return ok(
      mockDb.listWorkflows({
        q: stringParam(req.query, 'q'),
        status: stringParam(req.query, 'status'),
        ...pageQuery(req.query),
      }),
    )
  }

  return fail(404, 'not_found', `Mock 未实现：${method} ${path}`)
}
