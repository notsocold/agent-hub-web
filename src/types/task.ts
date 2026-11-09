export type A2aTaskState =
  | 'submitted'
  | 'working'
  | 'input_required'
  | 'auth_required'
  | 'completed'
  | 'failed'
  | 'canceled'
  | 'rejected'

export type TaskAction = 'cancel' | 'resume' | 'authorize' | 'reject'

export interface TaskAgentRef {
  id: string
  slug: string
  name: string
}

export interface TaskConversationRef {
  id: string
  title: string
}

export interface A2aTaskListItem {
  id: string
  a2a_task_id: string
  agent: TaskAgentRef
  run_id: string
  conversation: TaskConversationRef | null
  state: A2aTaskState
  progress: number | null
  duration_ms: number | null
  request_summary: string
  error_summary: string | null
  available_actions: TaskAction[]
  created_at: string
  updated_at: string
}

export interface TaskTimelineEntry {
  state: A2aTaskState
  at: string
  duration_ms: number | null
  note: string
}

export interface TaskInputRequest {
  question: string
  input_schema: Record<string, unknown>
  expires_at: string | null
}

export interface TaskAuthRequest {
  scopes: string[]
  authorization_url: string | null
  expires_at: string | null
}

export interface TaskResultArtifact {
  type: string
  summary: string
  parts: string[]
  data: Record<string, unknown>
}

export interface TaskResumeRequest {
  input: string
}

export interface TaskAuthorizeRequest {
  scopes?: string[]
  note?: string
}

export interface TaskRejectRequest {
  reason?: string
}

/** resume 沿用同一 task，响应携带更新后的任务与 run（run 结构前端只展示 id/状态）。 */
export interface TaskResumeResult {
  task: A2aTaskDetail
  run?: {
    id: string
    status: string
  } | null
}

export interface A2aTaskDetail extends A2aTaskListItem {
  tool_call_id: string
  request: {
    tool: string
    args: Record<string, unknown>
    summary: string
  } | null
  result: {
    artifact: TaskResultArtifact
    summary: string
  } | null
  error: {
    code: string
    message: string
    retryable: boolean
    at: string | null
  } | null
  input_request: TaskInputRequest | null
  auth_request: TaskAuthRequest | null
  timeline: TaskTimelineEntry[]
  started_at: string | null
  finished_at: string | null
}
