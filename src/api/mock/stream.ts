import type { ChatEventName, ChatMessage, ChatStreamRequest, Citation } from '@/types'

import { mockDb } from './db'

export interface MockStreamHandlers {
  onOpen?: (runId: string | null) => void
  onEvent: (event: ChatEventName, data: unknown) => void
  onError: (error: Error) => void
  signal: AbortSignal
}

interface MockStreamOptions {
  /** 帧间隔，测试可设为 0。 */
  frameDelay?: number
}

interface Frame {
  event: ChatEventName
  data: Record<string, unknown>
  delay?: number
}

const CITATIONS: Citation[] = [
  {
    index: 1,
    document_id: '99999999-9999-4999-8999-999999999999',
    chunk_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    title: 'Q3 客服复盘 v2',
    category: '客服',
    score: 0.94,
    updated_at: '2026-09-30T00:00:00Z',
  },
]

function abortError(): Error {
  const error = new Error('Aborted')
  error.name = 'AbortError'
  return error
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(abortError())
      return
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    function onAbort(): void {
      clearTimeout(timer)
      reject(abortError())
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

function resolveConversation(payload: ChatStreamRequest): {
  id: string
  title: string
  created: boolean
} {
  if (payload.conversation_id) {
    const existing = mockDb.getConversation(payload.conversation_id)
    if (existing) {
      return { id: existing.id, title: existing.title, created: false }
    }
  }
  const title = payload.message.trim().slice(0, 20) || '新会话'
  const conversation = mockDb.createConversation(title)
  return { id: conversation.id, title, created: true }
}

function baseCapabilities(categories: string[]): ChatMessage['capabilities'] {
  return {
    skills: [],
    mcp_servers: [],
    mcp_tools: [],
    knowledge_categories: categories,
    workflow_id: null,
  }
}

export async function mockChatStream(
  payload: ChatStreamRequest,
  handlers: MockStreamHandlers,
  options: MockStreamOptions = {},
): Promise<void> {
  const frameDelay = options.frameDelay ?? 90
  const signal = handlers.signal
  const conversation = resolveConversation(payload)
  const runId = crypto.randomUUID()
  const userMessageId = crypto.randomUUID()
  const assistantMessageId = crypto.randomUUID()
  const clientMessageId = payload.client_message_id ?? crypto.randomUUID()
  const isApproval = /审批|发布|slack|写操作/i.test(payload.message)
  const isError = /错误|失败|error/i.test(payload.message)

  let seq = 0
  function emit(event: ChatEventName, data: Record<string, unknown>): void {
    seq += 1
    handlers.onEvent(event, {
      ...data,
      run_id: runId,
      ts: new Date().toISOString(),
      seq,
    })
  }

  async function play(frames: Frame[]): Promise<void> {
    for (const frame of frames) {
      if (signal.aborted) throw abortError()
      await sleep(frame.delay ?? frameDelay, signal)
      if (signal.aborted) throw abortError()
      emit(frame.event, frame.data)
    }
  }

  function waitForDecision(approvalId: string): Promise<'approved' | 'rejected'> {
    return new Promise((resolve, reject) => {
      if (signal.aborted) {
        reject(abortError())
        return
      }
      const unsubscribe = mockDb.onApprovalResolved((id, decision) => {
        if (id !== approvalId) return
        cleanup()
        resolve(decision)
      })
      function onAbort(): void {
        cleanup()
        reject(abortError())
      }
      function cleanup(): void {
        unsubscribe()
        signal.removeEventListener('abort', onAbort)
      }
      signal.addEventListener('abort', onAbort, { once: true })
    })
  }

  function saveUserMessage(): void {
    const message: ChatMessage = {
      id: userMessageId,
      role: 'user',
      content: payload.message,
      content_type: 'markdown',
      run_id: runId,
      client_message_id: clientMessageId,
      status: 'completed',
      citations: [],
      attachments: [],
      capabilities: baseCapabilities(payload.knowledge_categories ?? []),
      artifacts: [],
      usage: null,
      error: null,
      created_at: new Date().toISOString(),
    }
    mockDb.appendMessage(conversation.id, message)
  }

  function saveAssistantMessage(content: string, finishReason: string): void {
    const message: ChatMessage = {
      id: assistantMessageId,
      role: 'assistant',
      content,
      content_type: 'markdown',
      run_id: runId,
      client_message_id: null,
      status:
        finishReason === 'stop' ? 'completed' : finishReason === 'error' ? 'failed' : 'canceled',
      citations: isError ? [] : CITATIONS,
      attachments: [],
      capabilities: baseCapabilities(payload.knowledge_categories ?? []),
      artifacts: [],
      usage: { input_tokens: 1280, output_tokens: 320, reasoning_tokens: 96, total_tokens: 1600 },
      error: isError ? { code: 'mock_stream_error', message: '演示用错误：模型返回异常。', retryable: true } : null,
      created_at: new Date().toISOString(),
    }
    mockDb.appendMessage(conversation.id, message)
  }

  try {
    handlers.onOpen?.(runId)

    const prefix: Frame[] = []
    if (conversation.created) {
      prefix.push({
        event: 'conversation.created',
        data: { conversation_id: conversation.id, title: conversation.title },
        delay: 0,
      })
    }
    prefix.push(
      {
        event: 'run.started',
        data: {
          run_id: runId,
          conversation_id: conversation.id,
          user_message_id: userMessageId,
          client_message_id: clientMessageId,
          model: payload.model ?? 'deepseek-chat',
          reasoning_effort: payload.reasoning_effort ?? 'low',
          workflow_id: payload.workflow_id ?? null,
          workflow_version: payload.workflow_version ?? null,
        },
        delay: 0,
      },
      {
        event: 'message.created',
        data: {
          message_id: userMessageId,
          role: 'user',
          client_message_id: clientMessageId,
          created_at: new Date().toISOString(),
        },
        delay: 40,
      },
      {
        event: 'message.started',
        data: {
          message_id: assistantMessageId,
          role: 'assistant',
          started_at: new Date().toISOString(),
        },
        delay: 40,
      },
      {
        event: 'reasoning.delta',
        data: {
          message_id: assistantMessageId,
          delta: '先确认问题范围，再检索知识库里的 Q3 复盘。',
        },
        delay: 100,
      },
      {
        event: 'reasoning.delta',
        data: {
          message_id: assistantMessageId,
          delta: '统计口径需要固定为按创建时间归入 Q3。',
        },
        delay: 80,
      },
      {
        event: 'reasoning.done',
        data: {
          message_id: assistantMessageId,
          duration_ms: 1200,
          tokens: 128,
          summary: '确认口径 → 检索复盘 → 组织回答；外部写操作前必须审批。',
        },
        delay: 60,
      },
    )
    await play(prefix)
    saveUserMessage()

    if (isError) {
      await play([
        {
          event: 'tool.start',
          data: {
            tool_call_id: 'call_error',
            tool: 'search_knowledge',
            display_name: '知识检索',
            args: { query: payload.message },
            args_preview: `query=${payload.message.slice(0, 40)}`,
            source: 'knowledge',
          },
        },
        {
          event: 'error',
          data: {
            code: 'model_error',
            message: '演示用错误：模型返回异常，请稍后重试。',
            retryable: true,
          },
        },
      ])
      emit('message.done', {
        run_id: runId,
        message_id: assistantMessageId,
        usage: { input_tokens: 320, output_tokens: 0, reasoning_tokens: 0, total_tokens: 320 },
        finish_reason: 'error',
        model: payload.model ?? 'deepseek-chat',
        first_token_ms: null,
        duration_ms: 800,
        active_duration_ms: 800,
        citations: [],
      })
      saveAssistantMessage('', 'error')
      return
    }

    const answer =
      '## 结论\n\nQ3 共收到 **128 条**工单，退款与物流类合计占 61%。\n\n' +
      '### 建议\n\n1. 先更新售后 FAQ 的退款时限；\n2. 把「吊牌保留」写进快捷回复；\n3. 发布前由 data-analyst 复核数字。'

    await play([
      {
        event: 'tool.start',
        data: {
          tool_call_id: 'call_search_1',
          tool: 'search_knowledge',
          display_name: '知识检索',
          args: { query: 'Q3 客服复盘 · 工单分类口径', top_k: 5 },
          args_preview: 'query=Q3 客服复盘 · 工单分类口径, top_k=5',
          source: 'knowledge',
        },
        delay: 120,
      },
      {
        event: 'tool.result',
        data: {
          tool_call_id: 'call_search_1',
          status: 'ok',
          summary: '命中 3 个片段',
          result_preview: 'Q3 客服复盘 v2 (0.94)、工单分类规范 v3 (0.92)、售后话术库 (0.81)',
          duration_ms: 800,
          source: 'knowledge',
          citations: CITATIONS,
        },
        delay: 260,
      },
    ])

    if (!isApproval) {
      await play([
        { event: 'message.delta', data: { message_id: assistantMessageId, delta: '## 结论\n\nQ3 共收到 ' }, delay: 180 },
        {
          event: 'message.delta',
          data: { message_id: assistantMessageId, delta: '**128 条**工单，退款与物流类合计占 61%。\n\n' },
          delay: 140,
        },
        {
          event: 'message.delta',
          data: { message_id: assistantMessageId, delta: '建议先更新售后 FAQ 的退款时限，再补充「吊牌保留」说明。' },
          delay: 200,
        },
      ])
      emit('message.done', {
        run_id: runId,
        message_id: assistantMessageId,
        usage: { input_tokens: 6842, output_tokens: 436, reasoning_tokens: 128, total_tokens: 7278 },
        finish_reason: 'stop',
        model: payload.model ?? 'deepseek-chat',
        first_token_ms: 120,
        duration_ms: 4200,
        active_duration_ms: 4200,
        citations: CITATIONS,
        reasoning: { duration_ms: 1200, tokens: 128, summary: '确认口径 → 检索复盘 → 组织回答。' },
      })
      saveAssistantMessage(answer, 'stop')
      return
    }

    // 审批脚本：A2A → 审批卡 → 等待决定 → 同一流继续
    await play([
      {
        event: 'a2a.task',
        data: {
          task_id: '88888888-8888-4888-8888-888888888888',
          a2a_task_id: 'task_9b2a',
          agent: 'data-analyst',
          agent_detail: {
            id: '77777777-7777-4777-8777-777777777777',
            slug: 'data-analyst',
            name: 'Data Analyst',
          },
          state: 'working',
          progress: 0.3,
          request_summary: '核对工单数字与知识库来源',
        },
        delay: 200,
      },
      {
        event: 'a2a.artifact',
        data: {
          task_id: '88888888-8888-4888-8888-888888888888',
          a2a_task_id: 'task_9b2a',
          artifact: {
            type: 'text',
            summary: '12/12 项数字核对通过，2 处引用待补。',
            parts: [],
            data: { checks_passed: 12, checks_total: 12 },
          },
        },
        delay: 180,
      },
      {
        event: 'a2a.task',
        data: {
          task_id: '88888888-8888-4888-8888-888888888888',
          a2a_task_id: 'task_9b2a',
          agent: 'data-analyst',
          agent_detail: {
            id: '77777777-7777-4777-8777-777777777777',
            slug: 'data-analyst',
            name: 'Data Analyst',
          },
          state: 'completed',
          progress: 1,
          result_summary: '12/12 项数字核对通过',
          duration_ms: 1200,
        },
        delay: 160,
      },
    ])

    const approval = mockDb.createApproval({
      run_id: runId,
      conversation_id: conversation.id,
      conversation_title: conversation.title,
      tool_name: 'mcp__slack_mcp__post_message',
      tool_display_name: 'Slack · 发送消息',
      source: 'mcp',
      executor: 'slack-mcp',
      target: '#support-weekly · 12 名成员',
      side_effect: '外部写操作；发布后可在 Slack 中删除',
      risk: 'write',
      reason: '外部写操作触发 HITL，等待人工确认',
      payload: { channel: 'C08F3K2', text: 'Q3 客服工单周报' },
    })

    emit('approval.required', {
      approval_id: approval.id,
      tool: approval.tool_name,
      tool_display_name: approval.tool_display_name,
      reason: approval.reason,
      payload: approval.payload,
      source: approval.source,
      executor: approval.executor,
      target: approval.target,
      side_effect: approval.side_effect,
      risk: approval.risk,
      expires_at: approval.expires_at,
    })

    const decision = await waitForDecision(approval.id)
    if (decision === 'approved') {
      await play([
        {
          event: 'message.delta',
          data: { message_id: assistantMessageId, delta: '已批准，正在发布到 #support-weekly。' },
          delay: 120,
        },
        {
          event: 'tool.start',
          data: {
            tool_call_id: 'call_slack_1',
            tool: 'mcp__slack_mcp__post_message',
            display_name: 'Slack · 发送消息',
            args: { channel: 'C08F3K2' },
            args_preview: 'channel=C08F3K2',
            source: 'mcp',
            risk: 'write',
            requires_approval: true,
          },
          delay: 100,
        },
        {
          event: 'tool.result',
          data: {
            tool_call_id: 'call_slack_1',
            status: 'ok',
            summary: '已发布到 #support-weekly',
            result_preview: 'message_ts=1731067385.123',
            duration_ms: 400,
            source: 'mcp',
          },
          delay: 220,
        },
      ])
      emit('message.done', {
        run_id: runId,
        message_id: assistantMessageId,
        usage: { input_tokens: 6842, output_tokens: 1236, reasoning_tokens: 642, total_tokens: 8078 },
        finish_reason: 'stop',
        model: payload.model ?? 'deepseek-chat',
        first_token_ms: 120,
        duration_ms: 108000,
        active_duration_ms: 42000,
        citations: CITATIONS,
        reasoning: { duration_ms: 12000, tokens: 642, summary: '先固定口径；数字交 data-analyst 核对；Slack 发布前必须审批。' },
      })
      saveAssistantMessage('已批准并发布到 #support-weekly。\n\n周报已归档，数字由 data-analyst 复核通过。', 'stop')
      return
    }

    await play([
      {
        event: 'message.delta',
        data: { message_id: assistantMessageId, delta: '已拒绝发布，周报草稿保留在会话中，未写入 Slack。' },
        delay: 100,
      },
    ])
    emit('message.done', {
      run_id: runId,
      message_id: assistantMessageId,
      usage: { input_tokens: 6842, output_tokens: 1210, reasoning_tokens: 620, total_tokens: 8052 },
      finish_reason: 'canceled',
      model: payload.model ?? 'deepseek-chat',
      first_token_ms: 120,
      duration_ms: 60000,
      active_duration_ms: 40000,
      citations: CITATIONS,
    })
    saveAssistantMessage('已拒绝发布，周报草稿保留。', 'canceled')
  } catch (error) {
    if (isAbort(error) || signal.aborted) return
    handlers.onError(error instanceof Error ? error : new Error(String(error)))
  }
}
