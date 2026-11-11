import { beforeEach, describe, expect, it } from 'vitest'

import {
  getBuildInfo,
  getRecentErrors,
  getRecentRequests,
  getRuntimeContext,
  recordError,
  recordRequest,
  resetDiagnostics,
  setRuntimeContext,
} from '@/utils/diagnostics'

const req = (i: number) => ({
  method: 'GET',
  url: `/x/${i}`,
  status: 200,
  durationMs: 5,
  requestId: `req-${i}`,
  traceId: '',
  at: i,
})

describe('diagnostics', () => {
  beforeEach(() => resetDiagnostics())

  it('环形缓冲只保留最近 20 条且新在前', () => {
    for (let i = 1; i <= 25; i += 1) recordRequest(req(i))
    const rows = getRecentRequests()
    expect(rows).toHaveLength(20)
    expect(rows[0]?.requestId).toBe('req-25')
    expect(rows.at(-1)?.requestId).toBe('req-6')
  })

  it('limit 参数截断返回条数', () => {
    for (let i = 1; i <= 5; i += 1) recordRequest(req(i))
    expect(getRecentRequests(2).map((row) => row.requestId)).toEqual(['req-5', 'req-4'])
  })

  it('错误也进环形缓冲', () => {
    recordError({ code: 'forbidden', message: '无权限', requestId: 'req-a', at: 1 })
    expect(getRecentErrors()[0]?.requestId).toBe('req-a')
  })

  it('构建信息包含版本与 API base', () => {
    const info = getBuildInfo()
    expect(info.version).toBeTruthy()
    expect(info.apiBase).toMatch(/^\/api\/v1$|^https?:/)
    expect(typeof info.mock).toBe('boolean')
    expect(info.buildTime).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('运行时上下文可读写并可清空', () => {
    setRuntimeContext({ runId: 'run-1', conversationId: 'conv-1' })
    expect(getRuntimeContext()).toEqual({ runId: 'run-1', conversationId: 'conv-1' })
    setRuntimeContext({ runId: null })
    expect(getRuntimeContext()).toEqual({ runId: null, conversationId: 'conv-1' })
  })
})
