import { describe, expect, it } from 'vitest'

import { createInitialChatState, markApprovalResolved, reduceChat } from '@/stores/chat-reducer'
import type { ChatEventName, ChatMessageView, ChatState } from '@/types'

function userView(id: string, clientId: string, content = '你好'): ChatMessageView {
  return {
    id,
    role: 'user',
    content,
    content_type: 'markdown',
    run_id: null,
    client_message_id: clientId,
    status: 'completed',
    citations: [],
    attachments: [],
    capabilities: { skills: [], mcp_servers: [], mcp_tools: [], knowledge_categories: [] },
    artifacts: [],
    usage: null,
    error: null,
    created_at: '2026-11-09T10:00:00Z',
  }
}

function run(state: ChatState, event: ChatEventName, data: Record<string, unknown>): ChatState {
  return reduceChat(state, event, data)
}

describe('chat reducer', () => {
  it('message.created 用 client_message_id 替换乐观消息', () => {
    let state: ChatState = {
      ...createInitialChatState(),
      messages: [userView('local-c1', 'c-1', '整理周报')],
    }
    state = run(state, 'message.created', {
      message_id: 'u-1',
      role: 'user',
      client_message_id: 'c-1',
      created_at: '2026-11-09T10:00:01Z',
      seq: 1,
    })

    expect(state.messages).toHaveLength(1)
    expect(state.messages[0]?.id).toBe('u-1')
    expect(state.messages[0]?.content).toBe('整理周报')
  })

  it('run.started → delta → message.done 收尾并记录用量', () => {
    let state = createInitialChatState()
    state = run(state, 'run.started', {
      run_id: 'r-1',
      conversation_id: 'conv-1',
      user_message_id: 'u-1',
      client_message_id: 'c-1',
      model: 'deepseek-chat',
      reasoning_effort: 'low',
      seq: 1,
    })
    state = run(state, 'message.started', {
      message_id: 'a-1',
      role: 'assistant',
      started_at: '2026-11-09T10:00:00Z',
      seq: 2,
    })
    state = run(state, 'message.delta', { message_id: 'a-1', delta: '你', seq: 3 })
    state = run(state, 'message.delta', { message_id: 'a-1', delta: '好', seq: 4 })
    state = run(state, 'message.done', {
      message_id: 'a-1',
      usage: { input_tokens: 10, output_tokens: 2, total_tokens: 12 },
      finish_reason: 'stop',
      model: 'deepseek-chat',
      first_token_ms: 120,
      duration_ms: 1200,
      active_duration_ms: 1000,
      citations: [],
      artifacts: [],
      seq: 5,
    })

    expect(state.messages[0]?.content).toBe('你好')
    expect(state.messages[0]?.status).toBe('completed')
    expect(state.streaming).toBe(false)
    expect(state.finishReason).toBe('stop')
    expect(state.usage?.total_tokens).toBe(12)
    expect(state.runId).toBe('r-1')
  })

  it('累积思考增量并在 done 时记录摘要', () => {
    let state = createInitialChatState()
    state = run(state, 'message.started', { message_id: 'a-1', role: 'assistant', seq: 1 })
    state = run(state, 'reasoning.delta', { message_id: 'a-1', delta: '先固定', seq: 2 })
    state = run(state, 'reasoning.delta', { message_id: 'a-1', delta: '统计口径', seq: 3 })
    state = run(state, 'reasoning.done', {
      message_id: 'a-1',
      duration_ms: 1200,
      tokens: 64,
      summary: '先固定统计口径',
      seq: 4,
    })

    const message = state.messages[0]
    expect(message?.reasoning?.content).toBe('先固定统计口径')
    expect(message?.reasoning?.durationMs).toBe(1200)
    expect(message?.reasoning?.done).toBe(true)
  })

  it('tool.start 与 tool.result 按 tool_call_id 合并', () => {
    let state = createInitialChatState()
    state = run(state, 'tool.start', {
      tool_call_id: 'call-1',
      tool: 'search_knowledge',
      display_name: '知识检索',
      args_preview: 'query=Q3',
      source: 'knowledge',
      seq: 1,
    })
    state = run(state, 'tool.result', {
      tool_call_id: 'call-1',
      status: 'ok',
      summary: '命中 3 个片段',
      result_preview: 'Q3 复盘 (0.94)',
      duration_ms: 800,
      seq: 2,
      citations: [
        {
          index: 1,
          document_id: 'doc-1',
          chunk_id: 'chunk-1',
          title: 'Q3 复盘',
          category: '客服',
          score: 0.94,
          updated_at: '2026-09-30T00:00:00Z',
        },
      ],
    })

    expect(state.process).toHaveLength(1)
    const item = state.process[0]
    expect(item?.kind).toBe('tool')
    if (item?.kind === 'tool') {
      expect(item.status).toBe('ok')
      expect(item.summary).toBe('命中 3 个片段')
      expect(item.durationMs).toBe(800)
      expect(item.citations).toHaveLength(1)
      expect(item.citations?.[0]?.document_id).toBe('doc-1')
    }
  })

  it('a2a.task 按 task_id 合并状态', () => {
    let state = createInitialChatState()
    state = run(state, 'a2a.task', {
      task_id: 'task-1',
      a2a_task_id: 'remote-1',
      agent: 'data-analyst',
      agent_detail: { id: 'a', slug: 'data-analyst', name: 'Data Analyst' },
      state: 'working',
      progress: 0.3,
      seq: 1,
    })
    state = run(state, 'a2a.task', {
      task_id: 'task-1',
      a2a_task_id: 'remote-1',
      agent: 'data-analyst',
      state: 'completed',
      progress: 1,
      result_summary: '核对通过',
      seq: 2,
    })

    expect(state.process).toHaveLength(1)
    const item = state.process[0]
    expect(item?.kind).toBe('a2a')
    if (item?.kind === 'a2a') {
      expect(item.state).toBe('completed')
      expect(item.status).toBe('ok')
      expect(item.resultSummary).toBe('核对通过')
    }
  })

  it('approval.required 设置待审批，决定后同步卡片', () => {
    let state = createInitialChatState()
    state = run(state, 'approval.required', {
      approval_id: 'ap-1',
      tool: 'mcp__slack_mcp__post_message',
      tool_display_name: 'Slack · 发送消息',
      source: 'mcp',
      executor: 'slack-mcp',
      target: '#support-weekly',
      side_effect: '外部写操作',
      risk: 'write',
      reason: '需要人工确认',
      seq: 1,
    })

    expect(state.pendingApprovalId).toBe('ap-1')
    expect(state.process).toHaveLength(1)

    state = markApprovalResolved(state, 'ap-1', 'approve')
    expect(state.pendingApprovalId).toBeNull()
    const item = state.process[0]
    if (item?.kind === 'approval') {
      expect(item.decision).toBe('approve')
      expect(item.status).toBe('ok')
    }
  })

  it('未知事件不破坏状态，重复 seq 被忽略', () => {
    let state = run(createInitialChatState(), 'run.started', {
      run_id: 'r-1',
      conversation_id: 'conv-1',
      seq: 1,
    })
    const before = state
    state = reduceChat(state, 'future.event' as ChatEventName, { seq: 2 })
    expect(state).toEqual(before)

    state = run(state, 'message.started', { message_id: 'a-1', role: 'assistant', seq: 3 })
    const afterStart = state
    state = run(state, 'message.started', { message_id: 'a-2', role: 'assistant', seq: 3 })
    expect(state).toBe(afterStart)
  })

  it('流内 error 保留已生成内容并标记失败', () => {
    let state = createInitialChatState()
    state = run(state, 'message.started', { message_id: 'a-1', role: 'assistant', seq: 1 })
    state = run(state, 'message.delta', { message_id: 'a-1', delta: '部分输出', seq: 2 })
    state = run(state, 'error', {
      code: 'model_error',
      message: '模型返回异常',
      retryable: true,
      seq: 3,
    })

    expect(state.error?.code).toBe('model_error')
    expect(state.streaming).toBe(false)
    expect(state.messages[0]?.content).toBe('部分输出')
    expect(state.messages[0]?.status).toBe('failed')
  })
})
