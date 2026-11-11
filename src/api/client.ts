import axios, { type AxiosInstance, type InternalAxiosRequestConfig, type AxiosError } from 'axios'

import type { ApiErrorBody, AuthTokens } from '@/types'
import { recordError, recordRequest } from '@/utils/diagnostics'
import { reportError } from '@/utils/reporting'
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

/**
 * 统一错误文案（M7）：权限与依赖不可用是全站共用语义，不能每个页面各写一套。
 * `code` / `details` 原样保留，调用方仍可按 `forbidden` / `replay_too_large` 分支。
 */
function normalizeErrorMessage(status: number, code: string, message: string): string {
  if (status === 403 && code === 'forbidden') return '当前账号无管理员权限'
  if (status === 503 && (code === 'database_unavailable' || code === 'service_unavailable')) {
    return '服务暂不可用，请稍后重试'
  }
  return message
}

/** 把后端错误信封转换成带 `details` 的 ApiRequestError。 */
export function apiErrorFromResponse(status: number, body: unknown): ApiRequestError {
  const envelope = body as ApiErrorBody | null | undefined
  const code = envelope?.error?.code ?? (status === 0 ? 'network_error' : 'unknown_error')
  const rawMessage =
    envelope?.error?.message ??
    (status === 0 ? '网络异常，请稍后重试' : `请求失败（HTTP ${status}）`)
  return new ApiRequestError(normalizeErrorMessage(status, code, rawMessage), {
    code,
    status,
    requestId: envelope?.error?.request_id ?? '',
    details: envelope?.error?.details ?? undefined,
  })
}

/** 请求开始时间：WeakMap 避免往 axios config 上挂任意字段。 */
const requestStartedAt = new WeakMap<object, number>()

function headerValue(headers: unknown, name: string): string {
  if (!headers || typeof headers !== 'object') return ''
  const record = headers as Record<string, unknown>
  const value = record[name] ?? record[name.toLowerCase()]
  if (typeof value === 'string') return value
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0]
  return ''
}

function elapsedMs(config: object): number {
  const startedAt = requestStartedAt.get(config)
  if (startedAt === undefined) return 0
  return Math.max(0, Math.round(performance.now() - startedAt))
}

/** 成功与失败都记录一次请求，失败另记错误缓冲；记录本身不得影响请求。 */
function recordOutcome(
  config: InternalAxiosRequestConfig | undefined,
  status: number,
  headers: unknown,
): void {
  if (!config) return
  try {
    const requestId = headerValue(headers, 'x-request-id')
    recordRequest({
      method: String(config.method ?? 'get').toUpperCase(),
      url: String(config.url ?? ''),
      status,
      durationMs: elapsedMs(config),
      requestId,
      traceId: headerValue(headers, 'x-trace-id'),
      at: Date.now(),
    })
  } catch {
    // 诊断写入失败不影响业务请求。
  }
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
    requestStartedAt.set(config, performance.now())
    const token = storage.getAccessToken()
    if (token) {
      config.headers.set('Authorization', `Bearer ${token}`)
    }
    return config
  })

  client.interceptors.response.use(
    (response) => {
      recordOutcome(response.config, response.status, response.headers)
      return response
    },
    async (error: unknown) => {
      const failed = toApiRequestError(error)
      if (axios.isAxiosError(error)) {
        recordOutcome(error.config, error.response?.status ?? 0, error.response?.headers)
      }
      try {
        const record = {
          code: failed.code,
          message: failed.message,
          requestId: failed.requestId,
          at: Date.now(),
        }
        recordError(record)
        reportError(record)
      } catch {
        // 诊断写入失败不影响业务错误处理。
      }
      if (!isUnauthorized(error)) {
        throw failed
      }

      const config = error.config as RetryableConfig | undefined
      const requestUrl = config?.url ?? ''
      const isRefreshRequest = requestUrl.includes('/auth/refresh')
      // 登录/注册的 401 是「邮箱或密码错误」，不是会话过期：
      // 不能进 refresh 流程、不能触发登出，直接把后端文案交给表单展示。
      const isCredentialRequest = /\/auth\/(login|register)(\?|$)/.test(requestUrl)

      if (isCredentialRequest) {
        throw failed
      }

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
