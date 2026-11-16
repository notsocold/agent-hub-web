import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import { conversationsApi } from '@/api/conversations'
import type { Conversation } from '@/types'

export interface ConversationGroup {
  label: string
  items: Conversation[]
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '加载会话失败'
}

/** 侧栏单页条数；refresh 用它作为最小刷新范围。 */
const PAGE_SIZE = 30
/** 后端 /conversations 允许的单页上限。 */
const MAX_PAGE_SIZE = 100

export const useConversationsStore = defineStore('conversations', () => {
  const items = ref<Conversation[]>([])
  const stats = ref<Record<string, number>>({})
  const loading = ref(false)
  const hasMore = ref(false)
  const nextCursor = ref<string | null>(null)
  const q = ref('')
  const status = ref<'all' | 'active' | 'archived'>('all')
  const error = ref<string | null>(null)

  const pendingCount = computed(
    () =>
      stats.value.pending_approval ??
      items.value.reduce((sum, item) => sum + item.pending_approval_count, 0),
  )

  const groups = computed<ConversationGroup[]>(() => {
    const today: Conversation[] = []
    const yesterday: Conversation[] = []
    const earlier: Conversation[] = []
    const now = new Date()
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
    const startOfYesterday = startOfToday - 24 * 60 * 60 * 1000

    for (const conversation of items.value) {
      const timestamp = Date.parse(conversation.last_message_at ?? conversation.created_at)
      if (!Number.isFinite(timestamp)) {
        earlier.push(conversation)
      } else if (timestamp >= startOfToday) {
        today.push(conversation)
      } else if (timestamp >= startOfYesterday) {
        yesterday.push(conversation)
      } else {
        earlier.push(conversation)
      }
    }

    return [
      { label: '今天', items: today },
      { label: '昨天', items: yesterday },
      { label: '更早', items: earlier },
    ].filter((group) => group.items.length > 0)
  })

  function replace(conversation: Conversation): void {
    const index = items.value.findIndex((item) => item.id === conversation.id)
    if (index >= 0) {
      items.value[index] = conversation
    } else {
      items.value.unshift(conversation)
    }
  }

  async function load(reset = true): Promise<void> {
    if (loading.value) return
    loading.value = true
    error.value = null
    try {
      const page = await conversationsApi.list({
        q: q.value.trim() || undefined,
        status: status.value,
        limit: PAGE_SIZE,
        cursor: reset ? undefined : (nextCursor.value ?? undefined),
      })
      items.value = reset ? page.items : [...items.value, ...page.items]
      stats.value = page.stats ?? {}
      hasMore.value = page.has_more
      nextCursor.value = page.next_cursor
    } catch (cause) {
      error.value = errorMessage(cause)
    } finally {
      loading.value = false
    }
  }

  async function search(keyword: string): Promise<void> {
    q.value = keyword
    await load(true)
  }

  /**
   * 刷新当前已加载范围，保留「加载更多」翻过的页。
   * 对话结束/重开会话时用它代替 load()，避免侧栏被重置成第一页导致之前看到的
   * 会话「消失」；后端已删除的条目会自然移除，本地刚建的空会话仍保留在顶部。
   */
  async function refresh(): Promise<void> {
    if (loading.value) return
    const target = Math.max(items.value.length, PAGE_SIZE)
    loading.value = true
    error.value = null
    try {
      const collected: Conversation[] = []
      let page = await conversationsApi.list({
        q: q.value.trim() || undefined,
        status: status.value,
        limit: Math.min(MAX_PAGE_SIZE, target),
      })
      collected.push(...page.items)
      while (collected.length < target && page.has_more && page.next_cursor) {
        page = await conversationsApi.list({
          q: q.value.trim() || undefined,
          status: status.value,
          limit: Math.min(MAX_PAGE_SIZE, target - collected.length),
          cursor: page.next_cursor,
        })
        collected.push(...page.items)
      }
      const known = new Set(collected.map((item) => item.id))
      const localOnly = items.value.filter(
        (item) => !known.has(item.id) && item.message_count === 0,
      )
      items.value = [...localOnly, ...collected]
      stats.value = page.stats ?? {}
      hasMore.value = page.has_more
      nextCursor.value = page.next_cursor
    } catch (cause) {
      error.value = errorMessage(cause)
    } finally {
      loading.value = false
    }
  }

  async function setStatus(next: 'all' | 'active' | 'archived'): Promise<void> {
    status.value = next
    await load(true)
  }

  async function create(): Promise<Conversation> {
    const conversation = await conversationsApi.create()
    items.value.unshift(conversation)
    return conversation
  }

  async function rename(id: string, title: string): Promise<void> {
    const updated = await conversationsApi.update(id, { title })
    replace(updated)
  }

  async function archive(id: string): Promise<void> {
    const updated = await conversationsApi.update(id, { status: 'archived' })
    replace(updated)
  }

  async function restore(id: string): Promise<void> {
    const updated = await conversationsApi.update(id, { status: 'active' })
    replace(updated)
  }

  async function remove(id: string): Promise<void> {
    await conversationsApi.remove(id)
    items.value = items.value.filter((item) => item.id !== id)
  }

  function touch(id: string, patch: Partial<Conversation>): void {
    const conversation = items.value.find((item) => item.id === id)
    if (!conversation) return
    Object.assign(conversation, patch)
  }

  return {
    items,
    stats,
    loading,
    hasMore,
    nextCursor,
    q,
    status,
    error,
    pendingCount,
    groups,
    load,
    refresh,
    search,
    setStatus,
    create,
    rename,
    archive,
    restore,
    remove,
    replace,
    touch,
  }
})
