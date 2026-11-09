import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { openChatStream } from '@/api/chat'
import { ApiRequestError } from '@/api/client'
import { conversationsApi } from '@/api/conversations'
import { runsApi } from '@/api/runs'
import { useChatStore } from '@/stores/chat'
import type { ConversationDetail, PageResult, Run } from '@/types'

vi.mock('@/api/chat', () => ({ openChatStream: vi.fn() }))
vi.mock('@/api/conversations', () => ({
  conversationsApi: { messages: vi.fn(), get: vi.fn() },
}))
vi.mock('@/api/runs', () => ({
  runsApi: { get: vi.fn(), events: vi.fn(), cancel: vi.fn(), resume: vi.fn() },
}))
vi.mock('@/api/approvals', () => ({
  approvalsApi: { decide: vi.fn(), list: vi.fn() },
}))

const conversation: ConversationDetail = {
  id: 'conv-1',
  title: '联调会话',
  status: 'active',
  message_count: 0,
  last_message_preview: '',
  last_message_at: null,
  pending_approval_count: 0,
  created_at: '2026-11-09T12:00:00Z',
  updated_at: '2026-11-09T12:00:00Z',
  archived_at: null,
  last_run: null,
}

const runningRun: Run = {
  id: 'run-1',
  conversation_id: 'conv-1',
  status: 'running',
  source: 'chat',
  model: 'deepseek-flash',
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
  started_at: '2026-11-09T12:01:00Z',
  finished_at: null,
  duration_ms: null,
  active_duration_ms: null,
  first_token_ms: null,
  pending: { kind: null, approval_id: null, task_id: null },
  message_ids: { user: null, assistant: null },
  agents: [],
  error: null,
}

const emptyPage: PageResult<never> = {
  items: [],
  next_cursor: null,
  has_more: false,
}

describe('chat store 真实契约恢复', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.resetAllMocks()
    vi.mocked(conversationsApi.messages).mockResolvedValue(emptyPage)
    vi.mocked(conversationsApi.get).mockResolvedValue(conversation)
  })

  it('409 run_in_progress 读取 details.run_id，并进入运行恢复状态', async () => {
    vi.mocked(openChatStream).mockRejectedValue(
      new ApiRequestError('该会话已有运行中的请求', {
        code: 'run_in_progress',
        status: 409,
        details: { run_id: 'run-1' },
      }),
    )
    vi.mocked(runsApi.get).mockResolvedValue(runningRun)

    const chat = useChatStore()
    await chat.send('你好')

    expect(openChatStream).toHaveBeenCalledTimes(1)
    const payload = vi.mocked(openChatStream).mock.calls[0]?.[0]
    expect(payload?.client_message_id).toBeTruthy()
    // 乐观消息没有落库，409 后移除。
    expect(chat.state.messages).toHaveLength(0)
    expect(chat.recovery).toMatchObject({
      kind: 'run_in_progress',
      runId: 'run-1',
      runStatus: 'running',
    })
    expect(chat.state.runId).toBe('run-1')
    expect(chat.state.streaming).toBe(true)
    expect(runsApi.get).toHaveBeenCalledWith('run-1')

    await chat.stop()
    chat.reset()
  })

  it('网络失败后重试复用同一 client_message_id（幂等回放）', async () => {
    const clientMessageIds: string[] = []
    vi.mocked(openChatStream).mockImplementation(async (payload, handlers) => {
      clientMessageIds.push(payload.client_message_id ?? '')
      if (clientMessageIds.length === 1) {
        throw new Error('network down')
      }
      handlers.onOpen?.('run-2')
      handlers.onEvent('run.started', {
        run_id: 'run-2',
        conversation_id: 'conv-1',
        model: 'deepseek-flash',
        reasoning_effort: 'low',
        seq: 1,
      })
      handlers.onEvent('message.done', {
        run_id: 'run-2',
        conversation_id: 'conv-1',
        message_id: 'assistant-1',
        usage: { input_tokens: 10, output_tokens: 2, total_tokens: 12 },
        finish_reason: 'stop',
        model: 'deepseek-flash',
        first_token_ms: 50,
        duration_ms: 500,
        active_duration_ms: 500,
        seq: 2,
      })
    })

    const chat = useChatStore()
    await chat.send('你好')
    expect(chat.state.error?.code).toBe('stream_failed')
    expect(chat.canRetry).toBe(true)

    await chat.retry()

    expect(clientMessageIds).toHaveLength(2)
    expect(clientMessageIds[0]).toBe(clientMessageIds[1])
    expect(chat.state.finishReason).toBe('stop')
    expect(chat.state.streaming).toBe(false)
    chat.reset()
  })
})
