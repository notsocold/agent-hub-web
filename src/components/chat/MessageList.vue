<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { VList } from 'virtua/vue'

import MessageBubble from './MessageBubble.vue'
import ProcessTimeline from './ProcessTimeline.vue'
import { buildMessageRows } from '@/utils/messageRows'
import type { A2aProcess, ChatMessageView, ProcessItem } from '@/types'

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
  'open-output': [item: A2aProcess]
}>()

const listRef = ref<InstanceType<typeof VList> | null>(null)
const pinned = ref(true)
let resizeRaf: number | null = null

/** 加载更早前的滚动快照；virtua 的 shift 只适用于纯头部增删，聊天是混合方向，用手动补偿。 */
let prependAnchor: { size: number; offset: number } | null = null

const rows = computed(() =>
  buildMessageRows(props.messages, props.process, props.currentRunId ?? null),
)

/** 本轮思考总时长：只统计当前 run 的消息，避免多轮历史累加。 */
const reasoningMs = computed(() => {
  const runId = props.currentRunId
  const relevant = runId
    ? props.messages.filter((message) => message.run_id === runId)
    : props.messages.slice(-1)
  return relevant.reduce((sum, message) => sum + (message.reasoning?.durationMs ?? 0), 0)
})

/** 最近一条助手消息：只用于判断状态节点，不读取正文。 */
const lastAssistant = computed<ChatMessageView | null>(() => {
  for (let index = props.messages.length - 1; index >= 0; index -= 1) {
    const message = props.messages[index]
    if (message?.role === 'assistant') return message
  }
  return null
})

/**
 * 本次挂载是否见过流式状态。
 * 打开历史会话时消息本身就是 completed / failed，不应误播报成本轮结果。
 */
const hasStreamed = ref(props.streaming)
watch(
  () => props.streaming,
  (streaming) => {
    if (streaming) hasStreamed.value = true
  },
)
watch(
  () => props.conversationId,
  () => {
    hasStreamed.value = props.streaming
  },
)

type LiveStatus = 'idle' | 'started' | 'completed' | 'failed' | 'waiting_approval'

/** 从消息/执行过程/流式标记推导当前状态节点；不依赖消息正文，因此逐字增量不会触发播报。 */
const liveStatus = computed<LiveStatus>(() => {
  if (props.process.some((item) => item.kind === 'approval' && item.status === 'waiting')) {
    return 'waiting_approval'
  }
  const assistant = lastAssistant.value
  if (!props.streaming && hasStreamed.value && assistant?.status === 'failed') return 'failed'
  if (props.streaming) return 'started'
  if (hasStreamed.value && assistant?.status === 'completed') return 'completed'
  return 'idle'
})

const LIVE_TEXT: Record<LiveStatus, string> = {
  idle: '',
  started: '助手开始回复',
  completed: '回复完成',
  failed: '生成失败',
  waiting_approval: '等待审批',
}

/** 同一状态 computed 返回相同字符串，相邻状态未变化时不会更新 DOM 或重复播报。 */
const liveText = computed(() => LIVE_TEXT[liveStatus.value])

function canScroll(): boolean {
  return rows.value.length > 0
}

function cancelResizeRaf(): void {
  if (resizeRaf != null) {
    window.cancelAnimationFrame(resizeRaf)
    resizeRaf = null
  }
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
  // 定位历史消息即离开贴底，并取消已排队的贴底，避免随后一次 resize 把视口拽回底部。
  pinned.value = false
  cancelResizeRaf()
  list.scrollToIndex(index, { align: 'center' })
  return true
}

function onScroll(offset: number): void {
  const list = listRef.value
  if (!list) return
  pinned.value = list.scrollSize - offset - list.viewportSize < 80
}

function onResize(): void {
  // 流式消息会持续增高：同一帧只贴底一次，且回调执行时再确认用户仍贴底。
  if (!pinned.value || resizeRaf != null) return
  resizeRaf = window.requestAnimationFrame(() => {
    resizeRaf = null
    if (pinned.value) scrollToBottom()
  })
}

function requestOlder(): void {
  const list = listRef.value
  if (list) prependAnchor = { size: list.scrollSize, offset: list.scrollOffset }
  emit('loadOlder')
}

function applyPrependCompensation(): void {
  const anchor = prependAnchor
  if (!anchor) return
  prependAnchor = null
  void nextTick(() => {
    window.requestAnimationFrame(() => {
      const list = listRef.value
      if (!list) return
      const delta = list.scrollSize - anchor.size
      if (delta > 0) list.scrollTo(anchor.offset + delta)
    })
  })
}

watch(
  () => props.messages.length,
  (next, previous) => {
    if (next > previous) applyPrependCompensation()
  },
)

watch(
  () => props.loadingOlder,
  (loading) => {
    // 已到最早一页时不会再有新消息，丢弃快照避免下次 append 误补偿。
    if (!loading) {
      window.setTimeout(() => {
        prependAnchor = null
      }, 0)
    }
  },
)

watch(
  () => props.conversationId,
  () => {
    prependAnchor = null
    pinned.value = true
    void nextTick(() => scrollToBottom())
  },
)

// 追加新消息且仍贴底时保持贴底；用户上滑后不打扰阅读。
watch(
  () => rows.value.at(-1)?.id,
  (next, previous) => {
    if (next && next !== previous && pinned.value) {
      void nextTick(() => scrollToBottom())
    }
  },
)

onBeforeUnmount(cancelResizeRaf)

defineExpose({ scrollToBottom, scrollToMessage })
</script>

<template>
  <div class="message-shell">
    <div v-if="hasMore" class="older-bar">
      <button type="button" class="load-older" :disabled="loadingOlder" @click="requestOlder">
        {{ loadingOlder ? '正在加载更早消息…' : '加载更早消息' }}
      </button>
    </div>

    <p v-if="loading && rows.length === 0" class="loading" role="status">正在加载历史消息…</p>

    <p class="sr-only" role="status" aria-live="polite" aria-atomic="true">{{ liveText }}</p>

    <div class="list-wrap">
      <VList
        v-if="rows.length > 0"
        ref="listRef"
        class="message-list"
        :data="rows"
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
              :reasoning-ms="reasoningMs"
              @approve="emit('approve', $event)"
              @reject="emit('reject', $event)"
              @open-output="emit('open-output', $event)"
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
