import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { approvalsApi } from '@/api/approvals'
import { ApiRequestError } from '@/api/client'
import { openChatStream } from '@/api/chat'
import { conversationsApi } from '@/api/conversations'
import { runsApi } from '@/api/runs'
import { useChatStore } from '@/stores/chat'
import { getRuntimeContext } from '@/utils/diagnostics'
import type { ConversationDetail, PageResult, Run } from '@/types'

vi.mock('@/api/chat', () => ({ openChatStream: vi.fn() }))
vi.mock('@/api/conversations', () => ({
  conversationsApi: { messages: vi.fn(), get: vi.fn() },
}))
vi.mock('@/api/runs', () => ({
  runsApi: {
    get: vi.fn(),
    events: vi.fn(),
    cancel: vi.fn(),
    resume: vi.fn(),
    stream: vi.fn(),
  },
}))
vi.mock('@/api/approvals', () => ({
  approvalsApi: { decide: vi.fn(), list: vi.fn(), detail: vi.fn() },
}))

function makeRun(overrides: Partial<Run> = {}): Run {
  return {
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
    started_at: '2026-11-11T00:00:00Z',
    finished_at: null,
    duration_ms: null,
    active_duration_ms: null,
    first_token_ms: null,
    pending: { kind: null, approval_id: null, task_id: null },
    message_ids: { user: null, assistant: null },
    agents: [],
    error: null,
    ...overrides,
  }
}

function makeConversation(id = 'conv-1'): ConversationDetail {
  return {
    id,
    title: '重连会话',
    status: 'active',
    message_count: 0,
    last_message_preview: '',
    last_message_at: null,
    pending_approval_count: 0,
    created_at: '2026-11-11T00:00:00Z',
    updated_at: '2026-11-11T00:00:00Z',
    archived_at: null,
    last_run: null,
  }
}

const emptyPage: PageResult<never> = {
  items: [],
  next_cursor: null,
  has_more: false,
}

const stores: ReturnType<typeof useChatStore>[] = []

/** 每个用例统一创建 store，afterEach 里 reset，避免重连监听/定时器串到下一个用例。 */
function createChatStore(): ReturnType<typeof useChatStore> {
  const store = useChatStore()
  stores.push(store)
  return store
}

/** 刷新微任务队列；假时钟下不推进真实时间。 */
async function flushMicrotasks(rounds = 8): Promise<void> {
  for (let i = 0; i < rounds; i += 1) await Promise.resolve()
}

function messageDone(seq: number): Record<string, unknown> {
  return {
    run_id: 'run-1',
    conversation_id: 'conv-1',
    message_id: 'assistant-1',
    finish_reason: 'stop',
    usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
    seq,
  }
}

