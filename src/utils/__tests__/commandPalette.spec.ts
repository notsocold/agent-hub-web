import { describe, expect, it } from 'vitest'

import type { ChatMessageView, SystemCapabilities } from '@/types'
import { filterPalettePages, matchMessages } from '@/utils/commandPalette'

function message(overrides: Partial<ChatMessageView> = {}): ChatMessageView {
  return {
    id: 'm1',
    role: 'assistant',
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

const capabilities: SystemCapabilities = {
  instructions: true,
  memories: true,
  skills: true,
  mcp: true,
  knowledge: false,
  attachments: true,
  workflows: false,
  approvals: true,
  agents: true,
  tasks: true,
}

describe('filterPalettePages', () => {
  it('空查询返回全部页面（能力未加载时不过滤）', () => {
    expect(filterPalettePages('', null).length).toBeGreaterThanOrEqual(5)
  })

  it('按能力关闭过滤页面', () => {
    const ids = filterPalettePages('', capabilities).map((page) => page.id)
    expect(ids).not.toContain('knowledge')
    expect(ids).toContain('chat')
    expect(ids).toContain('settings')
  })

  it('按关键词匹配 label 与 description', () => {
    expect(filterPalettePages('设置', null).map((page) => page.id)).toEqual(['settings'])
    expect(filterPalettePages('知识', null).map((page) => page.id)).toEqual(['knowledge'])
    expect(filterPalettePages('agent', null).map((page) => page.id)).toEqual(['agents'])
  })

  it('无匹配时返回空数组', () => {
    expect(filterPalettePages('不存在的页面', null)).toEqual([])
  })
})

describe('matchMessages', () => {
  it('空查询返回空数组', () => {
    expect(matchMessages([message()], '  ')).toEqual([])
  })

  it('大小写不敏感匹配正文', () => {
    const matched = matchMessages(
      [message({ id: 'a', content: '整理 WEEKLY 周报' })],
      'weekly',
    )
    expect(matched.map((item) => item.id)).toEqual(['a'])
  })

  it('最多返回 limit 条且最近的消息优先', () => {
    const messages = Array.from({ length: 12 }, (_, index) =>
      message({ id: `m${index}`, content: `包含关键词 ${index}` }),
    )
    const matched = matchMessages(messages, '关键词', 8)
    expect(matched).toHaveLength(8)
    expect(matched[0]?.id).toBe('m11')
    expect(matched.at(-1)?.id).toBe('m4')
  })
})
