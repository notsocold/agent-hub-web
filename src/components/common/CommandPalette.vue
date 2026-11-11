<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import EmptyState from '@/components/common/EmptyState.vue'
import ErrorState from '@/components/common/ErrorState.vue'
import LoadingSkeleton from '@/components/common/LoadingSkeleton.vue'
import { ApiRequestError } from '@/api/client'
import { conversationsApi } from '@/api/conversations'
import { useChatStore } from '@/stores/chat'
import { filterPalettePages, matchMessages, type PalettePage } from '@/utils/commandPalette'
import type { Conversation, SystemCapabilities } from '@/types'

const props = defineProps<{
  open: boolean
  capabilities?: SystemCapabilities | null
}>()

const emit = defineEmits<{ close: [] }>()

const route = useRoute()
const router = useRouter()
const chat = useChatStore()

const inputRef = ref<HTMLInputElement | null>(null)
const query = ref('')
const activeIndex = ref(0)
const conversations = ref<Conversation[]>([])
const conversationLoading = ref(false)
const conversationError = ref<string | null>(null)
const conversationErrorCode = ref<string | null>(null)
const conversationErrorRequestId = ref<string | null>(null)

let debounceTimer: ReturnType<typeof setTimeout> | null = null
let searchSeq = 0
let lastFocused: HTMLElement | null = null

interface PaletteItem {
  id: string
  group: 'page' | 'conversation' | 'message'
  label: string
  hint?: string
  run: () => void
}

const hasQuery = computed(() => query.value.trim().length > 0)

const messages = computed(() => {
  if (route.name !== 'chat' || !chat.state.conversationId) return []
  return matchMessages(chat.messages, query.value)
})

/** 结果项展示命中关键词附近的片段，而不是固定截取开头（关键词常常不在开头）。 */
function messageSnippet(content: string, keyword: string): string {
  const compact = (text: string): string => text.replace(/\s+/g, ' ').trim()
  const index = keyword ? content.toLowerCase().indexOf(keyword.toLowerCase()) : -1
  if (index < 0) return compact(content).slice(0, 60)
  const start = Math.max(0, index - 18)
  const end = Math.min(content.length, index + 42)
  return `${start > 0 ? '…' : ''}${compact(content.slice(start, end))}${end < content.length ? '…' : ''}`
}

const items = computed<PaletteItem[]>(() => {
  const list: PaletteItem[] = []
  for (const page of filterPalettePages(query.value, props.capabilities)) {
    list.push({
      id: `page-${page.id}`,
      group: 'page',
      label: page.label,
      hint: page.description,
      run: () => goPage(page),
    })
  }
  for (const conversation of conversations.value) {
    list.push({
      id: `conversation-${conversation.id}`,
      group: 'conversation',
      label: conversation.title,
      hint: `${conversation.message_count} 条消息`,
      run: () => goConversation(conversation.id),
    })
  }
  for (const message of messages.value) {
    list.push({
      id: `message-${message.id}`,
      group: 'message',
      label: messageSnippet(message.content, query.value.trim()),
      hint: message.role === 'user' ? '我' : '助手',
      run: () => goMessage(message.id),
    })
  }
  return list
})

const groups = computed(() => {
  const order: Array<{ key: PaletteItem['group']; label: string }> = [
    { key: 'page', label: '页面' },
    { key: 'conversation', label: '会话' },
    { key: 'message', label: '当前会话消息' },
  ]
  let cursor = 0
  return order
    .map(({ key, label }) => {
      const rows = items.value
        .filter((item) => item.group === key)
        .map((item) => ({ item, index: cursor++ }))
      return { key, label, rows }
    })
    .filter((group) => group.rows.length > 0)
})

const activeItemId = computed(() => items.value[activeIndex.value]?.id ?? null)
const showEmpty = computed(
  () => hasQuery.value && !conversationLoading.value && !conversationError.value && !items.value.length,
)

watch(items, (list) => {
  if (activeIndex.value >= list.length) activeIndex.value = Math.max(0, list.length - 1)
})

watch(
  () => props.open,
  async (open) => {
    if (!open) {
      const target = lastFocused
      lastFocused = null
      if (target) void nextTick(() => target.focus())
      return
    }
    query.value = ''
    activeIndex.value = 0
    conversations.value = []
    conversationError.value = null
    conversationLoading.value = false
    conversationErrorCode.value = null
    conversationErrorRequestId.value = null
    lastFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
    await nextTick()
    inputRef.value?.focus()
  },
)

