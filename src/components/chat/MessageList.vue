<script setup lang="ts">
import { computed, ref } from 'vue'

import MessageBubble from './MessageBubble.vue'
import ProcessTimeline from './ProcessTimeline.vue'
import { useAutoScroll } from '@/composables/useAutoScroll'
import type { ChatMessageView, ProcessItem } from '@/types'

const props = defineProps<{
  messages: ChatMessageView[]
  process: ProcessItem[]
  streaming: boolean
  loading: boolean
  resolvingApproval: boolean
  hasMore?: boolean
  loadingOlder?: boolean
}>()

const emit = defineEmits<{
  approve: [id: string]
  reject: [id: string]
  loadOlder: []
}>()

const container = ref<HTMLElement | null>(null)

const lastAssistantId = computed(() => {
  for (let index = props.messages.length - 1; index >= 0; index -= 1) {
    const message = props.messages[index]
    if (message?.role === 'assistant') return message.id
  }
  return null
})

const { showJump, onScroll, scrollToBottom } = useAutoScroll(container, () => [
  props.messages.length,
  props.messages.at(-1)?.content.length ?? 0,
  props.streaming,
])
</script>

<template>
  <div ref="container" class="message-scroll" @scroll="onScroll">
    <div class="message-inner">
      <p v-if="loading" class="loading">正在加载历史消息…</p>

      <button
        v-if="hasMore && !loading"
        type="button"
        class="load-older"
        :disabled="loadingOlder"
        @click="emit('loadOlder')"
      >
        {{ loadingOlder ? '正在加载更早消息…' : '加载更早消息' }}
      </button>

      <div v-for="message in messages" :key="message.id" class="message-item">
        <ProcessTimeline
          v-if="message.id === lastAssistantId && process.length > 0"
          :items="process"
          :busy="resolvingApproval"
          @approve="emit('approve', $event)"
          @reject="emit('reject', $event)"
        />
        <MessageBubble :message="message" />
      </div>
    </div>

    <button
      v-if="showJump"
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
.message-scroll {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  scroll-behavior: auto;
}

.message-inner {
  width: min(100%, calc(var(--content-max) + 64px));
  margin: 0 auto;
  padding: 26px 32px 12px;
}

.message-item {
  width: 100%;
}

.loading {
  padding: 20px 0;
  color: var(--ink-3);
  font-size: 12px;
  text-align: center;
}

.load-older {
  display: block;
  margin: 0 auto 14px;
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

.jump {
  position: sticky;
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
</style>
