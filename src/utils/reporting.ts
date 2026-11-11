/**
 * 可选上报钩子：默认关闭（未配置端点时不发任何请求）。
 *
 * 只上报排障元数据（错误码、request_id、耗时、Web Vitals），
 * 不上报 token、消息正文、附件内容或审批 payload。
 */
function beacon(endpoint: string | undefined, payload: Record<string, unknown>): void {
  if (!endpoint) return
  try {
    const body = JSON.stringify(payload)
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      navigator.sendBeacon(endpoint, new Blob([body], { type: 'application/json' }))
    } else {
      void fetch(endpoint, { method: 'POST', body, keepalive: true })
    }
  } catch {
    // 上报失败不影响业务，也不重试（避免故障时放大流量）。
  }
}

export function reportError(payload: {
  code: string
  message: string
  requestId: string
  at: number
}): void {
  beacon(import.meta.env.VITE_ERROR_REPORT_ENDPOINT, { kind: 'error', ...payload })
}

export function reportVital(payload: { name: string; value: number; at: number }): void {
  beacon(import.meta.env.VITE_PERF_ENDPOINT, { kind: 'vital', ...payload })
}
