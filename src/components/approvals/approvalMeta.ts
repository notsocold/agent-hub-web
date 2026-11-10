import type { ApprovalRisk, ApprovalStatus } from '@/types'

/** 与 StatusBadge 的 tone 保持一致。 */
export type ApprovalTone = 'ok' | 'warn' | 'error' | 'muted' | 'live'

export const APPROVAL_STATUS_LABELS: Record<ApprovalStatus, string> = {
  pending: '待处理',
  approved: '已批准',
  rejected: '已拒绝',
  expired: '已过期',
  canceled: '已取消',
}

export const APPROVAL_STATUS_TONES: Record<ApprovalStatus, ApprovalTone> = {
  pending: 'warn',
  approved: 'ok',
  rejected: 'error',
  expired: 'muted',
  canceled: 'muted',
}

export const APPROVAL_RISK_LABELS: Record<ApprovalRisk, string> = {
  read: '只读',
  write: '写操作',
  destructive: '破坏性操作',
  unknown: '未知风险',
}

export const APPROVAL_RISK_TONES: Record<ApprovalRisk, ApprovalTone> = {
  read: 'muted',
  write: 'warn',
  destructive: 'error',
  unknown: 'warn',
}

export function approvalStatusLabel(status: ApprovalStatus | string): string {
  return APPROVAL_STATUS_LABELS[status as ApprovalStatus] ?? status
}

export function approvalStatusTone(status: ApprovalStatus | string): ApprovalTone {
  return APPROVAL_STATUS_TONES[status as ApprovalStatus] ?? 'muted'
}

export function approvalRiskLabel(risk: ApprovalRisk | string): string {
  return APPROVAL_RISK_LABELS[risk as ApprovalRisk] ?? risk
}

export function approvalRiskTone(risk: ApprovalRisk | string): ApprovalTone {
  return APPROVAL_RISK_TONES[risk as ApprovalRisk] ?? 'muted'
}
