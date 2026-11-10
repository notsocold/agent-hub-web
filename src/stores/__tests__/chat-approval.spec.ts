import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiRequestError } from '@/api/client'
import { approvalToProcess, createInitialChatState } from '@/stores/chat-reducer'
import { useChatStore } from '@/stores/chat'
import type { Approval } from '@/types'

const mocks = vi.hoisted(() => ({
  decide: vi.fn(),
  detail: vi.fn(),
  list: vi.fn(),
  runGet: vi.fn(),
  cancel: vi.fn(),
  events: vi.fn(),
  resume: vi.fn(),
  messages: vi.fn(),
  conversationGet: vi.fn(),
  openStream: vi.fn(),
}))

vi.mock('@/api/approvals', () => ({
  approvalsApi: { decide: mocks.decide, detail: mocks.detail, list: mocks.list },
}))
vi.mock('@/api/runs', () => ({
  runsApi: {
    get: mocks.runGet,
    cancel: mocks.cancel,
    events: mocks.events,
    resume: mocks.resume,
  },
}))
vi.mock('@/api/conversations', () => ({
  conversationsApi: { messages: mocks.messages, get: mocks.conversationGet },
}))
vi.mock('@/api/chat', () => ({ openChatStream: mocks.openStream }))

function approval(overrides: Partial<Approval> = {}): Approval {
  return {
    id: 'a-1',
    run_id: 'r-1',
    conversation_id: 'c-1',
    conversation_title: '测试会话',
    status: 'pending',
    tool_name: 'mcp__slack__post_message',
    tool_display_name: 'Slack · 发送消息',
    source: 'mcp',
    executor: 'slack-mcp',
    target: '#support',
    side_effect: '外部写操作',
    risk: 'write',
    reason: '需要确认',
    payload: { channel: 'C1' },
    payload_preview: '{"channel":"C1"}',
    expires_at: '2026-11-11T01:00:00Z',
    created_at: '2026-11-11T00:00:00Z',
    decided_at: null,
    decided_by: null,
    decision_note: '',
    ...overrides,
  }
}

function seedPending(chat: ReturnType<typeof useChatStore>): void {
  chat.state = {
    ...createInitialChatState(),
    conversationId: 'c-1',
    runId: 'r-1',
    runStatus: 'interrupted',
    streaming: true,
    process: [
      approvalToProcess(approval({ id: 'a-1' })),
      approvalToProcess(approval({ id: 'a-2' })),
    ],
    pendingApprovalIds: ['a-1', 'a-2'],
    pendingApprovalId: 'a-1',
  }
}

function cardOf(chat: ReturnType<typeof useChatStore>, id: string) {
  const card = chat.state.process.find(
    (item) => item.kind === 'approval' && item.approvalId === id,
  )
  return card?.kind === 'approval' ? card : null
}

