import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import { ApiRequestError } from '@/api/client'
import { useAuthStore } from '@/stores/auth'
import type { KnowledgeDocument, KnowledgeDocumentPage } from '@/types'
import KnowledgeView from '@/views/KnowledgeView.vue'

const api = vi.hoisted(() => ({
  documents: vi.fn(),
  get: vi.fn(),
  remove: vi.fn(),
  retry: vi.fn(),
  rebuild: vi.fn(),
  search: vi.fn(),
  upload: vi.fn(),
}))

vi.mock('@/api/knowledge', () => ({ knowledgeApi: api }))

function doc(id: string, overrides: Partial<KnowledgeDocument> = {}): KnowledgeDocument {
  return {
    id,
    title: `文档 ${id}`,
    source_uri: `data/${id}.md`,
    category: '售后',
    status: 'ready',
    chunk_count: 10,
    size_bytes: 2048,
    owner: null,
    error: null,
    created_at: '2026-11-01T00:00:00Z',
    updated_at: '2026-11-01T00:00:00Z',
    ...overrides,
  }
}

function page(items: KnowledgeDocument[]): KnowledgeDocumentPage {
  return {
    items,
    next_cursor: null,
    has_more: false,
    stats: {
      documents: 4,
      chunks: 52,
      ready: 2,
      indexing: 1,
      pending: 0,
      failed: 1,
    },
  }
}

const DetailStub = {
  name: 'DocumentDetailDrawer',
  props: ['modelValue', 'document'],
  template: '<div data-testid="detail-stub" :data-open="String(modelValue)"></div>',
}

async function mountView(path = '/knowledge') {
  setActivePinia(createPinia())
  const auth = useAuthStore()
  auth.user = {
    id: 'user-1',
    email: 'you@example.com',
    display_name: '周丹',
    status: 'active',
    role: 'user',
    created_at: '2026-10-01T00:00:00Z',
    last_login_at: null,
  }

  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/knowledge', name: 'knowledge', component: { template: '<div />' } },
      { path: '/:pathMatch(.*)*', name: 'fallback', component: { template: '<div />' } },
    ],
  })
  await router.push(path)
  await router.isReady()

  const wrapper = mount(KnowledgeView, {
    global: {
      plugins: [router],
      stubs: {
        UploadDialog: true,
        SearchDebugPanel: true,
        DocumentDetailDrawer: DetailStub,
      },
    },
  })
  await flushPromises()
  return wrapper
}

describe('KnowledgeView M4', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.documents.mockResolvedValue(page([doc('a'), doc('b', { status: 'failed' })]))
  })

  it('首屏按 limit=20 拉取并渲染 6 键统计', async () => {
    const wrapper = await mountView()

    expect(api.documents).toHaveBeenCalledWith({ limit: 20 })
    const values = wrapper.findAll('[data-testid="knowledge-stats"] .value').map((item) => item.text())
    expect(values).toEqual(['4', '52', '2', '1', '0', '1'])
    expect(wrapper.findAll('[data-testid="doc-row"]')).toHaveLength(2)
  })

  it('切换状态筛选后带 status 重新请求', async () => {
    const wrapper = await mountView()
    await wrapper.find('[data-testid="status-filter"]').setValue('failed')
    await flushPromises()

    expect(api.documents).toHaveBeenLastCalledWith({ limit: 20, status: 'failed' })
  })

  it('document_id 深链打开详情抽屉', async () => {
    api.get.mockResolvedValue(doc('cited'))
    const wrapper = await mountView('/knowledge?document_id=cited')

    expect(api.get).toHaveBeenCalledWith('cited')
    expect(wrapper.find('[data-testid="detail-stub"]').attributes('data-open')).toBe('true')
  })

  it('引用文档已删除时回退为按标题搜索', async () => {
    api.get.mockRejectedValue(new ApiRequestError('知识库文档不存在', { code: 'not_found', status: 404 }))
    const wrapper = await mountView('/knowledge?document_id=gone&q=退款政策')

    const input = wrapper.find('[data-testid="doc-search"]').element as HTMLInputElement
    expect(input.value).toBe('退款政策')
    expect(wrapper.find('[data-testid="detail-stub"]').attributes('data-open')).toBe('false')
  })

  it('能力未启用时显示门控说明而不是空列表', async () => {
    api.documents.mockRejectedValue(
      new ApiRequestError('知识库能力未启用', { code: 'capability_disabled', status: 403 }),
    )
    const wrapper = await mountView()

    expect(wrapper.find('[data-testid="knowledge-gate"]').text()).toContain('知识库')
    expect(wrapper.find('[data-testid="doc-row"]').exists()).toBe(false)
  })

  it('普通用户看不到全量重建入口', async () => {
    const wrapper = await mountView()
    expect(wrapper.find('[data-testid="knowledge-rebuild"]').exists()).toBe(false)
  })
})
