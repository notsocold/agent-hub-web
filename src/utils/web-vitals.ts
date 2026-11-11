/**
 * Web Vitals 采集：PerformanceObserver 采集 LCP / CLS / INP，navigation 条目采集 TTFB，
 * 统一写入 `diagnostics.ts` 的环形缓冲，由诊断抽屉只读展示。
 *
 * 不引 `web-vitals` 第三方包：规模小、可控，避免把包体积与版本策略绑死。
 */
import { getWebVitals, recordVital } from '@/utils/diagnostics'
import { reportVital } from '@/utils/reporting'
import type { VitalRecord } from '@/utils/diagnostics'

// 计划约定 Web Vitals 的读取入口也挂在 web-vitals 上，抽屉侧仍从 diagnostics 读取。
export { getWebVitals }
export type { VitalRecord }

interface LayoutShiftEntry extends PerformanceEntry {
  /** 用户输入引起的布局偏移不计入 CLS。 */
  hadRecentInput?: boolean
  value?: number
}

interface NavigationEntry extends PerformanceEntry {
  /** 首字节时间戳；缺失时退回 startTime。 */
  responseStart?: number
}

/** 只有显式打开 VITE_PERF_LOG 才输出，生产环境默认静默。 */
function perfLogEnabled(): boolean {
  return import.meta.env.VITE_PERF_LOG === 'true'
}

/**
 * 启动 Web Vitals 采集，返回清理函数（组件卸载时调用）。
 *
 * 每种 entry 类型单独 try/catch：浏览器不支持时静默跳过，不能让监控拖垮应用。
 */
export function startWebVitals(): () => void {
  if (typeof PerformanceObserver === 'undefined') return () => {}

  const observers: PerformanceObserver[] = []
  let stopped = false
  let clsValue = 0
  let maxInp = 0
  let ttfbValue: number | null = null
  const logEnabled = perfLogEnabled()

  function record(record: VitalRecord): void {
    if (stopped) return
    recordVital(record)
    reportVital(record)
    if (logEnabled) {
      console.table(getWebVitals().map(({ name, value }) => ({ name, value })))
    }
  }

  function observe(type: string, handler: (entry: PerformanceEntry) => void): void {
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) handler(entry)
      })
      observer.observe({ type, buffered: true })
      observers.push(observer)
    } catch {
      // 旧浏览器不认识该 entry 类型：跳过这一项，其余指标继续采集。
    }
  }

  observe('largest-contentful-paint', (entry) => {
    record({ name: 'LCP', value: entry.startTime, at: Date.now() })
  })

  observe('layout-shift', (entry) => {
    const shift = entry as LayoutShiftEntry
    if (shift.hadRecentInput) return
    clsValue += shift.value ?? 0
    record({ name: 'CLS', value: clsValue, at: Date.now() })
  })

  observe('event', (entry) => {
    // INP 近似：event 条目里交互时长的最大值，比标准 INP 简化但足够定位慢交互。
    if (entry.duration <= maxInp) return
    maxInp = entry.duration
    record({ name: 'INP', value: entry.duration, at: Date.now() })
  })

  function recordTtfb(entry: NavigationEntry): void {
    if (ttfbValue !== null) return
    ttfbValue = Math.max(0, Math.round((entry.responseStart ?? entry.startTime) - entry.startTime))
    record({ name: 'TTFB', value: ttfbValue, at: Date.now() })
  }

  // 导航条目在 onMounted 时通常已就绪，优先同步读取；observer 仅作兜底。
  try {
    const [navigation] = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[]
    if (navigation) recordTtfb(navigation)
  } catch {
    // getEntriesByType 不可用时交给 observer。
  }
  observe('navigation', (entry) => recordTtfb(entry as NavigationEntry))

  return () => {
    if (stopped) return
    stopped = true
    for (const observer of observers) {
      try {
        observer.disconnect()
      } catch {
        // 断开失败不影响卸载流程。
      }
    }
    observers.length = 0
  }
}