describe('M5 审批决定语义（store）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mocks.list.mockResolvedValue({ items: [], next_cursor: null, has_more: false })
    mocks.messages.mockResolvedValue({ items: [], next_cursor: null, has_more: false })
    mocks.conversationGet.mockResolvedValue({
      id: 'c-1',
      title: '测试会话',
      last_run: { id: 'r-1', status: 'interrupted' },
    })
    mocks.runGet.mockResolvedValue({ id: 'r-1', status: 'interrupted' })
  })

  it('多审批中间决定是正常语义，不显示失败恢复态', async () => {
    const chat = useChatStore()
    seedPending(chat)
    mocks.decide.mockResolvedValue({
      id: 'a-1',
      status: 'approved',
      run_id: 'r-1',
      resumed: false,
      resume_error: '本轮还有其他审批待处理',
    })

    const outcome = await chat.resolveApprovalById('a-1', true)

    expect(outcome.kind).toBe('waiting_others')
    expect(chat.state.recovery).toBeNull()
    expect(chat.state.streaming).toBe(true)
    expect(chat.state.runStatus).toBe('interrupted')
    expect(chat.state.pendingApprovalIds).toEqual(['a-2'])
    expect(cardOf(chat, 'a-1')?.decision).toBe('approve')
  })

  it('409 审批过期时标记卡片不可操作并移除指针', async () => {
    const chat = useChatStore()
    seedPending(chat)
    mocks.list.mockResolvedValue({
      items: [approval({ id: 'a-2' })],
      next_cursor: null,
      has_more: false,
    })
    mocks.decide.mockRejectedValue(
      new ApiRequestError('审批已过期', { code: 'approval_expired', status: 409 }),
    )

    const outcome = await chat.resolveApprovalById('a-1', false)

    expect(outcome.kind).toBe('expired')
    expect(chat.state.pendingApprovalIds).toEqual(['a-2'])
    expect(cardOf(chat, 'a-1')?.status).toBe('canceled')
    expect(cardOf(chat, 'a-1')?.decision).toBeNull()
  })

  it('409 已在别处处理时使用服务端真实结论，而不是本次尝试', async () => {
    const chat = useChatStore()
    seedPending(chat)
    mocks.list.mockResolvedValue({
      items: [approval({ id: 'a-2' })],
      next_cursor: null,
      has_more: false,
    })
    mocks.decide.mockRejectedValue(
      new ApiRequestError('审批已处理', { code: 'approval_already_decided', status: 409 }),
    )
    mocks.detail.mockResolvedValue(
      approval({
        id: 'a-1',
        status: 'rejected',
        decided_at: '2026-11-11T00:10:00Z',
        decided_by: { id: 'u-9', display_name: '其他用户' },
        decision_note: '在审批中心拒绝',
      }),
    )

    const outcome = await chat.resolveApprovalById('a-1', true)

    expect(outcome.kind).toBe('already_decided')
    expect(chat.state.pendingApprovalIds).toEqual(['a-2'])
    expect(cardOf(chat, 'a-1')?.decision).toBe('reject')
    expect(cardOf(chat, 'a-1')?.status).toBe('ok')
  })

  it('决定响应迟到时不会覆盖已到达的终态', async () => {
    const chat = useChatStore()
    seedPending(chat)
    chat.state = {
      ...chat.state,
      runStatus: 'canceled',
      finishReason: 'canceled',
      streaming: false,
    }
    mocks.decide.mockResolvedValue({
      id: 'a-1',
      status: 'approved',
      run_id: 'r-1',
      resumed: true,
      resume_error: null,
    })

    await chat.resolveApprovalById('a-1', true)

    expect(chat.state.finishReason).toBe('canceled')
    expect(chat.state.streaming).toBe(false)
  })

  it('轮询到 canceled 且审批 expired 时合成审批超时恢复态', async () => {
    const chat = useChatStore()
    seedPending(chat)
    mocks.runGet.mockResolvedValue({ id: 'r-1', status: 'canceled' })
    mocks.conversationGet.mockResolvedValue({
      id: 'c-1',
      title: '测试会话',
      last_run: { id: 'r-1', status: 'canceled' },
    })
    mocks.list.mockResolvedValue({
      items: [approval({ id: 'a-1', status: 'expired' })],
      next_cursor: null,
      has_more: false,
    })

    await chat.adoptRun('r-1')

    await vi.waitFor(() => {
      expect(chat.state.recovery?.kind).toBe('approval_timeout')
    })
    expect(chat.state.pendingApprovalIds).toEqual([])
    expect(cardOf(chat, 'a-1')?.status).toBe('canceled')
  })

  it('聊天 429 设置倒计时并允许输入栏禁用', async () => {
    const chat = useChatStore()
    mocks.openStream.mockRejectedValue(
      new ApiRequestError('请求过于频繁', {
        code: 'rate_limited',
        status: 429,
        details: { retry_after_seconds: 12 },
      }),
    )

    await chat.send('触发限流')

    expect(chat.rateLimitActive).toBe(true)
    expect(chat.rateLimitRemaining).toBe(12)
    expect(chat.state.streaming).toBe(false)
    expect(chat.state.error).toBeNull()
    chat.reset()
  })
})
