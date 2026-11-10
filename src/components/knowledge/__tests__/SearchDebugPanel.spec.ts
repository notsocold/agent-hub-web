import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiRequestError } from '@/api/client'
import SearchDebugPanel from '@/components/knowledge/SearchDebugPanel.vue'

const api = vi.hoisted(() => ({ search: vi.fn() }))
vi.mock('@/api/knowledge', () => ({ knowledgeApi: api }))

async function search(wrapper: ReturnType<typeof mount>): Promise<void> {
  await wrapper.find('[data-testid="debug-query"]').setValue('退款需要保留吊牌吗')
  await wrapper.find('form').trigger('submit')
  await flushPromises()
}

describe('SearchDebugPanel 状态', () => {
  beforeEach(() => {
    api.search.mockReset()
  })

  it('空结果不是错误', async () => {
    api.search.mockResolvedValue({ hits: [], elapsed_ms: 3 })
    const wrapper = mount(SearchDebugPanel)
    await search(wrapper)

    expect(wrapper.text()).toContain('没有命中片段')
    expect(wrapper.text()).not.toContain('不可用')
  })

  it('503 显示检索服务不可用', async () => {
    api.search.mockRejectedValue(
      new ApiRequestError('embedding unavailable', {
        code: 'service_unavailable',
        status: 503,
      }),
    )
    const wrapper = mount(SearchDebugPanel)
    await search(wrapper)

    expect(wrapper.text()).toContain('检索服务暂不可用')
  })

  it('命中时展示标题、分数与来源', async () => {
    api.search.mockResolvedValue({
      hits: [
        {
          chunk_id: 'chunk-1',
          document_id: 'doc-1',
          title: '退货政策 > 吊牌要求',
          document_title: '退货政策',
          document_filename: 'returns.md',
          category: '售后',
          chunk_index: 1,
          content: '退货需要保留吊牌与包装。',
          score: 0.3283,
          updated_at: '2026-09-18T00:00:00Z',
        },
      ],
      elapsed_ms: 2,
    })
    const wrapper = mount(SearchDebugPanel)
    await search(wrapper)

    expect(wrapper.text()).toContain('退货政策 > 吊牌要求')
    expect(wrapper.text()).toContain('0.33')
    expect(wrapper.text()).toContain('returns.md')
  })
})