describe('chat store 断线重连状态机', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.resetAllMocks()
    setActivePinia(createPinia())
    // 固定抖动，退避序列可预测：1000/2000/4000/8000/16000。
    vi.spyOn(Math, 'random').mockReturnValue(0.5)

    vi.mocked(conversationsApi.messages).mockResolvedValue(emptyPage)
    vi.mocked(conversationsApi.get).mockResolvedValue(makeConversation())
    vi.mocked(approvalsApi.list).mockResolvedValue(emptyPage)
    vi.mocked(runsApi.cancel).mockResolvedValue({
      id: 'run-1',
      status: 'canceled',
      canceled_at: '2026-11-11T00:00:01Z',
    })
    vi.mocked(runsApi.get).mockResolvedValue(makeRun())

    // 默认场景：拿到 X-Run-ID 后网络中断（后端已受理、前端还没收到事件）。
    vi.mocked(openChatStream).mockImplementation(async (_payload, handlers) => {
      handlers.onOpen?.('run-1')
      throw new Error('network down')
    })
    // 默认重连也失败（网络尚未恢复）；需要成功续流的用例自行覆盖。
    vi.mocked(runsApi.stream).mockRejectedValue(new Error('network down'))
  })

  afterEach(() => {
    for (const store of stores) store.reset()
    stores.length = 0
    vi.clearAllTimers()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('断线后重连：先 GET run 回填 conversation_id，再从 lastSeq 续流', async () => {
    vi.mocked(openChatStream).mockImplementationOnce(async (_payload, handlers) => {
      handlers.onOpen?.('run-1')
      throw new Error('network down')
    })
    vi.mocked(runsApi.stream).mockImplementationOnce(async (_runId, _afterSeq, handlers) => {
      handlers.onOpen?.('run-1')
      handlers.onEvent('message.done', messageDone(1))
    })
    vi.mocked(runsApi.get).mockResolvedValue(
      makeRun({ conversation_id: 'conv-9', status: 'running' }),
    )

    const chat = createChatStore()
    await chat.send('你好')

    expect(openChatStream).toHaveBeenCalledTimes(1)
    expect(chat.connection).toBe('reconnecting')
    expect(runsApi.get).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1000)

    expect(runsApi.get).toHaveBeenCalledWith('run-1')
    // 正确性关键：回填 run.conversation_id，避免切会话后事件写错会话。
    expect(chat.state.conversationId).toBe('conv-9')
    // M7：重连不再重发 POST /chat/stream（会新建 run），而是从 lastSeq 续流。
    expect(openChatStream).toHaveBeenCalledTimes(1)
    expect(runsApi.stream).toHaveBeenCalledTimes(1)
    const [streamRunId, streamAfterSeq] = vi.mocked(runsApi.stream).mock.calls[0]!
    expect(streamRunId).toBe('run-1')
    expect(streamAfterSeq).toBe(0)
    expect(chat.state.finishReason).toBe('stop')
    expect(chat.connection).toBe('idle')
  })

  it('重连保留 lastSeq，不重复处理回放事件', async () => {
    vi.mocked(openChatStream).mockImplementationOnce(async (_payload, handlers) => {
      handlers.onOpen?.('run-1')
      handlers.onEvent('tool.start', { tool_call_id: 'call-1', tool: 'search', seq: 2 })
      handlers.onEvent('tool.result', {
        tool_call_id: 'call-1',
        result_preview: '命中 1 条',
        seq: 3,
      })
      throw new Error('network down')
    })
    vi.mocked(runsApi.stream).mockImplementationOnce(async (_runId, _afterSeq, handlers) => {
      handlers.onOpen?.('run-1')
      // 服务端回放已处理事件：seq 均 <= lastSeq，必须被 reducer 丢弃。
      handlers.onEvent('tool.start', { tool_call_id: 'call-1', tool: 'search', seq: 2 })
      handlers.onEvent('tool.result', {
        tool_call_id: 'call-1',
        result_preview: '命中 1 条',
        seq: 3,
      })
      handlers.onEvent('message.done', messageDone(4))
    })

    const chat = createChatStore()
    await chat.send('你好')
    expect(chat.state.lastSeq).toBe(3)
    expect(chat.processItems).toHaveLength(1)

    await vi.advanceTimersByTimeAsync(1000)

    // 续流必须携带 lastSeq，回放事件才能被去重。
    expect(vi.mocked(runsApi.stream).mock.calls[0]?.[1]).toBe(3)
    expect(chat.processItems).toHaveLength(1)
    expect(chat.processItems[0]?.kind).toBe('tool')
    expect(chat.state.lastSeq).toBe(4)
  })

  it('run 已终态时不重连，直接刷新历史', async () => {
    vi.mocked(openChatStream).mockImplementationOnce(async (_payload, handlers) => {
      handlers.onOpen?.('run-1')
      throw new Error('network down')
    })
    vi.mocked(runsApi.get).mockResolvedValue(
      makeRun({ status: 'succeeded', finished_at: '2026-11-11T00:00:05Z' }),
    )

    const chat = createChatStore()
    await chat.send('你好')
    await vi.advanceTimersByTimeAsync(1000)

    expect(openChatStream).toHaveBeenCalledTimes(1)
    expect(conversationsApi.messages).toHaveBeenCalledWith('conv-1', { limit: 100 })
    expect(chat.connection).toBe('idle')
    expect(chat.state.streaming).toBe(false)
    expect(chat.state.runStatus).toBe('succeeded')
  })

  it('正常 EOF（onClose）且无 message.done 时触发续流重连', async () => {
    vi.mocked(openChatStream).mockImplementation(async (_payload, handlers) => {
      handlers.onOpen?.('run-1')
      // 服务端静默关流：只靠 onerror 会漏掉，必须由 onClose 触发重连。
      handlers.onClose?.()
    })
    vi.mocked(runsApi.stream).mockImplementationOnce(async (_runId, _afterSeq, handlers) => {
      handlers.onOpen?.('run-1')
      handlers.onEvent('message.done', messageDone(2))
    })

    const chat = createChatStore()
    await chat.send('你好')

    expect(openChatStream).toHaveBeenCalledTimes(1)
    expect(chat.connection).toBe('reconnecting')
    // resolve 后的 finally 不得把重连中的 streaming 置 false。
    expect(chat.state.streaming).toBe(true)

    await vi.advanceTimersByTimeAsync(1000)

    expect(runsApi.get).toHaveBeenCalledWith('run-1')
    expect(runsApi.stream).toHaveBeenCalledTimes(1)
    expect(chat.state.finishReason).toBe('stop')
    expect(chat.state.streaming).toBe(false)
  })

  it('连续失败 5 次后进入 degraded，并复用恢复横幅路径', async () => {
    vi.mocked(runsApi.stream).mockRejectedValue(new Error('network down'))
    const chat = createChatStore()
    await chat.send('你好')

    for (const delay of [1000, 2000, 4000, 8000, 16000]) {
      await vi.advanceTimersByTimeAsync(delay)
    }

    expect(openChatStream).toHaveBeenCalledTimes(1)
    expect(runsApi.stream).toHaveBeenCalledTimes(5)
    expect(runsApi.get).toHaveBeenCalledTimes(5)
    expect(chat.reconnectAttempt).toBe(5)
    expect(chat.connection).toBe('degraded')
    expect(chat.state.streaming).toBe(false)
    expect(chat.state.recovery?.kind).toBe('stream_failed')
    expect(chat.state.recovery?.retryable).toBe(true)

    // 达到上限后不再自动发起重连。
    await vi.advanceTimersByTimeAsync(60_000)
    expect(runsApi.stream).toHaveBeenCalledTimes(5)
  })

  it('重连请求在收到响应头之前失败时，仍继续按退避重试', async () => {
    vi.mocked(runsApi.stream).mockRejectedValue(new Error('network down'))

    const chat = createChatStore()
    await chat.send('你好')
    expect(chat.connection).toBe('reconnecting')

    await vi.advanceTimersByTimeAsync(1000)
    expect(runsApi.stream).toHaveBeenCalledTimes(1)
    // 第 2 次尝试失败后必须继续排队下一次（不能因 in-flight 去重被吞掉）。
    expect(chat.reconnectAttempt).toBe(2)

    await vi.advanceTimersByTimeAsync(2000)
    expect(runsApi.stream).toHaveBeenCalledTimes(2)
  })

  it('超过 60s 总窗口后进入 degraded（即使不足 5 次）', async () => {
    vi.mocked(runsApi.stream).mockRejectedValue(new Error('network down'))

    const chat = createChatStore()
    await chat.send('你好')
    expect(chat.connection).toBe('reconnecting')

    // 模拟设备休眠/时钟跳跃：下一次退避到点时已经超出 60s 窗口。
    vi.setSystemTime(Date.now() + 60_000)
    await vi.advanceTimersByTimeAsync(1000)

    expect(runsApi.stream).toHaveBeenCalledTimes(1)
    expect(chat.connection).toBe('degraded')
    expect(chat.reconnectAttempt).toBe(1)
  })

  it('续流 400 replay_too_large 时降级轮询，不弹致命错误', async () => {
    vi.mocked(runsApi.get).mockResolvedValue(makeRun({ status: 'running' }))
    vi.mocked(runsApi.stream).mockRejectedValue(
      new ApiRequestError('回放事件超过上限', { code: 'replay_too_large', status: 400 }),
    )

    const chat = createChatStore()
    await chat.send('你好')
    await vi.advanceTimersByTimeAsync(1000)

    expect(runsApi.stream).toHaveBeenCalledTimes(1)
    expect(chat.connection).toBe('degraded')
    expect(chat.state.streaming).toBe(false)
    expect(chat.state.recovery?.kind).toBe('stream_failed')
    expect(chat.state.recovery?.message).toContain('轮询')

    // 降级后必须继续用轮询跟进，而不是卡死/反复重试同一 after_seq。
    const before = vi.mocked(runsApi.get).mock.calls.length
    await vi.advanceTimersByTimeAsync(2500)
    expect(vi.mocked(runsApi.get).mock.calls.length).toBe(before + 1)
    expect(runsApi.stream).toHaveBeenCalledTimes(1)
  })

  it('续流 404 时结束恢复并刷新历史（不再轮询）', async () => {
    vi.mocked(runsApi.get).mockResolvedValue(makeRun({ status: 'running' }))
    vi.mocked(runsApi.stream).mockRejectedValue(
      new ApiRequestError('运行不存在', { code: 'not_found', status: 404 }),
    )

    const chat = createChatStore()
    await chat.send('你好')
    await vi.advanceTimersByTimeAsync(1000)

    expect(chat.connection).toBe('idle')
    expect(chat.state.streaming).toBe(false)
    expect(chat.state.recovery).toBeNull()
    expect(conversationsApi.messages).toHaveBeenCalled()

    const before = vi.mocked(runsApi.get).mock.calls.length
    await vi.advanceTimersByTimeAsync(10_000)
    expect(vi.mocked(runsApi.get).mock.calls.length).toBe(before)
  })

  it('断线发生在 run 建立之前时不续流，也不进入重连', async () => {
    vi.mocked(openChatStream).mockImplementation(async () => {
      // 后端还没返回 X-Run-ID 就断网：没有可续流的 run。
      throw new ApiRequestError('网络异常', { code: 'network_error', status: 0 })
    })

    const chat = createChatStore()
    await chat.send('你好')
    await vi.advanceTimersByTimeAsync(60_000)

    expect(runsApi.stream).not.toHaveBeenCalled()
    expect(chat.connection).toBe('idle')
    expect(chat.state.error?.code).toBe('network_error')
  })

  it('GET run 返回的 run 与当前 run 不一致时放弃重连', async () => {
    vi.mocked(openChatStream).mockImplementationOnce(async (_payload, handlers) => {
      handlers.onOpen?.('run-1')
      throw new Error('network down')
    })
    vi.mocked(runsApi.get).mockResolvedValue(
      makeRun({ id: 'run-2', conversation_id: 'conv-2', status: 'running' }),
    )

    const chat = createChatStore()
    await chat.send('你好')
    await vi.advanceTimersByTimeAsync(1000)

    expect(openChatStream).toHaveBeenCalledTimes(1)
    expect(chat.connection).toBe('degraded')
  })

  it('run 处于 interrupted 时不重连，切回审批横幅并轮询', async () => {
    vi.mocked(openChatStream).mockImplementationOnce(async (_payload, handlers) => {
      handlers.onOpen?.('run-1')
      throw new Error('network down')
    })
    vi.mocked(runsApi.get).mockResolvedValue(makeRun({ status: 'interrupted' }))

    const chat = createChatStore()
    await chat.send('你好')
    await vi.advanceTimersByTimeAsync(1000)

    expect(openChatStream).toHaveBeenCalledTimes(1)
    expect(chat.connection).toBe('degraded')
    expect(chat.state.streaming).toBe(false)
    expect(chat.state.recovery?.kind).toBe('run_interrupted')
    expect(approvalsApi.list).toHaveBeenCalledWith({ run_id: 'run-1', status: 'all', limit: 50 })
  })

  it('interrupted 降级后轮询到终态，connection 回到 idle', async () => {
    vi.mocked(openChatStream).mockImplementationOnce(async (_payload, handlers) => {
      handlers.onOpen?.('run-1')
      throw new Error('network down')
    })
    vi.mocked(runsApi.get)
      .mockResolvedValueOnce(makeRun({ status: 'interrupted' }))
      .mockResolvedValueOnce(makeRun({ status: 'interrupted' }))
      .mockResolvedValueOnce(makeRun({ status: 'succeeded', finished_at: '2026-11-11T00:00:09Z' }))

    const chat = createChatStore()
    await chat.send('你好')
    await vi.advanceTimersByTimeAsync(1000)
    expect(chat.connection).toBe('degraded')
    expect(chat.state.recovery?.kind).toBe('run_interrupted')

    // 轮询到终态后必须收尾，不能让连接条永久停留在 degraded。
    await vi.advanceTimersByTimeAsync(2500)
    expect(chat.connection).toBe('idle')
    expect(chat.state.streaming).toBe(false)
    expect(chat.state.runStatus).toBe('succeeded')
  })

  it('离线时暂停计时，online 事件立即重试并重置计数', async () => {
    vi.mocked(runsApi.stream).mockRejectedValue(new Error('network down'))
    const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)

    const chat = createChatStore()
    await chat.send('你好')

    expect(chat.connection).toBe('reconnecting')
    expect(chat.reconnectAttempt).toBe(0)
    await vi.advanceTimersByTimeAsync(30_000)
    expect(runsApi.stream).not.toHaveBeenCalled()

    onLine.mockReturnValue(true)
    window.dispatchEvent(new Event('online'))
    await flushMicrotasks()

    // 恢复在线后立即重试（不等剩余退避），且计数从 0 重新开始。
    expect(runsApi.stream).toHaveBeenCalledTimes(1)
    expect(chat.reconnectAttempt).toBe(1)
    await vi.advanceTimersByTimeAsync(1000)
    expect(runsApi.stream).toHaveBeenCalledTimes(2)

    chat.stopReconnect()
    expect(chat.connection).toBe('degraded')
  })

  it('stop() 清理重连定时器，不再发起重连', async () => {
    vi.mocked(openChatStream).mockImplementationOnce(async (_payload, handlers) => {
      handlers.onOpen?.('run-1')
      throw new Error('network down')
    })

    const chat = createChatStore()
    await chat.send('你好')
    expect(chat.connection).toBe('reconnecting')

    await chat.stop()
    await vi.advanceTimersByTimeAsync(30_000)

    expect(openChatStream).toHaveBeenCalledTimes(1)
    expect(chat.connection).toBe('idle')
    expect(chat.reconnectAttempt).toBe(0)
  })

  it('degraded 后重试发送会停掉旧轮询，不与新流竞争', async () => {
    const chat = createChatStore()
    await chat.send('你好')

    for (const delay of [1000, 2000, 4000, 8000, 16000]) {
      await vi.advanceTimersByTimeAsync(delay)
    }
    expect(chat.connection).toBe('degraded')
    expect(chat.state.recovery?.kind).toBe('stream_failed')
    const pollingCalls = vi.mocked(runsApi.get).mock.calls.length

    // 用户点「重试发送」：这次流正常结束。
    vi.mocked(openChatStream).mockImplementationOnce(async (_payload, handlers) => {
      handlers.onOpen?.('run-1')
      handlers.onEvent('message.done', messageDone(1))
    })
    await chat.retry()
    await flushMicrotasks()

    // 旧轮询已停：推进多个轮询周期后不再 GET run，恢复横幅也不会被轮询复活。
    await vi.advanceTimersByTimeAsync(10_000)
    expect(vi.mocked(runsApi.get).mock.calls.length).toBe(pollingCalls)
    expect(chat.state.recovery).toBeNull()
  })

  it('run 与 conversation 变化同步到诊断运行时上下文', async () => {
    vi.mocked(openChatStream).mockImplementationOnce(async (_payload, handlers) => {
      handlers.onOpen?.('run-1')
      handlers.onEvent('conversation.created', { conversation_id: 'conv-1', seq: 1 })
    })

    const chat = createChatStore()
    chat.setConversation('conv-0', '旧会话')
    await chat.send('你好')
    await flushMicrotasks()

    expect(getRuntimeContext()).toEqual({ runId: 'run-1', conversationId: 'conv-1' })
  })

  it('HTTP 5xx 把 request_id 带进错误态', async () => {
    vi.mocked(openChatStream).mockRejectedValue(
      new ApiRequestError('上游失败', { code: 'llm_error', status: 500, requestId: 'req-500' }),
    )

    const chat = createChatStore()
    await chat.send('你好')

    expect(chat.state.error?.code).toBe('llm_error')
    expect(chat.state.error?.requestId).toBe('req-500')
    expect(chat.state.error?.retryable).toBe(true)
  })
})
