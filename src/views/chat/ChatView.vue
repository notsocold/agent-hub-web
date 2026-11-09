<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'

import ChatComposer from '@/components/chat/ChatComposer.vue'
import ConversationSidebar from '@/components/chat/ConversationSidebar.vue'
import MessageList from '@/components/chat/MessageList.vue'
import RunTraceDrawer from '@/components/chat/RunTraceDrawer.vue'
import { useChatStore } from '@/stores/chat'
import { useConversationsStore } from '@/stores/conversations'
import { useSystemStore } from '@/stores/system'
import type { ChatContextSelection, ReasoningEffortId } from '@/types'

const route = useRoute()
const router = useRouter()
const chat = useChatStore()
const conversations = useConversationsStore()
const system = useSystemStore()

const traceOpen = ref(false)
const model = ref('')
const reasoningEffort = ref<ReasoningEffortId>('low')

const suggestions = [
  '整理本周客服工单，生成一份团队周报',
  '查一下退款政策变更会影响哪些话术',
  '把这段 release notes 翻成英文',
]

const activeId = computed(() => (typeof route.query.c === 'string' ? route.query.c : undefined))
const activeConversation = computed(
  () => conversations.items.find((item) => item.id === activeId.value) ?? null,
)
const title = computed(
  () => chat.state.conversationTitle || activeConversation.value?.title || '新对话',
)
const isEmpty = computed(() => !activeId.value && chat.state.messages.length === 0)

const status = computed(() => {
  if (chat.state.pendingApprovalId) return { label: '待审批', tone: 'warn' }
  if (chat.state.streaming) return { label: '生成中', tone: 'live' }
  if (chat.state.error) return { label: '出错', tone: 'error' }
  return { label: '就绪', tone: 'ok' }
})

const subtitle = computed(() => {
  const parts: string[] = []
  const modelOption = system.models.find((item) => item.id === model.value)
  if (modelOption) parts.push(modelOption.name)
  parts.push(`${chat.state.messages.length} 条消息`)
  return parts.join(' · ')
})

async function loadConversation(id: string): Promise<void> {
  try {
    await chat.loadConversation(id)
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '加载会话失败')
  }
}

onMounted(async () => {
  void conversations.load()
  void system.load()
  model.value = system.defaultModel
  reasoningEffort.value = system.defaultReasoningEffort
  if (activeId.value) await loadConversation(activeId.value)
})

watch(
  () => system.defaultModel,
  (value) => {
    if (!model.value) model.value = value
  },
)

watch(
  () => system.defaultReasoningEffort,
  (value) => {
    reasoningEffort.value = value
  },
)

watch(
  () => route.query.c,
  (value) => {
    if (typeof value !== 'string') {
      if (!chat.state.streaming) chat.reset()
      return
    }
    if (value === chat.state.conversationId) return
    if (chat.state.streaming) return
    void loadConversation(value)
  },
)

watch(
  () => chat.state.conversationId,
  (id) => {
    if (!id || id === activeId.value) return
    void router.replace({ query: { ...route.query, c: id } })
  },
)

watch(
  () => chat.state.streaming,
  (streaming, previous) => {
    if (previous === true && !streaming) {
      void conversations.load()
    }
  },
)

function selectConversation(id: string): void {
  if (chat.state.streaming) chat.stop()
  void router.replace({ query: { ...route.query, c: id } })
}

function handleRemoved(id: string): void {
  if (id !== activeId.value) return
  if (chat.state.streaming) chat.stop()
  chat.reset()
  void router.replace({ query: {} })
}

function handleSend(payload: { text: string; context: ChatContextSelection }): void {
  void chat.send(payload.text, payload.context)
}

function useSuggestion(text: string): void {
  void chat.send(text)
}

async function handleApproval(approve: boolean): Promise<void> {
  try {
    await chat.resolveApproval(approve)
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '审批失败，请稍后重试')
  }
}
</script>

