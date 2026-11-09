import { fetchEventSource } from '@microsoft/fetch-event-source'

import { isMockEnabled } from './mock'
import { resolveBaseUrl } from './client'
import type { ChatEventName, ChatStreamRequest, StreamHandlers } from '@/types'
import { storage } from '@/utils/storage'

const CHAT_EVENTS = new Set<ChatEventName>([
  'conversation.created',
  'run.started',
  'message.created',
  'message.started',
  'message.delta',
  'reasoning.delta',
  'reasoning.done',
  'skill.activated',
  'tool.start',
  'tool.result',
  'a2a.task',
  'a2a.artifact',
  'a2a.input_required',
  'a2a.auth_required',
  'approval.required',
  'workflow.step',
  'memory.saved',
  'notice',
  'message.done',
  'error',
  'ping',
])

function isChatEvent(value: string): value is ChatEventName {
  return CHAT_EVENTS.has(value as ChatEventName)
}

export async function openChatStream(
  payload: ChatStreamRequest,
  handlers: StreamHandlers,
): Promise<void> {
  if (isMockEnabled()) {
    const { mockChatStream } = await import('@/api/mock/stream')
    await mockChatStream(payload, handlers)
    return
  }

  await fetchEventSource(`${resolveBaseUrl()}/chat/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      Authorization: `Bearer ${storage.getAccessToken() ?? ''}`,
    },
    body: JSON.stringify(payload),
    signal: handlers.signal,
    openWhenHidden: true,

    async onopen(response) {
      const contentType = response.headers.get('content-type') ?? ''
      if (!response.ok || !contentType.includes('text/event-stream')) {
        throw new Error(`SSE 连接失败：HTTP ${response.status}`)
      }
      handlers.onOpen?.(response.headers.get('X-Run-ID'))
    },

    onmessage(event) {
      if (!event.event || event.event === 'ping') return
      if (!isChatEvent(event.event)) {
        console.debug('[chat] 忽略未知事件', event.event)
        return
      }
      let data: unknown = {}
      if (event.data) {
        try {
          data = JSON.parse(event.data) as unknown
        } catch {
          console.warn('[chat] 无法解析 SSE 数据帧', event.data)
          return
        }
      }
      handlers.onEvent(event.event, data)
    },

    onerror(error) {
      handlers.onError(error instanceof Error ? error : new Error(String(error)))
      throw error
    },
  })
}
