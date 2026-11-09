import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiRequestError, createHttpClient } from '@/api/client'
import type { AuthTokens } from '@/types'
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
})
