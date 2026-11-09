import type { ChatMessage, Citation, MessageArtifact, MessageError, Usage } from './conversation'

export type ReasoningEffortId = 'low' | 'medium' | 'high'

/** 契约 4.1：聊天流请求。 */
export interface ChatStreamRequest {
  conversation_id?: string
  message: string
  client_message_id?: string
  attachments?: string[]
  skills?: string[]
  mcp_servers?: string[]
  mcp_tools?: string[]
  model?: string
  reasoning_effort?: ReasoningEffortId
  knowledge_categories?: string[]
  workflow_id?: string
  workflow_version?: number
}

/** 所有业务事件的公共字段；ping 除外。 */
export interface BaseEventData {
  run_id?: string
  ts?: string
  seq?: number
}

export interface ConversationCreatedData extends BaseEventData {
  conversation_id: string
  title: string
}

export interface RunStartedData extends BaseEventData {
  run_id: string
  conversation_id: string
  user_message_id: string
  client_message_id: string
  model: string
  reasoning_effort: ReasoningEffortId
  workflow_id?: string | null
  workflow_version?: number | null
}

export interface MessageCreatedData extends BaseEventData {
  message_id: string
  role: 'user'
  client_message_id: string
  created_at: string
}

export interface MessageStartedData extends BaseEventData {
  message_id: string
  role: 'assistant'
  started_at: string
}

export interface MessageDeltaData extends BaseEventData {
  message_id: string
  delta: string
}

export interface ReasoningDeltaData extends BaseEventData {
  message_id: string
  delta: string
}

export interface ReasoningDoneData extends BaseEventData {
  message_id: string
  duration_ms: number
  tokens: number
  summary: string
}

export interface SkillActivatedData extends BaseEventData {
  skill_id: string
  slug: string
  name: string
  scope?: string
  source?: string
  version?: string
  description?: string
  estimated_tokens?: number
  duration_ms?: number | null
  trigger?: string
  template?: string
  constraints?: string
}

export interface ToolStartData extends BaseEventData {
  tool_call_id: string
  tool: string
  display_name: string
  args?: Record<string, unknown>
  args_preview?: string
  source?: string
  source_id?: string | null
  server?: string
  risk?: string
  requires_approval?: boolean
  metadata?: Record<string, unknown>
}

export interface ToolResultData extends BaseEventData {
  tool_call_id: string
  status: 'ok' | 'error'
  summary?: string
  result_preview?: string
  duration_ms?: number | null
  source?: string
  error?: string | null
  citations?: Citation[]
  metadata?: Record<string, unknown>
}

export interface AgentRef {
  id: string
  slug: string
  name: string
}

export interface A2aTaskData extends BaseEventData {
  task_id: string
  a2a_task_id: string
  agent: string
  agent_detail?: AgentRef
  state:
    | 'submitted'
    | 'working'
    | 'input_required'
    | 'auth_required'
    | 'completed'
    | 'failed'
    | 'canceled'
    | 'rejected'
  progress?: number | null
  request_summary?: string | null
  result_summary?: string | null
  duration_ms?: number | null
  error?: string | null
}

export interface A2aArtifactData extends BaseEventData {
  task_id: string
  a2a_task_id: string
  artifact: {
    type: string
    summary?: string
    parts?: string[]
    data?: Record<string, unknown>
  }
}

export interface A2aInputRequiredData extends BaseEventData {
  task_id: string
  a2a_task_id: string
  agent: string
  agent_detail?: AgentRef
  question: string
  input_schema?: Record<string, unknown>
  expires_at?: string | null
}

export interface A2aAuthRequiredData extends BaseEventData {
  task_id: string
  a2a_task_id: string
  agent: string
  agent_detail?: AgentRef
  scopes: string[]
  authorization_url?: string | null
  expires_at?: string | null
}

export interface ApprovalRequiredData extends BaseEventData {
  approval_id: string
  tool: string
  tool_display_name?: string
  reason?: string
  payload?: Record<string, unknown>
  source?: string
  executor?: string
  target?: string
  side_effect?: string
  risk?: string
  expires_at?: string | null
}

export interface WorkflowStepData extends BaseEventData {
  workflow_id: string
  workflow_version: number
  step_index: number
  step_type: string
  name: string
  status: 'pending' | 'running' | 'done' | 'error' | 'skipped'
  duration_ms?: number | null
}

export interface MemorySavedData extends BaseEventData {
  memory_id: string
  kind: string
  action: string
  preview: string
}

export interface NoticeData extends BaseEventData {
  level: 'info' | 'warn' | 'error'
  code: string
  message: string
  retryable?: boolean
}

