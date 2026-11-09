import { apiClient } from './client'
import type { PageResult, Run, RunCancelResult, RunEvent } from '@/types'

export interface RunEventParams {
  limit?: number
  cursor?: string
  after_seq?: number
  types?: string
  q?: string
}

export const runsApi = {
  async get(id: string): Promise<Run> {
    const { data } = await apiClient.get<Run>(`/runs/${id}`)
    return data
  },

  async events(id: string, params: RunEventParams = {}): Promise<PageResult<RunEvent>> {
    const { data } = await apiClient.get<PageResult<RunEvent>>(`/runs/${id}/events`, { params })
    return data
  },

  async cancel(id: string): Promise<RunCancelResult> {
    const { data } = await apiClient.post<RunCancelResult>(`/runs/${id}/cancel`)
    return data
  },
}
