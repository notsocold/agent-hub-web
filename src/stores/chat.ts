import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'

import { approvalsApi } from '@/api/approvals'
import { openChatStream } from '@/api/chat'
import { ApiRequestError, notifyUnauthorized } from '@/api/client'
import { conversationsApi } from '@/api/conversations'
import { runsApi } from '@/api/runs'
import { setRuntimeContext } from '@/utils/diagnostics'
import { MAX_RECONNECT_ATTEMPTS, RECONNECT_WINDOW_MS, nextReconnectDelay } from '@/utils/retry'
import {
  clearPendingApproval,
  clearPendingApprovalIds,
  createInitialChatState,
  eventNameOfRunEvent,
  hydrateApprovals,
  markAllApprovalsResolved,
  markApprovalClosed,
  markApprovalExpired,
  markApprovalResolved,
  reduceChat,
} from './chat-reducer'
import type {
  ApprovalProcess,
  ChatContextSelection,
  ChatEventName,
  ChatMessage,
  ChatMessageView,
  ChatRecovery,
  ChatState,
  RunStatus,
} from '@/types'

/** 对话内审批决定的语义分类，供 UI 选择提示文案。 */
export type ApprovalOutcomeKind =
  | 'resumed'
  | 'waiting_others'
  | 'run_ended'
  | 'not_resumed'
  | 'expired'
  | 'already_decided'
  | 'failed'

export interface ApprovalOutcome {
  approvalId: string
  decision: 'approve' | 'reject'
  kind: ApprovalOutcomeKind
  message: string
  resumed: boolean
}

/** SSE 连接状态（与 `streaming` 解耦，设计 4.2 B1）。 */
export type ChatConnection = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'degraded'

const HISTORY_PAGE_SIZE = 100
const RUN_POLL_INTERVAL_MS = 2500
const TERMINAL_RUN_STATUSES: readonly RunStatus[] = ['succeeded', 'failed', 'canceled']
const ACTIVE_RUN_STATUSES: readonly RunStatus[] = ['queued', 'running', 'interrupted']
const RUN_STATUSES: readonly RunStatus[] = [...ACTIVE_RUN_STATUSES, ...TERMINAL_RUN_STATUSES]

interface ChatAttempt {
  text: string
  context: ChatContextSelection
  clientMessageId: string
}

function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

function normalizeRunStatus(value: string | null | undefined): RunStatus | null {
  return value && (RUN_STATUSES as readonly string[]).includes(value) ? (value as RunStatus) : null
}

function isTerminal(status: RunStatus | null): boolean {
  return status !== null && TERMINAL_RUN_STATUSES.includes(status)
}

function defaultCapabilities(): ChatMessageView['capabilities'] {
  return { skills: [], mcp_servers: [], mcp_tools: [], knowledge_categories: [], workflow_id: null }
}

function toView(message: ChatMessage): ChatMessageView {
  return {
    ...message,
    citations: message.citations ?? [],
    attachments: message.attachments ?? [],
    artifacts: message.artifacts ?? [],
    capabilities: { ...defaultCapabilities(), ...message.capabilities },
    streaming: false,
  }
}

function createUserMessage(content: string, clientMessageId: string): ChatMessageView {
  return {
    id: `local-${clientMessageId}`,
    role: 'user',
    content,
    content_type: 'markdown',
    run_id: null,
    client_message_id: clientMessageId,
    status: 'completed',
    citations: [],
    attachments: [],
    capabilities: defaultCapabilities(),
    artifacts: [],
    usage: null,
    error: null,
    created_at: new Date().toISOString(),
  }
}

