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
