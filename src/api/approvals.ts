import { apiClient } from './client'
import type {
  Approval,
  ApprovalDecisionRequest,
  ApprovalDecisionResult,
  ApprovalStatus,
  PageResult,
} from '@/types'

export interface ApprovalListParams {
  /** 后端默认 `pending`；历史 tab 用 `all`，也可按单一状态筛选。 */
  status?: ApprovalStatus | 'all'
  conversation_id?: string
  run_id?: string
  limit?: number
  cursor?: string
}

export const approvalsApi = {
  async list(params: ApprovalListParams = {}): Promise<PageResult<Approval>> {
    const { data } = await apiClient.get<PageResult<Approval>>('/approvals', { params })
    return data
  },

  async detail(id: string): Promise<Approval> {
    const { data } = await apiClient.get<Approval>(`/approvals/${id}`)
    return data
  },

  async decide(id: string, body: ApprovalDecisionRequest): Promise<ApprovalDecisionResult> {
    const { data } = await apiClient.post<ApprovalDecisionResult>(`/approvals/${id}/decision`, body)
    return data
  },
}
