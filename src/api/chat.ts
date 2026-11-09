import { fetchEventSource } from '@microsoft/fetch-event-source'

import { isMockEnabled } from './mock'
import {
  ApiRequestError,
  apiErrorFromResponse,
  notifyUnauthorized,
  refreshSession,
  resolveBaseUrl,
} from './client'
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

async function readErrorBody(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    try {
      return await response.text()
    } catch {
      return null
    }
  }
}

async function connectOnce(payload: ChatStreamRequest, handlers: StreamHandlers): Promise<void> {
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
      if (!response.ok) {
        // 409 run_in_progress / 403 capability_disabled 等错误体是 JSON 信封，
        // 必须在 onopen 里读出来，否则 fetch-event-source 只会抛 HTTP 状态。
        throw apiErrorFromResponse(response.status, await readErrorBody(response))
      }
      const contentType = response.headers.get('content-type') ?? ''
      if (!contentType.includes('text/event-stream')) {
        throw new ApiRequestError('SSE 响应不是 text/event-stream', {
          code: 'invalid_sse_response',
          status: response.status,
        })
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
      if (error instanceof ApiRequestError) {
        // 交给外层统一处理（409 恢复、401 刷新），不要再回调 onError。
        throw error
      }
      handlers.onError(error instanceof Error ? error : new Error(String(error)))
      throw error
    },
  })
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

  try {
    await connectOnce(payload, handlers)
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 401) {
      try {
        await refreshSession()
        await connectOnce(payload, handlers)
        return
      } catch (retryError) {
        if (retryError instanceof ApiRequestError && retryError.status === 401) {
          notifyUnauthorized()
        }
        throw retryError
      }
    }
    throw error
  }
}
