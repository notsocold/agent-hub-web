export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'expired' | 'canceled'
export type ApprovalRisk = 'read' | 'write' | 'destructive' | 'unknown'
export type ApprovalDecision = 'approve' | 'reject'

export interface ApprovalDecisionBy {
  id: string
  display_name: string
}

export interface Approval {
  id: string
  run_id: string
  conversation_id: string
  conversation_title: string
  status: ApprovalStatus
  tool_name: string
  tool_display_name: string
  source: string
  executor: string
  target: string
  side_effect: string
  risk: ApprovalRisk
  reason: string
  payload: Record<string, unknown>
  payload_preview: string
  expires_at: string | null
  created_at: string
  decided_at: string | null
  decided_by: ApprovalDecisionBy | null
  decision_note: string
}

export interface ApprovalDecisionRequest {
  decision: ApprovalDecision
  note?: string
}

export interface ApprovalDecisionResult {
  id: string
  status: ApprovalStatus
  run_id: string
  resumed: boolean
  resume_error: string | null
}
