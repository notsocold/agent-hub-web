import { apiClient } from './client'
import type {
  A2aTaskDetail,
  A2aTaskListItem,
  PageResult,
  TaskAuthorizeRequest,
  TaskRejectRequest,
  TaskResumeRequest,
  TaskResumeResult,
} from '@/types'

export interface TaskListParams {
  state?: string
  q?: string
  agent_id?: string
  run_id?: string
  conversation_id?: string
  from?: string
  to?: string
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

  async cancel(id: string): Promise<A2aTaskDetail> {
    const { data } = await apiClient.post<A2aTaskDetail>(`/tasks/${id}/cancel`)
    return data
  },

  async resume(id: string, body: TaskResumeRequest): Promise<TaskResumeResult> {
    const { data } = await apiClient.post<TaskResumeResult>(`/tasks/${id}/resume`, body)
    return data
  },

  async authorize(id: string, body: TaskAuthorizeRequest = {}): Promise<A2aTaskDetail> {
    const { data } = await apiClient.post<A2aTaskDetail>(`/tasks/${id}/authorize`, body)
    return data
  },

  async reject(id: string, body: TaskRejectRequest = {}): Promise<A2aTaskDetail> {
    const { data } = await apiClient.post<A2aTaskDetail>(`/tasks/${id}/reject`, body)
    return data
  },
}
