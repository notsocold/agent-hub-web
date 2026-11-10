// @vitest-environment node

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { approvalsApi } from '@/api/approvals'
import { auditApi } from '@/api/audit'
import { authApi } from '@/api/auth'
import { apiClient } from '@/api/client'
import { secretsApi } from '@/api/secrets'
import type { Approval, AuditLog, PageResult } from '@/types'
import { storage } from '@/utils/storage'

/**
 * M5 真实后端联调：需要 agent-hub 已在 127.0.0.1:8000 启动，
 * 且 dev@example.com 为管理员（密钥、全局审计仅管理员可用）。
 *
 * 运行：`pnpm test:real`（vitest.real.config.ts 中显式包含本文件）。
 * 本文件不触发聊天流（避免限流）与审批决定（避免制造恢复运行）。
 */
const EMAIL = process.env.REAL_TEST_EMAIL ?? 'dev@example.com'
const PASSWORD = process.env.REAL_TEST_PASSWORD ?? 'dev-password-123'
const MISSING_ID = '00000000-0000-4000-8000-000000000000'

const APPROVAL_STATS = ['approved', 'canceled', 'expired', 'pending', 'rejected']
const APPROVAL_FIELDS = [
  'conversation_id',
  'conversation_title',
  'created_at',
  'decided_at',
  'decided_by',
  'decision_note',
  'executor',
  'expires_at',
  'id',
  'payload',
  'payload_preview',
  'reason',
  'risk',
  'run_id',
  'side_effect',
  'source',
  'status',
  'target',
  'tool_display_name',
  'tool_name',
]
const AUDIT_FIELDS = [
  'action',
  'actor_id',
  'actor_type',
  'created_at',
  'detail',
  'id',
  'request_id',
  'resource_id',
  'resource_type',
]
const AUDIT_STRING_FIELDS = [
  'actor_type',
  'actor_id',
  'action',
  'resource_type',
  'resource_id',
  'request_id',
  'created_at',
] as const
const SECRET_FIELDS = ['created_at', 'description', 'enabled', 'name', 'updated_at']

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

function expectPageShape<T>(page: PageResult<T>, label: string): void {
  expect(Array.isArray(page.items), `${label}.items 是数组`).toBe(true)
  expect(
    page.next_cursor === null || typeof page.next_cursor === 'string',
    `${label}.next_cursor 为 null 或字符串`,
  ).toBe(true)
  expect(typeof page.has_more, `${label}.has_more 是布尔值`).toBe('boolean')
}

function expectAuditItem(item: AuditLog, label: string): void {
  expect(Object.keys(item).sort(), `${label} 恰好 9 字段`).toEqual(AUDIT_FIELDS)
  expect(typeof item.id, `${label}.id 是数字`).toBe('number')
  expect(
    AUDIT_STRING_FIELDS.every((key) => typeof item[key] === 'string'),
    `${label} 字符串字段类型正确`,
  ).toBe(true)
  expect(Boolean(item.detail) && typeof item.detail === 'object', `${label}.detail 是对象`).toBe(
    true,
  )
  expect(Number.isNaN(Date.parse(item.created_at)), `${label}.created_at 可解析`).toBe(false)
}

function expectApprovalItem(item: Approval, label: string): void {
  expect(Object.keys(item).sort(), `${label} 字段完整`).toEqual(APPROVAL_FIELDS)
  expect(typeof item.id, `${label}.id 是字符串`).toBe('string')
  expect(typeof item.status, `${label}.status 是字符串`).toBe('string')
  expect(Boolean(item.payload) && typeof item.payload === 'object', `${label}.payload 是对象`).toBe(
    true,
  )
}

function expectApprovalPage(page: PageResult<Approval>, label: string): void {
  expectPageShape(page, label)
  expect(Object.keys(page.stats ?? {}).sort(), `${label}.stats 恰好 5 键`).toEqual(APPROVAL_STATS)
  expect(
    Object.values(page.stats ?? {}).every((value) => typeof value === 'number'),
    `${label}.stats 值均为数字`,
  ).toBe(true)
  page.items.forEach((item, index) => expectApprovalItem(item, `${label}.items[${index}]`))
}

describe('前端 M5 审计/密钥/审批 API 与真实后端', () => {
  beforeAll(async () => {
    requireRealEnv()
    apiClient.defaults.adapter = 'http'
    await signIn()
  })

  it('审计日志 own 与管理员全量返回 PageResult 且元素字段完整', async () => {
    const own = await auditApi.own({ limit: 5 })
    expectPageShape(own, 'auditApi.own')
    expect(own.items.length).toBeLessThanOrEqual(5)
    own.items.forEach((item, index) => expectAuditItem(item, `auditApi.own.items[${index}]`))

    const all = await auditApi.all({ limit: 5 })
    expectPageShape(all, 'auditApi.all')
    expect(all.items.length).toBeLessThanOrEqual(5)
    all.items.forEach((item, index) => expectAuditItem(item, `auditApi.all.items[${index}]`))
  }, 30_000)

  describe('平台密钥', () => {
    const stamp = Date.now()
    const name = `WEB_M5_${stamp}`
    let persisted = false

    afterAll(async () => {
      if (!persisted) return
      await secretsApi.remove(name).catch(() => undefined)
    })

    it('创建 → 列表 → 轮换/停用 → 删除 全链路可消费', async () => {
      const description = `前端 M5 联调 ${stamp}`
      const created = await secretsApi.create({
        name,
        value: 'web-m5-value-1',
        description,
      })
      persisted = true
      expect(created.name).toBe(name)
      expect(created.enabled).toBe(true)
      expect(created.description).toBe(description)
      expect(Object.keys(created).sort()).toEqual(SECRET_FIELDS)
      expect('value' in created).toBe(false)
      expect(JSON.stringify(created)).not.toContain('web-m5-value-1')

      const list = await secretsApi.list()
      expect(list.some((item) => item.name === name)).toBe(true)
      expect(list.every((item) => !('value' in item))).toBe(true)

      const rotatedDescription = `前端 M5 轮换 ${stamp}`
      const rotated = await secretsApi.update(name, {
        value: 'web-m5-value-2',
        description: rotatedDescription,
      })
      expect(rotated.name).toBe(name)
      expect(rotated.description).toBe(rotatedDescription)
      expect(rotated.enabled).toBe(true)
      expect(Object.keys(rotated).sort()).toEqual(SECRET_FIELDS)
      expect('value' in rotated).toBe(false)

      const disabled = await secretsApi.update(name, { enabled: false })
      expect(disabled.enabled).toBe(false)

      await secretsApi.remove(name)
      persisted = false

      const after = await secretsApi.list()
      expect(after.some((item) => item.name === name)).toBe(false)
      await expect(secretsApi.update(name, { description: 'removed' })).rejects.toMatchObject({
        status: 404,
        code: 'secret_not_found',
      })
    }, 30_000)
  })

  it('审批列表返回 stats 5 键与 items，不存在详情 404', async () => {
    const pending = await approvalsApi.list({ limit: 5 })
    expectApprovalPage(pending, 'approvalsApi.list')
    expect(pending.items.length).toBeLessThanOrEqual(5)

    const all = await approvalsApi.list({ status: 'all', limit: 5 })
    expectApprovalPage(all, 'approvalsApi.list(status=all)')
    expect(all.items.length).toBeLessThanOrEqual(5)

    await expect(approvalsApi.detail(MISSING_ID)).rejects.toMatchObject({
      status: 404,
      code: 'not_found',
    })
  }, 30_000)
})
