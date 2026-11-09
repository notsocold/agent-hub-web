import type { A2aTaskState, TaskAction } from '@/types'

export type TaskTone = 'ok' | 'warn' | 'error' | 'muted' | 'live'

export const STATE_LABELS: Record<A2aTaskState, string> = {
  submitted: '已提交',
  working: '运行中',
  input_required: '等待输入',
  auth_required: '需要授权',
  completed: '已完成',
  failed: '失败',
  canceled: '已取消',
  rejected: '已拒绝',
}

export const STATE_TONES: Record<A2aTaskState, TaskTone> = {
  submitted: 'live',
  working: 'live',
  input_required: 'warn',
  auth_required: 'warn',
  completed: 'ok',
  failed: 'error',
  canceled: 'muted',
  rejected: 'muted',
}

/** 需要每 15 秒轮询的「进行中」状态。 */
export const RUNNING_STATES: readonly A2aTaskState[] = [
  'submitted',
  'working',
  'input_required',
  'auth_required',
]

export const ACTION_LABELS: Record<TaskAction, string> = {
  cancel: '取消',
  resume: '补充',
  authorize: '授权',
  reject: '拒绝',
}

export function stateLabel(state: string): string {
  return STATE_LABELS[state as A2aTaskState] ?? state
}

export function stateTone(state: string): TaskTone {
  return STATE_TONES[state as A2aTaskState] ?? 'muted'
}

export function isRunningState(state: string): boolean {
  return (RUNNING_STATES as readonly string[]).includes(state)
}