watch(query, (value) => {
  activeIndex.value = 0
  conversationError.value = null
  if (debounceTimer) {
    clearTimeout(debounceTimer)
    debounceTimer = null
  }
  const keyword = value.trim()
  if (!keyword) {
    searchSeq += 1
    conversations.value = []
    conversationLoading.value = false
    return
  }
  conversationLoading.value = true
  // 关键词变化立即丢弃旧结果：防抖窗口内按 Enter 不能打开不匹配的会话。
  conversations.value = []
  const seq = ++searchSeq
  debounceTimer = setTimeout(() => {
    debounceTimer = null
    void searchConversations(keyword, seq)
  }, 250)
})

async function searchConversations(keyword: string, seq: number): Promise<void> {
  try {
    const page = await conversationsApi.list({ q: keyword, status: 'active', limit: 8 })
    if (seq !== searchSeq) return
    conversations.value = page.items
  } catch (error) {
    if (seq !== searchSeq) return
    conversationError.value = error instanceof Error ? error.message : '会话搜索失败'
    conversationErrorCode.value = error instanceof ApiRequestError ? error.code : null
    conversationErrorRequestId.value = error instanceof ApiRequestError ? error.requestId : null
  } finally {
    if (seq === searchSeq) conversationLoading.value = false
  }
}

function close(): void {
  // 焦点恢复统一交给 open=false 的 watcher，覆盖 Esc / 点击 / Ctrl+K 再次触发。
  emit('close')
}

function move(step: number): void {
  const total = items.value.length
  if (total === 0) return
  activeIndex.value = (activeIndex.value + step + total) % total
  const id = activeItemId.value
  if (id) {
    void nextTick(() => {
      document.getElementById(`palette-item-${id}`)?.scrollIntoView({ block: 'nearest' })
    })
  }
}

function execute(): void {
  items.value[activeIndex.value]?.run()
}

function select(index: number): void {
  activeIndex.value = index
  execute()
}

function onInputKeydown(event: KeyboardEvent): void {
  // 中文输入法组合中（拼音候选）的回车/方向键/Escape 交给输入法。
  if (event.isComposing || event.keyCode === 229) return
  if (event.key === 'Escape') {
    event.preventDefault()
    close()
  } else if (event.key === 'ArrowDown') {
    event.preventDefault()
    move(1)
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    move(-1)
  } else if (event.key === 'Enter') {
    event.preventDefault()
    execute()
  }
}

function retrySearch(): void {
  const keyword = query.value.trim()
  if (!keyword) return
  conversationError.value = null
  conversationLoading.value = true
  void searchConversations(keyword, ++searchSeq)
}

function goPage(page: PalettePage): void {
  close()
  void router.push({ name: page.route })
}

function goConversation(id: string): void {
  close()
  if (chat.state.streaming) chat.stop()
  void router.push({ name: 'chat', query: { c: id } })
}

function goMessage(id: string): void {
  const conversationId = chat.state.conversationId
  close()
  if (!conversationId) return
  chat.requestScrollToMessage(id)
  void router.push({ name: 'chat', query: { c: conversationId } })
}

onBeforeUnmount(() => {
  if (debounceTimer) clearTimeout(debounceTimer)
  searchSeq += 1
})
</script>

