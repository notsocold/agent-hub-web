import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { approvalsApi } from '@/api/approvals'
import { conversationsApi } from '@/api/conversations'
import { runsApi } from '@/api/runs'
import { mockRunEvents } from '@/api/mock/fixtures'
import { createInitialChatState, eventNameOfRunEvent, reduceChat } from '@/stores/chat-reducer'
import { useChatStore } from '@/stores/chat'
import type { Approval, ConversationDetail, PageResult, Run, RunEvent } from '@/types'

vi.mock('@/api/chat', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/chat')>()
  return { ...actual, openChatStream: vi.fn() }
})
vi.mock('@/api/conversations', () => ({
  conversationsApi: { messages: vi.fn(), get: vi.fn() },
}))
vi.mock('@/api/runs', () => ({
  runsApi: { get: vi.fn(), events: vi.fn(), cancel: vi.fn(), resume: vi.fn(), stream: vi.fn() },
}))
vi.mock('@/api/approvals', () => ({
  approvalsApi: { decide: vi.fn(), list: vi.fn(), detail: vi.fn() },
}))

const emptyPage: PageResult<never> = { items: [], next_cursor: null, has_more: false }

function makeRun(overrides: Partial<Run> = {}): Run {
  return {
    id: 'run-1',
    conversation_id: 'conv-1',
    status: 'interrupted',
    source: 'chat',
    model: 'deepseek-chat',
    reasoning_effort: 'low',
    workflow: null,
    capabilities: {
      skills: [],
      mcp_servers: [],
      mcp_tools: [],
      knowledge_categories: [],
      workflow_id: null,
    },
    usage: null,
    started_at: '2026-11-11T00:00:00Z',
    finished_at: null,
    duration_ms: null,
    active_duration_ms: null,
    first_token_ms: null,
    pending: { kind: 'approval', approval_id: 'ap-1', task_id: null },
    message_ids: { user: null, assistant: null },
    agents: [],
    error: null,
    ...overrides,
  }
}

function makeConversation(): ConversationDetail {
  return {
    id: 'conv-1',
    title: '回放会话',
    status: 'active',
    message_count: 0,
    last_message_preview: '',
    last_message_at: null,
    pending_approval_count: 1,
    created_at: '2026-11-11T00:00:00Z',
    updated_at: '2026-11-11T00:00:00Z',
    archived_at: null,
    last_run: null,
  }
}

function makeEvent(overrides: Partial<RunEvent>): RunEvent {
  return {
    id: 'run-1:1',
    seq: 1,
    ts: '2026-11-11T00:00:00Z',
    type: 'tool',
    event: '',
    status: 'ok',
    title: '',
    subtitle: '',
    duration_ms: null,
    tokens: null,
    payload: {},
    error: null,
    ...overrides,
  }
}

const approval: Approval = {
  id: 'ap-1',
  run_id: 'run-1',
  conversation_id: 'conv-1',
  conversation_title: '回放会话',
  status: 'pending',
  tool_name: 'filesystem.write',
  tool_display_name: '文件写入',
  source: 'native',
  executor: 'filesystem',
  target: 'artifacts/a.md',
  side_effect: '覆盖同名文件',
  risk: 'write',
  reason: '写文件需要确认',
  payload: { path: 'artifacts/a.md' },
  payload_preview: '{"path":"artifacts/a.md"}',
  expires_at: '2026-11-11T01:00:00Z',
  created_at: '2026-11-11T00:00:00Z',
  decided_at: null,
  decided_by: null,
  decision_note: '',
}

describe('事件回放事件名映射', () => {
  it('接受白名单事件名', () => {
    expect(eventNameOfRunEvent({ event: 'tool.result' })).toBe('tool.result')
    expect(eventNameOfRunEvent({ event: 'approval.required' })).toBe('approval.required')
  })

  it('空串与未知事件返回 null，不猜测 type', () => {
    expect(eventNameOfRunEvent({ event: '' })).toBeNull()
    expect(eventNameOfRunEvent({ event: 'future.event' })).toBeNull()
  })

  it('周报 fixture 按事件回放能补工具/技能/A2A/审批卡', () => {
    const weeklyRunId = '33333333-3333-4333-8333-333333333333'
    let state = createInitialChatState()
    for (const item of mockRunEvents[weeklyRunId] ?? []) {
      const name = eventNameOfRunEvent(item)
      if (!name) continue
      state = reduceChat(state, name, { ...item.payload, seq: item.seq })
    }

    const kinds = state.process.map((item) => item.kind)
    expect(kinds).toContain('tool')
    expect(kinds).toContain('skill')
    expect(kinds).toContain('a2a')
    expect(kinds).toContain('approval')
    // 回放以 message.done 结束：审批卡保留但不再可操作，待审指针清空。
    const approvalCard = state.process.find((item) => item.kind === 'approval')
    expect(approvalCard?.kind === 'approval' && approvalCard.approvalId).toBe(
      '66666666-6666-4666-8666-666666666666',
    )
    expect(state.pendingApprovalIds).toHaveLength(0)
  })
})

describe('chat store 已落库事件回放', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    setActivePinia(createPinia())
    vi.mocked(conversationsApi.messages).mockResolvedValue(emptyPage)
    vi.mocked(conversationsApi.get).mockResolvedValue(makeConversation())
    vi.mocked(approvalsApi.list).mockResolvedValue({
      items: [approval],
      next_cursor: null,
      has_more: false,
    })
    vi.mocked(runsApi.get).mockResolvedValue(makeRun())
    vi.mocked(runsApi.events).mockResolvedValue({
      items: [
        makeEvent({
          id: 'run-1:1',
          seq: 1,
          type: 'tool',
          event: 'tool.start',
          payload: {
            seq: 1,
            tool_call_id: 'call-1',
            tool: 'search_knowledge',
            display_name: '知识检索',
            source: 'knowledge',
            args_preview: 'query=Q3',
          },
        }),
        makeEvent({
          id: 'run-1:2',
          seq: 2,
          type: 'approval',
          event: 'approval.required',
          status: 'waiting',
          payload: {
            seq: 2,
            approval_id: 'ap-1',
            tool: 'filesystem.write',
            tool_display_name: '文件写入',
            executor: 'filesystem',
            target: 'artifacts/a.md',
            side_effect: '覆盖同名文件',
            risk: 'write',
            payload_preview: '{"path":"artifacts/a.md"}',
          },
        }),
        makeEvent({
          id: 'run-1:3',
          seq: 3,
          type: 'notice',
          event: '',
          payload: { seq: 3 },
        }),
      ],
      next_cursor: null,
      has_more: false,
    })
  })

  it('按 event 重放到 process，空事件名被跳过', async () => {
    const store = useChatStore()

    await store.adoptRun('run-1')

    const kinds = store.state.process.map((item) => item.kind)
    expect(kinds).toContain('tool')
    expect(kinds).toContain('approval')
    // 第 3 条事件没有 event 名，不应产生 notice 卡。
    expect(kinds).not.toContain('notice')
    expect(store.state.pendingApprovalIds).toContain('ap-1')
    expect(runsApi.events).toHaveBeenCalledWith('run-1', {
      limit: 200,
      after_seq: 0,
    })
  })

  it('回放事件按 seq 去重，不重复应用', async () => {
    const store = useChatStore()
    await store.adoptRun('run-1')
    const processLength = store.state.process.length

    // 同一批事件再回放一次（模拟分页重复/另一条恢复路径）。
    await store.adoptRun('run-1')

    expect(store.state.process.length).toBe(processLength)
  })
})
