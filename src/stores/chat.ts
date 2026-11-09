import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import { approvalsApi } from '@/api/approvals'
import { openChatStream } from '@/api/chat'
import { conversationsApi } from '@/api/conversations'
import { runsApi } from '@/api/runs'
import { createInitialChatState, markApprovalResolved, reduceChat } from './chat-reducer'
import type {
  ChatContextSelection,
  ChatEventName,
  ChatMessage,
  ChatMessageView,
  ChatState,
} from '@/types'

function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

function toView(message: ChatMessage): ChatMessageView {
  return {
    ...message,
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
    capabilities: {
      skills: [],
      mcp_servers: [],
      mcp_tools: [],
      knowledge_categories: [],
      workflow_id: null,
    },
    artifacts: [],
    usage: null,
    error: null,
    created_at: new Date().toISOString(),
  }
}

export const useChatStore = defineStore('chat', () => {
  const state = ref<ChatState>(createInitialChatState())
  const loadingHistory = ref(false)
  const resolvingApproval = ref(false)

  let controller: AbortController | null = null
  let rafId: number | null = null
  const pendingDeltas = new Map<string, { text: string; seq: number }>()

  const messages = computed(() => state.value.messages)
  const processItems = computed(() => state.value.process)
  const streaming = computed(() => state.value.streaming)
  const pendingApproval = computed(() => {
    const id = state.value.pendingApprovalId
    if (!id) return null
    return state.value.process.find((item) => item.kind === 'approval' && item.approvalId === id) ?? null
  })

  function cancelRaf(): void {
    if (rafId !== null) {
      window.cancelAnimationFrame(rafId)
      rafId = null
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
    state.value = {
      ...state.value,
      streaming: false,
      error: { code: 'stream_error', message: error.message },
    }
  }

  async function send(
    text: string,
    context: ChatContextSelection = {},
  ): Promise<void> {
    const trimmed = text.trim()
    if (!trimmed || state.value.streaming) return

    const clientMessageId = crypto.randomUUID()
    controller = new AbortController()

    state.value = {
      ...state.value,
      streaming: true,
      finishReason: null,
      error: null,
      usage: null,
      pendingApprovalId: null,
      currentAssistantId: null,
      process: [],
      messages: [...state.value.messages, createUserMessage(trimmed, clientMessageId)],
    }

    try {
      await openChatStream(
        {
          conversation_id: state.value.conversationId ?? undefined,
          message: trimmed,
          client_message_id: clientMessageId,
          ...context,
        },
        {
          signal: controller.signal,
          onEvent,
          onError,
        },
      )
    } catch (error) {
      if (isAbort(error) || controller?.signal.aborted) return
      state.value = {
        ...state.value,
        streaming: false,
        error: {
          code: 'stream_failed',
          message: error instanceof Error ? error.message : '发送失败，请稍后重试',
        },
      }
    } finally {
      flushDeltas()
      cancelRaf()
      controller = null
    }
  }

  function stop(): void {
    const runId = state.value.runId
    controller?.abort()
    controller = null
    flushDeltas()
    cancelRaf()

    state.value = {
      ...state.value,
      streaming: false,
      finishReason: 'canceled',
      messages: state.value.messages.map((message) =>
        message.streaming ? { ...message, streaming: false, status: 'canceled' } : message,
      ),
    }

    if (runId) {
      void runsApi.cancel(runId).catch(() => undefined)
    }
  }

  async function resolveApproval(approve: boolean): Promise<void> {
    const approvalId = state.value.pendingApprovalId
    if (!approvalId || resolvingApproval.value) return

    resolvingApproval.value = true
    try {
      await approvalsApi.decide(approvalId, {
        decision: approve ? 'approve' : 'reject',
      })
      state.value = markApprovalResolved(
        state.value,
        approvalId,
        approve ? 'approve' : 'reject',
      )
    } finally {
      resolvingApproval.value = false
    }
  }

  async function loadConversation(id: string): Promise<void> {
    controller?.abort()
    controller = null
    cancelRaf()
    pendingDeltas.clear()
    state.value = { ...createInitialChatState(), conversationId: id }
    loadingHistory.value = true
    try {
      const [page, conversation] = await Promise.all([
        conversationsApi.messages(id, { limit: 50 }),
        conversationsApi.get(id),
      ])
      state.value = {
        ...state.value,
        conversationTitle: conversation.title,
        messages: page.items.map(toView),
      }
    } finally {
      loadingHistory.value = false
    }
  }

  function reset(): void {
    controller?.abort()
    controller = null
    cancelRaf()
    pendingDeltas.clear()
    state.value = createInitialChatState()
  }

  function setConversation(id: string | null, title = ''): void {
    state.value = { ...state.value, conversationId: id, conversationTitle: title }
  }

  return {
    state,
    messages,
    processItems,
    streaming,
    pendingApproval,
    loadingHistory,
    resolvingApproval,
    send,
    stop,
    resolveApproval,
    loadConversation,
    reset,
    setConversation,
  }
})
