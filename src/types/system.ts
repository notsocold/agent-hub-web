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
  /** 后端 M1 起新增；老响应缺失时按 false 处理（2026-11-09 反馈 3.4）。 */
  agents?: boolean
  /** 后端 M1 起新增；老响应缺失时按 false 处理（2026-11-09 反馈 3.4）。 */
  tasks?: boolean
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

export interface SystemInfo {
  version: string
  build: string
  environment: string
  models: ModelInfo[]
  default_model: string
  /**
   * 可以为空数组：当前模型不支持推理等级时返回 `[]`，
   * 前端必须隐藏推理等级选择器（2026-11-09 反馈 3.3）。
   */
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
  capabilities: SystemCapabilities
  limits: SystemLimits
}
