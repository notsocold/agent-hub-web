import type {
  AdminAgentList,
  AdminAgentListParams,
  AdminAgentUpdateRequest,
  AdminInstruction,
  AdminMcpServerCreateRequest,
  AdminMcpServerList,
  AdminMcpServerUpdateRequest,
  AdminOverview,
  AdminSkillList,
  AdminUser,
  AdminUserPage,
  AdminUserUpdateRequest,
  A2aTaskDetail,
  ChatEventName,
  A2aTaskListItem,
  Agent,
  AgentCreateRequest,
  AgentDetail,
  AgentHealthResult,
  AgentPreviewRequest,
  AgentPreviewResult,
  AgentRefreshResult,
  AgentUpdateRequest,
  Approval,
  Attachment,
  AuditLog,
  ChatMessage,
  Conversation,
  ConversationDetail,
  InstructionState,
  KnowledgeDocument,
  KnowledgeDocumentPage,
  KnowledgeSearchHit,
  McpCheckResult,
  McpServer,
  McpServerCreateRequest,
  McpServerUpdateRequest,
  McpTool,
  McpToolUpdateRequest,
  Memory,
  MemoryCreateRequest,
  MemoryKind,
  MemoryUpdateRequest,
  PageResult,
  PlatformSecret,
  Run,
  RunCancelResult,
  RunEvent,
  Skill,
  SkillFile,
  SkillImportResult,
  SystemInfo,
  User,
  Workflow,
} from '@/types'

import {
  mockAdminInstruction,
  mockAdminUsers,
  mockAgents,
  mockApprovals,
  mockAttachmentContents,
  mockAttachments,
  mockConversations,
  mockInstruction,
  mockKnowledgeDocuments,
  mockMcpServers,
  mockMcpTools,
  mockMemories,
  mockMessages,
  mockRunEvents,
  mockRuns,
  mockSkillFiles,
  mockSkills,
  mockSystemInfo,
  mockTaskDetails,
  mockTasks,
  mockUser,
  mockWorkflows,
} from './fixtures'
import { mockAuditLogs, mockExtraApprovals, mockPlatformSecrets } from './securityFixtures'

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function encodeCursor(offset: number): string {
  return `cursor_${offset}`
}

function decodeCursor(cursor?: string): number {
  const match = /^cursor_(\d+)$/.exec(cursor ?? '')
  return match ? Number(match[1]) : 0
}

function knowledgeBasename(path: string): string {
  return path.split('/').filter(Boolean).pop() ?? path
}

function knowledgeTitleFromFilename(filename: string): string {
  const base = knowledgeBasename(filename)
  return base.replace(/\.[^.]+$/, '') || base
}

interface PageQuery {
  limit?: number
  cursor?: string
}

function paginate<T>(items: T[], query: PageQuery): PageResult<T> {
  const limit = Math.min(Math.max(query.limit ?? 20, 1), 100)
  const offset = decodeCursor(query.cursor)
  const page = items.slice(offset, offset + limit)
  const hasMore = offset + limit < items.length
  return {
    items: page,
    next_cursor: hasMore ? encodeCursor(offset + limit) : null,
    has_more: hasMore,
  }
}

/** M8 管理台 mock 的规则错误：由 routers 映射成统一错误信封。 */
export class MockAdminRuleError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 422,
    readonly details?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'MockAdminRuleError'
  }
}

type AdminUserQuery = {
  q?: string
  role?: string
  status?: string
  limit?: number
  cursor?: string
}

type ApprovalListener = (id: string, decision: 'approved' | 'rejected') => void
type RunEventListener = (event: ChatEventName, data: Record<string, unknown>) => void
type RunTerminalListener = () => void

/** 事件分类：与后端 RunEvent.type 对齐（未知事件按 run 归类）。 */
function eventTypeOf(event: ChatEventName): RunEvent['type'] {
  if (event.startsWith('message.') || event.startsWith('reasoning.')) return 'message'
  if (event.startsWith('skill.')) return 'skill'
  if (event.startsWith('tool.')) return 'tool'
  if (event.startsWith('a2a.')) return 'a2a'
  if (event.startsWith('mcp.')) return 'mcp'
  if (event.startsWith('approval.')) return 'approval'
  if (event.startsWith('workflow.')) return 'workflow'
  if (event === 'error') return 'error'
  if (event === 'notice' || event === 'memory.saved') return 'notice'
  if (event === 'run.started' || event === 'run.interrupted' || event === 'run.resumed') {
    return 'run'
  }
  if (event === 'conversation.created') return 'request'
  return 'run'
}

/** 事件展示状态：等待审批/等待输入，运行中，错误，其余 ok。 */
function eventStatusOf(event: ChatEventName): RunEvent['status'] {
  if (event === 'approval.required' || event === 'run.interrupted') return 'waiting'
  if (event === 'run.started' || event === 'tool.start' || event === 'a2a.task') return 'running'
  if (event === 'error') return 'error'
  return 'ok'
}

function summarizeData(data: Record<string, unknown>): string {
  try {
    const text = JSON.stringify(data, (key, value) =>
      key === 'seq' || key === 'ts' ? undefined : value,
    )
    return text.length > 120 ? `${text.slice(0, 120)}…` : text
  } catch {
    return ''
  }
}

class MockDb {
  user: User = clone(mockUser)
  conversations: Conversation[] = []
  messages: Record<string, ChatMessage[]> = {}
  approvals: Approval[] = []
  auditLogs: AuditLog[] = []
  platformSecrets: PlatformSecret[] = []
  agents: Agent[] = []
  tasks: A2aTaskListItem[] = []
  taskDetails: Record<string, A2aTaskDetail> = {}
  knowledgeDocuments: KnowledgeDocument[] = []
  /** mock 用 `filename:size` 模拟 checksum 幂等键；真实后端用内容 checksum。 */
  knowledgeChecksums: Record<string, string> = {}
  workflows: Workflow[] = []
  systemInfo: SystemInfo = clone(mockSystemInfo)
  runs: Record<string, Run> = {}
  runEvents: Record<string, RunEvent[]> = {}
  attachments: Attachment[] = []
  instruction: InstructionState = clone(mockInstruction)
  adminUsers: AdminUser[] = []
  adminInstruction: AdminInstruction = clone(mockAdminInstruction)
  memories: Memory[] = []
  skills: Skill[] = []
  skillFiles: Record<string, SkillFile[]> = {}
  skillContents: Record<string, string> = {}
  mcpServers: McpServer[] = []
  mcpTools: Record<string, McpTool[]> = {}
  attachmentContents: Record<string, string> = {}

  private approvalListeners = new Set<ApprovalListener>()
  private runEventListeners = new Map<string, Set<RunEventListener>>()
  private runTerminalListeners = new Map<string, Set<RunTerminalListener>>()

  constructor() {
    this.reset()
  }

  reset(): void {
    this.user = clone(mockUser)
    this.conversations = clone(mockConversations)
    this.messages = clone(mockMessages)
    this.approvals = [...clone(mockApprovals), ...clone(mockExtraApprovals)]
    this.auditLogs = clone(mockAuditLogs)
    this.platformSecrets = clone(mockPlatformSecrets)
    this.agents = clone(mockAgents)
    this.tasks = clone(mockTasks)
    this.taskDetails = clone(mockTaskDetails)
    this.knowledgeDocuments = clone(mockKnowledgeDocuments)
    this.knowledgeChecksums = {}
    this.workflows = clone(mockWorkflows)
    this.systemInfo = clone(mockSystemInfo)
    this.runs = clone(mockRuns)
    this.runEvents = clone(mockRunEvents)
    this.attachments = clone(mockAttachments)
    this.instruction = clone(mockInstruction)
    this.adminUsers = clone(mockAdminUsers)
    this.adminInstruction = clone(mockAdminInstruction)
    this.memories = clone(mockMemories)
    this.skills = clone(mockSkills)
    this.skillFiles = clone(mockSkillFiles)
    this.skillContents = Object.fromEntries(
      mockSkills.map((skill) => [skill.id, skill.content ?? '']),
    )
    this.mcpServers = clone(mockMcpServers)
    this.mcpTools = clone(mockMcpTools)
    this.attachmentContents = clone(mockAttachmentContents)
    this.approvalListeners.clear()
    this.runEventListeners.clear()
    this.runTerminalListeners.clear()
  }

