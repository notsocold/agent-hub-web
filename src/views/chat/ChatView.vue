<script setup lang="ts">
import { computed, inject, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'

import AppIcon from '@/components/common/AppIcon.vue'
import ChatComposer from '@/components/chat/ChatComposer.vue'
import AgentOutputDrawer from '@/components/chat/AgentOutputDrawer.vue'
import ConnectionBanner from '@/components/chat/ConnectionBanner.vue'
import MessageList from '@/components/chat/MessageList.vue'
import RunRecoveryBanner from '@/components/chat/RunRecoveryBanner.vue'
import RunTraceDrawer from '@/components/chat/RunTraceDrawer.vue'
import RunTracePanel from '@/components/chat/RunTracePanel.vue'
import ErrorState from '@/components/common/ErrorState.vue'
import { useMediaQuery } from '@/composables/useMediaQuery'
import { workflowsApi } from '@/api/workflows'
import { useCapabilitiesStore } from '@/stores/capabilities'
import { useChatStore } from '@/stores/chat'
import { useConversationsStore } from '@/stores/conversations'
import { useSystemStore } from '@/stores/system'
import type {
  A2aProcess,
  ApprovalProcess,
  ChatContextSelection,
  ReasoningEffortId,
  Workflow,
} from '@/types'
import { withModelSelection } from '@/utils/chatSelection'

const route = useRoute()
const router = useRouter()
const chat = useChatStore()
const conversations = useConversationsStore()
const system = useSystemStore()
const capabilityCatalog = useCapabilitiesStore()

const traceOpen = ref(false)
const traceCollapsed = ref(false)
const agentOutputOpen = ref(false)
const agentOutputId = ref<string | null>(null)
/** 原型：>1180px 运行轨迹常驻右栏，窄屏回退为抽屉。 */
const narrowTrace = useMediaQuery('(max-width: 1180px)')
const isMobile = useMediaQuery('(max-width: 900px)')
const sidebar = inject<{ open: () => void } | null>('appSidebar', null)
const palette = inject<{ open: () => void } | null>('appPalette', null)
const model = ref('')
const reasoningEffort = ref<ReasoningEffortId>('low')
const messageListRef = ref<InstanceType<typeof MessageList> | null>(null)

// M9 T6：输入栏工作流候选与 query 预选。
/** enabled 模板候选（系统 + 本人第一页），capabilities.workflows 开启时加载。 */
const workflowOptions = ref<Workflow[]>([])
/** 从 route.query 预选并经详情接口校验的工作流模板；注入输入栏后由其接管。 */
const seedWorkflow = ref<Workflow | null>(null)
/** 已处理过的 query workflow_id，避免同一 id 重复预选。 */
const seededWorkflowIds = new Set<string>()

onUnmounted(() => {
  // 离开对话页只停前端重连，不取消后端 run（约定断线不取消）。
  if (chat.connection === 'reconnecting') chat.stopReconnect()
})

const chipTone = computed(() => {
  const map: Record<string, string> = {
    ok: 'is-ok',
    live: 'is-live',
    warn: 'is-wait',
    error: 'is-warn',
  }
  return map[status.value.tone] ?? 'is-ok'
})

function openSidebarAction(): void {
  sidebar?.open()
}

function toggleTrace(): void {
  if (narrowTrace.value) {
    traceOpen.value = true
    return
  }
  traceCollapsed.value = !traceCollapsed.value
}

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
const isEmpty = computed(
  () => chat.state.messages.length === 0 && !chat.state.streaming,
)

const status = computed(() => {
  if (chat.pendingApprovals.length > 0) return { label: '待审批', tone: 'warn' }
  if (chat.state.recovery?.kind === 'run_interrupted') return { label: '待处理', tone: 'warn' }
  if (chat.state.recovery?.kind === 'approval_timeout') return { label: '已超时', tone: 'error' }
  if (chat.state.streaming) return { label: '生成中', tone: 'live' }
  if (chat.state.recovery?.kind === 'run_in_progress') return { label: '运行中', tone: 'live' }
  if (chat.state.error) return { label: '出错', tone: 'error' }
  return { label: '就绪', tone: 'ok' }
})

async function loadConversation(id: string): Promise<void> {
  try {
    await chat.loadConversation(id)
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '加载会话失败')
  }
}

