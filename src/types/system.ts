import type { ReasoningEffortId } from './chat'

export interface ModelCapabilities {
  streaming: boolean
  reasoning: boolean
  tools: boolean
}

export interface ModelInfo {
  id: string
  name: string
  description: string
  capabilities: ModelCapabilities
}

export interface ReasoningEffortOption {
  id: ReasoningEffortId
  name: string
  description: string
}

export interface SystemCapabilities {
  instructions: boolean
  memories: boolean
  skills: boolean
  mcp: boolean
  knowledge: boolean
  attachments: boolean
  workflows: boolean
  approvals: boolean
}

export interface SystemLimits {
  skills_per_message: number
  mcp_servers_per_message: number
  mcp_tools_per_message: number
  knowledge_categories_per_message: number
  attachments_per_message: number
  attachment_max_bytes: number
  message_max_chars: number
}

export interface SystemA2aInfo {
  enabled: boolean
  card_url: string
  jsonrpc_url: string
  auth_type: string
  card_security: string
}

export interface SystemInfo {
  version: string
  build: string
  environment: string
  models: ModelInfo[]
  default_model: string
  reasoning_efforts: ReasoningEffortOption[]
  default_reasoning_effort: ReasoningEffortId
  embedding: {
    model: string
    dim: number
  }
  generation: {
    temperature: number
    timeout_seconds: number
    max_output_tokens: number
  }
  a2a: SystemA2aInfo
  capabilities: SystemCapabilities
  limits: SystemLimits
}
