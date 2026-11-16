import type { ChatMessage, Citation, MessageArtifact, MessageError, Usage } from './conversation'
import type { RunStatus } from './run'

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
  /** M5：审批被拒绝时后端发 `rejected`，工具实际未执行。 */
  status: 'ok' | 'error' | 'rejected'
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
  /** M5 幂等键：同一 run 内工具调用唯一。 */
  tool_call_id?: string
  tool: string
  tool_display_name?: string
  reason?: string
  payload?: Record<string, unknown>
  payload_preview?: string
  source?: string
  executor?: string
  target?: string
  side_effect?: string
  risk?: string
  expires_at?: string | null
}

/**
 * M5：图停在审批 gate 时发出，run=`interrupted`，**不是**终态。
 * SSE 保持连接（后端空闲 `HITL_STREAM_TIMEOUT_SECONDS` 后关闭），审批决定后
 * 继续收到 `run.resumed` 与后续 delta。
 */
export interface RunInterruptedData extends BaseEventData {
  run_id: string
  conversation_id: string
  message_id: string
  status: 'interrupted'
  /** 本轮所有 pending 审批 id；一轮多审批只挂起一次。 */
  approvals: string[]
  usage?: Usage
  citations?: Citation[]
}

/** M5：审批决定后恢复执行（非终态）。 */
export interface RunResumedData extends BaseEventData {
  run_id: string
  conversation_id: string
  status: 'running'
}

/** M9 T6 契约：``workflow.step`` payload 恰为这五个字段，紧跟对应 ``tool.result`` 之后。 */
export interface WorkflowStepData extends BaseEventData {
  step_id: string
  step_type: string
  step_title: string
  tool: string
  /** 后端宽松处理：'ok' | 'rejected' | 其余字符串一律按未知值降级。 */
  status: 'ok' | 'rejected' | string
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
  /** 后端 M1 实际会带上；老契约没有，按可选处理。 */
  conversation_id?: string
  message_id: string
  usage: Usage
  finish_reason: 'stop' | 'length' | 'canceled' | 'interrupted' | 'error' | string
  /**
   * M5：终态原因。审批超时为 `approval_timeout`，用户主动停止为 `user_canceled`；
   * 只有后端显式给出时出现。
   */
  reason?: string
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
  details?: Record<string, unknown>
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
  'run.interrupted': RunInterruptedData
  'run.resumed': RunResumedData
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

/**
 * M6/M7：SSE 流处理器。`onClose` 只在服务端正常关闭连接时触发，
 * 用于识别「静默关流但没收到 message.done」的断线。
 *
 * 放在 types 层供 `api/chat.ts` 与 `api/runs.ts` 共用，避免运行时循环依赖。
 */
export interface ChatStreamHandlers extends StreamHandlers {
  onClose?: () => void
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
  sourceId: string | null
  server: string
  risk: string | null
  requiresApproval: boolean
  argsPreview: string
  resultPreview: string
  summary: string
  error: string | null
  metadata: Record<string, unknown>
  /** `tool.result` 携带的整轮累计引用（检索类工具才有），与助手消息 citations 同形。 */
  citations?: Citation[]
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
  /** M5 幂等键，便于日志/追踪关联。 */
  toolCallId?: string
  tool: string
  toolDisplayName: string
  source: string
  executor: string
  target: string
  sideEffect: string
  risk: string
  reason: string
  payload?: Record<string, unknown>
  payloadPreview?: string
  expiresAt: string | null
  decision: 'approve' | 'reject' | null
  /** 审批决定备注（后端 `Approval.decision_note`；仅已决卡片有值）。 */
  decisionNote?: string
}

/** M9 时间线步骤卡：主键由 ``step_id`` 派生（reducer 拼 ``workflow:{step_id}``）。 */
export interface WorkflowStepProcess extends ProcessBase {
  kind: 'workflow'
  stepId: string
  stepType: string
  stepTitle: string
  tool: string
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

/**
 * 发送/流失败后的恢复提示。M1 后端在 `409 run_in_progress` 时
 * 会在 `error.details.run_id` 给出占锁的运行，前端据此恢复停止/刷新入口。
 */
export interface ChatRecovery {
  kind:
    | 'run_in_progress'
    | 'run_interrupted'
    | 'stream_failed'
    | 'approval_resume_failed'
    | 'approval_timeout'
  code: string
  message: string
  runId: string | null
  runStatus: RunStatus | null
  retryable: boolean
}

export interface ChatState {
  conversationId: string | null
  conversationTitle: string
  messages: ChatMessageView[]
  process: ProcessItem[]
  streaming: boolean
  runId: string | null
  runStatus: RunStatus | null
  currentAssistantId: string | null
  /** 兼容单审批调用方；始终等于 `pendingApprovalIds[0] ?? null`。 */
  pendingApprovalId: string | null
  /** M5：一轮可能挂起多个审批，按后端 `run.interrupted.approvals` 顺序维护。 */
  pendingApprovalIds: string[]
  usage: Usage | null
  finishReason: string | null
  error: MessageError | null
  recovery: ChatRecovery | null
  lastSeq: number
}

export interface ChatContextSelection {
  attachments?: string[]
  skills?: string[]
  mcp_servers?: string[]
  mcp_tools?: string[]
  knowledge_categories?: string[]
  /** M9：本轮选中的工作流模板 id；与技能/MCP/知识库互斥。 */
  workflow_id?: string
  /** M9：随选中的模板带出（query 预选缺省时用详情接口返回的当前 version）。 */
  workflow_version?: number
  /** 输入栏模型选择；为空时走后端默认模型。 */
  model?: string
  /** 仅在 `/system/info.reasoning_efforts` 非空时下发。 */
  reasoning_effort?: ReasoningEffortId
}
