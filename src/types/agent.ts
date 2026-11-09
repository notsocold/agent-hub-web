export type AgentHealthStatus = 'unknown' | 'healthy' | 'degraded' | 'unhealthy'
export type AgentAuthType = 'none' | 'api_key' | 'oauth2'

export interface AgentSkillRef {
  id: string
  name: string
  description?: string
}

export interface AgentCapabilities {
  streaming: boolean
  push_notifications: boolean
}

export interface AgentRecentTask {
  id: string
  a2a_task_id: string
  state: string
  duration_ms: number | null
  finished_at: string | null
}

export interface Agent {
  id: string
  slug: string
  name: string
  description: string
  url: string
  protocol_version: string
  skills: AgentSkillRef[]
  skill_count: number
  auth_type: AgentAuthType
  auth_scheme: string
  auth_hint: string
  capabilities: AgentCapabilities
  health_status: AgentHealthStatus
  enabled: boolean
  last_checked_at: string | null
  last_latency_ms: number | null
  last_error: string | null
  recent_task: AgentRecentTask | null
  created_at?: string
  updated_at?: string
}

export interface AgentHealthResult {
  health_status: AgentHealthStatus
  latency_ms: number | null
  checked_at: string
  error: string | null
}

/** 注册前预览：后端只拉取并校验 Agent Card，不落库、不生成工具。 */
export interface AgentPreviewRequest {
  url: string
  slug?: string
  auth?: AgentAuthInput
}

export interface AgentAuthInput {
  type: 'none' | 'api_key'
  /** 只保存引用（如 `env:DATA_AGENT_KEY`），前端不回填密钥。 */
  secret_ref?: string
}

export interface AgentNormalizedCard {
  name: string
  description: string
  url: string
  protocol_version: string
  skills: AgentSkillRef[]
  capabilities: AgentCapabilities
}

export interface AgentPreviewResult {
  valid: boolean
  /** 原始 Agent Card，保留后端返回的完整对象供抽屉展示。 */
  card: Record<string, unknown>
  normalized: AgentNormalizedCard
  warnings: string[]
}

export interface AgentCreateRequest {
  url: string
  slug?: string
  name?: string
  auth?: AgentAuthInput
}

export interface AgentUpdateRequest {
  name?: string
  enabled?: boolean
  auth?: AgentAuthInput
}

export interface AgentRefreshResult {
  agent: Agent
  changed: boolean
  changed_fields: string[]
}

/** 详情比列表多原始 Card 与最近任务；字段缺失时按可选处理。 */
export interface AgentDetail extends Agent {
  card?: Record<string, unknown>
  recent_tasks?: AgentRecentTask[]
}
