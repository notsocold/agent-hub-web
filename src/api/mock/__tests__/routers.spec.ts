import { beforeEach, describe, expect, it } from 'vitest'

import { mockDb } from '@/api/mock/db'
import { handleMockRequest, type MockRequest } from '@/api/mock/routers'

const authHeaders = { authorization: 'Bearer mock-access-test' }

function request(
  method: string,
  path: string,
  options: {
    query?: Record<string, string>
    body?: unknown
    headers?: Record<string, string>
  } = {},
): MockRequest {
  return {
    method,
    path,
    query: new URLSearchParams(options.query ?? {}),
    body: options.body,
    headers: options.headers ?? authHeaders,
  }
}

describe('mock REST 路由', () => {
  beforeEach(() => {
    mockDb.reset()
  })

  it('按标题搜索会话且大小写不敏感', async () => {
    const result = await handleMockRequest(request('GET', '/conversations', { query: { q: 'q3' } }))
    expect(result.status).toBe(200)
    const page = result.data as { items: Array<{ title: string }>; stats: { total: number } }
    expect(page.items).toHaveLength(1)
    expect(page.items[0]?.title).toContain('Q3')
    expect(page.stats.total).toBe(7)
  })

  it('分页返回可用 cursor', async () => {
    const first = await handleMockRequest(
      request('GET', '/conversations', { query: { limit: '2' } }),
    )
    const firstPage = first.data as {
      items: unknown[]
      next_cursor: string | null
      has_more: boolean
    }
    expect(firstPage.items).toHaveLength(2)
    expect(firstPage.has_more).toBe(true)
    expect(firstPage.next_cursor).toBeTruthy()

    const second = await handleMockRequest(
      request('GET', '/conversations', { query: { limit: '2', cursor: firstPage.next_cursor! } }),
    )
    const secondPage = second.data as { items: unknown[]; has_more: boolean }
    expect(secondPage.items).toHaveLength(2)
    expect(secondPage.has_more).toBe(true)
  })

  it('未登录访问受保护接口返回 401 信封', async () => {
    const result = await handleMockRequest(request('GET', '/conversations', { headers: {} }))
    expect(result.status).toBe(401)
    const body = result.data as { error: { code: string; request_id: string } }
    expect(body.error.code).toBe('unauthorized')
    expect(body.error.request_id).toContain('mock-')
  })

  it('删除会话后默认列表不再包含', async () => {
    const id = '22222222-2222-4222-8222-222222222223'
    const deleted = await handleMockRequest(request('DELETE', `/conversations/${id}`))
    expect(deleted.status).toBe(204)

    const list = await handleMockRequest(request('GET', '/conversations'))
    const page = list.data as { items: Array<{ id: string }> }
    expect(page.items.some((item) => item.id === id)).toBe(false)
  })

  it('批准审批后更新状态并返回 resumed', async () => {
    const id = '66666666-6666-4666-8666-666666666666'
    const result = await handleMockRequest(
      request('POST', `/approvals/${id}/decision`, { body: { decision: 'approve' } }),
    )
    expect(result.status).toBe(200)
    expect(result.data).toMatchObject({ status: 'approved', resumed: true })

    const again = await handleMockRequest(
      request('POST', `/approvals/${id}/decision`, { body: { decision: 'approve' } }),
    )
    expect(again.status).toBe(409)
    expect((again.data as { error: { code: string } }).error.code).toBe('approval_already_decided')
  })

  it('未知路径返回 404 信封', async () => {
    const result = await handleMockRequest(request('GET', '/not-exists'))
    expect(result.status).toBe(404)
    expect((result.data as { error: { code: string } }).error.code).toBe('not_found')
  })
})
