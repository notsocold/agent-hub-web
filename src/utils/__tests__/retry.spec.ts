import { describe, expect, it } from 'vitest'

import { MAX_RECONNECT_ATTEMPTS, RECONNECT_WINDOW_MS, nextReconnectDelay } from '@/utils/retry'

describe('重连退避计算', () => {
  it('第 1 次重连基准 1000ms（无抖动时精确）', () => {
    expect(nextReconnectDelay(0, () => 0.5)).toBe(1000)
  })

  it('第 5 次重连封顶 16000ms', () => {
    expect(nextReconnectDelay(4, () => 0.5)).toBe(16000)
  })

  it('超出退避序列的索引仍封顶 16000ms', () => {
    expect(nextReconnectDelay(9, () => 0.5)).toBe(16000)
  })

  it('±20% 抖动边界：0 → 下界，接近 1 → 上界', () => {
    expect(nextReconnectDelay(0, () => 0)).toBe(800)
    expect(nextReconnectDelay(0, () => 0.999999)).toBe(1200)
  })

  it('导出上限常量：5 次、60s 总窗口', () => {
    expect(MAX_RECONNECT_ATTEMPTS).toBe(5)
    expect(RECONNECT_WINDOW_MS).toBe(60_000)
  })
})
