import { describe, expect, it } from 'vitest'

import { normalizeEnum, TASK_STATES } from '@/types'
import type { Approval, ChatEventName, Conversation, MessageDoneData, RunStartedData } from '@/types'

describe('契约类型与 fixtures 对齐', () => {
  it('会话列表项字段与 fixtures 3.1 一致', () => {
    const conversation = {
      id: '0f1e7a2c-0000-4000-8000-000000000001',
      title: 'Q3 客服工单周报',
      status: 'active',
      message_count: 24,
      last_message_preview: '周报已经定稿，发布前需要你确认。',
      last_message_at: '2026-11-08T14:43:00Z',
      pending_approval_count: 1,
      created_at: '2026-11-08T14:41:00Z',
      updated_at: '2026-11-08T14:43:00Z',
    } satisfies Conversation

    expect(conversation.message_count).toBe(24)
    expect(conversation.status).toBe('active')
  })

  it('run.started 与审批字段与 fixtures 2.2 一致', () => {
    const runStarted = {
      run_id: '33333333-3333-4333-8333-333333333333',
      conversation_id: '22222222-2222-4222-8222-222222222222',
      user_message_id: '44444444-4444-4444-8444-444444444444',
      client_message_id: 'c-001',
      model: 'deepseek-chat',
      reasoning_effort: 'low',
      workflow_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      workflow_version: 2,
      ts: '2026-11-08T14:41:18Z',
      seq: 2,
    } satisfies RunStartedData

    const approval = {
      id: '66666666-6666-4666-8666-666666666666',
      run_id: '33333333-3333-4333-8333-333333333333',
      conversation_id: '22222222-2222-4222-8222-222222222222',
      conversation_title: 'Q3 客服工单周报',
      status: 'approved',
      tool_name: 'mcp__slack_mcp__post_message',
      tool_display_name: 'Slack · 发送消息',
      source: 'mcp',
      executor: 'slack-mcp',
      target: '#support-weekly · 12 名成员',
      side_effect: '外部写操作；发布后可在 Slack 中删除',
      risk: 'write',
      reason: '外部写操作触发 HITL，等待人工确认',
      payload: { channel: 'C08F3K2' },
      payload_preview: '{"channel":"C08F3K2"}',
      expires_at: '2026-11-08T15:13:00Z',
      created_at: '2026-11-08T14:43:00Z',
      decided_at: '2026-11-08T14:43:04Z',
      decided_by: { id: '11111111-1111-4111-8111-111111111111', display_name: '周丹' },
      decision_note: '确认执行',
    } satisfies Approval

    expect(runStarted.reasoning_effort).toBe('low')
    expect(approval.risk).toBe('write')
  })

  it('message.done 携带用量、引用与产物', () => {
    const done = {
      run_id: '33333333-3333-4333-8333-333333333333',
      message_id: '55555555-5555-4555-8555-555555555555',
      usage: {
        input_tokens: 6842,
        output_tokens: 1236,
        reasoning_tokens: 642,
        total_tokens: 8078,
      },
      finish_reason: 'stop',
      model: 'deepseek-chat',
      first_token_ms: 120,
      duration_ms: 108000,
      active_duration_ms: 42000,
      citations: [
        {
          index: 1,
          document_id: '99999999-9999-4999-8999-999999999999',
          chunk_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          title: 'Q3 客服复盘 v2',
          category: '客服',
          score: 0.94,
          updated_at: '2026-09-30T00:00:00Z',
        },
      ],
      artifacts: [],
    } satisfies MessageDoneData

    expect(done.usage.total_tokens).toBe(8078)
    expect(done.citations?.[0]?.index).toBe(1)
  })

  it('事件名联合覆盖契约 4.4 的全部事件', () => {
    const names: ChatEventName[] = [
      'conversation.created',
      'run.started',
      'message.created',
      'message.started',
      'message.delta',
      'reasoning.delta',
      'reasoning.done',
      'skill.activated',
      'tool.start',
      'tool.result',
      'a2a.task',
      'a2a.artifact',
      'a2a.input_required',
      'a2a.auth_required',
      'approval.required',
      'workflow.step',
      'memory.saved',
      'notice',
      'message.done',
      'error',
      'ping',
    ]

    expect(names).toHaveLength(21)
  })

  it('未知枚举值回退到 fallback', () => {
    expect(normalizeEnum('future_state', TASK_STATES, 'submitted')).toBe('submitted')
    expect(normalizeEnum('working', TASK_STATES, 'submitted')).toBe('working')
  })
})
