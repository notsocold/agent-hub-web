import type {
  A2aTaskData,
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
  SkillProcess,
  ToolProcess,
  Usage,
  WorkflowStepProcess,
} from '@/types'
import { TASK_STATES } from '@/types'

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
    reasoning_tokens:
      typeof record.reasoning_tokens === 'number' ? record.reasoning_tokens : null,
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
    currentAssistantId: null,
    pendingApprovalId: null,
    usage: null,
    finishReason: null,
    error: null,
    lastSeq: 0,
  }
}

function assistantMessage(
  id: string,
  runId: string | null,
  createdAt?: string,
): ChatMessageView {
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

function mapWorkflowStatus(status: string): WorkflowStepProcess['status'] {
  if (status === 'running') return 'running'
  if (status === 'error') return 'error'
  if (status === 'skipped') return 'skipped'
  if (status === 'pending') return 'waiting'
  return 'ok'
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
    status: data.status === 'error' ? 'error' : 'ok',
    startedAt: existing?.startedAt,
    durationMs: numOrNull(data.duration_ms),
    toolCallId,
    tool: existing?.tool ?? '',
    displayName: existing?.displayName ?? str(data.tool_call_id),
    source: existing?.source ?? str(data.source),
    argsPreview: existing?.argsPreview ?? '',
    resultPreview: str(data.result_preview),
    summary: str(data.summary),
    error: str(data.error) || null,
    metadata: asRecord(data.metadata),
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
      next.streaming = true
      next.finishReason = null
      next.error = null
      next.usage = null
      next.pendingApprovalId = null
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
        tool: str(data.tool),
        toolDisplayName: str(data.tool_display_name) || str(data.tool),
        source: str(data.source),
        executor: str(data.executor),
        target: str(data.target),
        sideEffect: str(data.side_effect),
        risk: str(data.risk),
        reason: str(data.reason),
        expiresAt: str(data.expires_at) || null,
        decision: null,
      }
      next.process = upsertProcess(next.process, item)
      next.pendingApprovalId = approvalId
      next.streaming = true
      return next
    }

    case 'workflow.step': {
      const workflowId = str(data.workflow_id)
      const stepIndex = typeof data.step_index === 'number' ? data.step_index : null
      if (!workflowId || stepIndex === null) return next
      const item: WorkflowStepProcess = {
        kind: 'workflow',
        id: `workflow:${workflowId}:${stepIndex}`,
        status: mapWorkflowStatus(str(data.status)),
        startedAt: str(data.ts),
        durationMs: numOrNull(data.duration_ms),
        workflowId,
        stepIndex,
        stepType: str(data.step_type),
        name: str(data.name),
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
      }
      next.error = error
      next.streaming = false
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
      const usage = asUsage(data.usage)
      const citations = Array.isArray(data.citations) ? (data.citations as Citation[]) : []
      const artifacts = Array.isArray(data.artifacts) ? (data.artifacts as MessageArtifact[]) : []
      const reasoning = asReasons(data.reasoning)
      const status =
        finishReason === 'stop'
          ? 'completed'
          : finishReason === 'error'
            ? 'failed'
            : 'canceled'

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
      next.usage = usage
      next.pendingApprovalId = null
      next.currentAssistantId = null
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
  return {
    ...state,
    process: items,
    pendingApprovalId: state.pendingApprovalId === approvalId ? null : state.pendingApprovalId,
  }
}
