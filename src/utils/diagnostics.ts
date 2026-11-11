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

/** Web Vitals 摘要：只存指标名、数值与采集时间，不含页面内容。 */
export interface VitalRecord {
  name: 'LCP' | 'CLS' | 'INP' | 'TTFB'
  value: number
  at: number
}

interface RuntimeContext {
  runId: string | null
  conversationId: string | null
}

const CAPACITY = 20

const requests: RequestRecord[] = []
const errors: ErrorRecord[] = []
const vitals: VitalRecord[] = []
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

/** 由 `src/utils/web-vitals.ts` 写入；容量与请求/错误缓冲一致。 */
export function recordVital(record: VitalRecord): void {
  push(vitals, record)
}

export function getRecentRequests(limit = CAPACITY): RequestRecord[] {
  return requests.slice(0, limit)
}

export function getRecentErrors(limit = CAPACITY): ErrorRecord[] {
  return errors.slice(0, limit)
}

/** 新→旧返回，与最近请求/错误保持一致，方便抽屉直接渲染。 */
export function getWebVitals(limit = CAPACITY): VitalRecord[] {
  return vitals.slice(0, limit)
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
  vitals.length = 0
  runtime = { runId: null, conversationId: null }
}
