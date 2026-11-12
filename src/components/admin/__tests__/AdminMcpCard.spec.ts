import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiRequestError } from '@/api/client'
import AdminMcpCard from '@/components/admin/AdminMcpCard.vue'
import type { AdminMcpServerList, McpServer } from '@/types'

const adminApiMock = vi.hoisted(() => ({
  mcpServers: vi.fn(),
  createMcpServer: vi.fn(),
  updateMcpServer: vi.fn(),
  deleteMcpServer: vi.fn(),
}))
vi.mock('@/api/admin', () => ({ adminApi: adminApiMock }))

const messageMock = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
}))
const messageBoxMock = vi.hoisted(() => ({ confirm: vi.fn() }))
vi.mock('element-plus', () => ({
  ElMessage: messageMock,
  ElMessageBox: messageBoxMock,
}))

function mcpRow(overrides: Partial<McpServer> = {}): McpServer {
  return {
    id: 'mcp-1',
    slug: 'slack-mcp',
    name: 'Slack',
    description: 'Slack MCP 服务',
    url: 'https://mcp.slack.example.com/mcp',
    transport: 'streamable_http',
    scope: 'system',
    enabled: true,
    effective_enabled: true,
    force_disabled: false,
    auto_inject: true,
    health_status: 'healthy',
    last_error: null,
    last_checked_at: '2026-11-11T08:00:00Z',
    latency_ms: 142,
    tool_count: 12,
    credentials_hint: 'secret:SLACK_MCP_TOKEN',
    ...overrides,
  }
}

function mcpList(overrides: Partial<AdminMcpServerList> = {}): AdminMcpServerList {
  return {
    items: [mcpRow()],
    stats: { total: 1, system: 1, user: 0, enabled: 1, healthy: 1 },
    ...overrides,
  }
}

async function mountCard(): Promise<VueWrapper> {
  // 默认 mock 已在 beforeEach 设置；用例可在 mount 前覆盖。
  const wrapper = mount(AdminMcpCard)
  await flushPromises()
  return wrapper
}

async function openCreateForm(wrapper: VueWrapper): Promise<void> {
  await wrapper
    .findAll('button')
    .find((button) => button.text() === '新建 MCP')!
    .trigger('click')
  await flushPromises()
}

/** 填写新建表单的最小合法字段（可覆盖 slug/url）。 */
async function fillCreateForm(wrapper: VueWrapper, slug: string): Promise<void> {
  await wrapper.find('input[aria-label="MCP 名称"]').setValue('Test MCP')
  await wrapper.find('input[aria-label="MCP slug"]').setValue(slug)
  await wrapper.find('input[aria-label="URL"]').setValue('https://mcp.example.com/mcp')
}

function findButton(wrapper: VueWrapper, text: string) {
  return wrapper.findAll('button').find((button) => button.text() === text)
}

