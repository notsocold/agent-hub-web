import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import ToolCard from '@/components/chat/cards/ToolCard.vue'
import type { ToolProcess } from '@/types'

const RouterLinkStub = {
  name: 'RouterLink',
  props: ['to'],
  template: '<a class="router-link" :data-to="JSON.stringify(to)"><slot /></a>',
}

function toolProcess(overrides: Partial<ToolProcess> = {}): ToolProcess {
  return {
    kind: 'tool',
    id: 'tool:call-1',
    status: 'ok',
    startedAt: '2026-11-10T10:00:00Z',
    durationMs: 820,
    toolCallId: 'call-1',
    tool: 'search_knowledge',
    displayName: '知识检索',
    source: 'knowledge',
    sourceId: null,
    server: '',
    risk: 'read',
    requiresApproval: false,
    argsPreview: 'query=退款需要保留吊牌吗',
    resultPreview: '',
    summary: '检索到 2 条片段',
    error: null,
    metadata: {},
    ...overrides,
  }
}

const citations = [
  {
    index: 1,
    document_id: 'doc-1',
    chunk_id: 'chunk-1',
    title: '退货政策 > 吊牌要求',
    category: '售后',
    score: 0.3283,
    updated_at: '2026-09-18T00:00:00Z',
  },
  {
    index: 2,
    document_id: 'doc-2',
    chunk_id: 'chunk-2',
    title: '退款处理 SOP',
    category: '售后',
    score: 0.2981,
    updated_at: '2026-08-02T00:00:00Z',
  },
]

describe('ToolCard 知识检索来源', () => {
  it('渲染知识库来源标签与引用列表', () => {
    const wrapper = mount(ToolCard, {
      props: { item: toolProcess({ citations }) },
      global: { stubs: { RouterLink: RouterLinkStub } },
    })

    expect(wrapper.text()).toContain('知识检索')
    expect(wrapper.text()).toContain('引用来源')
    const links = wrapper.findAll('a.router-link')
    expect(links).toHaveLength(2)
    const first = JSON.parse(links[0]!.attributes('data-to') ?? '{}') as {
      query?: { document_id?: string; q?: string }
    }
    expect(first.query?.document_id).toBe('doc-1')
    expect(first.query?.q).toContain('退货政策')
  })

  it('没有引用时不渲染来源区块', () => {
    const wrapper = mount(ToolCard, {
      props: { item: toolProcess() },
      global: { stubs: { RouterLink: RouterLinkStub } },
    })
    expect(wrapper.text()).not.toContain('引用来源')
  })
})
