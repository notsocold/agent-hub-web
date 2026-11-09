import type {
  A2aTaskDetail,
  A2aTaskListItem,
  Agent,
  AgentHealthResult,
  Approval,
  ChatMessage,
  Conversation,
  ConversationDetail,
  KnowledgeDocument,
  PageResult,
  Run,
  RunCancelResult,
  RunEvent,
  SystemInfo,
  User,
  Workflow,
} from '@/types'

import {
  mockAgents,
  mockApprovals,
  mockConversations,
  mockKnowledgeDocuments,
  mockMessages,
  mockRunEvents,
  mockRuns,
  mockSystemInfo,
  mockTaskDetails,
  mockTasks,
  mockUser,
  mockWorkflows,
} from './fixtures'

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

type ApprovalListener = (id: string, decision: 'approved' | 'rejected') => void

class MockDb {
  user: User = clone(mockUser)
  conversations: Conversation[] = []
  messages: Record<string, ChatMessage[]> = {}
  approvals: Approval[] = []
  agents: Agent[] = []
  tasks: A2aTaskListItem[] = []
  taskDetails: Record<string, A2aTaskDetail> = {}
  knowledgeDocuments: KnowledgeDocument[] = []
  workflows: Workflow[] = []
  systemInfo: SystemInfo = clone(mockSystemInfo)
  runs: Record<string, Run> = {}
  runEvents: Record<string, RunEvent[]> = {}

  private approvalListeners = new Set<ApprovalListener>()

  constructor() {
    this.reset()
  }

  reset(): void {
    this.user = clone(mockUser)
    this.conversations = clone(mockConversations)
    this.messages = clone(mockMessages)
    this.approvals = clone(mockApprovals)
    this.agents = clone(mockAgents)
    this.tasks = clone(mockTasks)
    this.taskDetails = clone(mockTaskDetails)
    this.knowledgeDocuments = clone(mockKnowledgeDocuments)
    this.workflows = clone(mockWorkflows)
    this.systemInfo = clone(mockSystemInfo)
    this.runs = clone(mockRuns)
    this.runEvents = clone(mockRunEvents)
    this.approvalListeners.clear()
  }

  listConversations(query: { q?: string; status?: string } & PageQuery): PageResult<Conversation> {
    const keyword = query.q?.trim().toLowerCase() ?? ''
    const status = query.status && query.status !== 'all' ? query.status : null
    const filtered = this.conversations
      .filter((conversation) => (status ? conversation.status === status : true))
      .filter((conversation) => (keyword ? conversation.title.toLowerCase().includes(keyword) : true))
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
    const run = Object.values(this.runs).find((item) => item.conversation_id === id)
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

  listMessages(
    conversationId: string,
    query: PageQuery,
  ): PageResult<ChatMessage> | null {
    const all = this.messages[conversationId]
    if (!all) return null
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 100)
    const end = query.cursor ? Number(decodeCursor(query.cursor)) : all.length
    const start = Math.max(0, end - limit)
    return {
      items: all.slice(start, end),
      next_cursor: start > 0 ? encodeCursor(start) : null,
      has_more: start > 0,
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
        keyword
          ? `${event.title} ${event.subtitle}`.toLowerCase().includes(keyword)
          : true,
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
    return { id, status: 'canceled', canceled_at: canceledAt }
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

  resolveApproval(
    id: string,
    decision: 'approve' | 'reject',
    note = '',
  ): Approval | null {
    const approval = this.approvals.find((item) => item.id === id)
    if (!approval) return null
    if (approval.status !== 'pending') {
      throw new Error('approval_already_decided')
    }
    approval.status = decision === 'approve' ? 'approved' : 'rejected'
    approval.decided_at = new Date().toISOString()
    approval.decided_by = { id: this.user.id, display_name: this.user.display_name }
    approval.decision_note = note

    const conversation = this.conversations.find(
      (item) => item.id === approval.conversation_id,
    )
    if (conversation && conversation.pending_approval_count > 0) {
      conversation.pending_approval_count -= 1
    }

    const resolved = approval.status
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
      .filter((agent) =>
        query.health_status ? agent.health_status === query.health_status : true,
      )
      .filter((agent) =>
        query.enabled ? String(agent.enabled) === query.enabled : true,
      )
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
      timeline: [{ state: task.state, at: task.updated_at, duration_ms: task.duration_ms, note: '' }],
      started_at: task.created_at,
      finished_at: task.state === 'completed' ? task.updated_at : null,
    }
  }

  listKnowledgeDocuments(
    query: { q?: string; category?: string; status?: string } & PageQuery,
  ): PageResult<KnowledgeDocument> {
    const keyword = query.q?.trim().toLowerCase() ?? ''
    const filtered = this.knowledgeDocuments
      .filter((document) => (query.category ? document.category === query.category : true))
      .filter((document) => (query.status ? document.status === query.status : true))
      .filter((document) =>
        keyword ? document.title.toLowerCase().includes(keyword) : true,
      )
      .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))

    return {
      ...paginate(filtered, query),
      stats: {
        documents: this.knowledgeDocuments.length,
        chunks: this.knowledgeDocuments.reduce((total, item) => total + item.chunk_count, 0),
        ready: this.knowledgeDocuments.filter((item) => item.status === 'ready').length,
        indexing: this.knowledgeDocuments.filter((item) => item.status === 'indexing').length,
        pending: this.knowledgeDocuments.filter((item) => item.status === 'pending').length,
        failed: this.knowledgeDocuments.filter((item) => item.status === 'failed').length,
      },
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

  getSystemInfo(): SystemInfo {
    return this.systemInfo
  }
}

export const mockDb = new MockDb()
