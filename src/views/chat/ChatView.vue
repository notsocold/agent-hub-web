<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'

import ChatComposer from '@/components/chat/ChatComposer.vue'
import AgentOutputDrawer from '@/components/chat/AgentOutputDrawer.vue'
import ConnectionBanner from '@/components/chat/ConnectionBanner.vue'
import MessageList from '@/components/chat/MessageList.vue'
import RunRecoveryBanner from '@/components/chat/RunRecoveryBanner.vue'
import RunTraceDrawer from '@/components/chat/RunTraceDrawer.vue'
import RunTracePanel from '@/components/chat/RunTracePanel.vue'
import ErrorState from '@/components/common/ErrorState.vue'
import { useMediaQuery } from '@/composables/useMediaQuery'
import { useCapabilitiesStore } from '@/stores/capabilities'
import { useChatStore } from '@/stores/chat'
import { useConversationsStore } from '@/stores/conversations'
import { useSystemStore } from '@/stores/system'
import type { A2aProcess, ApprovalProcess, ChatContextSelection, ReasoningEffortId } from '@/types'
import { withModelSelection } from '@/utils/chatSelection'

const route = useRoute()
const router = useRouter()
const chat = useChatStore()
const conversations = useConversationsStore()
const system = useSystemStore()
const capabilityCatalog = useCapabilitiesStore()

const traceOpen = ref(false)
const agentOutputOpen = ref(false)
const agentOutputId = ref<string | null>(null)
/** 原型：>1180px 运行轨迹常驻右栏，窄屏回退为抽屉。 */
const narrowTrace = useMediaQuery('(max-width: 1180px)')
const model = ref('')
const reasoningEffort = ref<ReasoningEffortId>('low')
const messageListRef = ref<InstanceType<typeof MessageList> | null>(null)

onUnmounted(() => {
  // 离开对话页只停前端重连，不取消后端 run（约定断线不取消）。
  if (chat.connection === 'reconnecting') chat.stopReconnect()
})

const suggestions = [
  '整理本周客服工单，生成一份团队周报',
  '查一下退款政策变更会影响哪些话术',
  '把这段 release notes 翻成英文',
]

const BLOCKED_LABELS: Record<string, string> = {
  workflows: '工作流',
  agents: '智能体',
  tasks: '任务',
  knowledge: '知识库',
}

const activeId = computed(() => (typeof route.query.c === 'string' ? route.query.c : undefined))
const activeConversation = computed(
  () => conversations.items.find((item) => item.id === activeId.value) ?? null,
)
const title = computed(
  () => chat.state.conversationTitle || activeConversation.value?.title || '新对话',
)
const isEmpty = computed(() => !activeId.value && chat.state.messages.length === 0)

