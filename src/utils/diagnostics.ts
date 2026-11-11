/**
 * 诊断数据：最近请求/错误/运行时上下文的环形缓冲。
 *
 * 只存 id、状态、耗时、版本这类排障元数据，不存 token、消息正文或审批 payload。
 * 由 `src/api/client.ts` 的拦截器与 `src/utils/web-vitals.ts` 写入，诊断抽屉只读渲染。
 */

export interface RequestRecord {
  method: string
  url: string
  status: number
  durationMs: number
  requestId: string
  traceId: string
  at: number
}

export interface ErrorRecord {
  code: string
  message: string
  requestId: string
  at: number
}

export interface BuildInfo {
  version: string
  buildTime: string
  gitSha: string
  apiBase: string
  mock: boolean
}

interface RuntimeContext {
  runId: string | null
  conversationId: string | null
}

const CAPACITY = 20

const requests: RequestRecord[] = []
const errors: ErrorRecord[] = []
let runtime: RuntimeContext = { runId: null, conversationId: null }

function push<T>(list: T[], item: T): void {
  list.unshift(item)
  if (list.length > CAPACITY) list.length = CAPACITY
}

export function recordRequest(record: RequestRecord): void {
  push(requests, record)
}

export function recordError(record: ErrorRecord): void {
  push(errors, record)
}

export function getRecentRequests(limit = CAPACITY): RequestRecord[] {
  return requests.slice(0, limit)
}

export function getRecentErrors(limit = CAPACITY): ErrorRecord[] {
  return errors.slice(0, limit)
}

export function getBuildInfo(): BuildInfo {
  const apiBase = import.meta.env.VITE_API_BASE_URL?.trim()
  return {
    version: typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev',
    buildTime: typeof __BUILD_TIME__ === 'string' ? __BUILD_TIME__ : '',
    gitSha: typeof __GIT_SHA__ === 'string' ? __GIT_SHA__ : 'unknown',
    apiBase: apiBase ? apiBase.replace(/\/$/, '') : '/api/v1',
    mock: import.meta.env.VITE_USE_MOCK === 'true',
  }
}

export function setRuntimeContext(ctx: {
  runId?: string | null
  conversationId?: string | null
}): void {
  runtime = {
    runId: ctx.runId === undefined ? runtime.runId : ctx.runId,
    conversationId: ctx.conversationId === undefined ? runtime.conversationId : ctx.conversationId,
  }
}

export function getRuntimeContext(): RuntimeContext {
  return { ...runtime }
}

/** 测试与登出时清空，避免上一个用户的数据串到下一个会话。 */
export function resetDiagnostics(): void {
  requests.length = 0
  errors.length = 0
  runtime = { runId: null, conversationId: null }
}
