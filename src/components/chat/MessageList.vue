<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { VList } from 'virtua/vue'

import MessageBubble from './MessageBubble.vue'
import ProcessTimeline from './ProcessTimeline.vue'
import { buildMessageRows } from '@/utils/messageRows'
import type { ChatMessageView, ProcessItem } from '@/types'

const props = defineProps<{
  messages: ChatMessageView[]
  process: ProcessItem[]
  streaming: boolean
  loading: boolean
  resolvingApproval: boolean
  /** M5：正在处理的审批 id，用于多审批时只禁用对应卡片。 */
  resolvingApprovalId?: string | null
  hasMore?: boolean
  loadingOlder?: boolean
  /** 当前 run，用于把「执行过程」锚定到本轮的 assistant 消息之前。 */
  currentRunId?: string | null
  /** 会话切换时重置贴底状态并滚到最新消息。 */
  conversationId?: string | null
}>()

const emit = defineEmits<{
  approve: [id: string]
  reject: [id: string]
  loadOlder: []
}>()

const listRef = ref<InstanceType<typeof VList> | null>(null)
const pinned = ref(true)
let resizeRaf: number | null = null

const rows = computed(() =>
  buildMessageRows(props.messages, props.process, props.currentRunId ?? null),
)

function canScroll(): boolean {
  return rows.value.length > 0
}

function scrollToBottom(smooth = false): void {
  const list = listRef.value
  if (!list || !canScroll()) return
  list.scrollToIndex(rows.value.length - 1, { align: 'end', smooth })
  pinned.value = true
}

function scrollToMessage(id: string): boolean {
  const list = listRef.value
  const index = rows.value.findIndex((row) => row.id === id)
  if (!list || index < 0) return false
  list.scrollToIndex(index, { align: 'center' })
  return true
}

/** F1：消息密度等外部变化导致行高变化时，让虚拟列表重测并保持贴底。 */
function refresh(): void {
  pinned.value = true
  void nextTick(() => scrollToBottom())
}

function onScroll(offset: number): void {
  const list = listRef.value
  if (!list) return
  pinned.value = list.scrollSize - offset - list.viewportSize < 80
}

function onResize(): void {
  // 流式消息会持续增高：同一帧只贴底一次，避免 ResizeObserver 连环触发。
  if (!pinned.value || resizeRaf != null) return
  resizeRaf = window.requestAnimationFrame(() => {
    resizeRaf = null
    scrollToBottom()
  })
}

watch(
  () => props.conversationId,
  () => {
    pinned.value = true
    void nextTick(() => scrollToBottom())
  },
)

// 追加新消息（发送、流式首包）且仍贴底时，保持贴底；加载更早只在头部插入，不触发。
watch(
  () => rows.value.at(-1)?.id,
  (next, previous) => {
    if (next && next !== previous && pinned.value) {
      void nextTick(() => scrollToBottom())
    }
  },
)

defineExpose({ scrollToBottom, scrollToMessage, refresh })
</script>

<template>
  <div class="message-shell">
    <div v-if="hasMore" class="older-bar">
      <button type="button" class="load-older" :disabled="loadingOlder" @click="emit('loadOlder')">
        {{ loadingOlder ? '正在加载更早消息…' : '加载更早消息' }}
      </button>
    </div>

    <p v-if="loading && rows.length === 0" class="loading" role="status">正在加载历史消息…</p>

    <div class="list-wrap">
      <VList
        v-if="rows.length > 0"
        ref="listRef"
        class="message-list"
        :data="rows"
        :shift="true"
        @scroll="onScroll"
        @resize="onResize"
      >
        <template #default="{ item }">
          <div :key="item.id" class="message-row">
            <ProcessTimeline
              v-if="item.kind === 'process'"
              :items="process"
              :busy="resolvingApproval"
              :resolving-approval-id="resolvingApprovalId ?? null"
              @approve="emit('approve', $event)"
              @reject="emit('reject', $event)"
            />
            <MessageBubble v-else :message="item.message" />
          </div>
        </template>
      </VList>
    </div>

    <button
      v-if="!pinned && rows.length > 0"
      type="button"
      class="jump"
      aria-label="回到底部"
      @click="scrollToBottom(true)"
    >
      回到底部
    </button>
  </div>
</template>

<style scoped>
.message-shell {
  position: relative;
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
}

.message-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.list-wrap {
  position: relative;
  display: flex;
  flex: 1;
  min-height: 0;
}

.message-row {
  width: min(100%, calc(var(--content-max) + 64px));
  margin: 0 auto;
  padding: 6px 32px 0;
}

.older-bar {
  display: flex;
  flex: none;
  justify-content: center;
  padding: 8px 0 0;
}

.load-older {
  padding: 5px 12px;
  border: 1px solid var(--line);
  border-radius: 99px;
  background: var(--surface);
  color: var(--ink-3);
  font-size: 11px;
}

.load-older:hover:not(:disabled) {
  border-color: var(--ink-3);
  color: var(--ink);
}

.load-older:disabled {
  cursor: wait;
  opacity: 0.7;
}

.loading {
  padding: 20px 0;
  color: var(--ink-3);
  font-size: 12px;
  text-align: center;
}

.jump {
  position: absolute;
  bottom: 14px;
  left: 50%;
  z-index: 5;
  padding: 6px 14px;
  border: 1px solid var(--line);
  border-radius: 99px;
  background: var(--surface);
  color: var(--ink-2);
  font-size: 11.5px;
  box-shadow: var(--shadow-md);
  transform: translateX(-50%);
}

.jump:hover {
  color: var(--ink);
}

@media (max-width: 900px) {
  .message-row {
    padding: 6px 16px 0;
  }
}
</style>