const status = computed(() => {
  if (chat.pendingApprovals.length > 0) return { label: '待审批', tone: 'warn' }
  if (chat.state.recovery?.kind === 'run_interrupted') return { label: '待处理', tone: 'warn' }
  if (chat.state.recovery?.kind === 'approval_timeout') return { label: '已超时', tone: 'error' }
  if (chat.state.streaming) return { label: '生成中', tone: 'live' }
  if (chat.state.recovery?.kind === 'run_in_progress') return { label: '运行中', tone: 'live' }
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
  void system.load().then(() => {
    if (system.enabled('knowledge')) void capabilityCatalog.loadKnowledgeCategories()
  })
  void capabilityCatalog.load()
  model.value = system.defaultModel
  reasoningEffort.value = system.defaultReasoningEffort

  const blocked = route.query.blocked
  if (typeof blocked === 'string' && BLOCKED_LABELS[blocked]) {
    ElMessage.info(`${BLOCKED_LABELS[blocked]}能力当前关闭，将在后续里程碑开放。`)
    const nextQuery = { ...route.query }
    delete nextQuery.blocked
    void router.replace({ query: nextQuery })
  }

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

// F1：命令面板选中「当前会话消息」后，等历史加载完再定位；定位成功即清空。
watch(
  () => [chat.pendingScrollMessageId, chat.state.conversationId, chat.state.messages.length] as const,
  async ([pendingId, conversationId, messageCount]) => {
    if (!pendingId || !conversationId || messageCount === 0) return
    await nextTick()
    if (messageListRef.value?.scrollToMessage(pendingId)) chat.clearPendingScroll()
  },
  { immediate: true },
)

const modelSelection = computed(() => ({
  model: model.value,
  reasoningEffort: reasoningEffort.value,
  reasoningSupported: system.reasoningEfforts.length > 0,
}))

function handleSend(payload: { text: string; context: ChatContextSelection }): void {
  void chat.send(payload.text, withModelSelection(payload.context, modelSelection.value))
}

function useSuggestion(text: string): void {
  void chat.send(text, withModelSelection({}, modelSelection.value))
}

async function handleApproval(id: string, approve: boolean): Promise<void> {
  const outcome = await chat.resolveApprovalById(id, approve)
  switch (outcome.kind) {
    case 'resumed':
      ElMessage.success(outcome.message)
      break
    case 'waiting_others':
      ElMessage.info(outcome.message)
      break
    case 'run_ended':
    case 'not_resumed':
      ElMessage.warning(outcome.message)
      break
    case 'expired':
    case 'already_decided':
      ElMessage.info(outcome.message)
      break
    default:
      ElMessage.error(outcome.message)
  }
}

/** 审批只在对话内完成：定位到待审批卡（没有 pending 时定位最后一张审批结果卡）。 */
async function focusPendingApproval(): Promise<void> {
  const pending = chat.pendingApprovals[0]
  const fallback = [...chat.processItems]
    .reverse()
    .find((item): item is ApprovalProcess => item.kind === 'approval')
  const approvalId =
    pending?.approvalId ?? (fallback && 'approvalId' in fallback ? fallback.approvalId : null)

  async function locate(): Promise<boolean> {
    if (!approvalId) return false
    const card = document.querySelector<HTMLElement>(`[data-approval-id="${approvalId}"]`)
    if (!card) return false
    card.scrollIntoView({ behavior: 'smooth', block: 'center' })
    card.querySelector<HTMLButtonElement>('[data-approval-approve]')?.focus()
    return true
  }

  await nextTick()
  if (await locate()) return

  // 虚拟滚动下审批卡尚未渲染时，先滚到最近一条消息，让过程区进入视口后再定位。
  const last = chat.messages[chat.messages.length - 1]
  if (last) messageListRef.value?.scrollToMessage(last.id)
  await nextTick()
  await locate()
}

const agentOutputItem = computed<A2aProcess | null>(() => {
  const id = agentOutputId.value
  if (!id) return null
  const item = chat.processItems.find((entry) => entry.kind === 'a2a' && entry.id === id)
  return item?.kind === 'a2a' ? item : null
})

function openAgentOutput(item: A2aProcess): void {
  agentOutputId.value = item.id
  agentOutputOpen.value = true
}

watch(
  () => chat.state.conversationId,
  () => {
    agentOutputOpen.value = false
    agentOutputId.value = null
  },
)

watch(agentOutputItem, (item) => {
  if (!item) agentOutputOpen.value = false
})

function handleRecoveryStop(): void {
  void chat.stop()
}

function handleRecoveryRetry(): void {
  void chat.retry()
}

function handleRecoveryRefresh(): void {
  void chat.refresh()
}
</script>

<template>
  <div class="chat-view">
    <section class="chat-main">
      <header class="chat-head">
        <div class="chat-heading">
          <h1>{{ title }}</h1>
          <p class="chat-sub">{{ subtitle }}</p>
        </div>
        <div class="chat-actions">
          <button
            v-if="chat.pendingApprovals.length > 0"
            type="button"
            class="status-chip is-actionable"
            :class="`tone-${status.tone}`"
            @click="focusPendingApproval"
          >
            <span class="dot"></span>
            {{ status.label }}
          </button>
          <span v-else class="status-chip" :class="`tone-${status.tone}`">
            <span class="dot"></span>
            {{ status.label }}
          </span>
          <button v-if="narrowTrace" type="button" class="trace-btn" @click="traceOpen = true">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
              <path d="M15 4.5v15" />
            </svg>
            运行详情
          </button>
        </div>
      </header>

      <div v-if="chat.rateLimitActive" class="rate-limit" role="status" aria-live="polite">
        发送过于频繁，请 <strong>{{ chat.rateLimitRemaining }}</strong> 秒后重试。
      </div>

      <div v-if="chat.pendingApprovals.length > 0" class="pending-approvals" role="status">
        <span>
          有 <strong>{{ chat.pendingApprovals.length }}</strong> 项操作等待你在对话中审批，批准或拒绝后运行才会继续。
        </span>
        <button type="button" class="pending-link" @click="focusPendingApproval">定位审批卡</button>
      </div>

      <RunRecoveryBanner
        v-if="chat.recovery"
        :recovery="chat.recovery"
        :busy="chat.recoveryBusy"
        @stop="handleRecoveryStop"
        @retry="handleRecoveryRetry"
        @refresh="handleRecoveryRefresh"
        @focus-approval="focusPendingApproval"
      />

      <!-- 仅重连中显示；降级后由 RunRecoveryBanner 接管，避免双横幅。 -->
      <ConnectionBanner
        v-if="chat.connection === 'reconnecting'"
        :connection="chat.connection"
        :attempt="chat.reconnectAttempt"
        @stop="chat.stopReconnect()"
      />

      <ErrorState
        v-if="chat.state.error && !chat.state.streaming"
        class="chat-error"
        :message="chat.state.error.message"
        :code="chat.state.error.code"
        :request-id="chat.state.error.requestId"
        :retryable="chat.state.error.retryable !== false"
        @retry="chat.retry()"
      />

      <MessageList
        v-if="!isEmpty"
        ref="messageListRef"
        :messages="chat.messages"
        :process="chat.processItems"
        :streaming="chat.state.streaming"
        :loading="chat.loadingHistory"
        :resolving-approval="chat.resolvingApproval"
        :resolving-approval-id="chat.resolvingApprovalId"
        :has-more="chat.historyHasMore"
        :loading-older="chat.loadingOlder"
        :current-run-id="chat.state.runId"
        :conversation-id="chat.state.conversationId ?? activeId ?? null"
        @approve="handleApproval($event, true)"
        @reject="handleApproval($event, false)"
        @load-older="chat.loadOlder()"
        @open-output="openAgentOutput"
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
        :disabled="chat.rateLimitActive"
        :model="model"
        :reasoning-effort="reasoningEffort"
        :models="system.models"
        :reasoning-efforts="system.reasoningEfforts"
        :max-chars="system.limits.message_max_chars"
        :skills="capabilityCatalog.enabledSkills"
        :mcp-servers="capabilityCatalog.mcpServers"
        :mcp-tools="capabilityCatalog.mcpTools"
        :knowledge-categories="capabilityCatalog.knowledgeCategories"
        :tools-loading="capabilityCatalog.loadingTools"
        :limits="system.limits"
        :capabilities="system.capabilities"
        :conversation-id="chat.state.conversationId ?? activeId ?? null"
        @send="handleSend"
        @load-mcp-tools="capabilityCatalog.loadTools"
        @stop="chat.stop()"
        @update:model="model = $event"
        @update:reasoning-effort="reasoningEffort = $event"
      />
    </section>

    <aside v-if="!narrowTrace" class="chat-trace" aria-label="运行详情">
      <header class="chat-trace-head">
        <p class="eyebrow mono">TRACE</p>
        <h2>运行轨迹</h2>
      </header>
      <RunTracePanel
        :items="chat.processItems"
        :run-id="chat.state.runId"
        :streaming="chat.state.streaming"
        :usage="chat.state.usage"
        :finish-reason="chat.state.finishReason"
        :conversation-title="title"
      />
    </aside>

    <AgentOutputDrawer
      :open="agentOutputOpen"
      :item="agentOutputItem"
      @close="agentOutputOpen = false"
    />

    <RunTraceDrawer
      v-if="narrowTrace"
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
  grid-template-columns: minmax(0, 1fr) 280px;
  height: 100%;
  min-height: 0;
}

.chat-trace {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  border-left: 1px solid var(--line);
  background: var(--paper-2);
}

.chat-trace-head {
  flex: none;
  padding: 14px 16px 10px;
  border-bottom: 1px solid var(--line);
}

.chat-trace-head .eyebrow {
  margin-bottom: 3px;
  color: var(--amber-text);
  font-size: 9px;
  letter-spacing: 0.12em;
}

.chat-trace-head h2 {
  font-size: 14px;
  font-weight: 650;
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

.status-chip.is-actionable {
  cursor: pointer;
  font-family: inherit;
}

.status-chip.is-actionable:hover {
  border-color: var(--ink-3);
  color: var(--ink);
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

.rate-limit {
  flex: none;
  margin: 10px 32px 0;
  padding: 9px 12px;
  border: 1px solid var(--amber-soft);
  border-radius: 8px;
  background: var(--amber-soft);
  color: var(--amber-text);
  font-size: 11.5px;
}

.rate-limit strong {
  font-family: var(--font-mono);
  font-size: 12px;
}

.chat-error {
  flex: none;
  margin: 10px 32px 0;
}

.pending-approvals {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  flex: none;
  margin: 10px 32px 0;
  padding: 9px 12px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface-2);
  color: var(--ink-2);
  font-size: 11.5px;
}

.pending-approvals strong {
  color: var(--amber-text);
  font-family: var(--font-mono);
}

.pending-link {
  margin-left: auto;
  color: var(--prussian);
  font-size: 11.5px;
  font-weight: 600;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.pending-link:hover {
  color: var(--ink);
}

.btn {
  height: 28px;
  padding: 0 11px;
  border: 1px solid var(--line);
  border-radius: 5px;
  background: var(--surface);
  color: var(--ink-2);
  font-size: 11.5px;
}

.btn:hover:not(:disabled) {
  border-color: var(--ink-3);
  color: var(--ink);
}

.btn.primary {
  border-color: var(--prussian);
  background: var(--prussian);
  color: var(--surface);
}

.btn:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

@media (max-width: 1180px) {
  .chat-view {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 900px) {
  .chat-view {
    grid-template-columns: minmax(0, 1fr);
  }

  .chat-head {
    min-height: 56px;
    padding: 0 16px;
  }
}
</style>
