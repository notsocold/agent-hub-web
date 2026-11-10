import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import MessageBubble from '@/components/chat/MessageBubble.vue'
import type { ChatMessageView } from '@/types'

const RouterLinkStub = {
  name: 'RouterLink',
  props: ['to'],
  template: '<a class="router-link" :data-to="JSON.stringify(to)"><slot /></a>',
}

function message(overrides: Partial<ChatMessageView> = {}): ChatMessageView {
  return {
    id: 'a-1',
    role: 'assistant',
    content: '退货需要保留吊牌。',
    content_type: 'markdown',
    run_id: 'run-1',
    client_message_id: null,
    status: 'completed',
    citations: [],
    attachments: [],
    capabilities: { skills: [], mcp_servers: [], mcp_tools: [], knowledge_categories: [] },
    artifacts: [],
    usage: null,
    error: null,
    created_at: '2026-11-10T10:00:00Z',
    ...overrides,
  }
}

describe('MessageBubble 引用深链', () => {
  it('引用按 document_id 跳转并带上标题回退', () => {
    const wrapper = mount(MessageBubble, {
      props: {
        message: message({
          citations: [
            {
              index: 1,
              document_id: 'doc-1',
              chunk_id: 'chunk-1',
              title: '退货政策 > 吊牌要求',
              category: '售后',
              score: 0.3283,
              updated_at: '2026-09-18T00:00:00Z',
            },
          ],
        }),
      },
      global: { stubs: { RouterLink: RouterLinkStub } },
    })

    const link = wrapper.find('a.router-link')
    const to = JSON.parse(link.attributes('data-to') ?? '{}') as {
      name?: string
      query?: Record<string, string>
    }
    expect(to.name).toBe('knowledge')
    expect(to.query?.document_id).toBe('doc-1')
    expect(to.query?.q).toBe('退货政策 > 吊牌要求')
  })

  it('用户消息展示本轮知识库分类', () => {
    const wrapper = mount(MessageBubble, {
      props: {
        message: message({
          role: 'user',
          content: '只查售后',
          capabilities: {
            skills: [],
            mcp_servers: [],
            mcp_tools: [],
            knowledge_categories: ['售后'],
          },
        }),
      },
      global: { stubs: { RouterLink: RouterLinkStub } },
    })

    expect(wrapper.text()).toContain('知识库')
    expect(wrapper.text()).toContain('售后')
  })
})
