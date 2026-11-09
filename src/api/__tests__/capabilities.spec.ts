import { createPinia, setActivePinia } from 'pinia'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { apiClient } from '@/api/client'
import { instructionsApi } from '@/api/instructions'
import { memoriesApi } from '@/api/memories'
import { mcpApi } from '@/api/mcp'
import { skillsApi } from '@/api/skills'
import { installMockAdapter, mockDb } from '@/api/mock'
import { storage } from '@/utils/storage'

beforeAll(() => {
  vi.stubEnv('VITE_USE_MOCK', 'true')
  installMockAdapter(apiClient)
})

beforeEach(() => {
  mockDb.reset()
  setActivePinia(createPinia())
  storage.setTokens({
    access_token: 'mock-access-test',
    refresh_token: 'mock-refresh-test',
    token_type: 'bearer',
    expires_in: 3600,
  })
})

describe('能力层 API 归一化', () => {
  it('指令保存与恢复默认使用 content 字段', async () => {
    const saved = await instructionsApi.save('先给结论。')
    expect(saved.source).toBe('user')
    expect(saved.effective).toBe('先给结论。')

    const reset = await instructionsApi.save(null)
    expect(reset.source).toBe('system_default')
    expect(reset.effective).toBe(reset.default_value)
  })

  it('技能列表无 cursor、目录使用有效启停、导入归一化 warnings', async () => {
    const created = await skillsApi.create({
      name: '冒烟技能',
      description: '用于测试',
      content: '# 冒烟\n\n1. 先给结论',
    })
    expect(created.scope).toBe('user')
    expect(created.editable).toBe(true)

    const list = await skillsApi.list()
    expect(list.items.some((item) => item.id === created.id)).toBe(true)
    expect(list.stats.total).toBeGreaterThan(0)

    const catalog = await skillsApi.catalog()
    expect(catalog.every((item) => typeof item.enabled === 'boolean')).toBe(true)

    const disabled = await skillsApi.setEnabled(created.id, false)
    expect(disabled.enabled).toBe(false)

    const file = new File(['# 导入技能\n'], 'demo-skill.zip', { type: 'application/zip' })
    const imported = await skillsApi.importZip(file)
    expect(imported.skill.name).toBe('demo-skill')
    expect(Array.isArray(imported.warnings)).toBe(true)
  })

  it('MCP 检查结果与可用目录按真实后端字段归一化', async () => {
    const created = await mcpApi.createServer({
      name: 'Smoke MCP',
      slug: 'smoke-mcp',
      url: 'https://example.com/mcp',
      transport: 'streamable_http',
      headers: { Authorization: 'Bearer env:SMOKE' },
    })
    expect(created.auth_hint).toContain('SMOKE')

    const seeded = mockDb.mcpServers[0]!
    const checked = await mcpApi.check(seeded.id)
    expect(checked.health_status).toBe('healthy')
    expect(checked.tool_count).toBe(2)
    expect(typeof checked.checked_at).toBe('string')

    const available = await mcpApi.available()
    expect(available.servers.some((item) => item.id === created.id)).toBe(true)

    const tools = await mcpApi.tools(created.id)
    expect(Array.isArray(tools)).toBe(true)
  })

  it('记忆导出兼容 items 字段', async () => {
    await memoriesApi.create({ kind: 'fact', title: '口径', content: '按创建时间统计' })
    const exported = await memoriesApi.exportAll()
    expect(exported.memories.length).toBeGreaterThan(0)
    expect(typeof exported.exported_at).toBe('string')
  })
})
