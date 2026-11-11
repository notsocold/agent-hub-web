import { describe, expect, it } from 'vitest'

import type { ChatMessageView, ProcessItem } from '@/types'
import { buildMessageRows } from '@/utils/messageRows'

function message(overrides: Partial<ChatMessageView> = {}): ChatMessageView {
  return {
    id: 'm1',
    role: 'user',
    content: 'hello',
    content_type: 'text',
    run_id: null,
    client_message_id: null,
    status: 'completed',
    citations: [],
    attachments: [],
    capabilities: {
      skills: [],
      mcp_servers: [],
      mcp_tools: [],
      knowledge_categories: [],
      workflow_id: null,
    },
    artifacts: [],
    usage: null,
    error: null,
    created_at: '2026-11-11T00:00:00.000Z',
    ...overrides,
  }
}

const processItem: ProcessItem = {
  id: 'notice-1',
  kind: 'notice',
  status: 'ok',
  level: 'info',
  code: 'notice',
  message: '工具已执行',
  retryable: false,
}

describe('buildMessageRows', () => {
  it('本轮有 assistant 时插在它之前', () => {
    const rows = buildMessageRows(
      [
        message({ id: 'u1', role: 'user', run_id: 'run-1' }),
        message({ id: 'a1', role: 'assistant', run_id: 'run-1' }),
        message({ id: 'u2', role: 'user', run_id: 'run-2' }),
        message({ id: 'a2', role: 'assistant', run_id: 'run-2' }),
      ],
      [processItem],
      'run-2',
    )

    expect(rows.map((row) => row.id)).toEqual(['u1', 'a1', 'u2', 'process', 'a2'])
  })

  it('本轮还没有 assistant 时插在最后一条 assistant 之前', () => {
    const rows = buildMessageRows(
      [
        message({ id: 'u1', role: 'user', run_id: 'run-1' }),
        message({ id: 'a1', role: 'assistant', run_id: 'run-1' }),
        message({ id: 'u2', role: 'user', run_id: 'run-2' }),
      ],
      [processItem],
      'run-2',
    )

    expect(rows.map((row) => row.id)).toEqual(['u1', 'process', 'a1', 'u2'])
  })

  it('完全没有 assistant 时放到列表末尾', () => {
    const rows = buildMessageRows(
      [message({ id: 'u1', role: 'user', run_id: 'run-1' })],
      [processItem],
      'run-1',
    )

    expect(rows.map((row) => row.id)).toEqual(['u1', 'process'])
  })

  it('process 为空时不产生 process 行', () => {
    const rows = buildMessageRows(
      [message({ id: 'u1' }), message({ id: 'a1', role: 'assistant' })],
      [],
      'run-1',
    )

    expect(rows.map((row) => row.id)).toEqual(['u1', 'a1'])
    expect(rows.some((row) => row.kind === 'process')).toBe(false)
  })

  it('空消息列表且 process 非空时只返回 process 行', () => {
    const rows = buildMessageRows([], [processItem], 'run-1')

    expect(rows).toEqual([{ id: 'process', kind: 'process' }])
  })

  it('currentRunId 为空时退化到最后一条 assistant 之前', () => {
    const rows = buildMessageRows(
      [message({ id: 'u1' }), message({ id: 'a1', role: 'assistant' })],
      [processItem],
      null,
    )

    expect(rows.map((row) => row.id)).toEqual(['u1', 'process', 'a1'])
  })

  it('行 id 唯一且消息 content 原样保留', () => {
    const rows = buildMessageRows(
      [
        message({ id: 'u1', content: '第一问' }),
        message({ id: 'a1', role: 'assistant', content: '第一答' }),
      ],
      [processItem],
      null,
    )

    expect(new Set(rows.map((row) => row.id)).size).toBe(rows.length)
    const content = rows
      .filter((row) => row.kind === 'message')
      .map((row) => (row.kind === 'message' ? row.message.content : ''))
    expect(content).toEqual(['第一问', '第一答'])
  })
})