export interface MessageDoneData extends BaseEventData {
  run_id: string
  message_id: string
  usage: Usage
  finish_reason: 'stop' | 'length' | 'canceled' | 'interrupted' | 'error' | string
  model: string
  first_token_ms: number | null
  duration_ms: number
  active_duration_ms: number
  citations?: Citation[]
  artifacts?: MessageArtifact[]
  reasoning?: {
    duration_ms: number
    tokens: number
    summary: string
  } | null
}

export interface StreamErrorData extends BaseEventData {
  code: string
  message: string
  request_id?: string
  run_id?: string
  retryable?: boolean
}

export interface ChatEventDataMap {
  'conversation.created': ConversationCreatedData
  'run.started': RunStartedData
  'message.created': MessageCreatedData
  'message.started': MessageStartedData
  'message.delta': MessageDeltaData
  'reasoning.delta': ReasoningDeltaData
  'reasoning.done': ReasoningDoneData
  'skill.activated': SkillActivatedData
  'tool.start': ToolStartData
  'tool.result': ToolResultData
  'a2a.task': A2aTaskData
  'a2a.artifact': A2aArtifactData
  'a2a.input_required': A2aInputRequiredData
  'a2a.auth_required': A2aAuthRequiredData
  'approval.required': ApprovalRequiredData
  'workflow.step': WorkflowStepData
  'memory.saved': MemorySavedData
  notice: NoticeData
  'message.done': MessageDoneData
  error: StreamErrorData
  ping: Record<string, never>
}

export type ChatEventName = keyof ChatEventDataMap

export type ChatEventData<K extends ChatEventName> = ChatEventDataMap[K]

export interface StreamHandlers {
  onOpen?: (runId: string | null) => void
  onEvent: (event: ChatEventName, data: unknown) => void
  onError: (error: Error) => void
  signal: AbortSignal
}

export type ProcessStatus = 'running' | 'waiting' | 'ok' | 'error' | 'skipped' | 'canceled'

interface ProcessBase {
  id: string
  status: ProcessStatus
  startedAt?: string
  durationMs?: number | null
}

export interface ReasoningProcess extends ProcessBase {
  kind: 'reasoning'
  content: string
  tokens: number | null
  done: boolean
}

export interface SkillProcess extends ProcessBase {
  kind: 'skill'
  skillId: string
  slug: string
  name: string
  scope: string
  description: string
  estimatedTokens: number | null
}

export interface ToolProcess extends ProcessBase {
  kind: 'tool'
  toolCallId: string
  tool: string
  displayName: string
  source: string
  argsPreview: string
  resultPreview: string
  summary: string
  error: string | null
  metadata: Record<string, unknown>
}

export interface A2aProcess extends ProcessBase {
  kind: 'a2a'
  taskId: string
  a2aTaskId: string
  agent: string
  agentName: string
  state: A2aTaskData['state']
  progress: number | null
  requestSummary: string
  resultSummary: string
  artifactSummary: string
  error: string | null
}

export interface ApprovalProcess extends ProcessBase {
  kind: 'approval'
  approvalId: string
  tool: string
  toolDisplayName: string
  source: string
  executor: string
  target: string
  sideEffect: string
  risk: string
  reason: string
  expiresAt: string | null
  decision: 'approve' | 'reject' | null
}

export interface WorkflowStepProcess extends ProcessBase {
  kind: 'workflow'
  workflowId: string
  stepIndex: number
  stepType: string
  name: string
}

export interface NoticeProcess extends ProcessBase {
  kind: 'notice'
  level: NoticeData['level']
  code: string
  message: string
  retryable: boolean
}

export interface ErrorProcess extends ProcessBase {
  kind: 'error'
  code: string
  message: string
}

export type ProcessItem =
  | ReasoningProcess
  | SkillProcess
  | ToolProcess
  | A2aProcess
  | ApprovalProcess
  | WorkflowStepProcess
  | NoticeProcess
  | ErrorProcess

export interface MessageReasoning {
  content: string
  durationMs: number | null
  tokens: number | null
  done: boolean
}

/** 前端消息视图：在服务端消息上叠加流式/思考状态。 */
export interface ChatMessageView extends ChatMessage {
  streaming?: boolean
  reasoning?: MessageReasoning
}

export interface ChatState {
  conversationId: string | null
  conversationTitle: string
  messages: ChatMessageView[]
  process: ProcessItem[]
  streaming: boolean
  runId: string | null
  pendingApprovalId: string | null
  usage: Usage | null
  finishReason: string | null
  error: MessageError | null
  lastSeq: number
}

export interface ChatContextSelection {
  attachments?: string[]
  skills?: string[]
  mcp_servers?: string[]
  mcp_tools?: string[]
  knowledge_categories?: string[]
}
