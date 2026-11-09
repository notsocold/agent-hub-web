import axios, { type AxiosInstance, type InternalAxiosRequestConfig, type AxiosError } from 'axios'

import type { ApiErrorBody, AuthTokens } from '@/types'
import { storage } from '@/utils/storage'

export class ApiRequestError extends Error {
  readonly code: string
  readonly status: number
  readonly requestId: string

  constructor(message: string, options: { code: string; status: number; requestId?: string }) {
    super(message)
    this.name = 'ApiRequestError'
    this.code = options.code
    this.status = options.status
    this.requestId = options.requestId ?? ''
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

function isUnauthorized(error: unknown): error is AxiosError<ApiErrorBody> {
  return axios.isAxiosError(error) && error.response?.status === 401
}

function toApiRequestError(error: unknown): ApiRequestError {
  if (axios.isAxiosError<ApiErrorBody>(error)) {
    const status = error.response?.status ?? 0
    const body = error.response?.data
    const code = body?.error?.code ?? (status === 0 ? 'network_error' : 'unknown_error')
    const message =
      body?.error?.message ?? (status === 0 ? '网络异常，请稍后重试' : error.message || '请求失败')
    const requestId = body?.error?.request_id ?? ''
    return new ApiRequestError(message, { code, status, requestId })
  }
  if (error instanceof ApiRequestError) {
    return error
  }
  return new ApiRequestError(error instanceof Error ? error.message : '请求失败', {
    code: 'unknown_error',
    status: 0,
  })
}

export function createHttpClient(options: HttpClientOptions = {}): AxiosInstance {
  const client = axios.create({
    baseURL: options.baseURL ?? resolveBaseUrl(),
    timeout: 30_000,
    headers: { Accept: 'application/json' },
  })

  const refresh = options.refresh ?? defaultRefresh
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
