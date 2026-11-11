/**
 * SSE 断线重连退避参数（设计 4.2 B3）。
 *
 * 退避序列 1s → 2s → 4s → 8s → 16s，带 ±20% 抖动；
 * 最多 5 次、总窗口 60s。抖动避免服务端故障恢复时所有客户端同时重连。
 */
export const MAX_RECONNECT_ATTEMPTS = 5
export const RECONNECT_WINDOW_MS = 60_000

const BASE_DELAY_MS = 1000
const MAX_DELAY_MS = 16_000
const JITTER_RATIO = 0.2

/**
 * 计算第 `attempt` 次重连的等待毫秒数（attempt 从 0 开始）。
 *
 * `random` 可注入以便测试固定抖动；默认取调用时的 `Math.random`，
 * 不要在模块加载时捕获，否则测试 spy 不生效。
 */
export function nextReconnectDelay(attempt: number, random: () => number = Math.random): number {
  const exponent = Math.max(0, Math.trunc(attempt))
  const base = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** exponent)
  const jitter = (random() * 2 - 1) * JITTER_RATIO
  return Math.round(base * (1 + jitter))
}