  listConversations(query: { q?: string; status?: string } & PageQuery): PageResult<Conversation> {
    const keyword = query.q?.trim().toLowerCase() ?? ''
    const status = query.status && query.status !== 'all' ? query.status : null
    const filtered = this.conversations
      .filter((conversation) => (status ? conversation.status === status : true))
      .filter((conversation) =>
        keyword ? conversation.title.toLowerCase().includes(keyword) : true,
      )
      .sort((a, b) => {
        const left = a.last_message_at ? Date.parse(a.last_message_at) : 0
        const right = b.last_message_at ? Date.parse(b.last_message_at) : 0
        return right - left
      })

    return {
      ...paginate(filtered, query),
      stats: {
        total: this.conversations.length,
        active: this.conversations.filter((item) => item.status === 'active').length,
        archived: this.conversations.filter((item) => item.status === 'archived').length,
        pending_approval: this.conversations.reduce(
          (total, item) => total + item.pending_approval_count,
          0,
        ),
      },
    }
  }

  getConversation(id: string): ConversationDetail | null {
    const conversation = this.conversations.find((item) => item.id === id)
    if (!conversation) return null
    // 多 run 会话必须取最新一轮：M7 起 mock 聊天也会写入 runs，
    // 取「第一个匹配」会把 last_run 回退到历史 run。
    const run = Object.values(this.runs)
      .filter((item) => item.conversation_id === id)
      .sort((left, right) => {
        const leftAt = left.started_at ? Date.parse(left.started_at) : 0
        const rightAt = right.started_at ? Date.parse(right.started_at) : 0
        return rightAt - leftAt
      })[0]
    return {
      ...conversation,
      archived_at: conversation.status === 'archived' ? conversation.updated_at : null,
      last_run: run
        ? { id: run.id, status: run.status, model: run.model, finished_at: run.finished_at }
        : null,
    }
  }

  createConversation(title = '新会话'): Conversation {
    const timestamp = new Date().toISOString()
    const conversation: Conversation = {
      id: crypto.randomUUID(),
      title,
      status: 'active',
      message_count: 0,
      last_message_preview: '',
      last_message_at: null,
      pending_approval_count: 0,
      created_at: timestamp,
      updated_at: timestamp,
    }
    this.conversations.unshift(conversation)
    this.messages[conversation.id] = []
    return conversation
  }

  updateConversation(
    id: string,
    body: { title?: string; status?: 'active' | 'archived' },
  ): Conversation | null {
    const conversation = this.conversations.find((item) => item.id === id)
    if (!conversation) return null
    if (body.title) conversation.title = body.title
    if (body.status) conversation.status = body.status
    conversation.updated_at = new Date().toISOString()
    return conversation
  }

  deleteConversation(id: string): boolean {
    const index = this.conversations.findIndex((item) => item.id === id)
    if (index < 0) return false
    this.conversations.splice(index, 1)
    delete this.messages[id]
    return true
  }

