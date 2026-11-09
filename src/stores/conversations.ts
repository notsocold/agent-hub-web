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
    () => stats.value.pending_approval ?? items.value.reduce((sum, item) => sum + item.pending_approval_count, 0),
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
        limit: 30,
        cursor: reset ? undefined : nextCursor.value ?? undefined,
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
