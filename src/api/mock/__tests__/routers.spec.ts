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

  it('消息历史按新到旧返回，cursor 翻到更旧一页', async () => {
    const conversationId = mockDb.conversations.find(
      (conversation) => (mockDb.messages[conversation.id]?.length ?? 0) >= 2,
    )?.id
    expect(conversationId).toBeTruthy()

    const first = await handleMockRequest(
      request('GET', `/conversations/${conversationId}/messages`, { query: { limit: '1' } }),
    )
    const firstPage = first.data as {
      items: Array<{ id: string; created_at: string }>
      next_cursor: string | null
      has_more: boolean
    }
    expect(firstPage.items).toHaveLength(1)
    expect(firstPage.has_more).toBe(true)

    const second = await handleMockRequest(
      request('GET', `/conversations/${conversationId}/messages`, {
        query: { limit: '1', cursor: firstPage.next_cursor! },
      }),
    )
    const secondPage = second.data as { items: Array<{ id: string; created_at: string }> }
    // fixture 里同一分钟的相邻消息可能时间相同，翻页至少应换一条更旧或同刻的记录。
    expect(secondPage.items[0]!.id).not.toBe(firstPage.items[0]!.id)
    expect(secondPage.items[0]!.created_at <= firstPage.items[0]!.created_at).toBe(true)
  })

  it('取消已结束运行返回 run_not_cancelable 且带 details.status', async () => {
    const finished = Object.values(mockDb.runs).find((run) => run.status === 'succeeded')
    expect(finished).toBeTruthy()
    const result = await handleMockRequest(request('POST', `/runs/${finished!.id}/cancel`))
    expect(result.status).toBe(409)
    expect(result.data).toMatchObject({
      error: { code: 'run_not_cancelable', details: { status: 'succeeded' } },
    })
  })

  it('未知路径返回 404 信封', async () => {
    const result = await handleMockRequest(request('GET', '/not-exists'))
    expect(result.status).toBe(404)
    expect((result.data as { error: { code: string } }).error.code).toBe('not_found')
  })
})
