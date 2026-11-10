import { describe, expect, it } from 'vitest'

import {
  createInitialChatState,
  hydrateApprovals,
  markApprovalExpired,
  markApprovalResolved,
  reduceChat,
} from '@/stores/chat-reducer'
import type { ChatEventName, ChatState } from '@/types'

function run(state: ChatState, event: ChatEventName, data: Record<string, unknown>): ChatState {
  return reduceChat(state, event, data)
}

function withApproval(id: string, seq: number, state: ChatState = createInitialChatState()) {
  return run(state, 'approval.required', {
    approval_id: id,
    tool: 'mcp__slack__post_message',
    tool_display_name: 'Slack · 发送消息',
    risk: 'write',
    reason: '外部写操作',
    seq,
  })
}

describe('M5 审批事件状态机', () => {
  it('approval.required 只挂卡，run.interrupted 才收敛为 interrupted', () => {
    let state = withApproval('a-1', 1)
    expect(state.runStatus).toBeNull()
    expect(state.streaming).toBe(false)
    expect(state.pendingApprovalIds).toEqual(['a-1'])

    state = run(state, 'run.interrupted', {
      run_id: 'r-1',
      conversation_id: 'c-1',
      message_id: 'm-1',
      status: 'interrupted',
      approvals: ['a-1', 'a-2'],
      seq: 2,
    })

    expect(state.runStatus).toBe('interrupted')
    expect(state.streaming).toBe(true)
    expect(state.pendingApprovalIds).toEqual(['a-1', 'a-2'])
    expect(state.pendingApprovalId).toBe('a-1')
    expect(state.recovery).toBeNull()
  })

  it('一轮多审批按事件顺序累积', () => {
    let state = withApproval('a-1', 1)
    state = withApproval('a-2', 2, state)
    state = withApproval('a-3', 3, state)

    expect(state.pendingApprovalIds).toEqual(['a-1', 'a-2', 'a-3'])
    expect(state.pendingApprovalId).toBe('a-1')
    expect(state.process.filter((item) => item.kind === 'approval')).toHaveLength(3)
  })

  it('markApprovalResolved 只移除对应审批并把指针移到下一个', () => {
    let state = withApproval('a-1', 1)
    state = withApproval('a-2', 2, state)
    state = run(state, 'run.interrupted', { approvals: ['a-1', 'a-2'], seq: 3 })

    state = markApprovalResolved(state, 'a-1', 'approve')
    expect(state.pendingApprovalIds).toEqual(['a-2'])
    expect(state.pendingApprovalId).toBe('a-2')
    const first = state.process.find((item) => item.kind === 'approval' && item.approvalId === 'a-1')
    expect(first?.kind === 'approval' && first.decision).toBe('approve')
  })

  it('run.resumed 恢复 running 并清理待审、标记卡片已处理', () => {
    let state = withApproval('a-1', 1)
    state = run(state, 'run.interrupted', { approvals: ['a-1'], seq: 2 })
    state = run(state, 'run.resumed', {
      run_id: 'r-1',
      conversation_id: 'c-1',
      status: 'running',
      seq: 3,
    })

    expect(state.runStatus).toBe('running')
    expect(state.streaming).toBe(true)
    expect(state.pendingApprovalIds).toEqual([])
    expect(state.pendingApprovalId).toBeNull()
    const card = state.process.find((item) => item.kind === 'approval')
    expect(card?.kind === 'approval' && card.status).toBe('ok')
  })

  it('审批超时终态设置明确提示并清空待审', () => {
    let state = withApproval('a-1', 1)
    state = run(state, 'run.interrupted', { approvals: ['a-1'], seq: 2 })
    state = run(state, 'message.done', {
      message_id: 'm-1',
      run_id: 'r-1',
      finish_reason: 'canceled',
      reason: 'approval_timeout',
      usage: { input_tokens: 10, output_tokens: 0, reasoning_tokens: 0, total_tokens: 10 },
      seq: 3,
    })

    expect(state.streaming).toBe(false)
    expect(state.runStatus).toBe('canceled')
    expect(state.pendingApprovalIds).toEqual([])
    expect(state.recovery?.kind).toBe('approval_timeout')
    const card = state.process.find((item) => item.kind === 'approval')
    expect(card?.kind === 'approval' && card.status).toBe('canceled')
  })

  it('兼容旧契约 message.done(finish_reason=interrupted)', () => {
    let state = withApproval('a-1', 1)
    state = run(state, 'message.done', {
      message_id: 'm-1',
      run_id: 'r-1',
      finish_reason: 'interrupted',
      usage: { input_tokens: 10, output_tokens: 0, reasoning_tokens: 0, total_tokens: 10 },
      seq: 2,
    })

    expect(state.runStatus).toBe('interrupted')
    expect(state.streaming).toBe(false)
    expect(state.pendingApprovalIds).toEqual(['a-1'])
    expect(state.recovery?.kind).toBe('run_interrupted')
  })

  it('markApprovalExpired 移除待审且保留卡片为不可操作', () => {
    let state = withApproval('a-1', 1)
    state = run(state, 'run.interrupted', { approvals: ['a-1'], seq: 2 })
    state = markApprovalExpired(state, 'a-1')

    expect(state.pendingApprovalIds).toEqual([])
    const card = state.process.find((item) => item.kind === 'approval')
    expect(card?.kind === 'approval' && card.status).toBe('canceled')
  })

  it('run.interrupted 记录 usage 并回填引用', () => {
    let state = run(createInitialChatState(), 'message.started', {
      message_id: 'm-1',
      role: 'assistant',
      started_at: '2026-11-11T00:00:00Z',
      seq: 1,
    })
    state = run(state, 'run.interrupted', {
      run_id: 'r-1',
      conversation_id: 'c-1',
      message_id: 'm-1',
      approvals: [],
      usage: { input_tokens: 100, output_tokens: 20, reasoning_tokens: 0, total_tokens: 120 },
      citations: [
        {
          index: 1,
          document_id: 'd-1',
          chunk_id: 'k-1',
          title: '退货政策',
          category: '售后',
          score: 0.9,
          updated_at: '2026-11-10T00:00:00Z',
        },
      ],
      seq: 2,
    })

    expect(state.usage?.total_tokens).toBe(120)
    expect(state.messages.find((item) => item.id === 'm-1')?.citations).toHaveLength(1)
  })
})

describe('hydrateApprovals 对账', () => {
  it('replacePending 空列表时清空待审指针（不复活旧审批）', () => {
    let state = withApproval('a-1', 1)
    state = run(state, 'run.interrupted', { approvals: ['a-1'], seq: 2 })

    state = hydrateApprovals(state, [], { replacePending: true })

    expect(state.pendingApprovalIds).toEqual([])
    expect(state.pendingApprovalId).toBeNull()
  })
})
