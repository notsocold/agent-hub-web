// @vitest-environment node

import { beforeAll, describe, expect, it } from 'vitest'

import { apiClient } from '@/api/client'
import { authApi } from '@/api/auth'
import { knowledgeApi } from '@/api/knowledge'
import type { KnowledgeDocument } from '@/types'
import { storage } from '@/utils/storage'

/**
 * M4 真实后端联调：需要 agent-hub 已在 127.0.0.1:8000 启动，且已执行
 * `scripts/seed_dev_account.py` 创建开发账号。
 *
 * 运行：`pnpm test:real`（vitest.real.config.ts 中显式包含本文件）。
 */
const EMAIL = process.env.REAL_TEST_EMAIL ?? 'dev@example.com'
const PASSWORD = process.env.REAL_TEST_PASSWORD ?? 'dev-password-123'

function requireRealEnv(): void {
  const base = import.meta.env.VITE_API_BASE_URL as string | undefined
  if (!base) {
    throw new Error('缺少 VITE_API_BASE_URL；请用 pnpm test:real 运行真实联调测试')
  }
}

async function signIn(): Promise<void> {
  storage.clearTokens()
  const tokens = await authApi.login({ email: EMAIL, password: PASSWORD })
  storage.setTokens(tokens)
}

function markdownFile(name: string, content: string): File {
  return new File([content], name, { type: 'text/markdown' })
}

describe('前端 M4 知识库 API 与真实后端', () => {
  let created: KnowledgeDocument | null = null

  beforeAll(async () => {
    requireRealEnv()
    apiClient.defaults.adapter = 'http'
    await signIn()
  })

  afterAll(async () => {
    if (created) {
      await knowledgeApi.remove(created.id).catch(() => undefined)
    }
  })

  it('上传 → 列表 → 检索 → 详情 → 重试 → 删除 全链路字段可消费', async () => {
    const stamp = Date.now()
    const title = `前端 M4 联调 ${stamp}`
    const first = await knowledgeApi.upload({
      file: markdownFile(
        `frontend-m4-${stamp}.md`,
        `# ${title}\n\n退货需要保留吊牌与包装，签收后 7 天内可申请退款。\n`,
      ),
      title,
      category: '联调',
    })
    expect(first.created).toBe(true)
    expect(first.document.status).toBe('ready')
    expect(first.document.chunk_count).toBeGreaterThanOrEqual(1)
    expect(first.document.owner).not.toBeNull()
    created = first.document

    const page = await knowledgeApi.documents({ q: String(stamp), limit: 20 })
    expect(page.items.some((item) => item.id === created!.id)).toBe(true)
    expect(page.stats.documents).toBeGreaterThanOrEqual(1)
    expect(Object.keys(page.stats).sort()).toEqual([
      'chunks',
      'documents',
      'failed',
      'indexing',
      'pending',
      'ready',
    ])

    const search = await knowledgeApi.search({
      query: String(stamp),
      top_k: 5,
      filters: { category: '联调' },
    })
    expect(search.hits.length).toBeGreaterThanOrEqual(1)
    expect(search.hits[0]?.document_id).toBe(created!.id)
    expect(typeof search.hits[0]?.score).toBe('number')
    expect(typeof search.elapsed_ms).toBe('number')

    const detail = await knowledgeApi.get(created!.id)
    expect(detail.title).toBe(title)

    const retried = await knowledgeApi.retry(created!.id)
    expect(retried.status).toBe('ready')

    await knowledgeApi.remove(created!.id)
    await expect(knowledgeApi.get(created!.id)).rejects.toMatchObject({
      status: 404,
      code: 'not_found',
    })
    created = null
  }, 120_000)

  it('同一内容重复上传返回已存在的文档', async () => {
    const stamp = Date.now()
    const file = markdownFile(
      `frontend-m4-dup-${stamp}.md`,
      `# 幂等联调 ${stamp}\n\n同一内容第二次上传应命中已有文档。\n`,
    )
    const first = await knowledgeApi.upload({ file, title: `幂等联调 ${stamp}` })
    created = first.document
    const second = await knowledgeApi.upload({ file, title: `幂等联调 ${stamp}` })
    expect(second.created).toBe(false)
    expect(second.document.id).toBe(first.document.id)
  }, 120_000)

  it('重建与全量列表按角色返回 200 或 403', async () => {
    const me = await authApi.me()
    if (me.role === 'admin') {
      const result = await knowledgeApi.rebuild({ scope: 'own' })
      expect(result.documents).toBeGreaterThanOrEqual(0)
      expect(result.failed).toBeLessThanOrEqual(result.documents)
      const all = await knowledgeApi.documents({ owner_scope: 'all', limit: 5 })
      expect(all.items.length).toBeLessThanOrEqual(5)
      return
    }

    await expect(knowledgeApi.rebuild({ scope: 'all' })).rejects.toMatchObject({
      status: 403,
      code: 'forbidden',
    })
    await expect(knowledgeApi.documents({ owner_scope: 'all' })).rejects.toMatchObject({
      status: 403,
      code: 'forbidden',
    })
  }, 120_000)
})
