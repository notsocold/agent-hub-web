import { apiClient } from './client'
import type {
  Approval,
  ApprovalDecisionRequest,
  ApprovalDecisionResult,
  PageResult,
} from '@/types'

export interface ApprovalListParams {
  status?: string
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

  async decide(id: string, body: ApprovalDecisionRequest): Promise<ApprovalDecisionResult> {
    const { data } = await apiClient.post<ApprovalDecisionResult>(
      `/approvals/${id}/decision`,
      body,
    )
    return data
  },
}
