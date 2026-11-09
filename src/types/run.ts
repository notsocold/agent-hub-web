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

export interface RunEventTokens {
  input?: number
  output?: number
}

export interface RunEvent {
  id: string
  seq: number
  ts: string
  type: RunEventType
  status: RunEventStatus
  title: string
  subtitle: string
  duration_ms: number | null
  tokens?: RunEventTokens | null
  payload: Record<string, unknown>
  error: string | null
}

export interface RunCancelResult {
  id: string
  status: RunStatus
  canceled_at: string
}
