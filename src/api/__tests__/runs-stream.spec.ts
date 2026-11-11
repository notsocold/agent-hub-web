import { fetchEventSource } from '@microsoft/fetch-event-source'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiRequestError, notifyUnauthorized, refreshSession } from '@/api/client'
import { runsApi } from '@/api/runs'
import type { AuthTokens, ChatStreamHandlers } from '@/types'
import { storage } from '@/utils/storage'

vi.mock('@microsoft/fetch-event-source', () => ({ fetchEventSource: vi.fn() }))
vi.mock('@/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/client')>()
  return { ...actual, refreshSession: vi.fn(), notifyUnauthorized: vi.fn() }
})

const tokens: AuthTokens = {
  access_token: 'access-2',
  refresh_token: 'refresh-2',
  token_type: 'bearer',
  expires_in: 900,
}

function handlers(): ChatStreamHandlers & { signal: AbortSignal } {
  return {
    onOpen: vi.fn(),
    onEvent: vi.fn(),
    onError: vi.fn(),
    onClose: vi.fn(),
    signal: new AbortController().signal,
  }
}

function sseResponse(runId = 'run-1'): Response {
  return {
    ok: true,
    status: 200,
    headers: new Headers({
      'content-type': 'text/event-stream',
      'X-Run-ID': runId,
    }),
  } as unknown as Response
}

function apiError(status: number, code: string, message: string): ApiRequestError {
  return new ApiRequestError(message, { code, status })
}

describe('runsApi.stream 运行事件续流', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    storage.setTokens(tokens)
  })

  it('用 GET + Bearer 携带 after_seq，并把事件交给 onEvent', async () => {
    vi.mocked(fetchEventSource).mockImplementation(async (url, options) => {
      await options.onopen?.(sseResponse())
      options.onmessage?.({ id: '2', event: 'approval.required', data: '{"approval_id":"ap-1"}' })
      options.onmessage?.({ id: '', event: 'ping', data: '' })
      options.onmessage?.({ id: '0', event: 'unknown.event', data: '{}' })
    })
    const streamHandlers = handlers()

    await runsApi.stream('run-1', 7, streamHandlers)

    expect(fetchEventSource).toHaveBeenCalledTimes(1)
    const [url, options] = vi.mocked(fetchEventSource).mock.calls[0]!
    expect(url).toBe('/api/v1/runs/run-1/stream?after_seq=7')
    expect(options?.method).toBe('GET')
    expect(options?.headers).toMatchObject({ Authorization: 'Bearer access-2' })
    expect(streamHandlers.onOpen).toHaveBeenCalledWith('run-1')
    expect(streamHandlers.onEvent).toHaveBeenCalledTimes(1)
    expect(streamHandlers.onEvent).toHaveBeenCalledWith('approval.required', {
      approval_id: 'ap-1',
    })
  })

  it('非 2xx 时抛出携带后端信封的 ApiRequestError', async () => {
    vi.mocked(fetchEventSource).mockImplementation(async () => {
      throw apiError(404, 'not_found', '运行不存在')
    })
    const streamHandlers = handlers()

    await expect(runsApi.stream('missing', 0, streamHandlers)).rejects.toMatchObject({
      status: 404,
      code: 'not_found',
    })
  })

  it('401 时用单飞 refresh 重试一次', async () => {
    vi.mocked(refreshSession).mockResolvedValue(tokens)
    vi.mocked(fetchEventSource)
      .mockRejectedValueOnce(apiError(401, 'unauthorized', '请先登录'))
      .mockImplementationOnce(async (_url, options) => {
        await options.onopen?.(sseResponse())
        options.onmessage?.({ id: '1', event: 'message.done', data: '{"run_id":"run-1"}' })
      })
    const streamHandlers = handlers()

    await runsApi.stream('run-1', 0, streamHandlers)

    expect(refreshSession).toHaveBeenCalledTimes(1)
    expect(fetchEventSource).toHaveBeenCalledTimes(2)
    expect(streamHandlers.onEvent).toHaveBeenCalledWith('message.done', { run_id: 'run-1' })
  })

  it('refresh 仍 401 时通知外壳回登录页', async () => {
    vi.mocked(refreshSession).mockRejectedValue(apiError(401, 'unauthorized', '刷新失败'))
    vi.mocked(fetchEventSource).mockRejectedValue(apiError(401, 'unauthorized', '请先登录'))

    await expect(runsApi.stream('run-1', 0, handlers())).rejects.toMatchObject({ status: 401 })
    expect(notifyUnauthorized).toHaveBeenCalledTimes(1)
  })

  it('400 replay_too_large 原样抛给 store 降级，不重试', async () => {
    vi.mocked(fetchEventSource).mockRejectedValue(
      apiError(400, 'replay_too_large', '回放事件超过 1000 条'),
    )

    await expect(runsApi.stream('run-1', 0, handlers())).rejects.toMatchObject({
      status: 400,
      code: 'replay_too_large',
    })
    expect(fetchEventSource).toHaveBeenCalledTimes(1)
  })
})
