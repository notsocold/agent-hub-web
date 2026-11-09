import { apiClient } from './client'
import type {
  Agent,
  AgentCreateRequest,
  AgentDetail,
  AgentHealthResult,
  AgentPreviewRequest,
  AgentPreviewResult,
  AgentRefreshResult,
  AgentUpdateRequest,
  PageResult,
} from '@/types'

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

  /** 两段式注册第一步：只拉取并校验 Card，不落库。 */
  async preview(body: AgentPreviewRequest): Promise<AgentPreviewResult> {
    const { data } = await apiClient.post<AgentPreviewResult>('/agents/preview', body)
    return data
  },

  async create(body: AgentCreateRequest): Promise<AgentDetail> {
    const { data } = await apiClient.post<AgentDetail>('/agents', body)
    return data
  },

  async get(id: string): Promise<AgentDetail> {
    const { data } = await apiClient.get<AgentDetail>(`/agents/${id}`)
    return data
  },

  async update(id: string, body: AgentUpdateRequest): Promise<AgentDetail> {
    const { data } = await apiClient.patch<AgentDetail>(`/agents/${id}`, body)
    return data
  },

  async remove(id: string): Promise<void> {
    await apiClient.delete(`/agents/${id}`)
  },

  async refresh(id: string): Promise<AgentRefreshResult> {
    const { data } = await apiClient.post<AgentRefreshResult>(`/agents/${id}/refresh`)
    return data
  },

  async health(id: string): Promise<AgentHealthResult> {
    const { data } = await apiClient.post<AgentHealthResult>(`/agents/${id}/health`)
    return data
  },
}
