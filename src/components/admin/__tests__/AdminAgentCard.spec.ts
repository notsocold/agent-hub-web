import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiRequestError } from '@/api/client'
import AdminAgentCard from '@/components/admin/AdminAgentCard.vue'
import type { AdminAgentList, Agent } from '@/types'

const adminApiMock = vi.hoisted(() => ({
  agents: vi.fn(),
  updateAgent: vi.fn(),
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

function agentRow(overrides: Partial<Agent> = {}): Agent {
  return {
    id: 'agent-1',
    slug: 'data-analyst',
    name: 'Data Analyst',
    description: '数据分析与数字核对',
    url: 'https://data.example.com/a2a',
    protocol_version: '1.0',
    skills: [{ id: 'verify_numbers', name: '数字核对' }],
    skill_count: 1,
    auth_type: 'api_key',
    auth_scheme: 'bearer',
    auth_hint: 'env:DATA_AGENT_KEY',
    capabilities: { streaming: true, push_notifications: false },
    health_status: 'healthy',
    enabled: true,
    last_checked_at: '2026-11-11T08:00:00Z',
    last_latency_ms: 142,
    last_error: null,
    recent_task: null,
    ...overrides,
  }
}

function agentList(overrides: Partial<AdminAgentList> = {}): AdminAgentList {
  return {
    items: [agentRow()],
    next_cursor: null,
    has_more: false,
    stats: { total: 1, healthy: 1, degraded: 0, unhealthy: 0, enabled: 1, disabled: 0 },
    ...overrides,
  }
}

async function mountCard(): Promise<VueWrapper> {
  // 默认 mock 已在 beforeEach 设置；用例可在 mount 前覆盖。
  const wrapper = mount(AdminAgentCard)
  await flushPromises()
  return wrapper
}

function findButton(wrapper: VueWrapper, text: string) {
  return wrapper
    .findAll('button')
    .find((button) => button.text() === text)
}

beforeEach(() => {
  vi.clearAllMocks()
  adminApiMock.agents.mockResolvedValue(agentList())
  adminApiMock.updateAgent.mockResolvedValue({})
  messageBoxMock.confirm.mockResolvedValue(true)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('AdminAgentCard', () => {
  it('渲染列表与 stats 摘要', async () => {
    const wrapper = await mountCard()

    const text = wrapper.text()
    expect(text).toContain('全局 Agent')
    expect(text).toContain('1 全部 · 1 健康 · 0 降级 · 0 不可用 · 0 停用')
    expect(text).toContain('Data Analyst')
    expect(text).toContain('data-analyst')
    expect(text).toContain('env:DATA_AGENT_KEY')
    // formatDateTime 按本地时区渲染（08:00Z 在 UTC+8 为 16:00），只断言日期部分。
    expect(text).toContain('2026-11-11')
    wrapper.unmount()
  })

  it('搜索防抖 400ms 后带 q 请求', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      const wrapper = await mountCard()
      const initialCalls = adminApiMock.agents.mock.calls.length

      await wrapper.find('input[type="search"]').setValue('data')
      expect(adminApiMock.agents.mock.calls.length).toBe(initialCalls)

      await vi.advanceTimersByTimeAsync(400)
      await flushPromises()

      expect(adminApiMock.agents.mock.calls.length).toBe(initialCalls + 1)
      const lastCall = adminApiMock.agents.mock.calls.at(-1)![0]!
      expect(lastCall.q).toBe('data')
      expect(lastCall.limit).toBe(20)
      wrapper.unmount()
    } finally {
      vi.useRealTimers()
    }
  })

  it('下一页带 cursor、上一页回退', async () => {
    adminApiMock.agents.mockResolvedValue(agentList({ has_more: true, next_cursor: 'cursor-1' }))
    const wrapper = await mountCard()

    adminApiMock.agents.mockResolvedValue(agentList())
    const footButtons = wrapper.findAll('.table-foot button')
    await footButtons[1]!.trigger('click')
    await flushPromises()
    expect(adminApiMock.agents.mock.calls.at(-1)![0]!.cursor).toBe('cursor-1')

    await footButtons[0]!.trigger('click')
    await flushPromises()
    // 回到第一页：栈空，不带 cursor。
    expect(adminApiMock.agents.mock.calls.at(-1)![0]!.cursor).toBeUndefined()
    wrapper.unmount()
  })

  it('编辑只提交变化字段（只改 name）', async () => {
    const wrapper = await mountCard()

    await findButton(wrapper, '编辑')!.trigger('click')
    await wrapper.find('input[aria-label="Agent 名称"]').setValue('New Name')
    await findButton(wrapper, '保存')!.trigger('click')
    await flushPromises()

    expect(messageBoxMock.confirm).toHaveBeenCalled()
    expect(adminApiMock.updateAgent).toHaveBeenCalledTimes(1)
    expect(adminApiMock.updateAgent).toHaveBeenCalledWith('agent-1', { name: 'New Name' })
    expect(messageMock.success).toHaveBeenCalledWith('已保存')
    wrapper.unmount()
  })

  it('编辑含 enabled 与鉴权变化时提交对应字段', async () => {
    const wrapper = await mountCard()

    await findButton(wrapper, '编辑')!.trigger('click')
    await wrapper.find('input[aria-label="编辑启用"]').setValue(false)
    await wrapper.find('select[aria-label="编辑鉴权类型"]').setValue('none')
    await findButton(wrapper, '保存')!.trigger('click')
    await flushPromises()

    expect(adminApiMock.updateAgent).toHaveBeenCalledWith('agent-1', {
      enabled: false,
      auth: { type: 'none' },
    })
    wrapper.unmount()
  })

  it('保存前确认 ElMessageBox，取消不提交', async () => {
    messageBoxMock.confirm.mockRejectedValue('cancel')
    const wrapper = await mountCard()

    await findButton(wrapper, '编辑')!.trigger('click')
    await wrapper.find('input[aria-label="Agent 名称"]').setValue('New Name')
    await findButton(wrapper, '保存')!.trigger('click')
    await flushPromises()

    expect(messageBoxMock.confirm).toHaveBeenCalled()
    expect(adminApiMock.updateAgent).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('保存 404 后提示并刷新列表', async () => {
    adminApiMock.updateAgent.mockRejectedValue(
      new ApiRequestError('Agent 不存在', { code: 'not_found', status: 404 }),
    )
    const wrapper = await mountCard()
    const callsBefore = adminApiMock.agents.mock.calls.length

    await findButton(wrapper, '编辑')!.trigger('click')
    await wrapper.find('input[aria-label="Agent 名称"]').setValue('New Name')
    await findButton(wrapper, '保存')!.trigger('click')
    await flushPromises()

    expect(messageMock.error).toHaveBeenCalledWith('Agent 不存在，已刷新列表')
    expect(adminApiMock.agents.mock.calls.length).toBeGreaterThan(callsBefore)
    wrapper.unmount()
  })
})