beforeEach(() => {
  vi.clearAllMocks()
  adminApiMock.mcpServers.mockResolvedValue(mcpList())
  adminApiMock.createMcpServer.mockResolvedValue({ id: 'mcp-new', health_status: 'healthy' })
  adminApiMock.updateMcpServer.mockResolvedValue({})
  adminApiMock.deleteMcpServer.mockResolvedValue(undefined)
  messageBoxMock.confirm.mockResolvedValue(true)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('AdminMcpCard', () => {
  it('渲染列表、stats 与传输/健康/凭据列', async () => {
    const wrapper = await mountCard()

    const text = wrapper.text()
    expect(text).toContain('系统 MCP')
    expect(text).toContain('1 个 · 1 启用 · 1 健康')
    expect(text).toContain('Slack')
    expect(text).toContain('slack-mcp')
    expect(text).toContain('Streamable HTTP')
    expect(text).toContain('secret:SLACK_MCP_TOKEN')
    expect(text).toContain('12')
    expect(text).toContain('启用')
    wrapper.unmount()
  })

  it('unhealthy 行展示 last_error 且强制停用口径生效', async () => {
    adminApiMock.mcpServers.mockResolvedValue(
      mcpList({
        items: [
          mcpRow({
            health_status: 'unhealthy',
            last_error: 'connect ECONNREFUSED 127.0.0.1:9',
            effective_enabled: undefined,
            force_disabled: true,
          }),
        ],
        stats: { total: 1, system: 1, user: 0, enabled: 0, healthy: 0 },
      }),
    )
    const wrapper = await mountCard()

    const text = wrapper.text()
    expect(text).toContain('connect ECONNREFUSED 127.0.0.1:9')
    expect(text).toContain('已强制停用')
    wrapper.unmount()
  })

  it('新建：slug 不合法时不发请求，合法后提交参数正确并刷新', async () => {
    const wrapper = await mountCard()
    const callsBefore = adminApiMock.mcpServers.mock.calls.length

    await openCreateForm(wrapper)
    await fillCreateForm(wrapper, 'Bad Slug!')
    await findButton(wrapper, '创建')!.trigger('click')
    await flushPromises()

    expect(messageMock.error).toHaveBeenCalled()
    expect(adminApiMock.createMcpServer).not.toHaveBeenCalled()

    await wrapper.find('input[aria-label="MCP slug"]').setValue('test-mcp')
    await findButton(wrapper, '创建')!.trigger('click')
    await flushPromises()

    expect(adminApiMock.createMcpServer).toHaveBeenCalledTimes(1)
    expect(adminApiMock.createMcpServer).toHaveBeenCalledWith({
      name: 'Test MCP',
      slug: 'test-mcp',
      transport: 'streamable_http',
      url: 'https://mcp.example.com/mcp',
    })
    expect(messageMock.success).toHaveBeenCalledWith('MCP 已创建')
    expect(adminApiMock.mcpServers.mock.calls.length).toBeGreaterThan(callsBefore)
    // 成功后表单收起。
    expect(wrapper.find('input[aria-label="MCP slug"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('创建返回 unhealthy 时提示 last_error 且仍刷新列表', async () => {
    adminApiMock.createMcpServer.mockResolvedValue({
      id: 'mcp-new',
      health_status: 'unhealthy',
      last_error: 'connect ECONNREFUSED',
    })
    const wrapper = await mountCard()
    const callsBefore = adminApiMock.mcpServers.mock.calls.length

    await openCreateForm(wrapper)
    await fillCreateForm(wrapper, 'test-mcp')
    await findButton(wrapper, '创建')!.trigger('click')
    await flushPromises()

    expect(messageMock.warning).toHaveBeenCalledWith('配置已保存，但连接失败：connect ECONNREFUSED')
    expect(adminApiMock.mcpServers.mock.calls.length).toBeGreaterThan(callsBefore)
    expect(wrapper.find('input[aria-label="MCP slug"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('409 conflict 提示 slug 已被占用', async () => {
    adminApiMock.createMcpServer.mockRejectedValue(
      new ApiRequestError('slug 已被占用', { code: 'conflict', status: 409 }),
    )
    const wrapper = await mountCard()

    await openCreateForm(wrapper)
    await fillCreateForm(wrapper, 'slack-mcp')
    await findButton(wrapper, '创建')!.trigger('click')
    await flushPromises()

    expect(messageMock.error).toHaveBeenCalledWith('slug 已被占用，请换一个')
    // 提交失败不丢弃表单，可修改后重试。
    expect(wrapper.find('input[aria-label="MCP slug"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('确认后删除并从列表移除', async () => {
    const wrapper = await mountCard()
    expect(wrapper.text()).toContain('Slack')

    await findButton(wrapper, '删除')!.trigger('click')
    await flushPromises()

    expect(messageBoxMock.confirm).toHaveBeenCalled()
    expect(adminApiMock.deleteMcpServer).toHaveBeenCalledWith('mcp-1')
    expect(wrapper.text()).not.toContain('Slack')
    wrapper.unmount()
  })

  it('删除 404 后提示并刷新列表', async () => {
    adminApiMock.deleteMcpServer.mockRejectedValue(
      new ApiRequestError('系统 MCP 不存在', { code: 'not_found', status: 404 }),
    )
    const wrapper = await mountCard()
    const callsBefore = adminApiMock.mcpServers.mock.calls.length

    await findButton(wrapper, '删除')!.trigger('click')
    await flushPromises()

    expect(messageMock.error).toHaveBeenCalledWith('系统 MCP 不存在，已刷新列表')
    expect(adminApiMock.mcpServers.mock.calls.length).toBeGreaterThan(callsBefore)
    wrapper.unmount()
  })

  it('确认后提交 enabled 开关字段', async () => {
    const wrapper = await mountCard()

    await findButton(wrapper, '停用')!.trigger('click')
    await flushPromises()

    expect(messageBoxMock.confirm).toHaveBeenCalled()
    expect(adminApiMock.updateMcpServer).toHaveBeenCalledWith('mcp-1', { enabled: false })
    expect(adminApiMock.mcpServers.mock.calls.length).toBeGreaterThan(1)
    wrapper.unmount()
  })

  it('确认后提交 force_disabled 开关字段', async () => {
    const wrapper = await mountCard()

    await findButton(wrapper, '强制停用')!.trigger('click')
    await flushPromises()

    expect(messageBoxMock.confirm).toHaveBeenCalled()
    expect(adminApiMock.updateMcpServer).toHaveBeenCalledWith('mcp-1', { force_disabled: true })
    wrapper.unmount()
  })

  it('取消确认不提交', async () => {
    messageBoxMock.confirm.mockRejectedValue('cancel')
    const wrapper = await mountCard()

    await findButton(wrapper, '停用')!.trigger('click')
    await flushPromises()

    expect(adminApiMock.updateMcpServer).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('新建表单不提供 stdio 传输（创建后不可改且需运维白名单）', async () => {
    const wrapper = await mountCard()
    await openCreateForm(wrapper)

    const options = wrapper
      .findAll('select')
      .flatMap((select) => select.findAll('option'))
      .map((option) => option.element.value)
    expect(options).toContain('streamable_http')
    expect(options).toContain('sse')
    expect(options).not.toContain('stdio')
    wrapper.unmount()
  })

  it('编辑 headers：填写引用行后随 patch 提交', async () => {
    const wrapper = await mountCard()

    await findButton(wrapper, '编辑')!.trigger('click')
    await flushPromises()
    await wrapper.find('input[aria-label="编辑 header 名 1"]').setValue('Authorization')
    await wrapper.find('input[aria-label="编辑 header 值 1"]').setValue('secret:MCP_KEY')
    await wrapper
      .findAll('form.edit-form button')
      .find((button) => button.text() === '保存')!
      .trigger('click')
    await flushPromises()

    expect(adminApiMock.updateMcpServer).toHaveBeenCalledWith('mcp-1', {
      headers: { Authorization: 'secret:MCP_KEY' },
    })
    wrapper.unmount()
  })

  it('编辑 headers 键值不完整时阻止提交', async () => {
    const wrapper = await mountCard()

    await findButton(wrapper, '编辑')!.trigger('click')
    await flushPromises()
    await wrapper.find('input[aria-label="编辑 header 名 1"]').setValue('Authorization')
    await wrapper
      .findAll('form.edit-form button')
      .find((button) => button.text() === '保存')!
      .trigger('click')
    await flushPromises()

    expect(messageMock.error).toHaveBeenCalledWith(
      'headers 的键与值需同时填写（支持 secret:NAME / env:NAME 引用）',
    )
    expect(adminApiMock.updateMcpServer).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('编辑 headers 留空时不修改 headers', async () => {
    const wrapper = await mountCard()

    await findButton(wrapper, '编辑')!.trigger('click')
    await flushPromises()
    await wrapper
      .findAll('form.edit-form button')
      .find((button) => button.text() === '保存')!
      .trigger('click')
    await flushPromises()

    // 全空行视为未修改：patch 无 headers，空对象不发请求。
    expect(adminApiMock.updateMcpServer).not.toHaveBeenCalled()
    expect(messageMock.info).toHaveBeenCalledWith('没有变更')
    wrapper.unmount()
  })
})
