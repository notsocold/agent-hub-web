import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useAuthStore } from '@/stores/auth'
import { useCapabilitiesStore } from '@/stores/capabilities'
import type { KnowledgeDocument } from '@/types'

const api = vi.hoisted(() => ({ documents: vi.fn() }))
vi.mock('@/api/knowledge', () => ({ knowledgeApi: api }))

function knowledgeDocument(id: string, category: string): KnowledgeDocument {
  return {
    id,
    title: `文档 ${id}`,
    source_uri: `data/${id}.md`,
    category,
    status: 'ready',
    chunk_count: 1,
    size_bytes: 10,
    owner: null,
    error: null,
    created_at: '2026-11-01T00:00:00Z',
    updated_at: '2026-11-01T00:00:00Z',
  }
}

function page(items: KnowledgeDocument[]) {
  return {
    items,
    next_cursor: null,
    has_more: false,
    stats: { documents: items.length, chunks: 1, ready: items.length, indexing: 0, pending: 0, failed: 0 },
  }
}

function signIn(id: string): void {
  const auth = useAuthStore()
  auth.user = {
    id,
    email: `${id}@example.com`,
    display_name: id,
    status: 'active',
    role: 'user',
    created_at: '2026-11-01T00:00:00Z',
    last_login_at: null,
  }
}

describe('知识库分类候选缓存', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    api.documents.mockReset()
  })

  it('同一用户命中缓存，切换用户后重新拉取', async () => {
    signIn('user-a')
    api.documents.mockResolvedValue(page([knowledgeDocument('a', '售后')]))
    const store = useCapabilitiesStore()

    await store.loadKnowledgeCategories()
    await store.loadKnowledgeCategories()
    expect(api.documents).toHaveBeenCalledTimes(1)
    expect(store.knowledgeCategories).toEqual(['售后'])

    signIn('user-b')
    api.documents.mockResolvedValue(page([knowledgeDocument('b', '客服')]))
    await store.loadKnowledgeCategories()
    expect(api.documents).toHaveBeenCalledTimes(2)
    expect(store.knowledgeCategories).toEqual(['客服'])
  })

  it('invalidateKnowledgeCategories 后强制重新拉取并清空旧值', async () => {
    signIn('user-a')
    api.documents.mockResolvedValue(page([knowledgeDocument('a', '售后')]))
    const store = useCapabilitiesStore()
    await store.loadKnowledgeCategories()

    store.invalidateKnowledgeCategories()
    expect(store.knowledgeCategories).toEqual([])

    api.documents.mockResolvedValue(page([knowledgeDocument('a', '售后'), knowledgeDocument('b', '客服')]))
    await store.loadKnowledgeCategories()
    expect(api.documents).toHaveBeenCalledTimes(2)
    expect(store.knowledgeCategories).toEqual(['客服', '售后'])
  })
})
