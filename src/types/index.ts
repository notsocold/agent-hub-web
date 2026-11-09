export * from './api'
export * from './auth'
export * from './attachment'
export * from './capability'
export * from './conversation'
export * from './chat'
export * from './run'
export * from './approval'
export * from './agent'
export * from './task'
export * from './knowledge'
export * from './workflow'
export * from './system'

import type { A2aTaskState } from './task'
import type { AgentHealthStatus } from './agent'
import type { ApprovalStatus } from './approval'
import type { ConversationStatus } from './conversation'
import type { KnowledgeDocumentStatus } from './knowledge'
import type { RunStatus } from './run'
import type { WorkflowStatus } from './workflow'

export const TASK_STATES: readonly A2aTaskState[] = [
  'submitted',
  'working',
  'input_required',
  'auth_required',
  'completed',
  'failed',
  'canceled',
  'rejected',
]

export const AGENT_HEALTH_STATUSES: readonly AgentHealthStatus[] = [
  'unknown',
  'healthy',
  'degraded',
  'unhealthy',
]

export const APPROVAL_STATUSES: readonly ApprovalStatus[] = [
  'pending',
  'approved',
  'rejected',
  'expired',
  'canceled',
]

export const CONVERSATION_STATUSES: readonly ConversationStatus[] = ['active', 'archived']

export const KNOWLEDGE_STATUSES: readonly KnowledgeDocumentStatus[] = [
  'pending',
  'indexing',
  'ready',
  'failed',
]

export const RUN_STATUSES: readonly RunStatus[] = [
  'queued',
  'running',
  'succeeded',
  'failed',
  'canceled',
  'interrupted',
]

export const WORKFLOW_STATUSES: readonly WorkflowStatus[] = ['draft', 'published', 'disabled']

/** 未知枚举值降级为 fallback，避免后端扩展枚举导致页面崩溃。 */
export function normalizeEnum<T extends string>(
  value: string | null | undefined,
  allowed: readonly T[],
  fallback: T,
): T {
  return allowed.includes(value as T) ? (value as T) : fallback
}
