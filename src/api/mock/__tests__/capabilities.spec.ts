import { beforeEach, describe, expect, it } from 'vitest'

import { mockDb } from '@/api/mock/db'
import { handleMockRequest, type MockRequest } from '@/api/mock/routers'

const authHeaders = { authorization: 'Bearer mock-access-test' }

function request(
  method: string,
  path: string,
  options: { query?: Record<string, string>; body?: unknown; headers?: Record<string, string> } = {},
): MockRequest {
  return {
    method,
    path,
    query: new URLSearchParams(options.query ?? {}),
    body: options.body,
    headers: options.headers ?? authHeaders,
  }
}

function page<T>(data: unknown): { items: T[]; has_more: boolean; stats?: Record<string, number> } {
  return data as { items: T[]; has_more: boolean; stats?: Record<string, number> }
}

describe('mock M1.5 能力层', () => {
  beforeEach(() => {
    mockDb.reset()
  })

  it('附件上传/去重/下载/删除', async () => {
    const form = {
      __mockForm: true,
      fields: { purpose: 'chat' },
      file: { name: 'tickets.csv', type: 'text/csv', size: 32 },
    }
    const created = await handleMockRequest(request('POST', '/attachments', { body: form }))
    expect(created.status).toBe(201)
    const attachment = created.data as { id: string; status: string; filename: string }
    expect(attachment.status).toBe('ready')
    expect(attachment.filename).toBe('tickets.csv')

    const duplicate = await handleMockRequest(request('POST', '/attachments', { body: form }))
    expect((duplicate.data as { duplicate?: boolean }).duplicate).toBe(true)

    const download = await handleMockRequest(
      request('GET', `/attachments/${attachment.id}/download`),
    )
    expect(download.data).toBeInstanceOf(Blob)

    const deleted = await handleMockRequest(request('DELETE', `/attachments/${attachment.id}`))
    expect(deleted.status).toBe(204)
    const missing = await handleMockRequest(request('GET', `/attachments/${attachment.id}`))
    expect(missing.status).toBe(404)
  })

  it('拒绝不允许的附件类型与超限文件', async () => {
    const bad = await handleMockRequest(
      request('POST', '/attachments', {
        body: {
          __mockForm: true,
          fields: {},
          file: { name: 'run.exe', type: 'application/x-msdownload', size: 10 },
        },
      }),
    )
    expect(bad.status).toBe(422)

    const huge = await handleMockRequest(
      request('POST', '/attachments', {
        body: {
          __mockForm: true,
          fields: {},
          file: { name: 'big.csv', type: 'text/csv', size: 21 * 1024 * 1024 },
        },
      }),
    )
    expect(huge.status).toBe(413)
  })

  it('指令保存为用户覆盖并可恢复默认', async () => {
    const initial = await handleMockRequest(request('GET', '/instructions'))
    expect((initial.data as { source: string }).source).toBe('user')

    const saved = await handleMockRequest(
      request('PUT', '/instructions', { body: { content: '先给结论。' } }),
    )
    expect(saved.data).toMatchObject({ source: 'user', effective: '先给结论。' })

    const reset = await handleMockRequest(
      request('PUT', '/instructions', { body: { content: null } }),
    )
    const state = reset.data as { source: string; effective: string; default_value: string }
    expect(state.source).toBe('system_default')
    expect(state.effective).toBe(state.default_value)
  })

  it('记忆 CRUD、搜索与清空', async () => {
    const created = await handleMockRequest(
      request('POST', '/memories', {
        body: { kind: 'fact', title: '口径', content: '按创建时间统计' },
      }),
    )
    expect(created.status).toBe(201)
    const memory = created.data as { id: string; status: string }

    const list = await handleMockRequest(
      request('GET', '/memories', { query: { q: '创建时间' } }),
    )
    const first = page<{ id: string }>(list.data)
    expect(first.items.some((item) => item.id === memory.id)).toBe(true)
    expect(first.stats?.active).toBeGreaterThan(0)

    const updated = await handleMockRequest(
      request('PATCH', `/memories/${memory.id}`, { body: { status: 'archived' } }),
    )
    expect((updated.data as { status: string }).status).toBe('archived')

    const before = mockDb.memories.length
    const cleared = await handleMockRequest(
      request('DELETE', '/memories', { query: { confirm: 'true' } }),
    )
    expect((cleared.data as { deleted: number }).deleted).toBe(before)
    expect(mockDb.memories).toHaveLength(0)
  })

  it('技能创建、启停、文件读取与删除', async () => {
    const created = await handleMockRequest(
      request('POST', '/skills', {
        body: { slug: 'weekly', name: '周报', content: '# 周报\n\n固定章节' },
      }),
    )
    expect(created.status).toBe(201)
    const skill = created.data as { id: string; scope: string; editable: boolean }
    expect(skill.scope).toBe('user')
    expect(skill.editable).toBe(true)

    const catalog = await handleMockRequest(request('GET', '/skills/catalog'))
    expect((catalog.data as { items: unknown[] }).items.length).toBeGreaterThan(0)

    const disabled = await handleMockRequest(
      request('PUT', `/skills/${skill.id}/enabled`, { body: { enabled: false } }),
    )
    expect((disabled.data as { enabled: boolean }).enabled).toBe(false)

    const files = await handleMockRequest(request('GET', `/skills/${skill.id}/files`))
    expect((files.data as { items: unknown[] }).items).toHaveLength(1)

    const content = await handleMockRequest(
      request('GET', `/skills/${skill.id}/files/${encodeURIComponent('SKILL.md')}`),
    )
    expect((content.data as { content: string }).content).toContain('固定章节')

    const removed = await handleMockRequest(request('DELETE', `/skills/${skill.id}`))
    expect(removed.status).toBe(204)
  })

  it('拒绝 stdio 与非法 MCP URL', async () => {
    const stdio = await handleMockRequest(
      request('POST', '/mcp/servers', {
        body: { name: 'local', url: 'http://localhost:9000', transport: 'stdio' },
      }),
    )
    expect(stdio.status).toBe(422)
    expect((stdio.data as { error: { code: string } }).error.code).toBe(
      'mcp_transport_not_allowed',
    )

    const invalid = await handleMockRequest(
      request('POST', '/mcp/servers', { body: { name: 'bad', url: 'file:///etc/passwd' } }),
    )
    expect(invalid.status).toBe(422)
  })

  it('MCP 检查、工具列表与可用目录', async () => {
    const serverId = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1'
    const check = await handleMockRequest(request('POST', `/mcp/servers/${serverId}/check`))
    expect(check.status).toBe(200)
    expect((check.data as { health_status: string }).health_status).toBe('healthy')

    const tools = await handleMockRequest(request('GET', `/mcp/servers/${serverId}/tools`))
    expect((tools.data as { items: unknown[] }).items).toHaveLength(2)

    const available = await handleMockRequest(request('GET', '/mcp/available'))
    const data = available.data as { items: Array<{ id: string }> }
    expect(data.items.length).toBeGreaterThan(0)

    const toolPage = await handleMockRequest(
      request('GET', `/mcp/servers/${serverId}/tools`, {}),
    )
    const toolItems = (toolPage.data as { items: Array<{ exposed_name: string }> }).items
    expect(toolItems.some((tool) => tool.exposed_name.includes('conversations_info'))).toBe(true)
  })

  it('智能体预览、注册、更新、刷新与删除', async () => {
    const preview = await handleMockRequest(
      request('POST', '/agents/preview', { body: { url: 'https://remote.example.com/a2a' } }),
    )
    expect((preview.data as { valid: boolean }).valid).toBe(true)

    const created = await handleMockRequest(
      request('POST', '/agents', {
        body: { url: 'https://remote.example.com/a2a', slug: 'remote', name: 'Remote' },
      }),
    )
    expect(created.status).toBe(201)
    const agent = created.data as { id: string; name: string; enabled: boolean }
    expect(agent.name).toBe('Remote')

    const updated = await handleMockRequest(
      request('PATCH', `/agents/${agent.id}`, { body: { enabled: false } }),
    )
    expect((updated.data as { enabled: boolean }).enabled).toBe(false)

    const refreshed = await handleMockRequest(request('POST', `/agents/${agent.id}/refresh`))
    expect((refreshed.data as { changed: boolean }).changed).toBe(false)

    const removed = await handleMockRequest(request('DELETE', `/agents/${agent.id}`))
    expect(removed.status).toBe(204)
  })

  it('任务补充信息/授权/拒绝的状态流转', async () => {
    const resumeId = '88888888-8888-4888-8888-888888888881'
    const resumed = await handleMockRequest(
      request('POST', `/tasks/${resumeId}/resume`, { body: { input: '按创建时间统计' } }),
    )
    expect(resumed.status).toBe(200)
    expect((resumed.data as { task: { state: string } }).task.state).toBe('working')

    const conflict = await handleMockRequest(
      request('POST', `/tasks/${resumeId}/resume`, { body: { input: '再一次' } }),
    )
    expect(conflict.status).toBe(409)

    const authId = '88888888-8888-4888-8888-888888888882'
    const authorized = await handleMockRequest(request('POST', `/tasks/${authId}/authorize`))
    expect((authorized.data as { state: string }).state).toBe('working')

    const cancelId = '88888888-8888-4888-8888-888888888880'
    const canceled = await handleMockRequest(request('POST', `/tasks/${cancelId}/cancel`))
    expect((canceled.data as { state: string }).state).toBe('canceled')
  })
})
