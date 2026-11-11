import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getWebVitals, resetDiagnostics } from '@/utils/diagnostics'
import { startWebVitals } from '@/utils/web-vitals'

interface ObserverHandle {
  type: string
  callback: (list: { getEntries: () => PerformanceEntry[] }) => void
  disconnected: boolean
}

const handles: ObserverHandle[] = []
let stop: (() => void) | null = null

/** 最小 PerformanceObserver 替身：记录 callback 与 observe 类型，测试里手动触发 entry。 */
class PerformanceObserverStub {
  private handle: ObserverHandle

  constructor(callback: ObserverHandle['callback']) {
    this.handle = { type: '', callback, disconnected: false }
  }

  observe(options: { type: string }): void {
    this.handle.type = options.type
    handles.push(this.handle)
  }

  disconnect(): void {
    this.handle.disconnected = true
  }
}

function emit(type: string, entry: Record<string, unknown>): void {
  const handle = handles.find((item) => item.type === type && !item.disconnected)
  if (!handle) throw new Error(`未注册 ${type} 的 PerformanceObserver`)
  handle.callback({ getEntries: () => [entry as unknown as PerformanceEntry] })
}

beforeEach(() => {
  resetDiagnostics()
  handles.length = 0
  stop = null
  vi.stubGlobal('PerformanceObserver', PerformanceObserverStub)
  // 测试环境没有真实导航条目，确保 TTFB 走 observer 兜底路径。
  vi.spyOn(performance, 'getEntriesByType').mockReturnValue([])
  vi.spyOn(console, 'table').mockImplementation(() => {})
})

afterEach(() => {
  stop?.()
  stop = null
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('web-vitals', () => {
  it('LCP 写入诊断环形缓冲，新记录在前', () => {
    stop = startWebVitals()
    emit('largest-contentful-paint', { startTime: 1234 })
    emit('largest-contentful-paint', { startTime: 2345 })

    const rows = getWebVitals()
    expect(rows.map((row) => row.name)).toEqual(['LCP', 'LCP'])
    expect(rows[0]).toMatchObject({ name: 'LCP', value: 2345 })
  })

  it('CLS 只累计非输入触发的 layout-shift', () => {
    stop = startWebVitals()
    emit('layout-shift', { hadRecentInput: true, value: 0.5 })
    expect(getWebVitals()).toHaveLength(0)

    emit('layout-shift', { hadRecentInput: false, value: 0.1 })
    emit('layout-shift', { hadRecentInput: false, value: 0.05 })

    const rows = getWebVitals()
    expect(rows).toHaveLength(2)
    expect(rows[0]?.name).toBe('CLS')
    expect(rows[0]?.value).toBeCloseTo(0.15, 5)
    expect(rows[1]?.value).toBeCloseTo(0.1, 5)
  })

  it('INP 取 event 条目 duration 的最大值', () => {
    stop = startWebVitals()
    emit('event', { duration: 120 })
    emit('event', { duration: 80 })
    emit('event', { duration: 240 })

    const rows = getWebVitals().filter((row) => row.name === 'INP')
    expect(rows.map((row) => row.value)).toEqual([240, 120])
  })

  it('TTFB 用 navigation 条目的 responseStart - startTime', () => {
    stop = startWebVitals()
    emit('navigation', { startTime: 100, responseStart: 250 })
    emit('navigation', { startTime: 100, responseStart: 900 })

    const rows = getWebVitals().filter((row) => row.name === 'TTFB')
    expect(rows).toHaveLength(1)
    expect(rows[0]?.value).toBe(150)
  })

  it('环形缓冲容量为 20', () => {
    stop = startWebVitals()
    for (let i = 1; i <= 25; i += 1) emit('largest-contentful-paint', { startTime: i })

    const rows = getWebVitals()
    expect(rows).toHaveLength(20)
    expect(rows[0]?.value).toBe(25)
    expect(rows.at(-1)?.value).toBe(6)
  })

  it('stop 断开 observer 且之后不再写入', () => {
    const halt = startWebVitals()
    const handle = handles.find((item) => item.type === 'largest-contentful-paint')
    emit('largest-contentful-paint', { startTime: 500 })
    expect(getWebVitals()).toHaveLength(1)

    halt()
    expect(handle?.disconnected).toBe(true)
    handle?.callback({ getEntries: () => [{ startTime: 900 } as PerformanceEntry] })
    expect(getWebVitals()).toHaveLength(1)
  })

  it('VITE_PERF_LOG=true 时打印 console.table', () => {
    vi.stubEnv('VITE_PERF_LOG', 'true')
    stop = startWebVitals()
    emit('largest-contentful-paint', { startTime: 42 })

    expect(console.table).toHaveBeenCalledWith([{ name: 'LCP', value: 42 }])
  })

  it('不支持 PerformanceObserver 时静默降级', () => {
    vi.stubGlobal('PerformanceObserver', undefined)
    stop = startWebVitals()

    expect(typeof stop).toBe('function')
    expect(getWebVitals()).toEqual([])
  })
})
