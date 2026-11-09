import { apiClient } from './client'
import type { PageResult, Workflow } from '@/types'

export interface WorkflowListParams {
  q?: string
  status?: string
  limit?: number
  cursor?: string
}

export const workflowsApi = {
  async list(params: WorkflowListParams = {}): Promise<PageResult<Workflow>> {
    const { data } = await apiClient.get<PageResult<Workflow>>('/workflows', { params })
    return data
  },
}