  /** 与后端 M1 一致：`created_at DESC, id DESC`，cursor 指向更旧的一页。 */
  listMessages(conversationId: string, query: PageQuery): PageResult<ChatMessage> | null {
    const all = this.messages[conversationId]
    if (!all) return null
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 100)
    const offset = decodeCursor(query.cursor)
    const newestFirst = [...all].sort((left, right) => {
      if (left.created_at !== right.created_at) {
        return left.created_at < right.created_at ? 1 : -1
      }
      return right.id.localeCompare(left.id)
    })
    const page = newestFirst.slice(offset, offset + limit)
    const hasMore = offset + limit < newestFirst.length
    return {
      items: page,
      next_cursor: hasMore ? encodeCursor(offset + limit) : null,
      has_more: hasMore,
    }
  }

  appendMessage(conversationId: string, message: ChatMessage): void {
    const list = this.messages[conversationId]
    if (!list) return
    list.push(message)
    const conversation = this.conversations.find((item) => item.id === conversationId)
    if (!conversation) return
    conversation.message_count = list.length
    conversation.last_message_preview = message.content.slice(0, 80)
    conversation.last_message_at = message.created_at
    conversation.updated_at = message.created_at
  }

  getRun(id: string): Run | null {
    return this.runs[id] ?? null
  }

  listRunEvents(
    runId: string,
    query: PageQuery & { after_seq?: number; types?: string; q?: string },
  ): PageResult<RunEvent> | null {
    const events = this.runEvents[runId]
    if (!events) return null
    const groups: Record<string, string[]> = {
      message: ['request', 'message'],
      tool: ['skill', 'tool'],
      a2a: ['a2a'],
      mcp: ['mcp'],
      approval: ['approval'],
      workflow: ['workflow'],
    }
    const requested = (query.types ?? '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
    const allowed = requested.flatMap((type) => groups[type] ?? [type])
    const keyword = query.q?.trim().toLowerCase() ?? ''
    const filtered = events
      .filter((event) => (query.after_seq ? event.seq > query.after_seq : true))
      .filter((event) => (allowed.length ? allowed.includes(event.type) : true))
      .filter((event) =>
        keyword ? `${event.title} ${event.subtitle}`.toLowerCase().includes(keyword) : true,
      )
    return paginate(filtered, query)
  }

  cancelRun(id: string): RunCancelResult | null {
    const run = this.runs[id]
    if (!run) return null
    if (run.status === 'succeeded' || run.status === 'failed' || run.status === 'canceled') {
      return null
    }
    const canceledAt = new Date().toISOString()
    run.status = 'canceled'
    run.finished_at = canceledAt
    // M7：取消也是终态，通知续流订阅者关闭连接。
    this.notifyRunTerminal(id)
    return { id, status: 'canceled', canceled_at: canceledAt }
  }

  writeAudit(input: {
    action: string
    resource_type: string
    resource_id: string
    detail?: Record<string, unknown>
    actor_type?: string
    actor_id?: string
  }): AuditLog {
    const entry: AuditLog = {
      id: (this.auditLogs[0]?.id ?? 2000) + 1,
      actor_type: input.actor_type ?? 'user',
      actor_id: input.actor_id ?? this.user.id,
      action: input.action,
      resource_type: input.resource_type,
      resource_id: input.resource_id,
      detail: input.detail ?? {},
      request_id: `mock-req-${crypto.randomUUID()}`,
      created_at: new Date().toISOString(),
    }
    this.auditLogs.unshift(entry)
    return entry
  }

  listAuditLogs(
    query: {
      action?: string
      resource_type?: string
      actor_type?: string
      actor_id?: string
      resource_id?: string
      start?: string
      end?: string
    } & PageQuery,
    scope: 'own' | 'all',
  ): PageResult<AuditLog> {
    const start = query.start ? Date.parse(query.start) : null
    const end = query.end ? Date.parse(query.end) : null
    const filtered = this.auditLogs
      .filter((item) =>
        scope === 'all' ? true : item.actor_type === 'user' && item.actor_id === this.user.id,
      )
      .filter((item) => (query.action ? item.action === query.action : true))
      .filter((item) => (query.resource_type ? item.resource_type === query.resource_type : true))
      .filter((item) => (query.actor_type ? item.actor_type === query.actor_type : true))
      .filter((item) => (query.actor_id ? item.actor_id === query.actor_id : true))
      .filter((item) => (query.resource_id ? item.resource_id === query.resource_id : true))
      .filter((item) => (start === null ? true : Date.parse(item.created_at) >= start))
      .filter((item) => (end === null ? true : Date.parse(item.created_at) < end))
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) || b.id - a.id)
    return paginate(filtered, query)
  }

  listSecrets(enabled?: boolean): PlatformSecret[] {
    return this.platformSecrets.filter((item) => (enabled === undefined ? true : item.enabled === enabled))
  }

  createSecret(input: {
    name: string
    description: string
  }): PlatformSecret | null {
    if (this.platformSecrets.some((item) => item.name === input.name)) return null
    const timestamp = new Date().toISOString()
    const secret: PlatformSecret = {
      name: input.name,
      description: input.description,
      enabled: true,
      created_at: timestamp,
      updated_at: timestamp,
    }
    this.platformSecrets.unshift(secret)
    this.writeAudit({
      action: 'secret.create',
      resource_type: 'secret',
      resource_id: input.name,
      detail: { name: input.name, enabled: true },
    })
    return secret
  }

  updateSecret(
    name: string,
    body: { description?: string; enabled?: boolean },
  ): PlatformSecret | null {
    const secret = this.platformSecrets.find((item) => item.name === name)
    if (!secret) return null
    if (body.description !== undefined) secret.description = body.description
    if (body.enabled !== undefined) secret.enabled = body.enabled
    secret.updated_at = new Date().toISOString()
    this.writeAudit({
      action: 'secret.update',
      resource_type: 'secret',
      resource_id: name,
      detail: { name, ...body },
    })
    return secret
  }

  deleteSecret(name: string): boolean {
    const index = this.platformSecrets.findIndex((item) => item.name === name)
    if (index < 0) return false
    this.platformSecrets.splice(index, 1)
    this.writeAudit({
      action: 'secret.delete',
      resource_type: 'secret',
      resource_id: name,
      detail: { name },
    })
    return true
  }

  listApprovals(
    query: { status?: string; conversation_id?: string; run_id?: string } & PageQuery,
  ): PageResult<Approval> {
    const status = query.status && query.status !== 'all' ? query.status : null
    const filtered = this.approvals
      .filter((item) => (status ? item.status === status : true))
      .filter((item) =>
        query.conversation_id ? item.conversation_id === query.conversation_id : true,
      )
      .filter((item) => (query.run_id ? item.run_id === query.run_id : true))
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))

    return {
      ...paginate(filtered, query),
      stats: {
        pending: this.approvals.filter((item) => item.status === 'pending').length,
        approved: this.approvals.filter((item) => item.status === 'approved').length,
        rejected: this.approvals.filter((item) => item.status === 'rejected').length,
        expired: this.approvals.filter((item) => item.status === 'expired').length,
        canceled: this.approvals.filter((item) => item.status === 'canceled').length,
      },
    }
  }

  createApproval(input: {
    run_id: string
    conversation_id: string
    conversation_title: string
    tool_name: string
    tool_display_name: string
    source: string
    executor: string
    target: string
    side_effect: string
    risk: Approval['risk']
    reason: string
    payload: Record<string, unknown>
  }): Approval {
    const timestamp = new Date().toISOString()
    const approval: Approval = {
      id: crypto.randomUUID(),
      run_id: input.run_id,
      conversation_id: input.conversation_id,
      conversation_title: input.conversation_title,
      status: 'pending',
      tool_name: input.tool_name,
      tool_display_name: input.tool_display_name,
      source: input.source,
      executor: input.executor,
      target: input.target,
      side_effect: input.side_effect,
      risk: input.risk,
      reason: input.reason,
      payload: input.payload,
      payload_preview: JSON.stringify(input.payload),
      expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      created_at: timestamp,
      decided_at: null,
      decided_by: null,
      decision_note: '',
    }
    this.approvals.unshift(approval)
    const conversation = this.conversations.find((item) => item.id === input.conversation_id)
    if (conversation) conversation.pending_approval_count += 1
    return approval
  }

  resolveApproval(id: string, decision: 'approve' | 'reject', note = ''): Approval | null {
    const approval = this.approvals.find((item) => item.id === id)
    if (!approval) return null
    if (approval.status !== 'pending') {
      throw new Error('approval_already_decided')
    }
    approval.status = decision === 'approve' ? 'approved' : 'rejected'
    approval.decided_at = new Date().toISOString()
    approval.decided_by = { id: this.user.id, display_name: this.user.display_name }
    approval.decision_note = note

    const conversation = this.conversations.find((item) => item.id === approval.conversation_id)
    if (conversation && conversation.pending_approval_count > 0) {
      conversation.pending_approval_count -= 1
    }

    const resolved = approval.status
    this.writeAudit({
      action: 'approval.decide',
      resource_type: 'approval',
      resource_id: approval.id,
      detail: { decision, tool: approval.tool_name },
    })
    for (const listener of this.approvalListeners) {
      listener(id, resolved as 'approved' | 'rejected')
    }
    return approval
  }

  onApprovalResolved(listener: ApprovalListener): () => void {
    this.approvalListeners.add(listener)
    return () => {
      this.approvalListeners.delete(listener)
    }
  }

  listAgents(
    query: { health_status?: string; enabled?: string; q?: string } & PageQuery,
  ): PageResult<Agent> {
    const keyword = query.q?.trim().toLowerCase() ?? ''
    const filtered = this.agents
      .filter((agent) => (query.health_status ? agent.health_status === query.health_status : true))
      .filter((agent) => (query.enabled ? String(agent.enabled) === query.enabled : true))
      .filter((agent) =>
        keyword ? `${agent.name} ${agent.slug}`.toLowerCase().includes(keyword) : true,
      )

    return {
      ...paginate(filtered, query),
      stats: {
        total: this.agents.length,
        healthy: this.agents.filter((item) => item.health_status === 'healthy').length,
        degraded: this.agents.filter((item) => item.health_status === 'degraded').length,
        unhealthy: this.agents.filter((item) => item.health_status === 'unhealthy').length,
        disabled: this.agents.filter((item) => !item.enabled).length,
        enabled: this.agents.filter((item) => item.enabled).length,
      },
    }
  }

  checkAgentHealth(id: string): AgentHealthResult | null {
    const agent = this.agents.find((item) => item.id === id)
    if (!agent) return null
    const latency = agent.health_status === 'degraded' ? 1200 : 120 + Math.floor(Math.random() * 80)
    agent.health_status = 'healthy'
    agent.last_latency_ms = latency
    agent.last_checked_at = new Date().toISOString()
    agent.last_error = null
    return {
      health_status: agent.health_status,
      latency_ms: latency,
      checked_at: agent.last_checked_at,
      error: null,
    }
  }

  listTasks(
    query: { state?: string; q?: string; agent_id?: string } & PageQuery,
  ): PageResult<A2aTaskListItem> {
    const keyword = query.q?.trim().toLowerCase() ?? ''
    const states = query.state ? query.state.split(',').map((item) => item.trim()) : []
    const filtered = this.tasks
      .filter((task) => (states.length ? states.includes(task.state) : true))
      .filter((task) => (query.agent_id ? task.agent.id === query.agent_id : true))
      .filter((task) =>
        keyword
          ? `${task.request_summary} ${task.a2a_task_id} ${task.agent.name}`
              .toLowerCase()
              .includes(keyword)
          : true,
      )
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))

    const stats: Record<string, number> = { total: this.tasks.length }
    for (const task of this.tasks) {
      stats[task.state] = (stats[task.state] ?? 0) + 1
    }

    return { ...paginate(filtered, query), stats }
  }

  getTaskDetail(id: string): A2aTaskDetail | null {
    const preset = this.taskDetails[id]
    if (preset) return preset
    const task = this.tasks.find((item) => item.id === id)
    if (!task) return null
    return {
      ...task,
      tool_call_id: 'call_mock',
      request: {
        tool: 'send_message',
        args: { task: task.request_summary },
        summary: task.request_summary,
      },
      result:
        task.state === 'completed'
          ? {
              artifact: {
                type: 'text',
                summary: task.request_summary,
                parts: [],
                data: {},
              },
              summary: task.request_summary,
            }
          : null,
      error: task.error_summary
        ? { code: 'a2a_error', message: task.error_summary, retryable: true, at: task.updated_at }
        : null,
      input_request:
        task.state === 'input_required'
          ? {
              question: '请补充执行所需的信息。',
              input_schema: { type: 'string', maxLength: 2000 },
              expires_at: null,
            }
          : null,
      auth_request:
        task.state === 'auth_required'
          ? {
              scopes: ['repo:read'],
              authorization_url: null,
              expires_at: null,
            }
          : null,
      timeline: [
        { state: task.state, at: task.updated_at, duration_ms: task.duration_ms, note: '' },
      ],
      started_at: task.created_at,
      finished_at: task.state === 'completed' ? task.updated_at : null,
    }
  }

  /** 可见范围：`visible` = 系统文档 + 自己的私有文档；`all` 只给管理员用。 */
  visibleKnowledgeDocuments(ownerScope: 'visible' | 'all' = 'visible'): KnowledgeDocument[] {
    if (ownerScope === 'all') return this.knowledgeDocuments
    return this.knowledgeDocuments.filter(
      (document) => document.owner === null || document.owner.id === this.user.id,
    )
  }

  listKnowledgeDocuments(
    query: { q?: string; category?: string; status?: string; owner_scope?: 'visible' | 'all' } & PageQuery,
  ): KnowledgeDocumentPage {
    const keyword = query.q?.trim().toLowerCase() ?? ''
    const visible = this.visibleKnowledgeDocuments(query.owner_scope)
    const filtered = visible
      .filter((document) => (query.category ? document.category === query.category : true))
      .filter((document) => (query.status ? document.status === query.status : true))
      .filter((document) =>
        keyword
          ? `${document.title} ${document.source_uri}`.toLowerCase().includes(keyword)
          : true,
      )
      .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))

    const page = paginate(filtered, query)
    return {
      items: page.items,
      next_cursor: page.next_cursor,
      has_more: page.has_more,
      // stats 是可见范围全量，不受 q/category/status 影响（后端口径）。
      stats: {
        documents: visible.length,
        chunks: visible.reduce((total, item) => total + item.chunk_count, 0),
        ready: visible.filter((item) => item.status === 'ready').length,
        indexing: visible.filter((item) => item.status === 'indexing').length,
        pending: visible.filter((item) => item.status === 'pending').length,
        failed: visible.filter((item) => item.status === 'failed').length,
      },
    }
  }

  getKnowledgeDocument(id: string): KnowledgeDocument | null {
    return this.knowledgeDocuments.find((document) => document.id === id) ?? null
  }

  canReadKnowledgeDocument(document: KnowledgeDocument): boolean {
    return this.user.role === 'admin' || document.owner === null || document.owner.id === this.user.id
  }

  /** 系统文档（`owner=null`）只有管理员可写；个人文档归所有者与管理员。 */
  canWriteKnowledgeDocument(document: KnowledgeDocument): boolean {
    return this.user.role === 'admin' || document.owner?.id === this.user.id
  }

  uploadKnowledgeDocument(input: {
    filename: string
    size_bytes: number
    title?: string
    category?: string
    scope?: 'user' | 'system'
  }): { document: KnowledgeDocument; created: boolean } {
    const scope = input.scope ?? 'user'
    const checksum = `${input.filename}:${input.size_bytes}`
    const duplicate = this.knowledgeDocuments.find(
      (document) =>
        this.knowledgeChecksums[document.id] === checksum &&
        (document.owner === null) === (scope === 'system'),
    )
    if (duplicate) return { document: duplicate, created: false }

    const now = new Date().toISOString()
    const document: KnowledgeDocument = {
      id: `99999999-9999-4999-8999-${String(Date.now()).slice(-12).padStart(12, '0')}`,
      title: input.title?.trim() || knowledgeTitleFromFilename(input.filename),
      category: input.category?.trim() ?? '',
      status: 'ready',
      chunk_count: Math.max(1, Math.ceil(input.size_bytes / 1024)),
      size_bytes: input.size_bytes,
      source_uri: `uploads/${knowledgeBasename(input.filename)}`,
      owner:
        scope === 'system'
          ? null
          : { id: this.user.id, display_name: this.user.display_name },
      error: null,
      created_at: now,
      updated_at: now,
    }
    this.knowledgeDocuments = [...this.knowledgeDocuments, document]
    this.knowledgeChecksums[document.id] = checksum
    return { document, created: true }
  }

  deleteKnowledgeDocument(id: string): boolean {
    const index = this.knowledgeDocuments.findIndex((document) => document.id === id)
    if (index < 0) return false
    this.knowledgeDocuments.splice(index, 1)
    delete this.knowledgeChecksums[id]
    return true
  }

  /** 从原文重新入库；mock 直接把失败文档恢复为 ready，并保留原有大小。 */
  retryKnowledgeDocument(id: string): KnowledgeDocument | null {
    const document = this.getKnowledgeDocument(id)
    if (!document) return null
    document.status = 'ready'
    document.chunk_count = Math.max(1, Math.ceil(document.size_bytes / 1024))
    document.error = null
    document.updated_at = new Date().toISOString()
    return document
  }

  searchKnowledge(query: string, topK: number, category?: string): KnowledgeSearchHit[] {
    const needle = query.trim()
    const ranked = this.visibleKnowledgeDocuments()
      .filter((document) => document.status === 'ready')
      .filter((document) => (category ? document.category === category : true))
      // 真实后端按相似度过滤：查询词无命中时不返回片段（E2E 空态依赖此语义）。
      .filter((document) => {
        if (!needle) return true
        return `${document.title} ${document.category} ${document.source_uri}`
          .toLowerCase()
          .includes(needle.toLowerCase())
      })
      .map((document) => ({
        document,
        relevance: needle
          ? Number(
              `${document.title} ${document.category} ${document.source_uri}`
                .toLowerCase()
                .includes(needle.toLowerCase()),
            )
          : 0,
      }))
      .sort(
        (a, b) =>
          b.relevance - a.relevance ||
          Date.parse(b.document.updated_at) - Date.parse(a.document.updated_at),
      )
      .slice(0, topK)

    return ranked.map(({ document }, index) => ({
      chunk_id: `${document.id}:${index + 1}`,
      document_id: document.id,
      title: document.title,
      document_title: document.title,
      document_filename: knowledgeBasename(document.source_uri),
      category: document.category,
      chunk_index: index,
      content: `【mock 检索片段】${document.title}（${document.category || '未分类'}）：与「${needle}」相关的内容示例。`,
      score: Math.round((0.9 - index * 0.06) * 10000) / 10000,
      updated_at: document.updated_at,
    }))
  }

  rebuildKnowledgeIndex(scope: 'all' | 'system' | 'own'): {
    documents: number
    chunks: number
    failed: number
    elapsed_ms: number
  } {
    const started = Date.now()
    const scoped = this.knowledgeDocuments.filter((document) =>
      scope === 'all' ? true : scope === 'system' ? document.owner === null : document.owner !== null,
    )
    const failed = scoped.filter((document) => document.status === 'failed').length
    const chunks = scoped
      .filter((document) => document.status === 'ready')
      .reduce((total, document) => total + document.chunk_count, 0)
    return {
      documents: scoped.length,
      chunks,
      failed,
      elapsed_ms: Math.max(0, Date.now() - started),
    }
  }

  listWorkflows(query: { q?: string; status?: string } & PageQuery): PageResult<Workflow> {
    const keyword = query.q?.trim().toLowerCase() ?? ''
    const filtered = this.workflows
      .filter((workflow) => (query.status ? workflow.status === query.status : true))
      .filter((workflow) =>
        keyword ? `${workflow.name} ${workflow.slug}`.toLowerCase().includes(keyword) : true,
      )
      .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))

    return {
      ...paginate(filtered, query),
      stats: {
        total: this.workflows.length,
        published: this.workflows.filter((item) => item.status === 'published').length,
        draft: this.workflows.filter((item) => item.status === 'draft').length,
        disabled: this.workflows.filter((item) => item.status === 'disabled').length,
        avg_steps:
          this.workflows.length > 0
            ? Math.round(
                this.workflows.reduce((total, item) => total + item.step_count, 0) /
                  this.workflows.length,
              )
            : 0,
      },
    }
  }

  // ---------------------------------------------------------------- 附件

  listAttachments(
    query: { conversation_id?: string } & PageQuery,
  ): PageResult<Attachment> {
    const filtered = this.attachments
      .filter((item) =>
        query.conversation_id ? item.conversation_id === query.conversation_id : true,
      )
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
    return {
      ...paginate(filtered, query),
      stats: {
        total: this.attachments.length,
        ready: this.attachments.filter((item) => item.status === 'ready').length,
        processing: this.attachments.filter((item) => item.status === 'processing').length,
      },
    }
  }

  createAttachment(input: {
    filename: string
    mime_type: string
    size_bytes: number
    conversation_id?: string | null
    purpose?: string
    content?: string
  }): Attachment {
    const checksum = `sha256:${Array.from(input.filename)
      .reduce((total, char) => (total * 31 + char.charCodeAt(0)) % 0xffffffff, 7)
      .toString(16)
      .padStart(8, '0')}${String(input.size_bytes).padStart(8, '0')}`
    const existing = this.attachments.find(
      (item) => item.checksum === checksum && item.filename === input.filename,
    )
    if (existing) {
      return { ...existing, duplicate: true }
    }
    const created: Attachment = {
      id: crypto.randomUUID(),
      filename: input.filename,
      mime_type: input.mime_type || 'application/octet-stream',
      size_bytes: input.size_bytes,
      checksum,
      status: 'ready',
      purpose: input.purpose ?? 'chat',
      conversation_id: input.conversation_id ?? null,
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    }
    this.attachments.unshift(created)
    this.attachmentContents[created.id] = input.content ?? `mock attachment: ${input.filename}\n`
    return created
  }

  getAttachment(id: string): Attachment | null {
    return this.attachments.find((item) => item.id === id) ?? null
  }

  deleteAttachment(id: string): boolean {
    const index = this.attachments.findIndex((item) => item.id === id)
    if (index < 0) return false
    this.attachments.splice(index, 1)
    delete this.attachmentContents[id]
    return true
  }

  attachmentContent(id: string): string | null {
    return this.attachmentContents[id] ?? null
  }

  attachToConversation(ids: string[], conversationId: string | null): Attachment[] {
    const result: Attachment[] = []
    for (const id of ids) {
      const attachment = this.getAttachment(id)
      if (!attachment) continue
      if (conversationId) attachment.conversation_id = conversationId
      result.push(attachment)
    }
    return result
  }

  // ---------------------------------------------------------------- 指令

  getInstruction(): InstructionState {
    return clone(this.instruction)
  }

  saveInstruction(value: string | null): InstructionState {
    const trimmed = value === null ? null : value.trim()
    this.instruction = {
      ...this.instruction,
      source: trimmed ? 'user' : 'system_default',
      user_value: trimmed || null,
      effective: trimmed || this.instruction.default_value,
      updated_at: new Date().toISOString(),
    }
    return clone(this.instruction)
  }

  // ---------------------------------------------------------------- 记忆

  listMemories(
    query: { kind?: string; status?: string; q?: string } & PageQuery,
  ): PageResult<Memory> {
    const keyword = query.q?.trim().toLowerCase() ?? ''
    const filtered = this.memories
      .filter((item) => (query.kind ? item.kind === query.kind : true))
      .filter((item) =>
        query.status && query.status !== 'all' ? item.status === query.status : true,
      )
      .filter((item) =>
        keyword
          ? `${item.title} ${item.content}`.toLowerCase().includes(keyword)
          : true,
      )
      .sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
        return Date.parse(b.updated_at) - Date.parse(a.updated_at)
      })
    return {
      ...paginate(filtered, query),
      stats: {
        total: this.memories.length,
        profile: this.memories.filter((item) => item.kind === 'profile').length,
        preference: this.memories.filter((item) => item.kind === 'preference').length,
        fact: this.memories.filter((item) => item.kind === 'fact').length,
        active: this.memories.filter((item) => item.status === 'active').length,
        archived: this.memories.filter((item) => item.status === 'archived').length,
      },
    }
  }

  createMemory(body: MemoryCreateRequest): Memory {
    const timestamp = new Date().toISOString()
    const memory: Memory = {
      id: crypto.randomUUID(),
      kind: body.kind,
      title: body.title,
      content: body.content,
      source: { kind: 'manual', label: '手动保存' },
      pinned: body.pinned ?? false,
      status: 'active',
      created_at: timestamp,
      updated_at: timestamp,
    }
    this.memories.unshift(memory)
    return clone(memory)
  }

  getMemory(id: string): Memory | null {
    const memory = this.memories.find((item) => item.id === id)
    return memory ? clone(memory) : null
  }

  updateMemory(id: string, body: MemoryUpdateRequest): Memory | null {
    const memory = this.memories.find((item) => item.id === id)
    if (!memory) return null
    if (body.kind) memory.kind = body.kind as MemoryKind
    if (body.title !== undefined) memory.title = body.title
    if (body.content !== undefined) memory.content = body.content
    if (body.pinned !== undefined) memory.pinned = body.pinned
    if (body.status !== undefined) memory.status = body.status
    memory.updated_at = new Date().toISOString()
    return clone(memory)
  }

  deleteMemory(id: string): boolean {
    const index = this.memories.findIndex((item) => item.id === id)
    if (index < 0) return false
    this.memories.splice(index, 1)
    return true
  }

  clearMemories(): number {
    const count = this.memories.length
    this.memories = []
    return count
  }

  // ---------------------------------------------------------------- 技能

  listSkills(
    query: { scope?: string; enabled?: boolean; q?: string } & PageQuery,
  ): PageResult<Skill> {
    const keyword = query.q?.trim().toLowerCase() ?? ''
    const filtered = this.skills
      .filter((item) => (query.scope && query.scope !== 'all' ? item.scope === query.scope : true))
      .filter((item) => (query.enabled === undefined ? true : this.skillEnabled(item) === query.enabled))
      .filter((item) =>
        keyword
          ? `${item.name} ${item.slug} ${item.description}`.toLowerCase().includes(keyword)
          : true,
      )
    return {
      ...paginate(filtered, query),
      stats: {
        total: this.skills.length,
        system: this.skills.filter((item) => item.scope === 'system').length,
        user: this.skills.filter((item) => item.scope === 'user').length,
        enabled: this.skills.filter((item) => this.skillEnabled(item)).length,
      },
    }
  }

  skillEnabled(skill: Skill): boolean {
    return skill.effective_enabled ?? skill.enabled
  }

  createSkill(input: {
    slug: string
    name: string
    description?: string
    content: string
  }): Skill {
    const id = crypto.randomUUID()
    const skill: Skill = {
      id,
      slug: input.slug,
      name: input.name,
      description: input.description ?? '',
      content: input.content,
      scope: 'user',
      editable: true,
      enabled: true,
      effective_enabled: true,
      estimated_tokens: Math.max(1, Math.round(input.content.length / 2)),
      file_count: 1,
      size_bytes: new TextEncoder().encode(input.content).length,
      version: '0.1.0',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    this.skills.unshift(skill)
    this.skillFiles[id] = [{ path: 'SKILL.md', size_bytes: skill.size_bytes, updated_at: skill.updated_at }]
    this.skillContents[id] = input.content
    return clone(skill)
  }

  importSkill(filename: string): SkillImportResult {
    const base = filename.replace(/\.zip$/i, '') || 'imported-skill'
    const slug = base.toLowerCase().replace(/[^a-z0-9_-]+/g, '-')
    const skill = this.createSkill({
      slug: slug || 'imported-skill',
      name: base,
      description: `从 ${filename} 导入的技能包`,
      content: `# ${base}\n\n这是 mock 导入的技能，用于验证导入/启用/选择链路。\n`,
    })
    return { skill, warnings: [] }
  }

  getSkill(id: string): Skill | null {
    const skill = this.skills.find((item) => item.id === id)
    if (!skill) return null
    return { ...clone(skill), content: this.skillContents[id] ?? skill.content ?? '' }
  }

  updateSkill(
    id: string,
    body: { name?: string; description?: string; content?: string },
  ): Skill | null {
    const skill = this.skills.find((item) => item.id === id)
    if (!skill || !skill.editable) return null
    if (body.name !== undefined) skill.name = body.name
    if (body.description !== undefined) skill.description = body.description
    if (body.content !== undefined) {
      this.skillContents[id] = body.content
      skill.size_bytes = new TextEncoder().encode(body.content).length
      skill.estimated_tokens = Math.max(1, Math.round(body.content.length / 2))
    }
    skill.updated_at = new Date().toISOString()
    return clone(skill)
  }

  deleteSkill(id: string): boolean {
    const index = this.skills.findIndex((item) => item.id === id && item.editable)
    if (index < 0) return false
    this.skills.splice(index, 1)
    delete this.skillFiles[id]
    delete this.skillContents[id]
    return true
  }

  setSkillEnabled(id: string, enabled: boolean): Skill | null {
    const skill = this.skills.find((item) => item.id === id)
    if (!skill) return null
    skill.enabled = enabled
    skill.effective_enabled = enabled
    skill.updated_at = new Date().toISOString()
    return clone(skill)
  }

  listSkillFiles(id: string): SkillFile[] | null {
    if (!this.skills.some((item) => item.id === id)) return null
    return clone(
      this.skillFiles[id] ?? [
        { path: 'SKILL.md', size_bytes: this.skills.find((item) => item.id === id)?.size_bytes ?? 0 },
      ],
    )
  }

  readSkillFile(id: string, path: string): { path: string; content: string } | null {
    if (!this.skills.some((item) => item.id === id)) return null
    const content =
      path === 'SKILL.md'
        ? (this.skillContents[id] ?? '')
        : `# ${path}\n\nmock 参考文件内容。`
    return { path, content }
  }

  listSkillCatalog(): Skill[] {
    return this.skills
      .filter((item) => this.skillEnabled(item))
      .map((item) => clone(item))
  }

  // ---------------------------------------------------------------- MCP

  listMcpServers(
    query: { scope?: string; enabled?: boolean; health_status?: string; q?: string } & PageQuery,
  ): PageResult<McpServer> {
    const keyword = query.q?.trim().toLowerCase() ?? ''
    const filtered = this.mcpServers
      .filter((item) => (query.scope && query.scope !== 'all' ? item.scope === query.scope : true))
      .filter((item) =>
        query.enabled === undefined ? true : (item.effective_enabled ?? item.enabled) === query.enabled,
      )
      .filter((item) => (query.health_status ? item.health_status === query.health_status : true))
      .filter((item) =>
        keyword ? `${item.name} ${item.slug}`.toLowerCase().includes(keyword) : true,
      )
    return {
      ...paginate(filtered, query),
      stats: {
        total: this.mcpServers.length,
        system: this.mcpServers.filter((item) => item.scope === 'system').length,
        user: this.mcpServers.filter((item) => item.scope === 'user').length,
        healthy: this.mcpServers.filter((item) => item.health_status === 'healthy').length,
        enabled: this.mcpServers.filter((item) => item.effective_enabled ?? item.enabled).length,
      },
    }
  }

  createMcpServer(body: McpServerCreateRequest): McpServer {
    const slug = body.slug?.trim() || body.name.toLowerCase().replace(/[^a-z0-9_-]+/g, '-')
    const server: McpServer = {
      id: crypto.randomUUID(),
      slug,
      name: body.name,
      description: body.description ?? '',
      url: body.url,
      transport: body.transport ?? 'streamable_http',
      scope: 'user',
      enabled: true,
      effective_enabled: true,
      auto_inject: body.auto_inject ?? false,
      health_status: 'unknown',
      last_error: null,
      last_checked_at: null,
      latency_ms: null,
      tool_count: 0,
      write_tools_allowed: true,
      admin_only_write_tools: false,
      auth_hint: body.headers?.Authorization ?? '',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    this.mcpServers.push(server)
    this.mcpTools[server.id] = []
    return clone(server)
  }

  getMcpServer(id: string): McpServer | null {
    const server = this.mcpServers.find((item) => item.id === id)
    return server ? clone(server) : null
  }

  updateMcpServer(id: string, body: McpServerUpdateRequest): McpServer | null {
    const server = this.mcpServers.find((item) => item.id === id)
    if (!server) return null
    if (body.name !== undefined) server.name = body.name
    if (body.url !== undefined) server.url = body.url
    if (body.auto_inject !== undefined) server.auto_inject = body.auto_inject
    if (body.headers?.Authorization !== undefined) {
      server.auth_hint = body.headers.Authorization
    }
    server.updated_at = new Date().toISOString()
    return clone(server)
  }

  deleteMcpServer(id: string): boolean {
    const index = this.mcpServers.findIndex((item) => item.id === id && item.scope === 'user')
    if (index < 0) return false
    this.mcpServers.splice(index, 1)
    delete this.mcpTools[id]
    return true
  }

  setMcpServerEnabled(id: string, enabled: boolean): McpServer | null {
    const server = this.mcpServers.find((item) => item.id === id)
    if (!server) return null
    server.enabled = enabled
    server.effective_enabled = enabled
    server.updated_at = new Date().toISOString()
    return clone(server)
  }

  checkMcpServer(id: string): McpCheckResult | null {
    const server = this.mcpServers.find((item) => item.id === id)
    if (!server) return null
    const tools = this.mcpTools[id] ?? []
    server.health_status = 'healthy'
    server.last_checked_at = new Date().toISOString()
    server.latency_ms = 120 + Math.floor(Math.random() * 90)
    server.last_error = null
    server.tool_count = tools.length
    return {
      health_status: server.health_status,
      latency_ms: server.latency_ms,
      tool_count: tools.length,
      checked_at: server.last_checked_at,
      error: null,
    }
  }

  listMcpTools(id: string): McpTool[] | null {
    if (!this.mcpServers.some((item) => item.id === id)) return null
    return clone(this.mcpTools[id] ?? [])
  }

  updateMcpTool(id: string, body: McpToolUpdateRequest): McpTool | null {
    for (const tools of Object.values(this.mcpTools)) {
      const tool = tools.find((item) => item.id === id)
      if (!tool) continue
      if (body.enabled !== undefined) tool.enabled = body.enabled
      if (body.requires_approval !== undefined) tool.requires_approval = body.requires_approval
      return clone(tool)
    }
    return null
  }

  availableMcp(): {
    servers: Array<Pick<McpServer, 'id' | 'slug' | 'name' | 'scope' | 'tool_count' | 'enabled' | 'health_status'>>
    tools: Array<Pick<McpTool, 'id' | 'server_id' | 'name' | 'exposed_name' | 'risk' | 'requires_approval'>>
  } {
    const servers = this.mcpServers.filter((item) => item.effective_enabled ?? item.enabled)
    return {
      servers: servers.map((item) => ({
        id: item.id,
        slug: item.slug,
        name: item.name,
        scope: item.scope,
        tool_count: item.tool_count,
        enabled: item.enabled,
        health_status: item.health_status,
      })),
      tools: servers.flatMap((server) =>
        (this.mcpTools[server.id] ?? [])
          .filter((tool) => tool.enabled && tool.user_allowed)
          .map((tool) => ({
            id: tool.id,
            server_id: tool.server_id,
            name: tool.name,
            exposed_name: tool.exposed_name,
            risk: tool.risk,
            requires_approval: tool.requires_approval,
          })),
      ),
    }
  }

  // ---------------------------------------------------------------- 智能体

  getAgent(id: string): Agent | null {
    const agent = this.agents.find((item) => item.id === id)
    return agent ? clone(agent) : null
  }

  getAgentDetail(id: string): AgentDetail | null {
    const agent = this.agents.find((item) => item.id === id)
    if (!agent) return null
    return {
      ...clone(agent),
      card: {
        protocolVersion: agent.protocol_version,
        name: agent.name,
        description: agent.description,
        url: agent.url,
        capabilities: agent.capabilities,
        skills: agent.skills,
      },
      recent_tasks: this.tasks
        .filter((task) => task.agent.id === id)
        .slice(0, 3)
        .map((task) => ({
          id: task.id,
          a2a_task_id: task.a2a_task_id,
          state: task.state,
          duration_ms: task.duration_ms,
          finished_at: task.updated_at,
        })),
    }
  }

  previewAgent(body: AgentPreviewRequest): AgentPreviewResult {
    const slug = body.slug?.trim() || 'remote-agent'
    return {
      valid: true,
      card: {
        protocolVersion: '1.0',
        name: slug,
        description: `从 ${body.url} 拉取的 Agent Card（mock）`,
        url: body.url,
        capabilities: { streaming: true, pushNotifications: false },
        skills: [{ id: `${slug}_default`, name: '默认技能', description: 'Mock Agent 技能' }],
      },
      normalized: {
        name: slug,
        description: `从 ${body.url} 拉取的 Agent Card（mock）`,
        url: body.url,
        protocol_version: '1.0',
        skills: [{ id: `${slug}_default`, name: '默认技能', description: 'Mock Agent 技能' }],
        capabilities: { streaming: true, push_notifications: false },
      },
      warnings: [],
    }
  }

  createAgent(body: AgentCreateRequest): AgentDetail {
    const slug = body.slug?.trim() || body.name?.trim().toLowerCase().replace(/\s+/g, '-')
    const name = body.name?.trim() || body.slug?.trim() || 'Remote Agent'
    const agent: Agent = {
      id: crypto.randomUUID(),
      slug: slug || `agent-${this.agents.length + 1}`,
      name,
      description: `从 ${body.url} 注册的远程 Agent`,
      url: body.url,
      protocol_version: '1.0',
      skills: [{ id: `${slug}_default`, name: '默认技能' }],
      skill_count: 1,
      auth_type: body.auth?.type ?? 'none',
      auth_scheme: body.auth?.type === 'api_key' ? 'bearer' : 'none',
      auth_hint: body.auth?.secret_ref ?? '',
      capabilities: { streaming: true, push_notifications: false },
      health_status: 'unknown',
      enabled: true,
      last_checked_at: null,
      last_latency_ms: null,
      last_error: null,
      recent_task: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    this.agents.unshift(agent)
    return this.getAgentDetail(agent.id)!
  }

  updateAgent(id: string, body: AgentUpdateRequest): AgentDetail | null {
    const agent = this.agents.find((item) => item.id === id)
    if (!agent) return null
    if (body.name !== undefined) agent.name = body.name
    if (body.enabled !== undefined) agent.enabled = body.enabled
    if (body.auth?.secret_ref !== undefined) agent.auth_hint = body.auth.secret_ref
    agent.updated_at = new Date().toISOString()
    return this.getAgentDetail(id)
  }

  deleteAgent(id: string): boolean {
    const index = this.agents.findIndex((item) => item.id === id)
    if (index < 0) return false
    this.agents.splice(index, 1)
    return true
  }

  refreshAgent(id: string): AgentRefreshResult | null {
    const agent = this.agents.find((item) => item.id === id)
    if (!agent) return null
    agent.last_checked_at = new Date().toISOString()
    agent.health_status = 'healthy'
    agent.last_error = null
    return { agent: clone(agent), changed: false, changed_fields: [] }
  }

  // ---------------------------------------------------------------- 任务动作

  private taskStateAfter(
    task: A2aTaskListItem,
    action: 'cancel' | 'resume' | 'authorize' | 'reject',
  ): A2aTaskListItem['state'] | null {
    const allowed: Record<string, A2aTaskListItem['state'][]> = {
      cancel: ['submitted', 'working', 'input_required', 'auth_required'],
      resume: ['input_required'],
      authorize: ['auth_required'],
      reject: ['auth_required', 'input_required'],
    }
    if (!allowed[action]?.includes(task.state)) return null
    return action === 'cancel' ? 'canceled' : action === 'reject' ? 'rejected' : 'working'
  }

  private applyTaskAction(
    id: string,
    action: 'cancel' | 'resume' | 'authorize' | 'reject',
    note = '',
  ): A2aTaskDetail | null {
    const task = this.tasks.find((item) => item.id === id)
    if (!task) return null
    const nextState = this.taskStateAfter(task, action)
    if (!nextState) return null
    const timestamp = new Date().toISOString()
    task.state = nextState
    task.updated_at = timestamp
    task.available_actions =
      nextState === 'working' ? ['cancel'] : nextState === 'canceled' || nextState === 'rejected' ? [] : task.available_actions
    if (nextState === 'canceled' || nextState === 'rejected') {
      task.progress = null
    }
    if (nextState === 'working') {
      task.progress = 0.2
    }
    const detail = this.taskDetails[id]
    if (detail) {
      detail.state = task.state
      detail.updated_at = timestamp
      detail.available_actions = task.available_actions
      detail.progress = task.progress
      detail.timeline = [
        ...detail.timeline,
        { state: nextState, at: timestamp, duration_ms: null, note },
      ]
      if (nextState === 'canceled' || nextState === 'rejected') {
        detail.input_request = null
        detail.auth_request = null
        detail.finished_at = timestamp
      }
      if (nextState === 'working') {
        detail.input_request = null
        detail.auth_request = null
      }
      return clone(detail)
    }
    const fallback = this.getTaskDetail(id)
    if (!fallback) return null
    fallback.timeline = [
      ...fallback.timeline,
      { state: nextState, at: timestamp, duration_ms: null, note },
    ]
    return fallback
  }

  cancelTask(id: string): A2aTaskDetail | null {
    return this.applyTaskAction(id, 'cancel', '用户取消')
  }

  resumeTask(id: string, input: string): A2aTaskDetail | null {
    return this.applyTaskAction(id, 'resume', `补充信息：${input.slice(0, 40)}`)
  }

  authorizeTask(id: string): A2aTaskDetail | null {
    return this.applyTaskAction(id, 'authorize', '用户完成授权')
  }

  rejectTask(id: string, reason: string): A2aTaskDetail | null {
    return this.applyTaskAction(id, 'reject', reason || '用户拒绝授权')
  }

  getSystemInfo(): SystemInfo {
    return this.systemInfo
  }

  // ---------- M8：管理台 ----------

  adminListUsers(query: AdminUserQuery): AdminUserPage {
    const keyword = query.q?.trim().toLowerCase() ?? ''
    const filtered = this.adminUsers
      .filter((user) => (query.role ? user.role === query.role : true))
      .filter((user) => (query.status ? user.status === query.status : true))
      .filter((user) =>
        keyword ? `${user.email} ${user.display_name}`.toLowerCase().includes(keyword) : true,
      )
      .sort((left, right) => {
        if (left.created_at === right.created_at) return right.id.localeCompare(left.id)
        return right.created_at.localeCompare(left.created_at)
      })
    const page = paginate(filtered, { limit: query.limit, cursor: query.cursor })
    return {
      ...page,
      stats: {
        total: filtered.length,
        active: filtered.filter((user) => user.status === 'active').length,
        disabled: filtered.filter((user) => user.status === 'disabled').length,
        admins: filtered.filter((user) => user.role === 'admin').length,
      },
    }
  }

  adminGetUser(id: string): AdminUser | null {
    return this.adminUsers.find((user) => user.id === id) ?? null
  }

  adminUpdateUser(id: string, body: AdminUserUpdateRequest): AdminUser | null {
    const target = this.adminGetUser(id)
    if (!target) return null
    if (body.role === undefined && body.status === undefined) {
      throw new MockAdminRuleError('validation_error', '至少需要修改一个字段')
    }
    const role = body.role ?? target.role
    const status = body.status ?? target.status
    if (role !== target.role && target.id === this.user.id) {
      throw new MockAdminRuleError('cannot_change_own_role', '不能修改自己的角色')
    }
    if (status === 'disabled' && target.id === this.user.id) {
      throw new MockAdminRuleError('cannot_disable_self', '不能停用自己的账号')
    }
    if (role !== target.role || status !== target.status) {
      const keepsActiveAdmin = role === 'admin' && status === 'active'
      const wasActiveAdmin = target.role === 'admin' && target.status === 'active'
      const otherActiveAdmins = this.adminUsers.filter(
        (user) =>
          user.id !== target.id && user.role === 'admin' && user.status === 'active',
      ).length
      if (wasActiveAdmin && !keepsActiveAdmin && otherActiveAdmins === 0) {
        throw new MockAdminRuleError('last_admin_protected', '不能移除最后一个活跃管理员', 409, {
          active_admins: 1,
        })
      }
      Object.assign(target, { role, status, updated_at: new Date().toISOString() })
    }
    return target
  }

  adminOverview(): AdminOverview {
    const users = this.adminUsers
    const runs = Object.values(this.runs)
    const tasks = this.tasks
    const documents = this.knowledgeDocuments
    const attachments = this.attachments.filter((item) => item.status !== 'deleted')
    const runsBy = (status: string): number => runs.filter((run) => run.status === status).length
    const tasksBy = (state: string): number => tasks.filter((task) => task.state === state).length

    return {
      generated_at: new Date().toISOString(),
      users: {
        total: users.length,
        active: users.filter((user) => user.status === 'active').length,
        disabled: users.filter((user) => user.status === 'disabled').length,
        admins: users.filter((user) => user.role === 'admin').length,
      },
      conversations: {
        total: this.conversations.length,
        active: this.conversations.filter((item) => item.status === 'active').length,
        archived: this.conversations.filter((item) => item.status === 'archived').length,
        deleted: 0,
      },
      messages: {
        total: Object.values(this.messages).reduce((sum, list) => sum + list.length, 0),
      },
      runs: {
        total: runs.length,
        queued: runsBy('queued'),
        running: runsBy('running'),
        succeeded: runsBy('succeeded'),
        failed: runsBy('failed'),
        canceled: runsBy('canceled'),
        interrupted: runsBy('interrupted'),
      },
      a2a_tasks: {
        total: tasks.length,
        submitted: tasksBy('submitted'),
        working: tasksBy('working'),
        input_required: tasksBy('input_required'),
        auth_required: tasksBy('auth_required'),
        completed: tasksBy('completed'),
        failed: tasksBy('failed'),
        canceled: tasksBy('canceled'),
        rejected: tasksBy('rejected'),
      },
      knowledge: {
        documents: documents.length,
        chunks: 0,
        documents_pending: documents.filter((item) => item.status === 'pending').length,
        documents_indexing: documents.filter((item) => item.status === 'indexing').length,
        documents_ready: documents.filter((item) => item.status === 'ready').length,
        documents_failed: documents.filter((item) => item.status === 'failed').length,
      },
      attachments: {
        total: attachments.length,
        storage_bytes: attachments.reduce((sum, item) => sum + (item.size_bytes ?? 0), 0),
        deleted: this.attachments.filter((item) => item.status === 'deleted').length,
      },
    }
  }

  adminGetInstruction(): AdminInstruction {
    return clone(this.adminInstruction)
  }

  adminSaveInstruction(content: string | null): AdminInstruction {
    const value = content === null || content.trim() === '' ? null : content
    if (value !== null && value.length > this.adminInstruction.max_chars) {
      throw new MockAdminRuleError(
        'instruction_too_long',
        `指令超过 ${this.adminInstruction.max_chars} 字符上限`,
      )
    }
    const isNoop = value === null && this.adminInstruction.is_default
    if (isNoop) return clone(this.adminInstruction)

    if (value === null) {
      this.adminInstruction = {
        ...this.adminInstruction,
        content: mockAdminInstruction.content,
        is_default: true,
        updated_by: null,
        updated_by_email: null,
        updated_at: null,
      }
    } else {
      this.adminInstruction = {
        ...this.adminInstruction,
        content: value,
        is_default: false,
        updated_by: this.user.id,
        updated_by_email: this.user.email,
        updated_at: new Date().toISOString(),
      }
    }
    return clone(this.adminInstruction)
  }

  adminListSkills(q?: string): AdminSkillList {
    const keyword = q?.trim().toLowerCase() ?? ''
    const items = this.skills
      .filter((skill) => skill.scope === 'system')
      .filter((skill) =>
        keyword ? `${skill.name} ${skill.description}`.toLowerCase().includes(keyword) : true,
      )
      .sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id))
    return {
      items,
      stats: {
        total: items.length,
        enabled: items.filter((skill) => skill.effective_enabled ?? skill.enabled).length,
        force_disabled: items.filter((skill) => skill.force_disabled === true).length,
      },
    }
  }

  adminSetSkillEnabled(id: string, enabled: boolean): Skill | null {
    const skill = this.skills.find((item) => item.id === id && item.scope === 'system')
    if (!skill) return null
    skill.enabled = enabled
    skill.effective_enabled = enabled && !skill.force_disabled
    skill.updated_at = new Date().toISOString()
    return skill
  }

  adminSetSkillForceDisabled(id: string, forceDisabled: boolean): Skill | null {
    const skill = this.skills.find((item) => item.id === id && item.scope === 'system')
    if (!skill) return null
    skill.force_disabled = forceDisabled
    skill.effective_enabled = skill.enabled && !forceDisabled
    skill.updated_at = new Date().toISOString()
    return skill
  }

  adminListMcpServers(): AdminMcpServerList {
    const items = this.mcpServers
      .filter((server) => server.scope === 'system')
      .sort((left, right) =>
        (right.created_at ?? '').localeCompare(left.created_at ?? ''),
      )
    return {
      items,
      stats: {
        total: items.length,
        system: items.length,
        user: 0,
        enabled: items.filter((server) => server.enabled && !server.force_disabled).length,
        healthy: items.filter((server) => server.health_status === 'healthy').length,
      },
    }
  }

  adminCreateMcpServer(body: AdminMcpServerCreateRequest): McpServer {
    if (this.mcpServers.some((server) => server.slug === body.slug)) {
      throw new MockAdminRuleError('conflict', 'slug 已被占用', 409)
    }
    const now = new Date().toISOString()
    const server: McpServer = {
      id: crypto.randomUUID(),
      slug: body.slug,
      name: body.name,
      description: body.description ?? '',
      url: body.url ?? null,
      transport: body.transport ?? 'streamable_http',
      scope: 'system',
      enabled: true,
      effective_enabled: true,
      force_disabled: false,
      auto_inject: true,
      health_status: 'unknown',
      last_error: null,
      last_checked_at: null,
      latency_ms: null,
      tool_count: 0,
      credentials_hint: body.headers?.Authorization,
      created_at: now,
      updated_at: now,
    }
    this.mcpServers.push(server)
    return server
  }

  adminUpdateMcpServer(id: string, body: AdminMcpServerUpdateRequest): McpServer | null {
    const server = this.mcpServers.find((item) => item.id === id && item.scope === 'system')
    if (!server) return null
    const editable: AdminMcpServerUpdateRequest = {
      name: body.name,
      description: body.description,
      url: body.url,
      headers: body.headers,
      auto_inject: body.auto_inject,
      enabled: body.enabled,
      force_disabled: body.force_disabled,
    }
    const changed = Object.entries(editable).filter(([, value]) => value !== undefined)
    if (changed.length === 0) {
      throw new MockAdminRuleError('validation_error', '至少需要修改一个字段')
    }
    for (const [key, value] of changed) {
      if (key === 'headers') {
        const headers = value as Record<string, string>
        if (headers.Authorization) server.credentials_hint = headers.Authorization
        continue
      }
      Object.assign(server, { [key]: value })
    }
    if (body.enabled !== undefined) server.enabled = body.enabled
    if (body.force_disabled !== undefined) server.force_disabled = body.force_disabled
    server.effective_enabled = server.enabled && !server.force_disabled
    server.updated_at = new Date().toISOString()
    return server
  }

  adminDeleteMcpServer(id: string): boolean {
    const index = this.mcpServers.findIndex(
      (item) => item.id === id && item.scope === 'system',
    )
    if (index < 0) return false
    this.mcpServers.splice(index, 1)
    return true
  }

  adminListAgents(params: AdminAgentListParams): AdminAgentList {
    const keyword = params.q?.trim().toLowerCase() ?? ''
    const filtered = this.agents
      .filter((agent) => (params.health_status ? agent.health_status === params.health_status : true))
      .filter((agent) => {
        if (params.enabled === undefined || params.enabled === '') return true
        const enabled = params.enabled === 'true'
        return agent.enabled === enabled
      })
      .filter((agent) =>
        keyword ? `${agent.name} ${agent.slug} ${agent.url}`.toLowerCase().includes(keyword) : true,
      )
    const page = paginate(filtered, { limit: params.limit, cursor: params.cursor })
    return {
      ...page,
      stats: {
        total: filtered.length,
        healthy: filtered.filter((agent) => agent.health_status === 'healthy').length,
        degraded: filtered.filter((agent) => agent.health_status === 'degraded').length,
        unhealthy: filtered.filter((agent) => agent.health_status === 'unhealthy').length,
        enabled: filtered.filter((agent) => agent.enabled).length,
        disabled: filtered.filter((agent) => !agent.enabled).length,
      },
    }
  }

  adminUpdateAgent(id: string, body: AdminAgentUpdateRequest): Agent | null {
    const agent = this.agents.find((item) => item.id === id)
    if (!agent) return null
    const readOnlyFields = [
      'slug',
      'url',
      'description',
      'protocol_version',
      'card',
      'skills',
      'capabilities',
      'health_status',
      'owner_user_id',
    ]
    const rejected = readOnlyFields.filter((field) => field in body)
    if (rejected.length > 0) {
      throw new MockAdminRuleError('validation_error', `字段不可编辑：${rejected.join(', ')}`)
    }
    if (body.name !== undefined) agent.name = body.name
    if (body.enabled !== undefined) agent.enabled = body.enabled
    if (body.requires_approval !== undefined) {
      ;(agent as Agent & { requires_approval?: boolean }).requires_approval =
        body.requires_approval
    }
    if (body.auth !== undefined) {
      agent.auth_type = body.auth.type === 'api_key' ? 'api_key' : body.auth.type
      agent.auth_hint = body.auth.secret_ref ?? ''
      agent.auth_scheme = body.auth.secret_ref ? 'secret_ref' : ''
    }
    if (body.headers !== undefined) {
      const header = body.headers.Authorization ?? ''
      if (header) agent.auth_hint = header
    }
    agent.updated_at = new Date().toISOString()
    return agent
  }

  // ---------- M7：mock 运行事件续流基础设施 ----------

  /** mock 聊天开始时登记 run，使 `GET /runs/{id}` 与续流端点可达。 */
  upsertRun(run: Run): void {
    this.runs[run.id] = run
    if (!this.runEvents[run.id]) this.runEvents[run.id] = []
  }

  setRunStatus(id: string, status: Run['status'], error: Run['error'] = null): void {
    const run = this.runs[id]
    if (!run) return
    run.status = status
    run.error = error
    if (status === 'succeeded' || status === 'failed' || status === 'canceled') {
      run.finished_at = new Date().toISOString()
      this.notifyRunTerminal(id)
    }
  }

  /**
   * 追加一条已落库事件并广播给续流订阅者。
   * `message.delta` / `reasoning.delta` 不落库（与后端一致），由调用方跳过。
   */
  appendRunEvent(runId: string, event: ChatEventName, data: Record<string, unknown>): void {
    const run = this.runs[runId]
    if (!run) return
    const seq = typeof data.seq === 'number' ? data.seq : this.runEvents[runId]!.length + 1
    const record: RunEvent = {
      id: `${runId}:${seq}`,
      seq,
      ts: typeof data.ts === 'string' ? data.ts : new Date().toISOString(),
      type: eventTypeOf(event),
      event,
      status: eventStatusOf(event),
      title: event,
      subtitle: summarizeData(data),
      duration_ms: typeof data.duration_ms === 'number' ? data.duration_ms : null,
      tokens: null,
      payload: data,
      error: typeof data.message === 'string' && event === 'error' ? data.message : null,
    }
    const list = this.runEvents[runId]!
    if (list.some((item) => item.seq === record.seq)) return
    list.push(record)
    list.sort((left, right) => left.seq - right.seq)
    for (const listener of this.runEventListeners.get(runId) ?? []) {
      listener(event, { ...data, seq })
    }
  }

  subscribeRunEvents(runId: string, listener: RunEventListener): () => void {
    const listeners = this.runEventListeners.get(runId) ?? new Set<RunEventListener>()
    listeners.add(listener)
    this.runEventListeners.set(runId, listeners)
    return () => {
      listeners.delete(listener)
      if (listeners.size === 0) this.runEventListeners.delete(runId)
    }
  }

  onRunTerminal(runId: string, listener: RunTerminalListener): () => void {
    const listeners = this.runTerminalListeners.get(runId) ?? new Set<RunTerminalListener>()
    listeners.add(listener)
    this.runTerminalListeners.set(runId, listeners)
    return () => {
      listeners.delete(listener)
      if (listeners.size === 0) this.runTerminalListeners.delete(runId)
    }
  }

  private notifyRunTerminal(runId: string): void {
    const listeners = this.runTerminalListeners.get(runId)
    if (!listeners) return
    this.runTerminalListeners.delete(runId)
    for (const listener of listeners) listener()
  }

  /** 等待 run 终态；已终态时立即 resolve。mock 续流测试/实时跟随用。 */
  waitRunTerminal(runId: string, signal: AbortSignal): Promise<void> {
    const run = this.runs[runId]
    if (!run || (run.status !== 'running' && run.status !== 'queued' && run.status !== 'interrupted')) {
      return Promise.resolve()
    }
    return new Promise<void>((resolve, reject) => {
      const off = this.onRunTerminal(runId, () => {
        signal.removeEventListener('abort', onAbort)
        resolve()
      })
      function onAbort(): void {
        off()
        const error = new Error('Aborted')
        error.name = 'AbortError'
        reject(error)
      }
      signal.addEventListener('abort', onAbort, { once: true })
    })
  }
}

export const mockDb = new MockDb()
