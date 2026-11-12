import { beforeEach, describe, expect, it } from 'vitest'

import { handleMockRequest, type MockRequest } from '@/api/mock/routers'
import { mockDb } from '@/api/mock'
import type { AdminOverview, AdminUserPage } from '@/types'

function request(
  method: string,
  path: string,
  options: { query?: Record<string, string>; body?: unknown; token?: boolean } = {},
): MockRequest {
  return {
    method,
    path,
    query: new URLSearchParams(options.query ?? {}),
    body: options.body ?? null,
    headers: options.token === false ? {} : { authorization: 'Bearer mock-token' },
  }
}

async function call(
  method: string,
  path: string,
  options: Parameters<typeof request>[2] = {},
): Promise<{ status: number; data: Record<string, unknown> }> {
  const result = await handleMockRequest(request(method, path, options))
  return result as { status: number; data: Record<string, unknown> }
}

function asAdmin(): void {
  mockDb.user.role = 'admin'
  mockDb.user.email = 'admin@example.com'
}

describe('M8 mock 管理台端点', () => {
  beforeEach(() => {
    mockDb.reset()
  })

  it('未登录 401、普通用户 403 forbidden + required_role', async () => {
    const anonymous = await call('GET', '/admin/users', { token: false })
    expect(anonymous.status).toBe(401)

    mockDb.user.role = 'user'
    const denied = await call('GET', '/admin/users')
    expect(denied.status).toBe(403)
    expect(denied.data).toMatchObject({
      error: {
        code: 'forbidden',
        details: { required_role: 'admin' },
      },
    })
  })

  it('用户列表带 stats、角色/关键字过滤与分页', async () => {
    asAdmin()
    const page = (await call('GET', '/admin/users', { query: { limit: '2' } }))
      .data as unknown as AdminUserPage
    expect(page.items).toHaveLength(2)
    expect(page.has_more).toBe(true)
    expect(page.stats.total).toBeGreaterThanOrEqual(6)
    expect(page.stats.admins).toBeGreaterThanOrEqual(2)

    const admins = (await call('GET', '/admin/users', { query: { role: 'admin' } }))
      .data as unknown as AdminUserPage
    expect(admins.items.every((user) => user.role === 'admin')).toBe(true)

    const keyword = (await call('GET', '/admin/users', { query: { q: 'alice' } }))
      .data as unknown as AdminUserPage
    expect(keyword.items).toHaveLength(1)
    expect(keyword.items[0]?.email).toBe('alice@example.com')
  })

  it('不能改自己的 role、不能停用自己', async () => {
    asAdmin()
    const ownRole = await call('PATCH', `/admin/users/${mockDb.user.id}`, {
      body: { role: 'user' },
    })
    expect(ownRole.status).toBe(422)
    expect((ownRole.data.error as { code?: string }).code).toBe('cannot_change_own_role')

    const ownStatus = await call('PATCH', `/admin/users/${mockDb.user.id}`, {
      body: { status: 'disabled' },
    })
    expect(ownStatus.status).toBe(422)
    expect((ownStatus.data.error as { code?: string }).code).toBe('cannot_disable_self')
  })

  it('可以停用其他用户，并写回列表状态', async () => {
    asAdmin()
    const target = '11111111-1111-4111-8111-111111111112'
    const updated = await call('PATCH', `/admin/users/${target}`, {
      body: { status: 'disabled' },
    })
    expect(updated.status).toBe(200)
    expect((updated.data as { status?: string }).status).toBe('disabled')

    const page = (await call('GET', '/admin/users', { query: { status: 'disabled' } }))
      .data as unknown as AdminUserPage
    expect(page.items.some((user) => user.id === target)).toBe(true)
  })

  it('概览包含全部状态键（canceled 单 L、A2A 8 态）', async () => {
    asAdmin()
    const overview = (await call('GET', '/admin/overview')).data as unknown as AdminOverview
    expect(typeof overview.generated_at).toBe('string')
    expect(overview.users.total).toBeGreaterThan(0)
    expect(Object.keys(overview.runs).sort()).toEqual(
      ['total', 'queued', 'running', 'succeeded', 'failed', 'canceled', 'interrupted'].sort(),
    )
    expect(Object.keys(overview.a2a_tasks).sort()).toEqual(
      [
        'total',
        'submitted',
        'working',
        'input_required',
        'auth_required',
        'completed',
        'failed',
        'canceled',
        'rejected',
      ].sort(),
    )
    expect(overview.attachments.storage_bytes).toBeGreaterThanOrEqual(0)
  })

  it('平台指令默认 → 保存 → 恢复', async () => {
    asAdmin()
    const initial = await call('GET', '/admin/settings/instruction')
    expect((initial.data as { is_default?: boolean }).is_default).toBe(true)

    const saved = await call('PUT', '/admin/settings/instruction', {
      body: { content: '平台默认：先结论后依据' },
    })
    expect(saved.status).toBe(200)
    expect(saved.data).toMatchObject({
      content: '平台默认：先结论后依据',
      is_default: false,
      updated_by_email: 'admin@example.com',
    })

    const restored = await call('PUT', '/admin/settings/instruction', {
      body: { content: null },
    })
    expect(restored.status).toBe(200)
    expect((restored.data as { is_default?: boolean }).is_default).toBe(true)
    expect((restored.data as { updated_by?: string | null }).updated_by).toBeNull()
  })

  it('超长平台指令返回 422 instruction_too_long', async () => {
    asAdmin()
    const tooLong = await call('PUT', '/admin/settings/instruction', {
      body: { content: 'a'.repeat(4001) },
    })
    expect(tooLong.status).toBe(422)
    expect((tooLong.data.error as { code?: string }).code).toBe('instruction_too_long')
  })

  it('系统技能两个开关都改变 effective_enabled', async () => {
    asAdmin()
    const list = await call('GET', '/admin/skills')
    const items = (list.data as { items: Array<{ id: string }> }).items
    expect(items.length).toBeGreaterThan(0)
    const skillId = items[0]!.id

    const force = await call('PUT', `/admin/skills/${skillId}/force-disable`, {
      body: { force_disabled: true },
    })
    expect(force.status).toBe(200)
    expect((force.data as { effective_enabled?: boolean }).effective_enabled).toBe(false)

    const restore = await call('PUT', `/admin/skills/${skillId}/force-disable`, {
      body: { force_disabled: false },
    })
    expect((restore.data as { effective_enabled?: boolean }).effective_enabled).toBe(true)

    const disabled = await call('PUT', `/admin/skills/${skillId}/enabled`, {
      body: { enabled: false },
    })
    expect((disabled.data as { enabled?: boolean }).enabled).toBe(false)
    expect((disabled.data as { effective_enabled?: boolean }).effective_enabled).toBe(false)
  })

  it('系统 MCP 列表/创建/冲突/更新/删除', async () => {
    asAdmin()
    const list = await call('GET', '/admin/mcp/servers')
    expect((list.data as { items: unknown[] }).items.length).toBeGreaterThan(0)

    const created = await call('POST', '/admin/mcp/servers', {
      body: {
        name: '内部检索',
        slug: 'internal-search',
        transport: 'streamable_http',
        url: 'https://mcp.example.com/mcp',
        headers: { Authorization: 'secret:MCP_KEY' },
      },
    })
    expect(created.status).toBe(201)
    expect(created.data).toMatchObject({ scope: 'system', enabled: true })

    const conflict = await call('POST', '/admin/mcp/servers', {
      body: { name: '重复', slug: 'internal-search' },
    })
    expect(conflict.status).toBe(409)
    expect((conflict.data.error as { code?: string }).code).toBe('conflict')

    const serverId = (created.data as { id: string }).id
    const updated = await call('PATCH', `/admin/mcp/servers/${serverId}`, {
      body: { enabled: false },
    })
    expect(updated.status).toBe(200)
    expect((updated.data as { effective_enabled?: boolean }).effective_enabled).toBe(false)

    const deleted = await call('DELETE', `/admin/mcp/servers/${serverId}`)
    expect(deleted.status).toBe(204)
    const after = await call('DELETE', `/admin/mcp/servers/${serverId}`)
    expect(after.status).toBe(404)
  })

  it('全局 Agent 列表 stats 忽略游标，只读字段提交 422', async () => {
    asAdmin()
    const page = await call('GET', '/admin/agents', { query: { limit: '1' } })
    const data = page.data as {
      stats: { total: number }
      items: Array<{ id: string }>
    }
    expect(data.items).toHaveLength(1)
    expect(data.stats.total).toBeGreaterThanOrEqual(1)

    const readOnly = await call('PATCH', `/admin/agents/${data.items[0]!.id}`, {
      body: { url: 'https://evil.example.com/a2a' },
    })
    expect(readOnly.status).toBe(422)
    expect((readOnly.data.error as { code?: string }).code).toBe('validation_error')

    const ok = await call('PATCH', `/admin/agents/${data.items[0]!.id}`, {
      body: { enabled: false },
    })
    expect(ok.status).toBe(200)
    expect((ok.data as { enabled?: boolean }).enabled).toBe(false)
  })
})
