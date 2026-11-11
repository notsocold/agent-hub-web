import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiRequestError, createHttpClient } from '@/api/client'
import type { AuthTokens } from '@/types'
import { getRecentErrors, getRecentRequests, resetDiagnostics } from '@/utils/diagnostics'
import { storage } from '@/utils/storage'

const tokens: AuthTokens = {
  access_token: 'new-token',
  refresh_token: 'new-refresh',
  token_type: 'bearer',
  expires_in: 900,
}

function ok(config: InternalAxiosRequestConfig, data: unknown = { ok: true }): AxiosResponse {
  return {
    data,
    status: 200,
    statusText: 'OK',
    headers: {},
    config,
  }
}

function unauthorized(config: InternalAxiosRequestConfig): AxiosError {
  return new AxiosError(
    'Request failed with status code 401',
    'ERR_BAD_REQUEST',
    config,
    undefined,
    {
      data: { error: { code: 'unauthorized', message: '请先登录', request_id: 'req-1' } },
      status: 401,
      statusText: 'Unauthorized',
      headers: {},
      config,
    },
  )
}

describe('api client', () => {
  beforeEach(() => {
    storage.clearTokens()
  })

  it('把错误信封转换成 ApiRequestError', async () => {
    const client = createHttpClient({ baseURL: '/api/v1' })
    client.defaults.adapter = async (config) => {
      throw new AxiosError('Unprocessable', 'ERR_BAD_REQUEST', config, undefined, {
        data: {
          error: {
            code: 'validation_error',
            message: '参数不合法',
            request_id: 'req-42',
          },
        },
        status: 422,
        statusText: 'Unprocessable Entity',
        headers: {},
        config,
      })
    }

    let caught: unknown
    try {
      await client.get('/anything')
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(ApiRequestError)
    const apiError = caught as ApiRequestError
    expect(apiError.code).toBe('validation_error')
    expect(apiError.status).toBe(422)
    expect(apiError.requestId).toBe('req-42')
    expect(apiError.message).toBe('参数不合法')
    expect(apiError.details).toEqual({})
  })

  it('保留 409 错误信封里的 details.run_id', async () => {
    const client = createHttpClient({ baseURL: '/api/v1' })
    client.defaults.adapter = async (config) => {
      throw new AxiosError('Conflict', 'ERR_BAD_REQUEST', config, undefined, {
        data: {
          error: {
            code: 'run_in_progress',
            message: '该会话已有运行中的请求',
            request_id: 'req-409',
            details: { run_id: 'run-abc' },
          },
        },
        status: 409,
        statusText: 'Conflict',
        headers: {},
        config,
      })
    }

    await expect(client.get('/anything')).rejects.toMatchObject({
      code: 'run_in_progress',
      status: 409,
      details: { run_id: 'run-abc' },
    })
  })

  it('并发 401 只刷新一次，并用新 token 重放请求', async () => {
    let refreshCalls = 0
    const onUnauthorized = vi.fn()
    const client = createHttpClient({
      baseURL: '/api/v1',
      refresh: async () => {
        refreshCalls += 1
        storage.setTokens(tokens)
        return tokens
      },
      onUnauthorized,
    })
    storage.setTokens({ ...tokens, access_token: 'old-token' })

    client.defaults.adapter = async (config) => {
      if (config.headers.get('Authorization') === 'Bearer new-token') {
        return ok(config)
      }
      throw unauthorized(config)
    }

    const [first, second] = await Promise.all([client.get('/a'), client.get('/b')])

    expect(refreshCalls).toBe(1)
    expect(onUnauthorized).not.toHaveBeenCalled()
    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
  })

  it('刷新失败时清空 token 并通知调用方', async () => {
    const onUnauthorized = vi.fn()
    const client = createHttpClient({
      baseURL: '/api/v1',
      refresh: async () => {
        throw new Error('refresh expired')
      },
      onUnauthorized,
    })
    storage.setTokens({ ...tokens, access_token: 'old-token' })
    client.defaults.adapter = async (config) => {
      throw unauthorized(config)
    }

    await expect(client.get('/a')).rejects.toMatchObject({ code: 'unauthorized', status: 401 })
    expect(onUnauthorized).toHaveBeenCalledTimes(1)
    expect(storage.getAccessToken()).toBeNull()
    expect(storage.getRefreshToken()).toBeNull()
  })

  it('成功响应记录 X-Request-ID / X-Trace-ID 到诊断缓冲', async () => {
    resetDiagnostics()
    const client = createHttpClient({ baseURL: '/api/v1' })
    client.defaults.adapter = async (config) => ({
      data: { ok: true },
      status: 200,
      statusText: 'OK',
      headers: { 'x-request-id': 'req-ok', 'x-trace-id': 'trace-1' },
      config,
    })

    await client.get('/anything')

    const rows = getRecentRequests()
    expect(rows[0]?.requestId).toBe('req-ok')
    expect(rows[0]?.traceId).toBe('trace-1')
    expect(rows[0]?.status).toBe(200)
    expect(rows[0]?.url).toBe('/anything')
  })

  it('失败响应把结构化错误写进诊断错误缓冲', async () => {
    resetDiagnostics()
    const client = createHttpClient({ baseURL: '/api/v1' })
    client.defaults.adapter = async (config) => {
      throw new AxiosError('Forbidden', 'ERR_BAD_REQUEST', config, undefined, {
        data: { error: { code: 'forbidden', message: '无权限', request_id: 'req-forbidden' } },
        status: 403,
        statusText: 'Forbidden',
        headers: {},
        config,
      })
    }

    await expect(client.get('/x')).rejects.toMatchObject({ code: 'forbidden' })
    expect(getRecentErrors()[0]?.requestId).toBe('req-forbidden')
    expect(getRecentRequests()[0]?.status).toBe(403)
  })
})

describe('api client 错误文案收口（M7）', () => {
  function failingClient(
    status: number,
    error: { code: string; message: string; details?: Record<string, unknown> },
  ) {
    const client = createHttpClient({ baseURL: '/api/v1' })
    client.defaults.adapter = async (config) => {
      throw new AxiosError('Request failed', 'ERR_BAD_REQUEST', config, undefined, {
        data: { error: { ...error, request_id: 'req-m7' } },
        status,
        statusText: 'Error',
        headers: {},
        config,
      })
    }
    return client
  }

  it('403 forbidden 统一为管理员权限文案，保留 code 与 required_role', async () => {
    const client = failingClient(403, {
      code: 'forbidden',
      message: '需要管理员权限',
      details: { required_role: 'admin' },
    })

    await expect(client.get('/agents')).rejects.toMatchObject({
      code: 'forbidden',
      status: 403,
      message: '当前账号无管理员权限',
      details: { required_role: 'admin' },
    })
  })

  it('503 数据库/服务不可用统一文案', async () => {
    for (const code of ['database_unavailable', 'service_unavailable']) {
      const client = failingClient(503, { code, message: '内部细节' })
      await expect(client.get('/x')).rejects.toMatchObject({
        code,
        status: 503,
        message: '服务暂不可用，请稍后重试',
      })
    }
  })

  it('登录 401 是凭据错误：不 refresh、不登出，展示后端文案', async () => {
    const refresh = vi.fn(async () => tokens)
    const onUnauthorized = vi.fn()
    const client = createHttpClient({ baseURL: '/api/v1', refresh, onUnauthorized })
    client.defaults.adapter = async (config) => {
      throw new AxiosError('Unauthorized', 'ERR_BAD_REQUEST', config, undefined, {
        data: {
          error: { code: 'invalid_credentials', message: '邮箱或密码错误', request_id: 'req-login' },
        },
        status: 401,
        statusText: 'Unauthorized',
        headers: {},
        config,
      })
    }

    await expect(client.post('/auth/login', {})).rejects.toMatchObject({
      code: 'invalid_credentials',
      message: '邮箱或密码错误',
      status: 401,
    })
    expect(refresh).not.toHaveBeenCalled()
    expect(onUnauthorized).not.toHaveBeenCalled()
  })
})
