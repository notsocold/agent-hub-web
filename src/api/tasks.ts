import { apiClient } from './client'
import type { A2aTaskDetail, A2aTaskListItem, PageResult } from '@/types'

export interface TaskListParams {
  state?: string
  q?: string
  agent_id?: string
  limit?: number
  cursor?: string
}

export const tasksApi = {
  async list(params: TaskListParams = {}): Promise<PageResult<A2aTaskListItem>> {
    const { data } = await apiClient.get<PageResult<A2aTaskListItem>>('/tasks', { params })
    return data
  },

  async get(id: string): Promise<A2aTaskDetail> {
    const { data } = await apiClient.get<A2aTaskDetail>(`/tasks/${id}`)
    return data
  },
}
