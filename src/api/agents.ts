import { apiClient } from './client'
import type { Agent, AgentHealthResult, PageResult } from '@/types'

export interface AgentListParams {
  health_status?: string
  enabled?: string
  q?: string
  limit?: number
  cursor?: string
}

export const agentsApi = {
  async list(params: AgentListParams = {}): Promise<PageResult<Agent>> {
    const { data } = await apiClient.get<PageResult<Agent>>('/agents', { params })
    return data
  },

  async health(id: string): Promise<AgentHealthResult> {
    const { data } = await apiClient.post<AgentHealthResult>(`/agents/${id}/health`)
    return data
  },
}
