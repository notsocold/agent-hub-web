import { apiClient } from './client'
import type {
  PageResult,
  Run,
  RunCancelResult,
  RunEvent,
  RunResumeRequest,
  RunResumeResult,
} from '@/types'

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

  /** M2 起可用；M1 对非 interrupted 运行返回 409，前端把它当状态提示而非致命错误。 */
  async resume(id: string, body: RunResumeRequest): Promise<RunResumeResult> {
    const { data } = await apiClient.post<RunResumeResult>(`/runs/${id}/resume`, body)
    return data
  },
}
