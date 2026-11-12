import type {
  A2aTaskData,
  Approval,
  ApprovalProcess,
  A2aProcess,
  ChatEventName,
  ChatMessageView,
  ChatState,
  Citation,
  ErrorProcess,
  MessageArtifact,
  MessageError,
  NoticeProcess,
  ProcessItem,
  RunEvent,
  SkillProcess,
  ToolProcess,
  Usage,
  WorkflowStepProcess,
} from '@/types'
import { TASK_STATES } from '@/types'
import type { RunStatus } from '@/types'
import { isChatEvent } from '@/api/chat'

function str(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function numOrNull(value: unknown): number | null {
  return typeof value === 'number' ? value : null
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function asUsage(value: unknown): Usage | null {
  const record = asRecord(value)
  if (typeof record.input_tokens !== 'number' || typeof record.output_tokens !== 'number') {
    return null
  }
  return {
    input_tokens: record.input_tokens,
    output_tokens: record.output_tokens,
    reasoning_tokens: typeof record.reasoning_tokens === 'number' ? record.reasoning_tokens : null,
    total_tokens: typeof record.total_tokens === 'number' ? record.total_tokens : null,
  }
}

function asReasons(value: unknown): {
  duration_ms: number
  tokens: number
  summary: string
} | null {
  const record = asRecord(value)
  if (typeof record.duration_ms !== 'number' || typeof record.tokens !== 'number') {
    return null
  }
  return {
    duration_ms: record.duration_ms,
    tokens: record.tokens,
    summary: str(record.summary),
  }
}

function emptyCapabilities(): ChatMessageView['capabilities'] {
  return { skills: [], mcp_servers: [], mcp_tools: [], knowledge_categories: [], workflow_id: null }
}

export function createInitialChatState(): ChatState {
  return {
    conversationId: null,
    conversationTitle: '',
    messages: [],
    process: [],
    streaming: false,
    runId: null,
    runStatus: null,
    currentAssistantId: null,
    pendingApprovalId: null,
    pendingApprovalIds: [],
    usage: null,
    finishReason: null,
    error: null,
    recovery: null,
    lastSeq: 0,
  }
}

function runStatusFromFinishReason(finishReason: string): RunStatus {
  if (finishReason === 'stop') return 'succeeded'
  if (finishReason === 'error') return 'failed'
  if (finishReason === 'interrupted') return 'interrupted'
  return 'canceled'
}

function assistantMessage(id: string, runId: string | null, createdAt?: string): ChatMessageView {
  return {
    id,
    role: 'assistant',
    content: '',
    content_type: 'markdown',
    run_id: runId,
    client_message_id: null,
    status: 'completed',
    citations: [],
    attachments: [],
    capabilities: emptyCapabilities(),
    artifacts: [],
    usage: null,
    error: null,
    created_at: createdAt ?? new Date().toISOString(),
    streaming: true,
  }
}

function updateMessage(
  messages: ChatMessageView[],
  id: string,
  updater: (message: ChatMessageView) => ChatMessageView,
): ChatMessageView[] {
  return messages.map((message) => (message.id === id ? updater(message) : message))
}

function upsertProcess(list: ProcessItem[], item: ProcessItem): ProcessItem[] {
  const index = list.findIndex((entry) => entry.id === item.id)
  if (index < 0) return [...list, item]
  const next = [...list]
  next[index] = { ...next[index], ...item } as ProcessItem
  return next
}

function mapA2aStatus(state: string): A2aProcess['status'] {
  if (state === 'working' || state === 'submitted') return 'running'
  if (state === 'input_required' || state === 'auth_required') return 'waiting'
  if (state === 'completed') return 'ok'
  if (state === 'canceled') return 'canceled'
  return 'error'
}

/** M9 T6 契约：'ok' 映射成功；'rejected' 与未知值一律映射失败。 */
function mapWorkflowStatus(status: string): WorkflowStepProcess['status'] {
  return status === 'ok' ? 'ok' : 'error'
}

function normalizeA2aState(value: string): A2aTaskData['state'] {
  return (TASK_STATES as readonly string[]).includes(value)
    ? (value as A2aTaskData['state'])
    : 'working'
}

function addToolStart(state: ChatState, data: Record<string, unknown>): ChatState {
  const toolCallId = str(data.tool_call_id)
  if (!toolCallId) return state
  const item: ToolProcess = {
    kind: 'tool',
    id: `tool:${toolCallId}`,
    status: 'running',
    startedAt: str(data.ts),
    toolCallId,
    tool: str(data.tool),
    displayName: str(data.display_name) || str(data.tool),
    source: str(data.source),
    sourceId: str(data.source_id) || null,
    server: str(data.server),
    risk: str(data.risk) || null,
    requiresApproval: data.requires_approval === true,
    argsPreview: str(data.args_preview),
    resultPreview: '',
    summary: '',
    error: null,
    metadata: asRecord(data.metadata),
  }
  return { ...state, process: upsertProcess(state.process, item) }
}

function addToolResult(state: ChatState, data: Record<string, unknown>): ChatState {
  const toolCallId = str(data.tool_call_id)
  if (!toolCallId) return state
  const existing = state.process.find(
    (item): item is ToolProcess => item.kind === 'tool' && item.toolCallId === toolCallId,
  )
  const item: ToolProcess = {
    kind: 'tool',
    id: existing?.id ?? `tool:${toolCallId}`,
    status:
      data.status === 'error'
        ? 'error'
        : data.status === 'rejected'
          ? 'canceled'
          : 'ok',
    startedAt: existing?.startedAt,
    durationMs: numOrNull(data.duration_ms),
    toolCallId,
    tool: existing?.tool ?? '',
    displayName: existing?.displayName ?? str(data.tool_call_id),
    source: existing?.source ?? str(data.source),
    sourceId: existing?.sourceId ?? null,
    server: existing?.server ?? '',
    risk: existing?.risk ?? null,
    requiresApproval: existing?.requiresApproval ?? false,
    argsPreview: existing?.argsPreview ?? '',
    resultPreview: str(data.result_preview),
    summary: str(data.summary),
    error: str(data.error) || null,
    metadata: asRecord(data.metadata),
    citations: Array.isArray(data.citations)
      ? (data.citations as Citation[])
      : existing?.citations,
  }
  return { ...state, process: upsertProcess(state.process, item) }
}

function addA2aTask(state: ChatState, data: Record<string, unknown>): ChatState {
  const taskId = str(data.task_id)
  if (!taskId) return state
  const agentDetail = asRecord(data.agent_detail)
  const a2aState = normalizeA2aState(str(data.state))
  const existing = state.process.find(
    (item): item is A2aProcess => item.kind === 'a2a' && item.taskId === taskId,
  )
  const item: A2aProcess = {
    kind: 'a2a',
    id: existing?.id ?? `a2a:${taskId}`,
    status: mapA2aStatus(a2aState),
    startedAt: existing?.startedAt ?? str(data.ts),
    durationMs: numOrNull(data.duration_ms) ?? existing?.durationMs ?? null,
    taskId,
    a2aTaskId: str(data.a2a_task_id),
    agent: str(data.agent),
    agentName: str(agentDetail.name) || str(data.agent),
    state: a2aState,
    progress: numOrNull(data.progress) ?? existing?.progress ?? null,
    requestSummary: str(data.request_summary) || existing?.requestSummary || '',
    resultSummary: str(data.result_summary) || existing?.resultSummary || '',
    artifactSummary: existing?.artifactSummary ?? '',
    error: str(data.error) || existing?.error || null,
  }
  return { ...state, process: upsertProcess(state.process, item) }
}

/** 审批实体 → 对话过程卡片；M5 多审批与补卡共用。 */
export function approvalToProcess(approval: Approval): ApprovalProcess {
  const decided = approval.status === 'approved' || approval.status === 'rejected'
  const waiting = approval.status === 'pending'
  return {
    kind: 'approval',
    id: `approval:${approval.id}`,
    status: waiting ? 'waiting' : decided ? 'ok' : 'canceled',
    startedAt: approval.created_at,
    approvalId: approval.id,
    toolCallId: undefined,
    tool: approval.tool_name,
    toolDisplayName: approval.tool_display_name || approval.tool_name,
    source: approval.source,
    executor: approval.executor,
    target: approval.target,
    sideEffect: approval.side_effect,
    risk: approval.risk,
    reason: approval.reason,
    payload: approval.payload,
    payloadPreview: approval.payload_preview,
    expiresAt: approval.expires_at,
    decision:
      approval.status === 'approved' ? 'approve' : approval.status === 'rejected' ? 'reject' : null,
  }
}

/**
 * 用服务端审批列表补齐/刷新过程卡片（断线恢复、运行中断补卡时使用）。
 * 不改变 run 状态，由调用方决定。
 */
export function hydrateApprovals(
  state: ChatState,
  approvals: Approval[],
  options: { replacePending?: boolean } = {},
): ChatState {
  if (approvals.length === 0) {
    return options.replacePending
      ? { ...state, pendingApprovalIds: [], pendingApprovalId: null }
      : state
  }
  let process = [...state.process]
  for (const approval of approvals) {
    process = upsertProcess(process, approvalToProcess(approval))
  }
  const pendingIds = approvals.filter((item) => item.status === 'pending').map((item) => item.id)
  const existingPending = state.pendingApprovalIds.filter((id) =>
    process.some((item) => item.kind === 'approval' && item.approvalId === id),
  )
  // 断线对账以服务端为准；事件流路径保留本地尚未落库的审批。
  const merged = options.replacePending
    ? pendingIds
    : [...new Set([...existingPending, ...pendingIds])]
  return {
    ...state,
    process,
    pendingApprovalIds: merged,
    pendingApprovalId: merged[0] ?? null,
  }
}

/** 终态：清空待审指针并把仍等待的卡片标为不可操作。 */
export function clearPendingApprovalIds(state: ChatState): ChatState {
  const process = state.process.map((item) =>
    item.kind === 'approval' && item.status === 'waiting'
      ? ({ ...item, status: 'canceled' } satisfies ApprovalProcess)
      : item,
  )
  return {
    ...state,
    process,
    pendingApprovalIds: [],
    pendingApprovalId: null,
  }
}

/** 关闭审批卡但不知道服务端结论：标为不可操作并移除指针。 */
export function markApprovalClosed(state: ChatState, approvalId: string): ChatState {
  const process = state.process.map((item) =>
    item.kind === 'approval' && item.approvalId === approvalId
      ? ({ ...item, status: 'canceled' } satisfies ApprovalProcess)
      : item,
  )
  const pending = state.pendingApprovalIds.filter((id) => id !== approvalId)
  return {
    ...state,
    process,
    pendingApprovalIds: pending,
    pendingApprovalId: pending[0] ?? null,
  }
}

/** 只移除指针，不改写卡片结论（用于「已在别处处理」的 409）。 */
export function clearPendingApproval(state: ChatState, approvalId: string): ChatState {
  const pending = state.pendingApprovalIds.filter((id) => id !== approvalId)
  return {
    ...state,
    pendingApprovalIds: pending,
    pendingApprovalId: pending[0] ?? null,
  }
}

/** 过期审批：卡片标记不可操作，并从待审列表移除。 */
export function markApprovalExpired(state: ChatState, approvalId: string): ChatState {
  const items = state.process.map((item) => {
    if (item.kind !== 'approval' || item.approvalId !== approvalId) return item
    return { ...item, status: 'canceled' } satisfies ApprovalProcess
  })
  const pending = state.pendingApprovalIds.filter((id) => id !== approvalId)
  return {
    ...state,
    process: items,
    pendingApprovalIds: pending,
    pendingApprovalId: pending[0] ?? null,
  }
}

/** 恢复执行意味着该 run 的所有 pending 审批都已处理，清理不可再操作的卡片。 */
export function markAllApprovalsResolved(state: ChatState): ChatState {
  const items = state.process.map((item) =>
    item.kind === 'approval' && item.status === 'waiting'
      ? ({ ...item, status: 'ok' } satisfies ApprovalProcess)
      : item,
  )
  return {
    ...state,
    process: items,
    pendingApprovalIds: [],
    pendingApprovalId: null,
  }
}

/**
 * M7：把事件回放项映射成 SSE 事件名。
 *
 * 后端对无法识别的事件返回空串；前端只接受白名单内的事件，空串/未知事件
 * 返回 null 由调用方跳过并记录，绝不根据 `type` 猜测事件名。
 */
export function eventNameOfRunEvent(event: Pick<RunEvent, 'event'>): ChatEventName | null {
  return event.event && isChatEvent(event.event) ? event.event : null
}

export function reduceChat(state: ChatState, event: ChatEventName, raw: unknown): ChatState {
  const data = asRecord(raw)
  const seq = typeof data.seq === 'number' ? data.seq : null
  if (seq !== null && seq <= state.lastSeq) return state

  const next: ChatState = {
    ...state,
    lastSeq: seq ?? state.lastSeq,
    process: [...state.process],
    messages: [...state.messages],
  }

  switch (event) {
    case 'ping':
      return state

    case 'conversation.created': {
      next.conversationId = str(data.conversation_id) || state.conversationId
      next.conversationTitle = str(data.title) || state.conversationTitle
      return next
    }

    case 'run.started': {
      next.conversationId = str(data.conversation_id) || state.conversationId
      next.runId = str(data.run_id) || state.runId
      next.runStatus = 'running'
      next.streaming = true
      next.finishReason = null
      next.error = null
      next.recovery = null
      next.usage = null
      next.pendingApprovalId = null
      next.pendingApprovalIds = []
      next.currentAssistantId = null
      next.process = []
      return next
    }

    case 'message.created': {
      const messageId = str(data.message_id)
      if (!messageId) return next
      const clientId = str(data.client_message_id)
      const index = clientId
        ? next.messages.findIndex((message) => message.client_message_id === clientId)
        : -1
      if (index >= 0) {
        const existing = next.messages[index]
        if (existing) {
          next.messages[index] = { ...existing, id: messageId, status: 'completed' }
        }
      } else {
        next.messages = [
          ...next.messages,
          {
            ...assistantMessage(messageId, next.runId, str(data.created_at) || undefined),
            role: 'user',
            streaming: false,
          },
        ]
      }
      return next
    }

    case 'message.started': {
      const messageId = str(data.message_id)
      if (!messageId) return next
      if (!next.messages.some((message) => message.id === messageId)) {
        next.messages = [
          ...next.messages,
          assistantMessage(messageId, next.runId, str(data.started_at) || undefined),
        ]
      }
      next.currentAssistantId = messageId
      return next
    }

    case 'message.delta': {
      const messageId = str(data.message_id)
      const delta = str(data.delta)
      if (!messageId || !delta) return next
      if (!next.messages.some((message) => message.id === messageId)) {
        next.messages = [...next.messages, assistantMessage(messageId, next.runId)]
      }
      next.messages = updateMessage(next.messages, messageId, (message) => ({
        ...message,
        content: message.content + delta,
        streaming: true,
      }))
      next.currentAssistantId = messageId
      next.streaming = true
      return next
    }

    case 'reasoning.delta': {
      const messageId = str(data.message_id)
      const delta = str(data.delta)
      if (!messageId || !delta) return next
      if (!next.messages.some((message) => message.id === messageId)) {
        next.messages = [...next.messages, assistantMessage(messageId, next.runId)]
      }
      next.messages = updateMessage(next.messages, messageId, (message) => ({
        ...message,
        reasoning: {
          content: (message.reasoning?.content ?? '') + delta,
          durationMs: message.reasoning?.durationMs ?? null,
          tokens: message.reasoning?.tokens ?? null,
          done: false,
        },
      }))
      return next
    }

    case 'reasoning.done': {
      const messageId = str(data.message_id)
      if (!messageId) return next
      next.messages = updateMessage(next.messages, messageId, (message) => ({
        ...message,
        reasoning: {
          content: message.reasoning?.content ?? str(data.summary),
          durationMs: numOrNull(data.duration_ms),
          tokens: numOrNull(data.tokens),
          done: true,
        },
      }))
      return next
    }

    case 'skill.activated': {
      const skillId = str(data.skill_id) || `skill-${next.lastSeq}`
      const item: SkillProcess = {
        kind: 'skill',
        id: `skill:${skillId}`,
        status: 'ok',
        startedAt: str(data.ts),
        durationMs: numOrNull(data.duration_ms),
        skillId,
        slug: str(data.slug),
        name: str(data.name) || str(data.slug),
        scope: str(data.scope),
        description: str(data.description),
        estimatedTokens: numOrNull(data.estimated_tokens),
      }
      next.process = upsertProcess(next.process, item)
      return next
    }

    case 'tool.start':
      return addToolStart(next, data)

    case 'tool.result':
      return addToolResult(next, data)

    case 'a2a.task':
      return addA2aTask(next, data)

    case 'a2a.artifact': {
      const taskId = str(data.task_id)
      if (!taskId) return next
      const artifact = asRecord(data.artifact)
      const existing = next.process.find(
        (item): item is A2aProcess => item.kind === 'a2a' && item.taskId === taskId,
      )
      if (!existing) return next
      next.process = upsertProcess(next.process, {
        ...existing,
        artifactSummary: str(artifact.summary),
      })
      return next
    }

    case 'a2a.input_required':
    case 'a2a.auth_required': {
      const taskId = str(data.task_id)
      if (!taskId) return next
      const existing = next.process.find(
        (item): item is A2aProcess => item.kind === 'a2a' && item.taskId === taskId,
      )
      const agentDetail = asRecord(data.agent_detail)
      const item: A2aProcess = existing
        ? {
            ...existing,
            status: 'waiting',
            state: event === 'a2a.input_required' ? 'input_required' : 'auth_required',
          }
        : {
            kind: 'a2a',
            id: `a2a:${taskId}`,
            status: 'waiting',
            startedAt: str(data.ts),
            durationMs: null,
            taskId,
            a2aTaskId: str(data.a2a_task_id),
            agent: str(data.agent),
            agentName: str(agentDetail.name) || str(data.agent),
            state: event === 'a2a.input_required' ? 'input_required' : 'auth_required',
            progress: null,
            requestSummary: '',
            resultSummary: '',
            artifactSummary: '',
            error: null,
          }
      next.process = upsertProcess(next.process, item)
      return next
    }

    case 'approval.required': {
      const approvalId = str(data.approval_id)
      if (!approvalId) return next
      const item: ApprovalProcess = {
        kind: 'approval',
        id: `approval:${approvalId}`,
        status: 'waiting',
        startedAt: str(data.ts),
        approvalId,
        toolCallId: str(data.tool_call_id) || undefined,
        tool: str(data.tool),
        toolDisplayName: str(data.tool_display_name) || str(data.tool),
        source: str(data.source),
        executor: str(data.executor),
        target: str(data.target),
        sideEffect: str(data.side_effect),
        risk: str(data.risk),
        reason: str(data.reason),
        payload: data.payload && typeof data.payload === 'object' ? asRecord(data.payload) : undefined,
        payloadPreview: str(data.payload_preview) || undefined,
        expiresAt: str(data.expires_at) || null,
        decision: null,
      }
      next.process = upsertProcess(next.process, item)
      // 一轮可能有多个审批；run 状态等后端 `run.interrupted` 再收敛。
      next.pendingApprovalIds = next.pendingApprovalIds.includes(approvalId)
        ? next.pendingApprovalIds
        : [...next.pendingApprovalIds, approvalId]
      next.pendingApprovalId = next.pendingApprovalIds[0] ?? null
      return next
    }

    case 'run.interrupted': {
      next.runId = str(data.run_id) || next.runId
      next.runStatus = 'interrupted'
      // SSE 保持连接（等待审批）；输入栏仍按执行中处理。
      next.streaming = true
      next.recovery = null
      const approvals = Array.isArray(data.approvals)
        ? data.approvals.filter((value): value is string => typeof value === 'string')
        : []
      next.pendingApprovalIds = approvals
      next.pendingApprovalId = approvals[0] ?? null
      const usage = asUsage(data.usage)
      if (usage) next.usage = usage
      if (Array.isArray(data.citations) && next.currentAssistantId) {
        const citations = data.citations as Citation[]
        next.messages = updateMessage(next.messages, next.currentAssistantId, (message) => ({
          ...message,
          citations,
        }))
      }
      return next
    }

    case 'run.resumed': {
      next.runId = str(data.run_id) || next.runId
      next.runStatus = 'running'
      next.streaming = true
      next.finishReason = null
      next.error = null
      next.recovery = null
      next.process = next.process.map((item) =>
        item.kind === 'approval' && item.status === 'waiting'
          ? ({ ...item, status: 'ok' } satisfies ApprovalProcess)
          : item,
      )
      next.pendingApprovalIds = []
      next.pendingApprovalId = null
      return next
    }

    case 'workflow.step': {
      // M9 payload：{step_id, step_type, step_title, tool, status}；step_id 作主键。
      const stepId = str(data.step_id)
      if (!stepId) return next
      const item: WorkflowStepProcess = {
        kind: 'workflow',
        id: `workflow:${stepId}`,
        status: mapWorkflowStatus(str(data.status)),
        startedAt: str(data.ts),
        stepId,
        stepType: str(data.step_type),
        stepTitle: str(data.step_title),
        tool: str(data.tool),
      }
      next.process = upsertProcess(next.process, item)
      return next
    }

    case 'memory.saved': {
      const item: NoticeProcess = {
        kind: 'notice',
        id: `memory:${str(data.memory_id) || next.lastSeq}`,
        status: 'ok',
        startedAt: str(data.ts),
        level: 'info',
        code: 'memory_saved',
        message: str(data.preview),
        retryable: false,
      }
      next.process = upsertProcess(next.process, item)
      return next
    }

    case 'notice': {
      const item: NoticeProcess = {
        kind: 'notice',
        id: `notice:${next.lastSeq}`,
        status: str(data.level) === 'error' ? 'error' : 'ok',
        startedAt: str(data.ts),
        level:
          data.level === 'error' || data.level === 'warn' || data.level === 'info'
            ? data.level
            : 'info',
        code: str(data.code),
        message: str(data.message),
        retryable: data.retryable === true,
      }
      next.process = upsertProcess(next.process, item)
      return next
    }

    case 'error': {
      const error: MessageError = {
        code: str(data.code) || 'stream_error',
        message: str(data.message) || '生成失败',
        retryable: data.retryable === true,
        requestId: str(data.request_id) || undefined,
      }
      next.error = error
      next.streaming = false
      next.runStatus = 'failed'
      next.pendingApprovalIds = []
      next.pendingApprovalId = null
      const item: ErrorProcess = {
        kind: 'error',
        id: `error:${next.lastSeq}`,
        status: 'error',
        startedAt: str(data.ts),
        code: error.code,
        message: error.message,
      }
      next.process = upsertProcess(next.process, item)
      if (next.currentAssistantId) {
        next.messages = updateMessage(next.messages, next.currentAssistantId, (message) => ({
          ...message,
          streaming: false,
          status: 'failed',
          error,
        }))
      }
      return next
    }

    case 'message.done': {
      const messageId = str(data.message_id)
      const finishReason = str(data.finish_reason) || 'stop'
      const reason = str(data.reason)
      const usage = asUsage(data.usage)
      const citations = Array.isArray(data.citations) ? (data.citations as Citation[]) : []
      const artifacts = Array.isArray(data.artifacts) ? (data.artifacts as MessageArtifact[]) : []
      const reasoning = asReasons(data.reasoning)
      const status =
        finishReason === 'stop' ? 'completed' : finishReason === 'error' ? 'failed' : 'canceled'

      if (messageId && !next.messages.some((message) => message.id === messageId)) {
        next.messages = [...next.messages, assistantMessage(messageId, next.runId)]
      }
      if (messageId) {
        next.messages = updateMessage(next.messages, messageId, (message) => ({
          ...message,
          streaming: false,
          status,
          usage: usage ?? message.usage,
          citations: citations.length > 0 ? citations : message.citations,
          artifacts: artifacts.length > 0 ? artifacts : message.artifacts,
          reasoning: reasoning
            ? {
                content: message.reasoning?.content || reasoning.summary,
                durationMs: reasoning.duration_ms,
                tokens: reasoning.tokens,
                done: true,
              }
            : message.reasoning,
        }))
      }

      next.streaming = false
      next.finishReason = finishReason
      next.runStatus = runStatusFromFinishReason(finishReason)
      next.usage = usage
      next.currentAssistantId = null

      const timedOut = finishReason === 'canceled' && reason === 'approval_timeout'
      const legacyInterrupted = finishReason === 'interrupted'
      if (timedOut) {
        // M5：审批超时后 run 终态 canceled；过期审批不可再操作。
        next.process = next.process.map((item) =>
          item.kind === 'approval' && item.status === 'waiting'
            ? ({ ...item, status: 'canceled' } satisfies ApprovalProcess)
            : item,
        )
        next.pendingApprovalIds = []
        next.pendingApprovalId = null
        next.recovery = {
          kind: 'approval_timeout',
          code: 'approval_timeout',
          message: '审批超时，本轮运行已取消；该操作没有执行。如仍需要，请重新发送。',
          runId: next.runId,
          runStatus: 'canceled',
          retryable: false,
        }
      } else if (legacyInterrupted) {
        // 兼容 M4 契约（M5 已改为 run.interrupted + 后续 run.resumed）。
        next.recovery = {
          kind: 'run_interrupted',
          code: 'run_interrupted',
          message: '本轮运行正在等待审批；处理后才会继续。',
          runId: next.runId,
          runStatus: 'interrupted',
          retryable: false,
        }
      } else {
        next.process = next.process.map((item) =>
          item.kind === 'approval' && item.status === 'waiting'
            ? ({ ...item, status: 'canceled' } satisfies ApprovalProcess)
            : item,
        )
        next.pendingApprovalIds = []
        next.pendingApprovalId = null
        next.recovery = null
      }
      return next
    }

    default:
      return state
  }
}

/** 审批决定后同步过程卡片，避免等待下一次事件。 */
export function markApprovalResolved(
  state: ChatState,
  approvalId: string,
  decision: 'approve' | 'reject',
): ChatState {
  const items = state.process.map((item) => {
    if (item.kind !== 'approval' || item.approvalId !== approvalId) return item
    return {
      ...item,
      decision,
      status: decision === 'approve' ? 'ok' : 'canceled',
    } satisfies ApprovalProcess
  })
  const pending = (state.pendingApprovalIds ?? []).filter((id) => id !== approvalId)
  return {
    ...state,
    process: items,
    pendingApprovalIds: pending,
    pendingApprovalId: pending[0] ?? null,
  }
}
