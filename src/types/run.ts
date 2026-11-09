import type { MessageCapabilities, MessageError, Usage } from './conversation'

export type RunStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled' | 'interrupted'
export type RunPendingKind = 'approval' | 'input_required' | 'auth_required'
export type RunEventType =
  | 'request'
  | 'message'
  | 'skill'
  | 'tool'
  | 'a2a'
  | 'mcp'
  | 'approval'
  | 'workflow'
  | 'notice'
  | 'error'
export type RunEventStatus = 'ok' | 'running' | 'waiting' | 'error' | 'canceled' | 'skipped'

export interface RunWorkflow {
  id: string
  name: string
  version: number
}

export interface RunPending {
  kind: RunPendingKind | null
  approval_id: string | null
  task_id: string | null
}

export interface RunAgent {
  kind: 'local' | 'a2a'
  id: string
  name: string
  model?: string
  slug?: string
  skill_id?: string
  state?: string
}

export interface Run {
  id: string
  conversation_id: string
  status: RunStatus
  source: string
  model: string | null
  reasoning_effort: string | null
  workflow: RunWorkflow | null
  capabilities: MessageCapabilities
  usage: Usage | null
  started_at: string | null
  finished_at: string | null
  duration_ms: number | null
  active_duration_ms: number | null
  first_token_ms: number | null
  pending: RunPending
  message_ids: {
    user: string | null
    assistant: string | null
  }
  agents: RunAgent[]
  error: MessageError | null
}

/**
 * 运行事件里的 token 统计。后端实际返回
 * `{input_tokens, output_tokens, reasoning_tokens, total_tokens}`，
 * 部分事件为 `null`；保留任意数字键以兼容后续扩展。
 */
export type RunEventTokens = Record<string, number | null>

export interface RunEvent {
  /** 不透明字符串，M1 实际为 `<run_id>:<seq>`，不是 UUID（反馈 3.5）。 */
  id: string
  seq: number
  ts: string
  type: RunEventType
  status: RunEventStatus
  title: string
  subtitle: string
  duration_ms: number | null
  /** 该事件的 token 用量；没有 token 的事件返回 null，该键始终存在。 */
  tokens: RunEventTokens | null
  payload: Record<string, unknown>
  /** 错误摘要字符串；无错误返回 null，该键始终存在。 */
  error: string | null
}

export interface RunCancelResult {
  id: string
  status: RunStatus
  canceled_at: string
}

export interface RunResumeRequest {
  /** M1 恢复端点要求 input 必填，但 M1 实际会返回 409。 */
  input: string
}

export interface RunResumeResult {
  run_id: string
  status: RunStatus
  resumed: boolean
}
