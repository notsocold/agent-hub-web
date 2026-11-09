import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { conversationsApi } from '@/api/conversations'
import { useConversationsStore } from '@/stores/conversations'
import type { Conversation } from '@/types'

vi.mock('@/api/conversations', () => ({
  conversationsApi: {
    list: vi.fn(),
    create: vi.fn(),
    get: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    messages: vi.fn(),
  },
}))

function conversation(id: string, patch: Partial<Conversation> = {}): Conversation {
  return {
    id,
    title: `会话 ${id}`,
    status: 'active',
    message_count: 2,
    last_message_preview: '预览',
    last_message_at: new Date().toISOString(),
    pending_approval_count: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...patch,
  }
}

describe('conversations store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('load 写入列表与统计，并按日期分组', async () => {
    const today = conversation('today', { last_message_at: new Date().toISOString() })
    const yesterday = conversation('yesterday', {
      last_message_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    })
    const earlier = conversation('earlier', {
      last_message_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    })
    vi.mocked(conversationsApi.list).mockResolvedValue({
      items: [today, yesterday, earlier],
      next_cursor: null,
      has_more: false,
      stats: { total: 3, pending_approval: 1 },
    })

    const store = useConversationsStore()
    await store.load()

    expect(store.items).toHaveLength(3)
    expect(store.pendingCount).toBe(1)
    expect(store.groups.map((group) => group.label)).toEqual(['今天', '昨天', '更早'])
  })

  it('search 把关键字传给接口并替换列表', async () => {
    vi.mocked(conversationsApi.list).mockResolvedValue({
      items: [conversation('weekly', { title: 'Q3 客服工单周报' })],
      next_cursor: null,
      has_more: false,
      stats: { total: 1 },
    })

    const store = useConversationsStore()
    await store.search('周报')

    expect(conversationsApi.list).toHaveBeenCalledWith(
      expect.objectContaining({ q: '周报', status: 'all' }),
    )
    expect(store.items).toHaveLength(1)
    expect(store.q).toBe('周报')
  })

  it('archive 更新本地会话状态', async () => {
    vi.mocked(conversationsApi.list).mockResolvedValue({
      items: [conversation('a')],
      next_cursor: null,
      has_more: false,
    })
    vi.mocked(conversationsApi.update).mockResolvedValue(
      conversation('a', { status: 'archived' }),
    )

    const store = useConversationsStore()
    await store.load()
    await store.archive('a')

    expect(conversationsApi.update).toHaveBeenCalledWith('a', { status: 'archived' })
    expect(store.items[0]?.status).toBe('archived')
  })

  it('remove 成功后从列表移除', async () => {
    vi.mocked(conversationsApi.list).mockResolvedValue({
      items: [conversation('a'), conversation('b')],
      next_cursor: null,
      has_more: false,
    })
    vi.mocked(conversationsApi.remove).mockResolvedValue()

    const store = useConversationsStore()
    await store.load()
    await store.remove('a')

    expect(store.items.map((item) => item.id)).toEqual(['b'])
  })
})
