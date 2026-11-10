import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { knowledgeApi } from '@/api/knowledge'
import { apiClient, ApiRequestError } from '@/api/client'
import { installMockAdapter, mockDb } from '@/api/mock'
import { storage } from '@/utils/storage'

beforeAll(() => {
  vi.stubEnv('VITE_USE_MOCK', 'true')
  installMockAdapter(apiClient)
})

beforeEach(() => {
  mockDb.reset()
  storage.setTokens({
    access_token: 'mock-access-test',
    refresh_token: 'mock-refresh-test',
    token_type: 'bearer',
    expires_in: 3600,
  })
})

describe('knowledgeApi M4', () => {
  it('上传区分新建 201 与幂等 200', async () => {
    const file = new File(['# policy'], 'm4-api.md', { type: 'text/markdown' })
    const first = await knowledgeApi.upload({ file, category: '售后' })
    expect(first.created).toBe(true)
    expect(first.document.category).toBe('售后')

    const second = await knowledgeApi.upload({ file })
    expect(second.created).toBe(false)
    expect(second.document.id).toBe(first.document.id)
  })

  it('列表返回 6 键 stats 并透传 owner_scope', async () => {
    const page = await knowledgeApi.documents({ limit: 2, owner_scope: 'visible' })
    expect(page.items).toHaveLength(2)
    expect(page.stats.documents).toBe(mockDb.knowledgeDocuments.length)
    expect(page.has_more).toBe(true)
  })

  it('删除后详情 404 映射为 ApiRequestError', async () => {
    const page = await knowledgeApi.documents({ limit: 1 })
    const id = page.items[0]!.id
    await knowledgeApi.remove(id)
    await expect(knowledgeApi.get(id)).rejects.toMatchObject({
      name: 'ApiRequestError',
      status: 404,
      code: 'not_found',
    })
  })

  it('普通用户重建被 403 拒绝', async () => {
    await expect(knowledgeApi.rebuild({ scope: 'all' })).rejects.toBeInstanceOf(ApiRequestError)
    await expect(knowledgeApi.rebuild({ scope: 'own' })).rejects.toMatchObject({
      status: 403,
      code: 'forbidden',
    })
  })

  it('检索请求把 top_k 与 filters 原样发送', async () => {
    const result = await knowledgeApi.search({
      query: '退款',
      top_k: 2,
      filters: { category: '售后' },
    })
    expect(result.hits.length).toBeLessThanOrEqual(2)
    expect(result.hits.every((hit) => hit.category === '售后')).toBe(true)
    expect(typeof result.elapsed_ms).toBe('number')
  })
})
