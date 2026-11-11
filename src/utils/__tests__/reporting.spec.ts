import { afterEach, describe, expect, it, vi } from 'vitest'

import { reportError, reportVital } from '@/utils/reporting'

describe('reporting', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('未配置端点时不发请求', () => {
    const sendBeacon = vi.fn()
    Object.defineProperty(navigator, 'sendBeacon', { value: sendBeacon, configurable: true })
    reportError({ code: 'x', message: 'y', requestId: 'r', at: 1 })
    reportVital({ name: 'LCP', value: 1, at: 1 })
    expect(sendBeacon).not.toHaveBeenCalled()
  })

  it('配置端点后用 sendBeacon 上报元数据', () => {
    vi.stubEnv('VITE_ERROR_REPORT_ENDPOINT', 'http://collector.test/errors')
    const sendBeacon = vi.fn().mockReturnValue(true)
    Object.defineProperty(navigator, 'sendBeacon', { value: sendBeacon, configurable: true })

    reportError({ code: 'llm_error', message: '上游失败', requestId: 'req-1', at: 1 })

    expect(sendBeacon).toHaveBeenCalledTimes(1)
    const [url, body] = sendBeacon.mock.calls[0] as [string, Blob]
    expect(url).toBe('http://collector.test/errors')
    expect(body).toBeInstanceOf(Blob)
  })
})
