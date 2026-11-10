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

function uploadForm(
  filename: string,
  size: number,
  fields: Record<string, string> = {},
): MockRequest {
  return request('POST', '/knowledge/documents', {
    body: {
      __mockForm: true,
      fields,
      file: { name: filename, type: 'text/markdown', size },
    },
  })
}

function failCode(data: unknown): string {
  return (data as { error?: { code?: string } }).error?.code ?? ''
}

describe('mock 知识库 M4 端点', () => {
  beforeEach(() => {
    mockDb.reset()
  })

  it('列表按 q 同时匹配标题与来源路径', async () => {
    const byTitle = await handleMockRequest(request('GET', '/knowledge/documents', { query: { q: '退款' } }))
    expect(byTitle.status).toBe(200)
    expect((byTitle.data as { items: unknown[] }).items).toHaveLength(1)

    const bySource = await handleMockRequest(
      request('GET', '/knowledge/documents', { query: { q: 'refund-policy' } }),
    )
    expect((bySource.data as { items: unknown[] }).items).toHaveLength(1)
  })

  it('列表 stats 是可见范围全量、不随筛选变化', async () => {
    const all = await handleMockRequest(request('GET', '/knowledge/documents'))
    const filtered = await handleMockRequest(
      request('GET', '/knowledge/documents', { query: { status: 'failed' } }),
    )
    const allStats = (all.data as { stats: Record<string, number> }).stats
    const filteredStats = (filtered.data as { stats: Record<string, number> }).stats
    expect(Object.keys(allStats).sort()).toEqual([
      'chunks',
      'documents',
      'failed',
      'indexing',
      'pending',
      'ready',
    ])
    expect(filteredStats).toEqual(allStats)
    expect((filtered.data as { items: unknown[] }).items).toHaveLength(1)
  })

  it('普通用户 owner_scope=all 返回 403 forbidden', async () => {
    const response = await handleMockRequest(
      request('GET', '/knowledge/documents', { query: { owner_scope: 'all' } }),
    )
    expect(response.status).toBe(403)
    expect(failCode(response.data)).toBe('forbidden')
  })

  it('上传新建返回 201 与 11 字段文档', async () => {
    const response = await handleMockRequest(
      uploadForm('returns.md', 2048, { title: '退货政策', category: '售后' }),
    )
    expect(response.status).toBe(201)
    const document = response.data as Record<string, unknown>
    expect(Object.keys(document).sort()).toEqual([
      'category',
      'chunk_count',
      'created_at',
      'error',
      'id',
      'owner',
      'size_bytes',
      'source_uri',
      'status',
      'title',
      'updated_at',
    ])
    expect(document.title).toBe('退货政策')
    expect(document.status).toBe('ready')
    expect(document.chunk_count).toBeGreaterThan(0)
    expect((document.owner as { id: string }).id).toBe(mockDb.user.id)
  })

  it('相同文件名与大小重复上传返回 200 且不新增文档', async () => {
    const first = await handleMockRequest(uploadForm('returns.md', 2048))
    const second = await handleMockRequest(uploadForm('returns.md', 2048))
    expect(first.status).toBe(201)
    expect(second.status).toBe(200)
    expect((second.data as { id: string }).id).toBe((first.data as { id: string }).id)
  })

  it('超过 10MB 返回 413，不支持的扩展名返回 422', async () => {
    const tooLarge = await handleMockRequest(uploadForm('big.md', 10 * 1024 * 1024 + 1))
    expect(tooLarge.status).toBe(413)
    expect(failCode(tooLarge.data)).toBe('payload_too_large')

    const badType = await handleMockRequest(uploadForm('tool.exe', 1024))
    expect(badType.status).toBe(422)
    expect(failCode(badType.data)).toBe('validation_error')
  })

  it('普通用户上传系统文档返回 403', async () => {
    const response = await handleMockRequest(uploadForm('system.md', 1024, { scope: 'system' }))
    expect(response.status).toBe(403)
    expect(failCode(response.data)).toBe('forbidden')
  })

  it('详情 404 与删除 204', async () => {
    const list = await handleMockRequest(request('GET', '/knowledge/documents'))
    const id = (list.data as { items: Array<{ id: string }> }).items[0]!.id

    const detail = await handleMockRequest(request('GET', `/knowledge/documents/${id}`))
    expect(detail.status).toBe(200)

    const deleted = await handleMockRequest(request('DELETE', `/knowledge/documents/${id}`))
    expect(deleted.status).toBe(204)

    const missing = await handleMockRequest(request('GET', `/knowledge/documents/${id}`))
    expect(missing.status).toBe(404)
    expect(failCode(missing.data)).toBe('not_found')
  })

  it('重试失败文档：系统文档普通用户 403，管理员重试后 ready', async () => {
    const list = await handleMockRequest(
      request('GET', '/knowledge/documents', { query: { status: 'failed' } }),
    )
    const failed = (list.data as { items: Array<{ id: string; owner: unknown }> }).items[0]!
    expect(failed.owner).toBeNull()

    const denied = await handleMockRequest(
      request('POST', `/knowledge/documents/${failed.id}/retry`),
    )
    expect(denied.status).toBe(403)
    expect(failCode(denied.data)).toBe('forbidden')

    mockDb.user.role = 'admin'
    const response = await handleMockRequest(
      request('POST', `/knowledge/documents/${failed.id}/retry`),
    )
    expect(response.status).toBe(200)
    const document = response.data as { status: string; chunk_count: number; error: string | null }
    expect(document.status).toBe('ready')
    expect(document.chunk_count).toBeGreaterThan(0)
    expect(document.error).toBeNull()
  })

  it('普通用户重建返回 403，管理员按 scope 返回统计', async () => {
    const denied = await handleMockRequest(
      request('POST', '/knowledge/rebuild', { body: { scope: 'all' } }),
    )
    expect(denied.status).toBe(403)

    mockDb.user.role = 'admin'
    const systemDocs = mockDb.knowledgeDocuments.filter((doc) => doc.owner === null)
    const expectedFailed = systemDocs.filter((doc) => doc.status === 'failed').length
    const expectedChunks = systemDocs
      .filter((doc) => doc.status === 'ready')
      .reduce((total, doc) => total + doc.chunk_count, 0)
    const response = await handleMockRequest(
      request('POST', '/knowledge/rebuild', { body: { scope: 'system' } }),
    )
    expect(response.status).toBe(200)
    const result = response.data as {
      documents: number
      chunks: number
      failed: number
      elapsed_ms: number
    }
    expect(result.documents).toBe(systemDocs.length)
    expect(result.failed).toBe(expectedFailed)
    expect(result.chunks).toBe(expectedChunks)
    expect(result.elapsed_ms).toBeGreaterThanOrEqual(0)
  })

  it('检索返回 10 字段命中并支持分类过滤', async () => {
    const response = await handleMockRequest(
      request('POST', '/knowledge/search', {
        body: { query: '退款', top_k: 3, filters: { category: '售后' } },
      }),
    )
    expect(response.status).toBe(200)
    const result = response.data as { hits: Array<Record<string, unknown>>; elapsed_ms: number }
    expect(result.hits.length).toBeGreaterThan(0)
    expect(result.elapsed_ms).toBeGreaterThanOrEqual(0)
    expect(Object.keys(result.hits[0]!).sort()).toEqual([
      'category',
      'chunk_id',
      'chunk_index',
      'content',
      'document_filename',
      'document_id',
      'document_title',
      'score',
      'title',
      'updated_at',
    ])
    expect(result.hits.every((hit) => hit.category === '售后')).toBe(true)
  })

  it('检索空查询返回 422', async () => {
    const response = await handleMockRequest(
      request('POST', '/knowledge/search', { body: { query: '   ' } }),
    )
    expect(response.status).toBe(422)
    expect(failCode(response.data)).toBe('validation_error')
  })
})