/** M9：加载输入栏工作流候选；失败不阻断对话，仅面板为空。 */
async function loadWorkflowOptions(): Promise<void> {
  try {
    const page = await workflowsApi.list()
    workflowOptions.value = page.items
  } catch (error) {
    console.warn('[chat] 加载工作流候选失败', error)
  }
}

/**
 * M9 T6：`/chat?workflow_id&workflow_version&workflow_name` 预选工作流。
 * 调详情接口校验：无效 id / 请求失败静默忽略并 console.warn；停用模板不预选。
 * query 缺 version 时用返回模板的当前 version；带 version 时以列表页展示版本为准。
 * workflow_name 仅作展示提示，chip 文案以 get(id) 返回为准，故不读取。
 */
async function seedWorkflowFromQuery(): Promise<void> {
  const id = typeof route.query.workflow_id === 'string' ? route.query.workflow_id : ''
  if (!id || seededWorkflowIds.has(id)) return
  if (!system.enabled('workflows')) return
  seededWorkflowIds.add(id)
  try {
    const workflow = await workflowsApi.get(id)
    if (!workflow.enabled) {
      console.warn(`[chat] 工作流 ${id} 已停用，忽略预选`)
      return
    }
    const rawVersion = route.query.workflow_version
    const version =
      typeof rawVersion === 'string' && /^\d+$/.test(rawVersion) ? Number(rawVersion) : null
    seedWorkflow.value = version !== null ? { ...workflow, version } : workflow
  } catch (error) {
    console.warn(`[chat] 预选工作流 ${id} 失败，已忽略 query 参数`, error)
  }
}

