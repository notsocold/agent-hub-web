import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import { approvalsApi } from '@/api/approvals'
import { openChatStream } from '@/api/chat'
import { ApiRequestError, notifyUnauthorized } from '@/api/client'
import { conversationsApi } from '@/api/conversations'
import { runsApi } from '@/api/runs'
import { createInitialChatState, markApprovalResolved, reduceChat } from './chat-reducer'
import type {
  ChatContextSelection,
  ChatEventName,
  ChatMessage,
  ChatMessageView,
  ChatRecovery,
  ChatState,
  RunStatus,
} from '@/types'

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
  const recoveryBusy = ref(false)
  const historyHasMore = ref(false)
  const historyCursor = ref<string | null>(null)
  const lastAttempt = ref<ChatAttempt | null>(null)

  let controller: AbortController | null = null
  let rafId: number | null = null
  let pollTimer: ReturnType<typeof setInterval> | null = null
  let pollRunId: string | null = null
  const pendingDeltas = new Map<string, { text: string; seq: number }>()

  const messages = computed(() => state.value.messages)
  const processItems = computed(() => state.value.process)
  const streaming = computed(() => state.value.streaming)
  const recovery = computed(() => state.value.recovery)
  const canRetry = computed(
    () =>
      Boolean(lastAttempt.value) &&
      !state.value.streaming &&
      state.value.recovery?.kind !== 'run_in_progress' &&
      state.value.recovery?.kind !== 'run_interrupted',
  )
  const pendingApproval = computed(() => {
    const id = state.value.pendingApprovalId
    if (!id) return null
    return (
      state.value.process.find((item) => item.kind === 'approval' && item.approvalId === id) ?? null
    )
  })

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

  function onOpen(runId: string | null): void {
    // 新连接（含幂等回放）的 seq 从 1 开始，先重置去重基线；
    // 否则同 run 的重复请求会被旧 lastSeq 全部丢弃。
    state.value = {
      ...state.value,
      lastSeq: 0,
      runId: runId ?? state.value.runId,
      runStatus: state.value.runStatus ?? 'running',
      streaming: true,
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
  }

  function onError(error: Error): void {
    flushDeltas()
    if (state.value.error) return
    state.value = {
      ...state.value,
      streaming: false,
      error: { code: 'stream_error', message: error.message },
    }
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

  async function adoptRun(runId: string): Promise<void> {
    clearPolling()
    pollRunId = runId
    recoveryBusy.value = true
    try {
      const run = await runsApi.get(runId)
      state.value = {
        ...state.value,
        runId: run.id,
        runStatus: run.status,
        streaming: run.status === 'running' || run.status === 'queued',
      }
      if (isTerminal(run.status)) {
        state.value = { ...state.value, streaming: false }
        setRecovery(null)
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
            ? '该运行正在等待审批或人工输入，处理后才能继续发送。'
            : '该会话已有运行中的请求，可等待完成或先停止当前运行。',
          runId: run.id,
          runStatus: run.status,
          retryable: false,
        },
      }
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
        state.value = { ...state.value, streaming: false }
        setRecovery(null)
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
            ? '该运行正在等待审批或人工输入，处理后才能继续发送。'
            : '该会话已有运行中的请求，可等待完成或先停止当前运行。',
          runId: run.id,
          runStatus: run.status,
          retryable: false,
        },
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

    state.value = {
      ...state.value,
      conversationId,
      conversationTitle: conversation.title,
      messages: sortMessages([...preserved, ...fetched]),
      runId: conversation.last_run?.id ?? state.value.runId,
      runStatus:
        normalizeRunStatus(conversation.last_run?.status) ?? state.value.runStatus,
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
        error: { code: error.code, message: error.message, retryable: false },
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
    if (state.value.streaming) return
    controller?.abort()
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
      runStatus: 'queued',
      finishReason: null,
      error: null,
      recovery: null,
      usage: null,
      pendingApprovalId: null,
      currentAssistantId: null,
      process: [],
      lastSeq: 0,
    }

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
          onOpen,
          onEvent,
          onError,
        },
      )
    } catch (error) {
      if (isAbort(error) || currentController.signal.aborted) return
      failed = true
      if (error instanceof ApiRequestError) {
        await handleApiFailure(error, attempt)
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
      }
    } finally {
      flushDeltas()
      cancelRaf()
      if (controller === currentController) controller = null
      if (!failed && !currentController.signal.aborted) {
        state.value = { ...state.value, streaming: false }
        // 断线/回放时增量可能缺失，以服务端历史为准；同时补齐标题与计数。
        await refreshHistory().catch(() => undefined)
      }
    }
  }

  async function send(text: string, context: ChatContextSelection = {}): Promise<void> {
    const trimmed = text.trim()
    if (!trimmed || state.value.streaming) return
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
    if (!attempt || state.value.streaming) return
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
    if (runId && (state.value.streaming || state.value.runStatus === 'interrupted')) {
      await adoptRun(runId)
      return
    }
    await refreshHistory()
  }

  async function resolveApproval(approve: boolean): Promise<void> {
    const approvalId = state.value.pendingApprovalId
    if (!approvalId || resolvingApproval.value) return

    resolvingApproval.value = true
    try {
      const result = await approvalsApi.decide(approvalId, {
        decision: approve ? 'approve' : 'reject',
      })
      state.value = markApprovalResolved(state.value, approvalId, approve ? 'approve' : 'reject')
      if (result.resumed) {
        state.value = { ...state.value, streaming: true, recovery: null }
        return
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
    } finally {
      resolvingApproval.value = false
    }
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

  async function loadConversation(id: string): Promise<void> {
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
        schedulePolling(lastRun.id)
      }
    } finally {
      loadingHistory.value = false
    }
  }

  function reset(): void {
    controller?.abort()
    controller = null
    cancelRaf()
    clearPolling()
    pendingDeltas.clear()
    lastAttempt.value = null
    historyHasMore.value = false
    historyCursor.value = null
    state.value = createInitialChatState()
  }

  function setConversation(id: string | null, title = ''): void {
    state.value = {
      ...state.value,
      conversationId: id,
      conversationTitle: title,
      runStatus: null,
      recovery: null,
    }
  }

  return {
    state,
    messages,
    processItems,
    streaming,
    recovery,
    pendingApproval,
    loadingHistory,
    loadingOlder,
    resolvingApproval,
    recoveryBusy,
    historyHasMore,
    canRetry,
    send,
    retry,
    stop,
    refresh,
    adoptRun,
    resolveApproval,
    loadOlder,
    loadConversation,
    reset,
    setConversation,
  }
})