<template>
  <div v-if="open" class="palette-backdrop" @click.self="close">
    <div
      class="palette"
      role="dialog"
      aria-modal="true"
      aria-label="全局搜索"
      @keydown.esc="close"
      @keydown.tab.prevent
    >
      <div class="palette-head">
        <svg class="search-icon" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="11" cy="11" r="6.5" />
          <path d="m16 16 4.5 4.5" />
        </svg>
        <input
          ref="inputRef"
          v-model="query"
          class="palette-input"
          type="text"
          role="combobox"
          aria-label="搜索页面、会话或当前会话消息"
          aria-autocomplete="list"
          aria-controls="palette-listbox"
          aria-expanded="true"
          :aria-activedescendant="activeItemId ? `palette-item-${activeItemId}` : undefined"
          placeholder="搜索页面、会话或当前会话消息…"
          @keydown="onInputKeydown"
        />
        <kbd class="esc-hint">Esc</kbd>
      </div>

      <LoadingSkeleton v-if="conversationLoading" variant="text" :count="3" />

      <ErrorState
        v-else-if="conversationError"
        :message="conversationError"
        :code="conversationErrorCode ?? undefined"
        :request-id="conversationErrorRequestId ?? undefined"
        class="palette-error"
        @retry="retrySearch"
      />

      <div
        id="palette-listbox"
        class="palette-list"
        role="listbox"
        aria-label="搜索结果"
        :aria-busy="conversationLoading"
      >
        <div v-for="group in groups" :key="group.key" role="group" :aria-label="group.label">
          <p class="group-label" aria-hidden="true">{{ group.label }}</p>
          <button
            v-for="row in group.rows"
            :id="`palette-item-${row.item.id}`"
            :key="row.item.id"
            type="button"
            role="option"
            tabindex="-1"
            class="palette-item"
            :class="{ 'is-active': row.index === activeIndex }"
            :aria-selected="row.index === activeIndex"
            @mouseenter="activeIndex = row.index"
            @click="select(row.index)"
          >
            <span class="item-label">{{ row.item.label }}</span>
            <span v-if="row.item.hint" class="item-hint">{{ row.item.hint }}</span>
          </button>
        </div>
      </div>

      <EmptyState
        v-if="showEmpty"
        size="sm"
        title="没有匹配结果"
        description="换个关键词，或确认对应页面是否已开放。"
      />

      <p class="palette-foot">
        <span><kbd>↑</kbd><kbd>↓</kbd> 选择</span>
        <span><kbd>Enter</kbd> 打开</span>
        <span><kbd>Esc</kbd> 关闭</span>
      </p>
    </div>
  </div>
</template>

<style scoped>
.palette-backdrop {
  position: fixed;
  inset: 0;
  z-index: 3000;
  display: flex;
  justify-content: center;
  padding: 12vh 16px 16px;
  background: rgba(20, 27, 32, 0.42);
}

.palette {
  display: flex;
  flex-direction: column;
  width: min(560px, 100%);
  max-height: 72vh;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--surface);
  box-shadow: var(--shadow-lg);
}

.palette-head {
  display: flex;
  flex: none;
  align-items: center;
  gap: 9px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--line-2);
}

.search-icon {
  flex: none;
  width: 15px;
  height: 15px;
  fill: none;
  stroke: var(--ink-3);
  stroke-width: 1.6;
  stroke-linecap: round;
}

.palette-input {
  flex: 1;
  min-width: 0;
  border: 0;
  background: transparent;
  color: var(--ink);
  font-size: 14px;
  outline: none;
}

/* 键盘聚焦时由全局 :focus-visible 提供焦点环；输入框本身不额外画内环。 */
.palette-input:focus-visible {
  outline: 2px solid var(--prussian);
  outline-offset: 2px;
  border-radius: 4px;
}

.palette-input::placeholder {
  color: var(--ink-3);
}

.esc-hint {
  flex: none;
  padding: 1px 6px;
  border: 1px solid var(--line);
  border-radius: 4px;
  color: var(--ink-3);
  font-family: var(--font-mono);
  font-size: 10px;
}

.palette-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 6px;
}

.group-label {
  padding: 8px 10px 4px;
  color: var(--ink-3);
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.04em;
}

.palette-item {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
  width: 100%;
  padding: 8px 10px;
  border-radius: 6px;
  color: var(--ink-2);
  font-size: 12.5px;
  text-align: left;
}

.palette-item.is-active {
  background: var(--prussian-soft);
  color: var(--ink);
}

.item-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.item-hint {
  flex: none;
  max-width: 45%;
  overflow: hidden;
  color: var(--ink-3);
  font-size: 10.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.palette-error {
  margin: 10px;
}

.palette-foot {
  display: flex;
  flex: none;
  gap: 14px;
  padding: 8px 14px;
  border-top: 1px solid var(--line-2);
  color: var(--ink-3);
  font-size: 10.5px;
}

.palette-foot kbd {
  padding: 0 4px;
  border: 1px solid var(--line);
  border-radius: 3px;
  font-family: var(--font-mono);
  font-size: 10px;
}
</style>
