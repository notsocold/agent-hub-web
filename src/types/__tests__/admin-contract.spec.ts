import { beforeEach, describe, expect, it, vi } from 'vitest'

import { adminApi } from '@/api/admin'

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
}))

vi.mock('@/api/client', () => ({
  apiClient: {
    get: mocks.get,
    post: mocks.post,
    put: mocks.put,
    patch: mocks.patch,
    delete: mocks.delete,
  },
}))

const { get, post, put, patch } = mocks
const del = mocks.delete

function resolveGet(data: unknown = {}): void {
  get.mockResolvedValue({ data })
}
function resolvePut(data: unknown = {}): void {
  put.mockResolvedValue({ data })
}
function resolvePatch(data: unknown = {}): void {
  patch.mockResolvedValue({ data })
}

describe('M8 管理台 API 契约', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('用户列表/详情/PATCH 走 /admin/users 且保留参数', async () => {
    resolveGet({
      items: [],
      next_cursor: null,
      has_more: false,
      stats: { total: 0, active: 0, disabled: 0, admins: 0 },
    })
    await adminApi.users({ q: 'ali', role: 'admin', status: 'active', limit: 20, cursor: 'c1' })
    expect(get).toHaveBeenCalledWith('/admin/users', {
      params: { q: 'ali', role: 'admin', status: 'active', limit: 20, cursor: 'c1' },
    })

    resolveGet({})
    await adminApi.user('u-1')
    expect(get).toHaveBeenCalledWith('/admin/users/u-1')

    resolvePatch({})
    await adminApi.updateUser('u-1', { role: 'user', status: 'disabled' })
    expect(patch).toHaveBeenCalledWith('/admin/users/u-1', {
      role: 'user',
      status: 'disabled',
    })
  })

  it('概览与平台指令端点', async () => {
    resolveGet({})
    await adminApi.overview()
    expect(get).toHaveBeenCalledWith('/admin/overview')

    await adminApi.instruction()
    expect(get).toHaveBeenCalledWith('/admin/settings/instruction')

    resolvePut({})
    await adminApi.saveInstruction(null)
    expect(put).toHaveBeenCalledWith('/admin/settings/instruction', { content: null })
    await adminApi.saveInstruction('平台默认')
    expect(put).toHaveBeenCalledWith('/admin/settings/instruction', { content: '平台默认' })
  })

  it('系统技能两个开关分别走 enabled / force-disable', async () => {
    resolveGet({})
    await adminApi.skills('周报')
    expect(get).toHaveBeenCalledWith('/admin/skills', { params: { q: '周报' } })

    resolvePut({})
    await adminApi.setSkillEnabled('s-1', true)
    expect(put).toHaveBeenCalledWith('/admin/skills/s-1/enabled', { enabled: true })
    await adminApi.setSkillForceDisabled('s-1', false)
    expect(put).toHaveBeenCalledWith('/admin/skills/s-1/force-disable', {
      force_disabled: false,
    })
  })

  it('系统 MCP CRUD 方法正确', async () => {
    resolveGet({})
    await adminApi.mcpServers()
    expect(get).toHaveBeenCalledWith('/admin/mcp/servers')

    post.mockResolvedValue({ data: {} })
    await adminApi.createMcpServer({
      name: '内部检索',
      slug: 'internal-search',
      transport: 'streamable_http',
      url: 'https://mcp.example.com/mcp',
      headers: { Authorization: 'secret:MCP_KEY' },
    })
    expect(post).toHaveBeenCalledWith('/admin/mcp/servers', {
      name: '内部检索',
      slug: 'internal-search',
      transport: 'streamable_http',
      url: 'https://mcp.example.com/mcp',
      headers: { Authorization: 'secret:MCP_KEY' },
    })

    resolvePatch({})
    await adminApi.updateMcpServer('m-1', { enabled: false })
    expect(patch).toHaveBeenCalledWith('/admin/mcp/servers/m-1', { enabled: false })

    del.mockResolvedValue({ data: null })
    await adminApi.deleteMcpServer('m-1')
    expect(del).toHaveBeenCalledWith('/admin/mcp/servers/m-1')
  })

  it('全局 Agent 列表/更新走 /admin/agents', async () => {
    resolveGet({ items: [], next_cursor: null, has_more: false, stats: {} })
    await adminApi.agents({ q: 'code', enabled: 'true', limit: 20 })
    expect(get).toHaveBeenCalledWith('/admin/agents', {
      params: { q: 'code', enabled: 'true', limit: 20 },
    })

    resolvePatch({})
    await adminApi.updateAgent('a-1', { enabled: false, requires_approval: true })
    expect(patch).toHaveBeenCalledWith('/admin/agents/a-1', {
      enabled: false,
      requires_approval: true,
    })
  })
})
