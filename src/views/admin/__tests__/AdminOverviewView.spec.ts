import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import AdminOverviewView from '@/views/admin/AdminOverviewView.vue'
import type { AdminOverview } from '@/types'

const adminApiMock = vi.hoisted(() => ({
  overview: vi.fn(),
}))

vi.mock('@/api/admin', () => ({ adminApi: adminApiMock }))

function overview(overrides: Partial<AdminOverview> = {}): AdminOverview {
  return {
    generated_at: '2026-11-12T06:00:00Z',
    users: { total: 6, active: 5, disabled: 1, admins: 2 },
    conversations: { total: 4, active: 2, archived: 1, deleted: 1 },
    messages: { total: 18 },
    runs: {
      total: 3,
      queued: 0,
      running: 1,
      succeeded: 1,
      failed: 1,
      canceled: 0,
      interrupted: 0,
    },
    a2a_tasks: {
      total: 2,
      submitted: 0,
      working: 1,
      input_required: 0,
      auth_required: 0,
      completed: 1,
      failed: 0,
      canceled: 0,
      rejected: 0,
    },
    knowledge: {
      documents: 5,
      chunks: 20,
      documents_pending: 0,
      documents_indexing: 1,
      documents_ready: 3,
      documents_failed: 1,
    },
    attachments: { total: 2, storage_bytes: 2048, deleted: 1 },
    ...overrides,
  }
}

describe('AdminOverviewView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    adminApiMock.overview.mockResolvedValue(overview())
  })

  it('渲染关键计数、状态明细与数据时间', async () => {
    const wrapper = mount(AdminOverviewView)
    await flushPromises()

    const text = wrapper.text()
    expect(adminApiMock.overview).toHaveBeenCalledTimes(1)
    expect(text).toContain('管理概览')
    expect(text).toContain('用户')
    expect(text).toContain('6')
    expect(text).toContain('5 活跃 · 2 管理员')
    expect(text).toContain('运行状态')
    expect(text).toContain('等待审批')
    expect(text).toContain('A2A 任务状态')
    expect(text).toContain('知识文档')
    expect(text).toContain('附件存储')
    expect(text).toContain('2026')
    wrapper.unmount()
  })

  it('手动刷新再次请求概览', async () => {
    const wrapper = mount(AdminOverviewView)
    await flushPromises()

    await wrapper.get('button').trigger('click')
    await flushPromises()

    expect(adminApiMock.overview).toHaveBeenCalledTimes(2)
    wrapper.unmount()
  })

  it('加载失败展示错误态并支持重试', async () => {
    adminApiMock.overview.mockRejectedValueOnce(new Error('概览接口不可用'))
    const wrapper = mount(AdminOverviewView)
    await flushPromises()

    expect(wrapper.text()).toContain('概览接口不可用')
    const buttons = wrapper.findAll('button')
    expect(buttons.length).toBeGreaterThan(0)
    await buttons[buttons.length - 1]!.trigger('click')
    await flushPromises()
    expect(adminApiMock.overview).toHaveBeenCalledTimes(2)
    wrapper.unmount()
  })
})
