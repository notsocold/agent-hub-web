import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import AdminAuditView from '@/views/admin/AdminAuditView.vue'
import type { AuditLog, PageResult } from '@/types'

const auditApiMock = vi.hoisted(() => ({ all: vi.fn(), own: vi.fn() }))
vi.mock('@/api/audit', () => ({ auditApi: auditApiMock }))

const routeMock = vi.hoisted(() => ({ query: {} as Record<string, unknown> }))
vi.mock('vue-router', () => ({ useRoute: () => routeMock }))

const messageMock = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
}))
vi.mock('element-plus', () => ({
  ElMessage: messageMock,
  ElMessageBox: { confirm: vi.fn() },
}))

function auditLog(overrides: Partial<AuditLog> = {}): AuditLog {
  return {
    id: 1,
    actor_type: 'admin',
    actor_id: 'u-1',
    action: 'secret.update',
    resource_type: 'secret',
    resource_id: 's-1',
    detail: { result: 'success' },
    request_id: 'req-1',
    created_at: '2026-11-12T08:00:00Z',
    ...overrides,
  }
}

function page(items: AuditLog[]): PageResult<AuditLog> {
  return { items, next_cursor: null, has_more: false }
}

async function mountView(): Promise<VueWrapper> {
  setActivePinia(createPinia())
  const wrapper = mount(AdminAuditView)
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  vi.clearAllMocks()
  routeMock.query = {}
  auditApiMock.all.mockResolvedValue(page([auditLog()]))
  auditApiMock.own.mockResolvedValue(page([]))
})

describe('AdminAuditView M7 字段提示与防御性渲染', () => {
  it('展示 IP/结果字段说明条，列头带 title，无值时保持 —', async () => {
    const wrapper = await mountView()

    expect(wrapper.text()).toContain('IP 与结果字段后端暂未输出，显示为 —')
    const headers = wrapper.findAll('thead th')
    for (const label of ['IP', '结果']) {
      const header = headers.find((th) => th.text() === label)!
      expect(header.attributes('title')).toContain('后端接口暂未输出该字段，待契约补齐')
    }

    const cells = wrapper.findAll('tbody tr')[0]!.findAll('td')
    expect(cells[4]!.text()).toBe('—')
    expect(cells[5]!.text()).toBe('—')
    expect(wrapper.find('.audit-ip').text()).toBe('—')
    wrapper.unmount()
  })

  it('后端补齐字段后正常渲染 IP/结果，成功结果使用通过态徽标', async () => {
    auditApiMock.all.mockResolvedValue(page([auditLog({ ip: '203.0.113.7', result: 'success' })]))
    const wrapper = await mountView()

    expect(wrapper.find('.audit-ip').text()).toBe('203.0.113.7')
    const resultCell = wrapper.findAll('tbody tr')[0]!.findAll('td')[5]!
    expect(resultCell.text()).toBe('success')
    expect(resultCell.find('.st').classes()).toContain('st-ok')
    wrapper.unmount()
  })

  it('失败结果使用错误态徽标，未知结果保持中性', async () => {
    auditApiMock.all.mockResolvedValue(
      page([
        auditLog({ id: 1, ip: '198.51.100.9', result: 'failure' }),
        auditLog({ id: 2, ip: '198.51.100.10', result: 'something-new' }),
      ]),
    )
    const wrapper = await mountView()

    const rows = wrapper.findAll('tbody tr')
    expect(rows[0]!.findAll('td')[5]!.find('.st').classes()).toContain('st-error')
    expect(rows[1]!.findAll('td')[5]!.find('.st').classes()).toContain('st-muted')
    wrapper.unmount()
  })
})

describe('AdminAuditView M9 搜索深链预填', () => {
  it('挂载时用 route.query.action 预填动作筛选，只发一次首屏请求', async () => {
    routeMock.query = { action: 'secret.update' }
    const wrapper = await mountView()

    expect(auditApiMock.all).toHaveBeenCalledTimes(1)
    expect(auditApiMock.all.mock.calls[0]![0]!.action).toBe('secret.update')
    const select = wrapper.find('select[aria-label="按操作筛选"]').element as HTMLSelectElement
    expect(select.value).toBe('secret.update')
    wrapper.unmount()
  })

  it('多值 query 取第一个合法动作，非法值忽略', async () => {
    routeMock.query = { action: ['not.exists', 'skill.update'] }
    const wrapper = await mountView()

    expect(auditApiMock.all).toHaveBeenCalledTimes(1)
    expect(auditApiMock.all.mock.calls[0]![0]!.action).toBe('skill.update')
    wrapper.unmount()
  })

  it('非法 action 忽略并保留全部操作，首屏请求不带 action', async () => {
    routeMock.query = { action: 'not.exists' }
    const wrapper = await mountView()

    expect(auditApiMock.all).toHaveBeenCalledTimes(1)
    expect(auditApiMock.all.mock.calls[0]![0]!.action).toBeUndefined()
    const select = wrapper.find('select[aria-label="按操作筛选"]').element as HTMLSelectElement
    expect(select.value).toBe('')
    wrapper.unmount()
  })

  it('无 action query 时首屏行为不变', async () => {
    const wrapper = await mountView()

    expect(auditApiMock.all).toHaveBeenCalledTimes(1)
    expect(auditApiMock.all.mock.calls[0]![0]!.action).toBeUndefined()
    wrapper.unmount()
  })
})