<template>
  <div class="chat-view">
    <div class="chat-sidebar">
      <ConversationSidebar
        :active-id="activeId"
        @select="selectConversation"
        @removed="handleRemoved"
      />
    </div>

    <section class="chat-main">
      <header class="chat-head">
        <div class="chat-heading">
          <h1>{{ title }}</h1>
          <p class="chat-sub">{{ subtitle }}</p>
        </div>
        <div class="chat-actions">
          <span class="status-chip" :class="`tone-${status.tone}`">
            <span class="dot"></span>
            {{ status.label }}
          </span>
          <button type="button" class="trace-btn" @click="traceOpen = true">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
              <path d="M15 4.5v15" />
            </svg>
            运行详情
          </button>
        </div>
      </header>

      <MessageList
        v-if="!isEmpty"
        :messages="chat.messages"
        :process="chat.processItems"
        :streaming="chat.state.streaming"
        :loading="chat.loadingHistory"
        :resolving-approval="chat.resolvingApproval"
        @approve="handleApproval(true)"
        @reject="handleApproval(false)"
      />

      <div v-else class="welcome">
        <p class="eyebrow mono">DISPATCH DESK</p>
        <h2>今天要调度什么？</h2>
        <p class="lede">
          描述任务，主智能体会按需调用技能、工具与远程 Agent；外部写操作会先请你审批。
        </p>
        <div class="suggestions">
          <button
            v-for="suggestion in suggestions"
            :key="suggestion"
            type="button"
            class="suggestion"
            @click="useSuggestion(suggestion)"
          >
            {{ suggestion }}
          </button>
        </div>
      </div>

      <ChatComposer
        :streaming="chat.state.streaming"
        :model="model"
        :reasoning-effort="reasoningEffort"
        :models="system.models"
        :reasoning-efforts="system.reasoningEfforts"
        :max-chars="system.limits.message_max_chars"
        @send="handleSend"
        @stop="chat.stop()"
        @update:model="model = $event"
        @update:reasoning-effort="reasoningEffort = $event"
      />
    </section>

    <RunTraceDrawer
      :open="traceOpen"
      :items="chat.processItems"
      :run-id="chat.state.runId"
      :streaming="chat.state.streaming"
      :usage="chat.state.usage"
      :finish-reason="chat.state.finishReason"
      :conversation-title="title"
      @close="traceOpen = false"
    />
  </div>
</template>

<style scoped>
.chat-view {
  display: grid;
  grid-template-columns: 272px minmax(0, 1fr);
  height: 100%;
  min-height: 0;
}

.chat-sidebar {
  min-width: 0;
  min-height: 0;
}

.chat-main {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  background: var(--paper);
}

.chat-head {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  min-height: 68px;
  padding: 0 32px;
  border-bottom: 1px solid var(--line);
}

.chat-heading {
  flex: 1;
  min-width: 0;
}

.chat-heading h1 {
  overflow: hidden;
  font-size: 17px;
  font-weight: 650;
  letter-spacing: -0.012em;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chat-sub {
  margin-top: 3px;
  overflow: hidden;
  color: var(--ink-3);
  font-size: 11.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chat-actions {
  display: flex;
  flex: none;
  align-items: center;
  gap: 8px;
}

.status-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 26px;
  padding: 0 9px;
  border: 1px solid var(--line);
  border-radius: 5px;
  background: var(--surface);
  color: var(--ink-2);
  font-size: 10.5px;
  white-space: nowrap;
}

.status-chip .dot {
  width: 5px;
  height: 5px;
}

.status-chip.tone-live .dot {
  background: var(--amber);
  animation: pulse 1.6s ease-in-out infinite;
}

.status-chip.tone-warn .dot {
  background: var(--amber);
}

.status-chip.tone-ok .dot {
  background: var(--green);
}

.status-chip.tone-error .dot {
  background: var(--red);
}

.trace-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 26px;
  padding: 0 9px;
  border: 1px solid var(--line);
  border-radius: 5px;
  color: var(--ink-2);
  font-size: 10.5px;
  white-space: nowrap;
}

.trace-btn:hover {
  border-color: var(--ink-3);
  color: var(--ink);
}

.trace-btn svg {
  width: 13px;
  height: 13px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.welcome {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 0;
  padding: 32px;
  text-align: center;
}

.eyebrow {
  margin-bottom: 14px;
  color: var(--amber-text);
  font-size: 10px;
  letter-spacing: 0.16em;
}

.welcome h2 {
  font-size: clamp(26px, 3vw, 34px);
  font-weight: 650;
  letter-spacing: -0.03em;
}

.lede {
  max-width: 520px;
  margin-top: 12px;
  color: var(--ink-3);
  font-size: 13px;
  line-height: 1.75;
}

.suggestions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
  max-width: 620px;
  margin-top: 26px;
}

.suggestion {
  padding: 8px 13px;
  border: 1px solid var(--line);
  border-radius: 99px;
  background: var(--surface);
  color: var(--ink-2);
  font-size: 12px;
  box-shadow: var(--shadow-sm);
  transition:
    border-color 0.15s,
    color 0.15s;
}

.suggestion:hover {
  border-color: var(--ink-3);
  color: var(--ink);
}

@media (max-width: 900px) {
  .chat-view {
    grid-template-columns: minmax(0, 1fr);
  }

  .chat-sidebar {
    display: none;
  }

  .chat-head {
    min-height: 56px;
    padding: 0 16px;
  }
}
</style>
