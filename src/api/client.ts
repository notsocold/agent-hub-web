import axios, { type AxiosInstance, type InternalAxiosRequestConfig, type AxiosError } from 'axios'

import type { ApiErrorBody, AuthTokens } from '@/types'
import { storage } from '@/utils/storage'

export class ApiRequestError extends Error {
  readonly code: string
  readonly status: number
  readonly requestId: string
  readonly details: Record<string, unknown>

  constructor(
    message: string,
    options: {
      code: string
      status: number
      requestId?: string
      details?: Record<string, unknown>
    },
  ) {
    super(message)
    this.name = 'ApiRequestError'
    this.code = options.code
    this.status = options.status
    this.requestId = options.requestId ?? ''
    this.details = options.details ?? {}
  }
}

interface RetryableConfig extends InternalAxiosRequestConfig {
  _retry?: boolean
}

interface HttpClientOptions {
  baseURL?: string
  /** 测试注入用；默认实现直接调用 /auth/refresh 并写回 storage。 */
  refresh?: () => Promise<AuthTokens>
  onUnauthorized?: () => void
}

let unauthorizedHandler: (() => void) | null = null

export function setUnauthorizedHandler(handler: (() => void) | null): void {
  unauthorizedHandler = handler
}

export function resolveBaseUrl(): string {
  const configured = import.meta.env.VITE_API_BASE_URL
  return configured && configured.trim() ? configured.replace(/\/$/, '') : '/api/v1'
}

async function defaultRefresh(): Promise<AuthTokens> {
  const refreshToken = storage.getRefreshToken()
  if (!refreshToken) {
    throw new Error('缺少 refresh token')
  }
  const response = await axios.post<AuthTokens>(
    `${resolveBaseUrl()}/auth/refresh`,
    { refresh_token: refreshToken },
    { headers: { Accept: 'application/json' } },
  )
  storage.setTokens(response.data)
  return response.data
}

let sharedRefreshPromise: Promise<AuthTokens> | null = null

/**
 * 供 SSE 等非 axios 通道复用的单飞刷新。后端 refresh token 会旋转，
 * 并发刷新会让先完成的 token 立刻失效，因此必须共享同一个 Promise。
 */
export function refreshSession(): Promise<AuthTokens> {
  if (!sharedRefreshPromise) {
    sharedRefreshPromise = defaultRefresh().finally(() => {
      sharedRefreshPromise = null
    })
  }
  return sharedRefreshPromise
}

function isUnauthorized(error: unknown): error is AxiosError<ApiErrorBody> {
  return axios.isAxiosError(error) && error.response?.status === 401
}

/** 把后端错误信封转换成带 `details` 的 ApiRequestError。 */
export function apiErrorFromResponse(status: number, body: unknown): ApiRequestError {
  const envelope = body as ApiErrorBody | null | undefined
  const code = envelope?.error?.code ?? (status === 0 ? 'network_error' : 'unknown_error')
  const message =
    envelope?.error?.message ??
    (status === 0 ? '网络异常，请稍后重试' : `请求失败（HTTP ${status}）`)
  return new ApiRequestError(message, {
    code,
    status,
    requestId: envelope?.error?.request_id ?? '',
    details: envelope?.error?.details ?? undefined,
  })
}

function toApiRequestError(error: unknown): ApiRequestError {
  if (axios.isAxiosError<ApiErrorBody>(error)) {
    const status = error.response?.status ?? 0
    if (error.response?.data) {
      return apiErrorFromResponse(status, error.response.data)
    }
    return new ApiRequestError(
      status === 0 ? '网络异常，请稍后重试' : error.message || '请求失败',
      { code: status === 0 ? 'network_error' : 'unknown_error', status },
    )
  }
  if (error instanceof ApiRequestError) {
    return error
  }
  return new ApiRequestError(error instanceof Error ? error.message : '请求失败', {
    code: 'unknown_error',
    status: 0,
  })
}

/** SSE 收到 401 且刷新失败时，通知外壳回到登录页。 */
export function notifyUnauthorized(): void {
  unauthorizedHandler?.()
}

export function createHttpClient(options: HttpClientOptions = {}): AxiosInstance {
  const client = axios.create({
    baseURL: options.baseURL ?? resolveBaseUrl(),
    timeout: 30_000,
    headers: { Accept: 'application/json' },
  })

  const refresh = options.refresh ?? refreshSession
  let refreshPromise: Promise<AuthTokens> | null = null

  async function refreshOnce(): Promise<AuthTokens> {
    if (!refreshPromise) {
      refreshPromise = refresh().finally(() => {
        refreshPromise = null
      })
    }
    return refreshPromise
  }

  function handleUnauthorized(): void {
    storage.clearTokens()
    options.onUnauthorized?.()
    if (!options.onUnauthorized) {
      unauthorizedHandler?.()
    }
  }

  client.interceptors.request.use((config) => {
    const token = storage.getAccessToken()
    if (token) {
      config.headers.set('Authorization', `Bearer ${token}`)
    }
    return config
  })

  client.interceptors.response.use(
    (response) => response,
    async (error: unknown) => {
      if (!isUnauthorized(error)) {
        throw toApiRequestError(error)
      }

      const config = error.config as RetryableConfig | undefined
      const isRefreshRequest = config?.url?.includes('/auth/refresh')

      if (!config || config._retry || isRefreshRequest) {
        handleUnauthorized()
        throw toApiRequestError(error)
      }

      config._retry = true
      try {
        await refreshOnce()
        return await client.request(config)
      } catch {
        handleUnauthorized()
        throw new ApiRequestError('登录已过期，请重新登录', {
          code: 'unauthorized',
          status: 401,
        })
      }
    },
  )

  return client
}

export const apiClient = createHttpClient()