onMounted(async () => {
  void system.load().then(() => {
    if (system.enabled('knowledge')) void capabilityCatalog.loadKnowledgeCategories()
    // M9：workflows 能力开启才加载候选与 query 预选。
    if (system.enabled('workflows')) {
      void loadWorkflowOptions()
      void seedWorkflowFromQuery()
    }
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

// M9：组件复用时（如从工作流页跳转）query 预选也要生效。
watch(
  () => route.query.workflow_id,
  () => {
    void seedWorkflowFromQuery()
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

const runWorkflow = ref<Workflow | null>(null)

function handleSend(payload: { text: string; context: ChatContextSelection }): void {
  const workflowId = payload.context.workflow_id
  runWorkflow.value = workflowId
    ? (workflowOptions.value.find((item) => item.id === workflowId) ?? null)
    : null
  void chat.send(payload.text, withModelSelection(payload.context, modelSelection.value))
}

const runWorkflowMeta = computed(() => {
  const steps = runWorkflow.value?.steps ?? []
  if (steps.length === 0) return ''
  const parts = [`${steps.length} 步`]
  const a2a = steps.filter((step) => step.type === 'a2a').length
  if (a2a > 0) parts.push(`${a2a} 个远程智能体`)
  const approvals = steps.filter((step) => step.type === 'approval').length
  if (approvals > 0) parts.push(`${approvals} 个审批`)
  return parts.join(' · ')
})

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
  <div
    class="chat-layout"
    :class="{ 'trace-collapsed': traceCollapsed && !narrowTrace, 'trace-open': traceOpen }"
  >
    <main class="chat">
      <header class="chat-head">
        <button
          v-if="isMobile"
          class="mobile-sidebar-btn"
          type="button"
          aria-label="打开导航"
          title="打开导航"
          @click="openSidebarAction"
        >
          <AppIcon name="menu-burger" />
        </button>
        <div class="chat-heading">
          <h1 class="chat-title">{{ title }}</h1>
          <div class="chat-sub">
            <span>main-agent</span>
            <span class="sep">/</span>
            <span>{{ status.label }}</span>
            <template v-if="chat.state.runId">
              <span class="sep">/</span>
              <span class="mono">{{ chat.state.runId }}</span>
            </template>
          </div>
        </div>
        <div class="chat-actions">
          <button
            v-if="chat.pendingApprovals.length > 0"
            type="button"
            class="status-chip"
            :class="chipTone"
            title="查看并处理待审批"
            aria-label="待审批，点击处理"
            @click="focusPendingApproval"
          >
            <span class="dot"></span>{{ status.label }}
          </button>
          <span v-else class="status-chip" :class="chipTone">
            <span class="dot"></span>{{ status.label }}
          </span>
          <button
            v-if="isMobile"
            class="icon-btn"
            type="button"
            aria-label="全局搜索"
            title="全局搜索"
            @click="palette?.open()"
          >
            <AppIcon name="search" />
          </button>
          <button
            class="icon-btn"
            type="button"
            title="运行详情"
            :aria-label="narrowTrace ? '打开运行详情' : '切换运行详情面板'"
            :aria-expanded="narrowTrace ? traceOpen : !traceCollapsed"
            @click="toggleTrace"
          >
            <AppIcon name="panel" />
          </button>
        </div>
      </header>

      <div v-if="chat.rateLimitActive" class="chat-banner is-warn" role="status" aria-live="polite">
        发送过于频繁，请 <strong>{{ chat.rateLimitRemaining }}</strong> 秒后重试。
      </div>

      <div v-if="chat.pendingApprovals.length > 0" class="chat-banner is-warn" role="status">
        <span>
          有 <strong>{{ chat.pendingApprovals.length }}</strong> 项操作等待你在对话中审批，批准或拒绝后运行才会继续。
        </span>
        <button type="button" class="text-link" @click="focusPendingApproval">定位审批卡</button>
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

      <div v-if="runWorkflow" class="workflow-strip">
        <span class="workflow-strip-icon"><AppIcon name="workflow" /></span>
        <span class="workflow-strip-label">当前运行</span>
        <span class="workflow-strip-name">
          {{ runWorkflow.name }}
          <span class="tag">v{{ runWorkflow.version }}</span>
        </span>
        <span class="workflow-strip-meta">{{ runWorkflowMeta }}</span>
        <span class="spacer"></span>
        <RouterLink class="text-link" :to="{ name: 'workflow-edit', params: { id: runWorkflow.id } }">
          查看工作流
          <AppIcon name="arrow" />
        </RouterLink>
      </div>

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

      <div v-else class="stream">
        <div class="stream-inner">
          <div class="welcome">
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
        :workflows="workflowOptions"
        :seed-workflow="seedWorkflow"
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
    </main>

    <aside v-if="!narrowTrace" class="trace" aria-label="运行详情">
      <RunTracePanel
        :items="chat.processItems"
        :run-id="chat.state.runId"
        :streaming="chat.state.streaming"
        :usage="chat.state.usage"
        :finish-reason="chat.state.finishReason"
        :conversation-title="title"
        mode="panel"
        @open-events="traceOpen = true"
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
.welcome {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 12vh 20px 0;
  text-align: center;
}

.welcome .eyebrow {
  color: var(--amber-text);
  font-size: 9.5px;
  letter-spacing: 0.13em;
}

.welcome h2 {
  font-size: 26px;
  font-weight: 650;
  letter-spacing: -0.02em;
  line-height: 1.2;
}

.welcome .lede {
  max-width: 52ch;
  color: var(--ink-3);
  font-size: 12.5px;
  line-height: 1.7;
}

.suggestions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
  margin-top: 6px;
}

.suggestion {
  padding: 7px 12px;
  border: 1px solid var(--line);
  border-radius: 99px;
  background: var(--surface);
  color: var(--ink-2);
  font-size: 11.5px;
  transition:
    border-color 0.15s,
    color 0.15s;
}

.suggestion:hover {
  border-color: var(--ink-3);
  color: var(--ink);
}

.workflow-strip {
  flex: none;
  width: min(100% - 72px, 812px);
  margin: 0 auto;
}

.chat-banner {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin: 8px 24px 0;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 12px;
  line-height: 1.5;
}

.chat-banner.is-warn {
  background: var(--amber-soft);
  color: var(--amber-text);
}

.chat-banner strong {
  font-weight: 650;
}

.chat-error {
  margin: 8px 24px 0;
}
</style>