function sortMessages(messages: ChatMessageView[]): ChatMessageView[] {
  // 后端同一轮的 user/assistant 消息只相差 1 微秒，Date.parse 会截断到毫秒。
  // ISO 8601 UTC 字符串可直接字典序比较；相等时保持调用方给的服务端顺序。
  return [...messages].sort((left, right) => {
    if (left.created_at === right.created_at) return 0
    return left.created_at < right.created_at ? -1 : 1
  })
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

export const useChatStore = defineStore('chat', () => {
  const state = ref<ChatState>(createInitialChatState())
  const loadingHistory = ref(false)
  const loadingOlder = ref(false)
  const resolvingApproval = ref(false)
  const resolvingApprovalId = ref<string | null>(null)
  const recoveryBusy = ref(false)
  const rateLimitRemaining = ref(0)
  let rateLimitTimer: ReturnType<typeof setInterval> | null = null
  const historyHasMore = ref(false)
  const historyCursor = ref<string | null>(null)
  const lastAttempt = ref<ChatAttempt | null>(null)
  /** 连接状态机：idle → connecting → open → reconnecting → degraded。 */
  const connection = ref<ChatConnection>('idle')
  /** 本轮自动重连已消耗的次数（0..MAX_RECONNECT_ATTEMPTS），供连接条展示。 */
  const reconnectAttempt = ref(0)

  let controller: AbortController | null = null
  let rafId: number | null = null
  let pollTimer: ReturnType<typeof setInterval> | null = null
  let pollRunId: string | null = null
  let approvalsSyncSeq = 0
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let reconnectWindowStartedAt: number | null = null
  let reconnectInFlight = false
  let reconnectController: AbortController | null = null
  let connectivityBound = false
  const pendingDeltas = new Map<string, { text: string; seq: number }>()

  const messages = computed(() => state.value.messages)
  const processItems = computed(() => state.value.process)
  const streaming = computed(() => state.value.streaming)
  const recovery = computed(() => state.value.recovery)
  const canRetry = computed(
    () =>
      Boolean(lastAttempt.value) &&
      !state.value.streaming &&
      rateLimitRemaining.value === 0 &&
      state.value.recovery?.kind !== 'run_in_progress' &&
      state.value.recovery?.kind !== 'run_interrupted',
  )
  /**
   * F1：命令面板选中「当前会话消息」后写入，MessageList 就绪时消费并清空。
   * 跨页导航时保留该值，直到对话页加载完成为止。
   */
  const pendingScrollMessageId = ref<string | null>(null)

  function requestScrollToMessage(id: string): void {
    pendingScrollMessageId.value = id
  }

  function clearPendingScroll(): void {
    pendingScrollMessageId.value = null
  }

  const pendingApproval = computed(() => {
    const id = state.value.pendingApprovalId
    if (!id) return null
    return (
      state.value.process.find((item) => item.kind === 'approval' && item.approvalId === id) ?? null
    )
  })
  /** M5：按 `run.interrupted.approvals` 顺序返回待审批卡（一轮可能多张）。 */
  const pendingApprovals = computed(() => {
    const ids = state.value.pendingApprovalIds
    return ids
      .map(
        (id) =>
          state.value.process.find(
            (item): item is ApprovalProcess =>
              item.kind === 'approval' && item.approvalId === id,
          ) ?? null,
      )
      .filter((item): item is ApprovalProcess => item !== null)
  })
  const rateLimitActive = computed(() => rateLimitRemaining.value > 0)

  function cancelRaf(): void {
    if (rafId !== null) {
      window.cancelAnimationFrame(rafId)
      rafId = null
    }
  }

  function clearPolling(): void {
    if (pollTimer !== null) {
      clearInterval(pollTimer)
      pollTimer = null
    }
    pollRunId = null
  }

  function clearRateLimit(): void {
    if (rateLimitTimer !== null) {
      clearInterval(rateLimitTimer)
      rateLimitTimer = null
    }
    rateLimitRemaining.value = 0
  }

  /** 聊天 429：按后端 `details.retry_after_seconds` 倒计时，期间禁止发送。 */
  function startRateLimit(seconds: number): void {
    clearRateLimit()
    const total = Math.max(1, Math.ceil(seconds))
    rateLimitRemaining.value = total
    rateLimitTimer = setInterval(() => {
      rateLimitRemaining.value = Math.max(0, rateLimitRemaining.value - 1)
      if (rateLimitRemaining.value === 0) clearRateLimit()
    }, 1000)
  }

  /**
   * 断线/进入会话/审批事件到达时，用服务端审批列表对账过程卡片。
   *
   * - 以服务端 pending 列表为准，清理已不存在的旧指针（I7）；
   * - 请求代次 + runId 校验，避免 A 会话的迟到响应写进 B 会话；
   * - `status: all` 用完整 Approval 字段补全 `approval.required` 事件缺失的
   *   executor/target/side_effect 等展示字段（真实后端事件字段较少）。
   */
  async function syncPendingApprovals(runId: string): Promise<void> {
    const seq = ++approvalsSyncSeq
    try {
      const page = await approvalsApi.list({ run_id: runId, status: 'all', limit: 50 })
      if (seq !== approvalsSyncSeq || state.value.runId !== runId) return
      state.value = hydrateApprovals(state.value, page.items, { replacePending: true })
    } catch {
      // 补卡失败不改变主状态；待审批仍可在对话内操作。
    }
  }

  /** 终态后对账审批卡：补全已决定/过期的卡片并清空待审指针。 */
  async function reconcileRunApprovals(
    runId: string,
    terminalStatus: RunStatus,
  ): Promise<void> {
    const seq = ++approvalsSyncSeq
    try {
      const page = await approvalsApi.list({ run_id: runId, status: 'all', limit: 50 })
      if (seq !== approvalsSyncSeq || state.value.runId !== runId) return
      const expired = page.items.some((item) => item.status === 'expired')
      state.value = hydrateApprovals(state.value, page.items, { replacePending: true })
      state.value = clearPendingApprovalIds(state.value)
      if (terminalStatus === 'canceled' && expired) {
        state.value = {
          ...state.value,
          streaming: false,
          recovery: {
            kind: 'approval_timeout',
            code: 'approval_timeout',
            message: '审批超时，本轮运行已取消；该操作没有执行。如仍需要，请重新发送。',
            runId,
            runStatus: 'canceled',
            retryable: false,
          },
        }
      }
    } catch {
      // 对账失败时至少清掉不可操作的待审指针。
      state.value = clearPendingApprovalIds(state.value)
    }
  }

  function flushDeltas(): void {
    if (pendingDeltas.size === 0) return
    const entries = [...pendingDeltas.entries()]
    pendingDeltas.clear()
    for (const [messageId, buffered] of entries) {
      state.value = reduceChat(state.value, 'message.delta', {
        message_id: messageId,
        delta: buffered.text,
        seq: buffered.seq,
      })
    }
  }

  function scheduleFlush(): void {
    if (rafId !== null) return
    rafId = window.requestAnimationFrame(() => {
      rafId = null
      flushDeltas()
    })
  }

  /**
   * 流建立时调用。`resetSeq` 区分首次连接（重置 lastSeq 去重基线）与重连
   * （保留 lastSeq，回放的已处理事件必须继续被丢弃，设计 4.2 B4）。
   */
  function onOpen(runId: string | null, resetSeq = true): void {
    clearReconnectTimer()
    unbindConnectivityListeners()
    if (resetSeq) reconnectAttempt.value = 0
    // 窗口按“本次可跟随的连接”重新计时；重连次数在当前 run 结束或新发送前累计，
    // 否则服务端「握手成功即断流」会让 5 次上限永远达不到。
    reconnectWindowStartedAt = null
    connection.value = 'open'
    // 防御：重连若拿到不同的 run（后端违背幂等契约），保留旧 lastSeq 会把新 run
    // 的 seq 1..N 全部丢弃，因此此时必须重置。
    const runChanged = runId !== null && state.value.runId !== null && runId !== state.value.runId
    state.value = {
      ...state.value,
      lastSeq: resetSeq || runChanged ? 0 : state.value.lastSeq,
      runId: runId ?? state.value.runId,
      runStatus: state.value.runStatus ?? 'running',
      streaming: true,
      error: null,
      recovery: null,
    }
  }

  function onEvent(event: ChatEventName, data: unknown): void {
    if (event === 'message.delta') {
      const record = data as { message_id?: unknown; delta?: unknown; seq?: unknown }
      const messageId = typeof record.message_id === 'string' ? record.message_id : ''
      const delta = typeof record.delta === 'string' ? record.delta : ''
      if (!messageId || !delta) return
      const existing = pendingDeltas.get(messageId)
      pendingDeltas.set(messageId, {
        text: (existing?.text ?? '') + delta,
        seq: typeof record.seq === 'number' ? record.seq : (existing?.seq ?? 0),
      })
      scheduleFlush()
      return
    }

    flushDeltas()
    state.value = reduceChat(state.value, event, data)
    if (event === 'run.interrupted') {
      const record = data as { run_id?: unknown }
      const runId = typeof record.run_id === 'string' ? record.run_id : ''
      if (runId) void syncPendingApprovals(runId)
    } else if (event === 'run.resumed') {
      // 恢复后旧审批列表响应不得把已处理卡片复活。
      approvalsSyncSeq += 1
    }
  }

  function onError(error: Error): void {
    flushDeltas()
    // 可自动重连时先不展示错误、也不结束 streaming：交给 catch 里的重连
    // 调度，避免错误卡片闪一下再被连接条覆盖（设计 4.2 B2）。
    if (canAutoReconnect(error)) return
    if (state.value.error) return
    state.value = {
      ...state.value,
      streaming: false,
      error: { code: 'stream_error', message: error.message },
    }
    connection.value = 'idle'
  }

  function removeMessage(clientMessageId: string): void {
    state.value = {
      ...state.value,
      messages: state.value.messages.filter(
        (message) => message.client_message_id !== clientMessageId,
      ),
    }
  }

  function setRecovery(recoveryValue: ChatRecovery | null): void {
    state.value = { ...state.value, recovery: recoveryValue }
  }

  function clearReconnectTimer(): void {
    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
  }

  /** 读取实时状态（回调可能已把它改回 reconnecting，避免被 TS 的窄化误判）。 */
  function isReconnecting(): boolean {
    return connection.value === 'reconnecting'
  }

  function bindConnectivityListeners(): void {
    if (connectivityBound) return
    connectivityBound = true
    window.addEventListener('online', onBrowserOnline)
    window.addEventListener('offline', onBrowserOffline)
  }

  function unbindConnectivityListeners(): void {
    if (!connectivityBound) return
    connectivityBound = false
    window.removeEventListener('online', onBrowserOnline)
    window.removeEventListener('offline', onBrowserOffline)
  }

  /** 清掉重连定时器与在线监听；重连次数由调用方决定是否重置。 */
  function clearReconnect(): void {
    clearReconnectTimer()
    unbindConnectivityListeners()
  }

  /** 新一轮恢复开始（首次连接成功/停止/切会话）时重置重连预算。 */
  function resetReconnectBudget(): void {
    clearReconnect()
    reconnectAttempt.value = 0
    reconnectWindowStartedAt = null
  }

  function onBrowserOffline(): void {
    // 离线只暂停退避计时：不降级、不消耗次数，online 后立即重试（设计 4.2 B3）。
    if (connection.value !== 'reconnecting') return
    clearReconnectTimer()
  }

  function onBrowserOnline(): void {
    if (connection.value !== 'reconnecting') return
    clearReconnectTimer()
    // 网络恢复视为新的恢复窗口：立即重试一次并重置计数。
    reconnectAttempt.value = 0
    reconnectWindowStartedAt = null
    if (reconnectInFlight) return
    void performReconnect()
  }

  /** 是否满足设计 4.2 B2 的自动重连条件（4xx 业务错误按现有逻辑处理）。 */
  function canAutoReconnect(error?: unknown): boolean {
    if (!lastAttempt.value || !state.value.runId) return false
    if (state.value.finishReason !== null || isTerminal(state.value.runStatus)) return false
    // 后端 `error` 事件即终态：即使 runStatus 还没刷新，也不能再重连，
    // 否则每次续流都会回放同一 error 并触发一轮新的退避重连。
    if (state.value.error) return false
    // HITL 等待审批没有活动流，交给审批横幅 + 轮询，不进重连。
    if (state.value.runStatus === 'interrupted') return false
    if (error instanceof ApiRequestError && error.status >= 400 && error.status < 500) return false
    return true
  }

  /**
   * 进入降级：停止自动重连，复用现有恢复横幅 + 轮询路径，
   * 不新增第二套恢复 UI（设计 4.2 B1/B5）。
   */
  function enterDegraded(message: string, runId: string | null = state.value.runId): void {
    clearReconnect()
    connection.value = 'degraded'
    state.value = {
      ...state.value,
      streaming: false,
      error: null,
      recovery: {
        kind: 'stream_failed',
        code: 'stream_failed',
        message,
        runId,
        runStatus: state.value.runStatus,
        retryable: true,
      },
    }
    if (runId && !isTerminal(state.value.runStatus)) {
      // 续流失败/回放上限：先用分页回放补已落库过程卡（工具/审批/通知），
      // 再轮询跟进状态；回放失败不阻塞轮询。
      void replayPersistedEvents(runId, state.value.lastSeq)
      schedulePolling(runId)
    }
  }

  /**
   * 调度下一次自动重连：1s/2s/4s/8s/16s ±20%，最多 5 次、总窗口 60s。
   * 定时器到点只执行一次「GET run 校验 + 重发流」，失败会回到这里累计次数。
   */
  function scheduleReconnect(): void {
    if (!lastAttempt.value || !state.value.runId) return
    if (state.value.finishReason !== null || isTerminal(state.value.runStatus)) return
    // 已收到 error 终态事件：重连只会回放同一错误，直接收尾。
    if (state.value.error) return
    if (connection.value === 'degraded') return
    // onerror 与 onclose 可能先后到达；已有定时器时只保留一次调度。
    // 不能把「本次请求在途」也算作重复：catch 里正是请求失败后在排队下一次。
    if (connection.value === 'reconnecting' && reconnectTimer !== null) return

    connection.value = 'reconnecting'
    state.value = { ...state.value, streaming: true, error: null, recovery: null }
    bindConnectivityListeners()

    // 离线：暂停计时、不消耗次数；online 事件会立即重试。
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      clearReconnectTimer()
      return
    }

    if (reconnectAttempt.value >= MAX_RECONNECT_ATTEMPTS) {
      enterDegraded('连接中断，自动重连已达上限，改为轮询恢复。')
      return
    }

    const now = Date.now()
    if (reconnectWindowStartedAt === null) reconnectWindowStartedAt = now
    const delay = nextReconnectDelay(reconnectAttempt.value)
    if (now - reconnectWindowStartedAt + delay > RECONNECT_WINDOW_MS) {
      enterDegraded('连接中断，重连总时长已超过 60 秒，改为轮询恢复。')
      return
    }

    reconnectAttempt.value += 1
    clearReconnectTimer()
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      void performReconnect()
    }, delay)
  }

  /**
   * 执行一次重连：先 `GET /runs/{id}` 回填/校验，再按 run 状态决定
   * 终态收尾、审批恢复或重发流。不得走 `startStream`（会重置
   * lastSeq/process/runId，回放事件会被重复应用，设计 4.2 B4）。
   */
  async function performReconnect(): Promise<void> {
    const attempt = lastAttempt.value
    const runId = state.value.runId
    if (!attempt || !runId) {
      enterDegraded('连接已断开，缺少可恢复的运行信息。', null)
      return
    }
    if (reconnectInFlight) return
    reconnectInFlight = true
    controller?.abort()
    const currentController = new AbortController()
    controller = currentController
    reconnectController = currentController
    let settled = false

    try {
      // 正确性关键：新会话可能「后端已建 run、前端还没收到 conversation.created」，
      // 必须先用 run.conversation_id 回填，否则重连会被后端当成新会话新建 run。
      const run = await runsApi.get(runId)
      if (currentController.signal.aborted) return
      if (state.value.runId !== runId || run.id !== state.value.runId) {
        // 用户已切走或 run 已被替换：放弃重连，避免把旧 run 的事件写进当前会话。
        settled = true
        enterDegraded('运行状态已变化，已停止自动重连。', null)
        return
      }

      state.value = {
        ...state.value,
        conversationId: run.conversation_id,
        runId: run.id,
        runStatus: run.status,
      }

      if (isTerminal(run.status)) {
        // 服务端已经结束：补历史 + 审批对账，不再连流。
        settled = true
        resetReconnectBudget()
        connection.value = 'idle'
        state.value = { ...state.value, streaming: false }
        setRecovery(null)
        void reconcileRunApprovals(run.id, run.status)
        await refreshHistory().catch(() => undefined)
        return
      }

      if (run.status === 'interrupted') {
        // HITL：没有可跟随的活动流，复用现有 adoptRun 的审批横幅 + 轮询路径。
        settled = true
        clearReconnect()
        connection.value = 'degraded'
        await adoptRun(run.id)
        return
      }

      // running / queued：M7 起从 lastSeq 续流（GET + Bearer），
      // 不再重发消息——重发会新建 run，且回放事件会与已处理事件重复。
      await runsApi.stream(runId, state.value.lastSeq, {
        signal: currentController.signal,
        onOpen: () => onOpen(runId, false),
        onEvent,
        onError,
        onClose: onStreamClose,
      })

      if (
        !currentController.signal.aborted &&
        state.value.finishReason === null &&
        !isTerminal(state.value.runStatus)
      ) {
        // 流 resolve 但没有 message.done/onClose（自定义实现）：仍按断线处理。
        scheduleReconnect()
      }
    } catch (error) {
      if (isAbort(error) || currentController.signal.aborted) return

      // 400 replay_too_large：回放超过上限，改用轮询恢复；不能重试同一 after_seq。
      if (error instanceof ApiRequestError && error.code === 'replay_too_large') {
        settled = true
        resetReconnectBudget()
        enterDegraded('断点回放事件超过上限，改为轮询恢复。', runId)
        return
      }

      // 404：run 已删除/不可见，续流和轮询都没有意义，补历史后结束恢复。
      if (error instanceof ApiRequestError && error.status === 404) {
        settled = true
        resetReconnectBudget()
        connection.value = 'idle'
        state.value = { ...state.value, streaming: false, recovery: null }
        await refreshHistory().catch(() => undefined)
        return
      }

      if (error instanceof ApiRequestError && error.status >= 400 && error.status < 500) {
        // 4xx 业务错误不重连：交给现有错误/409 恢复逻辑。
        settled = true
        resetReconnectBudget()
        await handleApiFailure(error, attempt)
        connection.value = state.value.recovery?.kind === 'run_in_progress' ? 'degraded' : 'idle'
        return
      }
      if (canAutoReconnect(error)) {
        scheduleReconnect()
        return
      }
      settled = true
      enterDegraded('连接已断开，自动重连已停止。')
    } finally {
      reconnectInFlight = false
      if (reconnectController === currentController) reconnectController = null
      if (controller === currentController) controller = null
      flushDeltas()
      cancelRaf()
      if (!settled && !currentController.signal.aborted && !isReconnecting()) {
        // 只有流真正结束才收尾；重连调度中必须保持 streaming。
        connection.value = connection.value === 'open' ? 'idle' : connection.value
        state.value = { ...state.value, streaming: false }
        await refreshHistory().catch(() => undefined)
      }
    }
  }

  /**
   * 正常 EOF（fetch-event-source 的 onclose）也按断线处理：
   * 未收到 message.done 且 run 非终态时调度重连（设计 4.2 B4）。
   */
  function onStreamClose(): void {
    flushDeltas()
    if (
      state.value.finishReason !== null ||
      isTerminal(state.value.runStatus) ||
      state.value.error !== null
    ) {
      if (connection.value === 'open') connection.value = 'idle'
      return
    }
    if (!lastAttempt.value || !state.value.runId) return
    scheduleReconnect()
  }

  /** 用户主动停止自动重连：清定时器与在途请求，落回现有恢复横幅路径。 */
  function stopReconnect(): void {
    const wasReconnecting = connection.value === 'reconnecting'
    resetReconnectBudget()
    reconnectController?.abort()
    reconnectController = null
    if (!wasReconnecting) return
    connection.value = 'degraded'
    state.value = {
      ...state.value,
      streaming: false,
      recovery: {
        kind: 'stream_failed',
        code: 'stream_failed',
        message: '已停止自动重连，可手动重新连接或刷新状态。',
        runId: state.value.runId,
        runStatus: state.value.runStatus,
        retryable: true,
      },
    }
  }

  /**
   * M7：把已落库事件（`GET /runs/{id}/events`）按 `event` 重放进 reducer。
   *
   * 用途：进入会话/重连降级时补齐工具卡、审批卡、通知等「已落库」过程项。
   * `message.delta` 不落库，断线窗口内的逐字文本仍由终态 `refreshHistory()` 补齐。
   * `event` 为空或不在白名单的事件跳过并记录，不根据 `type` 猜测事件名。
   */
  async function replayPersistedEvents(runId: string, afterSeq: number): Promise<void> {
    let cursor: string | undefined
    let applied = 0
    try {
      // 进入回放前再确认一次，避免 await 期间用户切走会话后把事件写进新会话。
      if (state.value.runId !== runId) return
      for (let page = 0; page < 20; page += 1) {
        const result = await runsApi.events(runId, {
          limit: 200,
          after_seq: afterSeq,
          ...(cursor ? { cursor } : {}),
        })
        if (state.value.runId !== runId) return
        for (const item of result.items) {
          const name = eventNameOfRunEvent(item)
          if (!name) {
            console.debug('[chat] 忽略无事件名的回放事件', item.type, item.seq)
            continue
          }
          const payload = item.payload ?? {}
          const seq = typeof payload.seq === 'number' ? payload.seq : item.seq
          state.value = reduceChat(state.value, name, { ...payload, seq })
          applied += 1
        }
        if (!result.has_more || !result.next_cursor) break
        cursor = result.next_cursor
      }
    } catch (error) {
      // 回放是补卡增强，失败不阻塞恢复主流程（轮询/审批对账仍会进行）。
      console.debug('[chat] 事件回放失败', error)
      return
    }
    if (applied > 0) flushDeltas()
  }

  async function adoptRun(runId: string): Promise<void> {
    // 恢复过程中用户可能切会话：await 之后用 conversationId 判断代次，
    // 避免旧 run 的 process/recovery/轮询写进新会话。
    const conversationId = state.value.conversationId
    clearPolling()
    pollRunId = runId
    recoveryBusy.value = true
    try {
      const run = await runsApi.get(runId)
      if (state.value.conversationId !== conversationId) return
      const runChanged = state.value.runId !== run.id
      state.value = {
        ...state.value,
        runId: run.id,
        runStatus: run.status,
        lastSeq: runChanged ? 0 : state.value.lastSeq,
        streaming: run.status === 'running' || run.status === 'queued',
      }
      if (isTerminal(run.status)) {
        // 终态即收尾：清理所有重连预算，连接条必须回到 idle。
        resetReconnectBudget()
        connection.value = 'idle'
        state.value = { ...state.value, streaming: false }
        setRecovery(null)
        void reconcileRunApprovals(run.id, run.status)
        await refreshHistory()
        return
      }
      // 非终态：先回放已落库事件补卡，再进入审批横幅/轮询。
      await replayPersistedEvents(run.id, runChanged ? 0 : state.value.lastSeq)
      if (state.value.conversationId !== conversationId) return

      const interrupted = run.status === 'interrupted'
      state.value = {
        ...state.value,
        streaming: !interrupted,
        recovery: {
          kind: interrupted ? 'run_interrupted' : 'run_in_progress',
          code: interrupted ? 'run_interrupted' : 'run_in_progress',
          message: interrupted
            ? '该运行正在等待审批；批准或拒绝后会自动继续。'
            : '该会话已有运行中的请求，可等待完成或先停止当前运行。',
          runId: run.id,
          runStatus: run.status,
          retryable: false,
        },
      }
      if (interrupted) await syncPendingApprovals(run.id)
      schedulePolling(run.id)
    } catch (error) {
      state.value = {
        ...state.value,
        streaming: false,
        error: {
          code: 'run_lookup_failed',
          message: errorMessage(error, '查询运行状态失败'),
          retryable: true,
        },
      }
    } finally {
      recoveryBusy.value = false
    }
  }

  function schedulePolling(runId: string): void {
    clearPolling()
    pollRunId = runId
    pollTimer = setInterval(() => {
      void pollRun(runId)
    }, RUN_POLL_INTERVAL_MS)
  }

  async function pollRun(runId: string): Promise<void> {
    if (pollRunId !== runId) return
    try {
      const run = await runsApi.get(runId)
      if (pollRunId !== runId) return
      state.value = { ...state.value, runStatus: run.status }
      if (isTerminal(run.status)) {
        clearPolling()
        // 轮询到终态也要结束 degraded，否则连接条会永久停留。
        resetReconnectBudget()
        connection.value = 'idle'
        state.value = { ...state.value, streaming: false }
        setRecovery(null)
        void reconcileRunApprovals(run.id, run.status)
        await refreshHistory()
        return
      }
      const interrupted = run.status === 'interrupted'
      state.value = {
        ...state.value,
        streaming: !interrupted,
        recovery: {
          kind: interrupted ? 'run_interrupted' : 'run_in_progress',
          code: interrupted ? 'run_interrupted' : 'run_in_progress',
          message: interrupted
            ? '该运行正在等待审批；批准或拒绝后会自动继续。'
            : '该会话已有运行中的请求，可等待完成或先停止当前运行。',
          runId: run.id,
          runStatus: run.status,
          retryable: false,
        },
      }
      if (interrupted) {
        await syncPendingApprovals(run.id)
      }
    } catch {
      // 轮询失败不打断当前状态，下次继续。
    }
  }

  async function refreshHistory(): Promise<void> {
    const conversationId = state.value.conversationId
    if (!conversationId) return
    const [page, conversation] = await Promise.all([
      conversationsApi.messages(conversationId, { limit: HISTORY_PAGE_SIZE }),
      conversationsApi.get(conversationId),
    ])
    // 请求期间用户已切走会话：迟到响应不得覆盖新会话的消息与 run 状态。
    if (state.value.conversationId !== conversationId) return
    const fetched = page.items.map(toView).reverse()
    const fetchedIds = new Set(fetched.map((message) => message.id))
    const fetchedClientIds = new Set(
      fetched.map((message) => message.client_message_id).filter((value): value is string => !!value),
    )
    const oldestFetched = fetched[0]?.created_at
    const preserved = state.value.messages.filter((message) => {
      if (fetchedIds.has(message.id)) return false
      if (message.client_message_id && fetchedClientIds.has(message.client_message_id)) return false
      if (message.id.startsWith('local-')) return true
      return !oldestFetched || message.created_at < oldestFetched
    })

    const lastRunStatus =
      normalizeRunStatus(conversation.last_run?.status) ?? state.value.runStatus
    state.value = {
      ...state.value,
      conversationId,
      conversationTitle: conversation.title,
      messages: sortMessages([...preserved, ...fetched]),
      runId: conversation.last_run?.id ?? state.value.runId,
      runStatus: lastRunStatus,
    }
    // 流因 HITL 空闲超时关闭时，run 仍是 interrupted；给出恢复入口而不是静默。
    if (lastRunStatus === 'interrupted' && state.value.recovery?.kind !== 'run_interrupted') {
      state.value = {
        ...state.value,
        streaming: false,
        recovery: {
          kind: 'run_interrupted',
          code: 'run_interrupted',
          message: '该运行正在等待审批；批准或拒绝后会自动继续。',
          runId: conversation.last_run?.id ?? null,
          runStatus: 'interrupted',
          retryable: false,
        },
      }
      if (conversation.last_run?.id) {
        void syncPendingApprovals(conversation.last_run.id)
        // 没有活动 SSE 时，用轮询跟进审批决定后的恢复。
        schedulePolling(conversation.last_run.id)
      }
    } else if (lastRunStatus && isTerminal(lastRunStatus) && state.value.pendingApprovalIds.length > 0) {
      if (conversation.last_run?.id) {
        void reconcileRunApprovals(conversation.last_run.id, lastRunStatus)
      }
    }
    historyHasMore.value = page.has_more
    historyCursor.value = page.next_cursor
  }

  async function handleApiFailure(error: ApiRequestError, attempt: ChatAttempt): Promise<void> {
    if (error.status === 401) {
      notifyUnauthorized()
      state.value = {
        ...state.value,
        streaming: false,
        error: { code: 'unauthorized', message: '登录已过期，请重新登录' },
      }
      return
    }

    if (error.code === 'rate_limited') {
      removeMessage(attempt.clientMessageId)
      const raw = error.details.retry_after_seconds
      const seconds = typeof raw === 'number' && raw > 0 ? raw : 60
      startRateLimit(seconds)
      state.value = {
        ...state.value,
        streaming: false,
        finishReason: null,
        error: null,
        recovery: null,
      }
      return
    }

    if (error.code === 'run_in_progress') {
      removeMessage(attempt.clientMessageId)
      const runId =
        typeof error.details.run_id === 'string' ? error.details.run_id : null
      state.value = {
        ...state.value,
        streaming: false,
        error: null,
        finishReason: null,
        recovery: {
          kind: 'run_in_progress',
          code: error.code,
          message: error.message,
          runId,
          runStatus: 'running',
          retryable: false,
        },
      }
      if (runId) await adoptRun(runId)
      return
    }

    if (error.status >= 400 && error.status < 500) {
      removeMessage(attempt.clientMessageId)
      state.value = {
        ...state.value,
        streaming: false,
        error: {
          code: error.code,
          message: error.message,
          retryable: false,
          requestId: error.requestId || undefined,
        },
        recovery: {
          kind: 'stream_failed',
          code: error.code,
          message: error.message,
          runId: state.value.runId,
          runStatus: state.value.runStatus,
          retryable: false,
        },
      }
      return
    }

    // 5xx / 连接中断：后端可能已经受理，保留乐观消息，用同一
    // client_message_id 重试可拿到同一 run 的事件回放。
    state.value = {
      ...state.value,
      streaming: false,
      error: {
        code: error.code,
        message: error.message,
        retryable: true,
        requestId: error.requestId || undefined,
      },
      recovery: {
        kind: 'stream_failed',
        code: error.code,
        message: error.message,
        runId: state.value.runId,
        runStatus: state.value.runStatus,
        retryable: true,
      },
    }
  }

  async function startStream(attempt: ChatAttempt): Promise<void> {
    if (state.value.streaming || rateLimitActive.value) return
    controller?.abort()
    // 降级态下用户点「重试发送」时，旧轮询必须停掉，否则会和新流互相覆盖状态。
    clearPolling()
    resetReconnectBudget()
    connection.value = 'connecting'
    const currentController = new AbortController()
    controller = currentController

    const existing = state.value.messages.some(
      (message) => message.client_message_id === attempt.clientMessageId,
    )
    state.value = {
      ...state.value,
      messages: existing
        ? state.value.messages
        : [...state.value.messages, createUserMessage(attempt.text, attempt.clientMessageId)],
      streaming: true,
      runId: null,
      runStatus: 'queued',
      pendingApprovalIds: [],
      pendingApprovalId: null,
      finishReason: null,
      error: null,
      recovery: null,
      usage: null,
      currentAssistantId: null,
      process: [],
      lastSeq: 0,
    }

    // 新 run 开始后，旧 run 的审批同步响应不得写回。
    approvalsSyncSeq += 1
    let failed = false
    try {
      await openChatStream(
        {
          conversation_id: state.value.conversationId ?? undefined,
          message: attempt.text,
          client_message_id: attempt.clientMessageId,
          ...attempt.context,
        },
        {
          signal: currentController.signal,
          onOpen: (runId) => onOpen(runId, true),
          onEvent,
          onError,
          onClose: onStreamClose,
        },
      )
    } catch (error) {
      if (isAbort(error) || currentController.signal.aborted) return
      failed = true
      if (canAutoReconnect(error)) {
        // 后端已受理（已拿到 runId）后的网络中断/5xx：静默进入自动重连，
        // 不再展示一次性的 stream_failed 横幅（设计 4.2 B2）。
        scheduleReconnect()
        return
      }
      if (error instanceof ApiRequestError) {
        await handleApiFailure(error, attempt)
        connection.value = state.value.recovery?.kind === 'run_in_progress' ? 'degraded' : 'idle'
      } else {
        state.value = {
          ...state.value,
          streaming: false,
          error: {
            code: 'stream_failed',
            message: errorMessage(error, '发送失败，请稍后重试'),
            retryable: true,
          },
          recovery: {
            kind: 'stream_failed',
            code: 'stream_failed',
            message: '连接中断，暂未确认后端是否已接收；可用同一幂等键重试。',
            runId: state.value.runId,
            runStatus: state.value.runStatus,
            retryable: true,
          },
        }
        connection.value = 'idle'
      }
    } finally {
      flushDeltas()
      cancelRaf()
      if (controller === currentController) controller = null
      if (!failed && !currentController.signal.aborted && !isReconnecting()) {
        connection.value = 'idle'
        state.value = { ...state.value, streaming: false }
        // 断线/回放时增量可能缺失，以服务端历史为准；同时补齐标题与计数。
        await refreshHistory().catch(() => undefined)
      }
    }
  }

  async function send(text: string, context: ChatContextSelection = {}): Promise<void> {
    const trimmed = text.trim()
    if (!trimmed || state.value.streaming || rateLimitActive.value) return
    const attempt: ChatAttempt = {
      text: trimmed,
      context: { ...context },
      clientMessageId: crypto.randomUUID(),
    }
    lastAttempt.value = attempt
    await startStream(attempt)
  }

  async function retry(): Promise<void> {
    const attempt = lastAttempt.value
    if (!attempt || state.value.streaming || rateLimitActive.value) return
    if (
      state.value.recovery?.kind === 'run_in_progress' ||
      state.value.recovery?.kind === 'run_interrupted'
    ) {
      return
    }
    await startStream(attempt)
  }

  async function stop(): Promise<void> {
    const runId = state.value.runId
    resetReconnectBudget()
    connection.value = 'idle'
    controller?.abort()
    controller = null
    flushDeltas()
    cancelRaf()
    clearPolling()

    state.value = {
      ...state.value,
      streaming: false,
      finishReason: 'canceled',
      runStatus: 'canceled',
      recovery: null,
      pendingApprovalIds: [],
      pendingApprovalId: null,
      process: state.value.process.map((item) =>
        item.kind === 'approval' && item.status === 'waiting'
          ? { ...item, status: 'canceled' as const }
          : item,
      ),
      messages: state.value.messages.map((message) =>
        message.streaming ? { ...message, streaming: false, status: 'canceled' } : message,
      ),
    }

    if (!runId) return

    recoveryBusy.value = true
    try {
      await runsApi.cancel(runId)
      await refreshHistory()
    } catch (error) {
      if (error instanceof ApiRequestError && error.code === 'run_not_cancelable') {
        const status = normalizeRunStatus(
          typeof error.details.status === 'string' ? error.details.status : undefined,
        )
        state.value = { ...state.value, runStatus: status ?? state.value.runStatus }
        await refreshHistory().catch(() => undefined)
      } else if (error instanceof ApiRequestError && error.status === 404) {
        await refreshHistory().catch(() => undefined)
      } else {
        state.value = {
          ...state.value,
          error: {
            code: 'cancel_failed',
            message: errorMessage(error, '停止失败，请稍后重试'),
            retryable: true,
          },
        }
      }
    } finally {
      recoveryBusy.value = false
    }
  }

  async function refresh(): Promise<void> {
    const runId = state.value.runId
    // 降级（续流失败/回放上限）时 run 可能仍在运行：走 adoptRun 重新校验、
    // 回放补卡并恢复轮询，而不是只刷新历史消息。
    if (
      runId &&
      (state.value.streaming ||
        state.value.runStatus === 'interrupted' ||
        connection.value === 'degraded')
    ) {
      await adoptRun(runId)
      return
    }
    await refreshHistory()
  }

  /**
   * M5：按审批 id 处理，一轮多审批时每张卡片独立决定。
   *
   * `resumed=false` 不一定是失败：`本轮还有其他审批待处理` 与 `运行已结束`
   * 都是正常语义，只有其他原因才展示恢复失败横幅。
   */
  async function resolveApprovalById(
    approvalId: string,
    approve: boolean,
    note = '',
  ): Promise<ApprovalOutcome> {
    const decision = approve ? 'approve' : 'reject'
    if (resolvingApproval.value) {
      return {
        approvalId,
        decision,
        kind: 'failed',
        message: '正在处理其他审批，请稍候',
        resumed: false,
      }
    }

    resolvingApproval.value = true
    resolvingApprovalId.value = approvalId
    // 决定开始后，之前在途的审批列表响应不能再覆盖本次决定结果。
    approvalsSyncSeq += 1
    try {
      const result = await approvalsApi.decide(approvalId, {
        decision,
        ...(note ? { note } : {}),
      })
      state.value = markApprovalResolved(state.value, approvalId, decision)

      if (result.resumed) {
        // 流可能已经先发出 message.done（尤其是 mock/快速路径）；终态优先，
        // 不要让迟到的决定响应把 finishReason 覆盖回 null。
        const terminal =
          state.value.runStatus === 'succeeded' ||
          state.value.runStatus === 'failed' ||
          state.value.runStatus === 'canceled'
        if (!terminal) {
          state.value = {
            ...state.value,
            streaming: true,
            runStatus: 'running',
            finishReason: null,
            error: null,
            recovery: null,
          }
        }
        // 流已因 HITL 空闲超时关闭时没有活动的 SSE，改用轮询跟进恢复。
        if (!controller) void adoptRun(result.run_id)
        return {
          approvalId,
          decision,
          kind: 'resumed',
          message: approve ? '已批准，运行将继续' : '已拒绝，运行将继续收尾',
          resumed: true,
        }
      }

      if (result.resume_error === '本轮还有其他审批待处理') {
        state.value = {
          ...state.value,
          streaming: true,
          runStatus: 'interrupted',
          recovery: null,
        }
        return {
          approvalId,
          decision,
          kind: 'waiting_others',
          message: '审批已记录，本轮还有其他审批待处理',
          resumed: false,
        }
      }

      if (result.resume_error === '运行已结束' || result.resume_error === '运行不存在') {
        state.value = markAllApprovalsResolved({
          ...state.value,
          streaming: false,
          recovery: null,
        })
        await refreshHistory().catch(() => undefined)
        return {
          approvalId,
          decision,
          kind: 'run_ended',
          message: '审批已记录，运行已结束',
          resumed: false,
        }
      }

      state.value = {
        ...state.value,
        streaming: false,
        recovery: {
          kind: 'approval_resume_failed',
          code: 'approval_resume_failed',
          message:
            result.resume_error ??
            '审批已记录，但当前后端未能自动恢复运行；可刷新状态或放弃本轮。',
          runId: result.run_id,
          runStatus: state.value.runStatus,
          retryable: false,
        },
      }
      await refreshHistory().catch(() => undefined)
      return {
        approvalId,
        decision,
        kind: 'not_resumed',
        message: result.resume_error ?? '审批已记录，但运行未自动恢复',
        resumed: false,
      }
    } catch (error) {
      if (error instanceof ApiRequestError && error.code === 'approval_expired') {
        state.value = markApprovalExpired(state.value, approvalId)
        state.value = { ...state.value, streaming: false, recovery: null }
        await refreshHistory().catch(() => undefined)
        return {
          approvalId,
          decision,
          kind: 'expired',
          message: '审批已过期，无法继续执行',
          resumed: false,
        }
      }
      if (error instanceof ApiRequestError && error.code === 'approval_already_decided') {
        // 用服务端真实状态覆盖卡片，避免把本次尝试的 approve/reject 写成结论。
        try {
          const approval = await approvalsApi.detail(approvalId)
          state.value = hydrateApprovals(state.value, [approval])
          if (approval.status !== 'pending') {
            state.value = clearPendingApproval(state.value, approvalId)
          }
        } catch {
          state.value = markApprovalClosed(state.value, approvalId)
        }
        await refreshHistory().catch(() => undefined)
        return {
          approvalId,
          decision,
          kind: 'already_decided',
          message: '审批已在别处处理，请刷新查看结果',
          resumed: false,
        }
      }
      return {
        approvalId,
        decision,
        kind: 'failed',
        message: errorMessage(error, '审批失败，请稍后重试'),
        resumed: false,
      }
    } finally {
      resolvingApproval.value = false
      resolvingApprovalId.value = null
    }
  }

  /** 兼容单审批调用方：处理当前第一个待审审批。 */
  async function resolveApproval(approve: boolean): Promise<ApprovalOutcome> {
    const approvalId = state.value.pendingApprovalId ?? state.value.pendingApprovalIds[0] ?? null
    if (!approvalId) {
      return {
        approvalId: '',
        decision: approve ? 'approve' : 'reject',
        kind: 'failed',
        message: '当前没有待处理审批',
        resumed: false,
      }
    }
    return resolveApprovalById(approvalId, approve)
  }

  async function loadOlder(): Promise<void> {
    const conversationId = state.value.conversationId
    const cursor = historyCursor.value
    if (!conversationId || !cursor || loadingOlder.value || !historyHasMore.value) return
    loadingOlder.value = true
    try {
      const page = await conversationsApi.messages(conversationId, {
        limit: HISTORY_PAGE_SIZE,
        cursor,
      })
      const older = page.items.map(toView).reverse()
      const existingIds = new Set(state.value.messages.map((message) => message.id))
      state.value = {
        ...state.value,
        messages: sortMessages([
          ...older.filter((message) => !existingIds.has(message.id)),
          ...state.value.messages,
        ]),
      }
      historyHasMore.value = page.has_more
      historyCursor.value = page.next_cursor
    } finally {
      loadingOlder.value = false
    }
  }

  /** 快速切换会话时只允许最后一次请求写入 state。 */
  let loadConversationSeq = 0

  async function loadConversation(id: string): Promise<void> {
    const seq = ++loadConversationSeq
    resetReconnectBudget()
    connection.value = 'idle'
    controller?.abort()
    controller = null
    cancelRaf()
    clearPolling()
    pendingDeltas.clear()
    lastAttempt.value = null
    historyHasMore.value = false
    historyCursor.value = null
    state.value = { ...createInitialChatState(), conversationId: id }
    loadingHistory.value = true
    try {
      const [page, conversation] = await Promise.all([
        conversationsApi.messages(id, { limit: HISTORY_PAGE_SIZE }),
        conversationsApi.get(id),
      ])
      if (seq !== loadConversationSeq) return
      const lastRun = conversation.last_run
      const lastRunStatus = normalizeRunStatus(lastRun?.status)
      state.value = {
        ...state.value,
        conversationTitle: conversation.title,
        messages: page.items.map(toView).reverse(),
        runId: lastRun?.id ?? null,
        runStatus: lastRunStatus,
      }
      historyHasMore.value = page.has_more
      historyCursor.value = page.next_cursor

      if (lastRun && lastRunStatus && ACTIVE_RUN_STATUSES.includes(lastRunStatus)) {
        const interrupted = lastRunStatus === 'interrupted'
        state.value = {
          ...state.value,
          streaming: !interrupted,
          recovery: {
            kind: interrupted ? 'run_interrupted' : 'run_in_progress',
            code: interrupted ? 'run_interrupted' : 'run_in_progress',
            message: interrupted
              ? '该运行正在等待审批或人工输入，处理后才能继续发送。'
              : '该会话已有运行中的请求，可等待完成或先停止当前运行。',
            runId: lastRun.id,
            runStatus: lastRunStatus,
            retryable: false,
          },
        }
        if (interrupted) void syncPendingApprovals(lastRun.id)
        schedulePolling(lastRun.id)
      }
    } catch (error) {
      if (seq !== loadConversationSeq) return
      throw error
    } finally {
      if (seq === loadConversationSeq) loadingHistory.value = false
    }
  }

  function reset(): void {
    resetReconnectBudget()
    connection.value = 'idle'
    controller?.abort()
    controller = null
    cancelRaf()
    clearPolling()
    clearRateLimit()
    pendingDeltas.clear()
    lastAttempt.value = null
    historyHasMore.value = false
    historyCursor.value = null
    state.value = createInitialChatState()
  }

  function setConversation(id: string | null, title = ''): void {
    resetReconnectBudget()
    connection.value = 'idle'
    controller?.abort()
    controller = null
    state.value = {
      ...state.value,
      conversationId: id,
      conversationTitle: title,
      runStatus: null,
      recovery: null,
    }
  }

  // 诊断抽屉的运行时上下文：chat store 是 run/conversation 的唯一来源。
  watch(
    () => [state.value.runId, state.value.conversationId] as const,
    ([runId, conversationId]) => {
      setRuntimeContext({ runId: runId ?? null, conversationId: conversationId ?? null })
    },
    { immediate: true },
  )

  return {
    state,
    messages,
    processItems,
    streaming,
    recovery,
    connection,
    reconnectAttempt,
    pendingApproval,
    pendingApprovals,
    pendingScrollMessageId,
    requestScrollToMessage,
    clearPendingScroll,
    loadingHistory,
    loadingOlder,
    resolvingApproval,
    resolvingApprovalId,
    recoveryBusy,
    rateLimitRemaining,
    rateLimitActive,
    historyHasMore,
    canRetry,
    send,
    retry,
    stop,
    stopReconnect,
    refresh,
    adoptRun,
    resolveApproval,
    resolveApprovalById,
    loadOlder,
    loadConversation,
    reset,
    setConversation,
  }
})
