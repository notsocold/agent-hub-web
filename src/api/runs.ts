import { fetchEventSource } from '@microsoft/fetch-event-source'

import { isMockEnabled } from './mock'
import {
  ApiRequestError,
  apiClient,
  apiErrorFromResponse,
  notifyUnauthorized,
  refreshSession,
  resolveBaseUrl,
} from './client'
import { isChatEvent, readErrorBody } from './chat'
import type {
  ChatStreamHandlers,
  PageResult,
  Run,
  RunCancelResult,
  RunEvent,
  RunResumeRequest,
  RunResumeResult,
} from '@/types'
import { storage } from '@/utils/storage'

export interface RunEventParams {
  limit?: number
  cursor?: string
  after_seq?: number
  types?: string
  q?: string
}

/**
 * M7：运行事件续流（GET + Bearer）。
 *
 * 浏览器 `EventSource` 不支持自定义请求头，因此必须用 `fetch-event-source`。
 * 帧格式与 `POST /chat/stream` 一致；后端先回放 `seq > after_seq` 的已落库
 * 事件，再跟随实时事件，终态后关闭。`after_seq` 由调用方传 `lastSeq`，
 * 回放事件与实时事件统一交给 `onEvent`，由 store 的 `seq` 去重。
 */
async function connectRunStream(
  runId: string,
  afterSeq: number,
  handlers: ChatStreamHandlers,
): Promise<void> {
  await fetchEventSource(
    `${resolveBaseUrl()}/runs/${encodeURIComponent(runId)}/stream?after_seq=${afterSeq}`,
    {
      method: 'GET',
      headers: {
        Accept: 'text/event-stream',
        Authorization: `Bearer ${storage.getAccessToken() ?? ''}`,
      },
      signal: handlers.signal,
      openWhenHidden: true,
      // Node 测试环境没有 window.fetch；显式用 globalThis.fetch 保持可测。
      fetch: ((...args: Parameters<typeof fetch>) => globalThis.fetch(...args)) as typeof fetch,

      async onopen(response) {
        if (!response.ok) {
          // 404 不泄露存在性；400 replay_too_large 由 store 降级轮询。
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
          console.debug('[runs] 忽略未知续流事件', event.event)
          return
        }
        let data: unknown = {}
        if (event.data) {
          try {
            data = JSON.parse(event.data) as unknown
          } catch {
            console.warn('[runs] 无法解析续流数据帧', event.data)
            return
          }
        }
        handlers.onEvent(event.event, data)
      },

      onerror(error) {
        if (error instanceof ApiRequestError) {
          // 交回外层按 401 刷新 / 400 降级处理，避免重复回调 onError。
          throw error
        }
        handlers.onError(error instanceof Error ? error : new Error(String(error)))
        throw error
      },

      onclose() {
        handlers.onClose?.()
      },
    },
  )
}

async function streamOnce(
  runId: string,
  afterSeq: number,
  handlers: ChatStreamHandlers,
): Promise<void> {
  if (isMockEnabled()) {
    const { mockRunStream } = await import('@/api/mock/stream')
    await mockRunStream(runId, afterSeq, handlers)
    return
  }
  await connectRunStream(runId, afterSeq, handlers)
}

export const runsApi = {
  async get(id: string): Promise<Run> {
    const { data } = await apiClient.get<Run>(`/runs/${id}`)
    return data
  },

  async events(id: string, params: RunEventParams = {}): Promise<PageResult<RunEvent>> {
    const { data } = await apiClient.get<PageResult<RunEvent>>(`/runs/${id}/events`, { params })
    return data
  },

  async cancel(id: string): Promise<RunCancelResult> {
    const { data } = await apiClient.post<RunCancelResult>(`/runs/${id}/cancel`)
    return data
  },

  /** M2 起可用；M1 对非 interrupted 运行返回 409，前端把它当状态提示而非致命错误。 */
  async resume(id: string, body: RunResumeRequest): Promise<RunResumeResult> {
    const { data } = await apiClient.post<RunResumeResult>(`/runs/${id}/resume`, body)
    return data
  },

  /**
   * M7：从 `afterSeq` 续流。与 `openChatStream` 同语义：401 用单飞 refresh
   * 重试一次，refresh 仍 401 时通知外壳回登录页。
   */
  async stream(
    runId: string,
    afterSeq: number,
    handlers: ChatStreamHandlers,
  ): Promise<void> {
    try {
      await streamOnce(runId, afterSeq, handlers)
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 401) {
        try {
          await refreshSession()
          await streamOnce(runId, afterSeq, handlers)
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
  },
}
