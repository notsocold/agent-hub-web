import { apiClient } from './client'
import type { CursorParams, PageResult, Workflow, WorkflowRun, WorkflowStep } from '@/types'

/**
 * M9 工作流契约 API：与后端 ``app/modules/workflows/router.py`` 的七个端点
 * 一一对应（CRUD / 启停 / 运行历史），列表均为游标分页。
 */
export const workflowsApi = {
  /** 系统模板 + 本人模板，按 created_at DESC 游标分页。 */
  async list(params: CursorParams = {}): Promise<PageResult<Workflow>> {
    const { data } = await apiClient.get<PageResult<Workflow>>('/workflows', { params })
    return data
  },

  /** 创建本人步骤模板（后端返回 201：scope=user、version=1、enabled=true）。 */
  async create(payload: {
    name: string
    description?: string
    steps: WorkflowStep[]
  }): Promise<Workflow> {
    const { data } = await apiClient.post<Workflow>('/workflows', payload)
    return data
  },

  /** 详情：系统或本人 → 200；他人/不存在 → 404。 */
  async get(id: string): Promise<Workflow> {
    const { data } = await apiClient.get<Workflow>(`/workflows/${id}`)
    return data
  },

  /** PATCH 本人模板：成功后 version + 1。 */
  async update(
    id: string,
    payload: { name?: string; description?: string; steps?: WorkflowStep[] },
  ): Promise<Workflow> {
    const { data } = await apiClient.patch<Workflow>(`/workflows/${id}`, payload)
    return data
  },

  /** 启停本人模板：只改 enabled 位，不改 version。 */
  async setEnabled(id: string, enabled: boolean): Promise<Workflow> {
    const { data } = await apiClient.put<Workflow>(`/workflows/${id}/enabled`, { enabled })
    return data
  },

  /** 硬删本人模板：后端返回 204 无内容。 */
  async remove(id: string): Promise<void> {
    await apiClient.delete(`/workflows/${id}`)
  },

  /** 运行历史：仅模板 owner 可查；系统模板 403，他人/不存在 404。 */
  async listRuns(id: string, params: CursorParams = {}): Promise<PageResult<WorkflowRun>> {
    const { data } = await apiClient.get<PageResult<WorkflowRun>>(`/workflows/${id}/runs`, {
      params,
    })
    return data
  },
}
