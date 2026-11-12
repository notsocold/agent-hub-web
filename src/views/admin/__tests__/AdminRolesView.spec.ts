import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import AdminRolesView from '@/views/admin/AdminRolesView.vue'
import type { AdminUserPage } from '@/types'

const adminApiMock = vi.hoisted(() => ({
  users: vi.fn(),
}))

vi.mock('@/api/admin', () => ({ adminApi: adminApiMock }))

function userPage(stats: Partial<AdminUserPage['stats']> = {}): AdminUserPage {
  return {
    items: [],
    next_cursor: null,
    has_more: false,
    stats: { total: 6, active: 5, disabled: 1, admins: 2, ...stats },
  }
}

describe('AdminRolesView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    adminApiMock.users.mockResolvedValue(userPage())
  })

  it('渲染只读提示、角色说明、角色分布与能力矩阵表头', async () => {
    const wrapper = mount(AdminRolesView)
    await flushPromises()

    const text = wrapper.text()
    expect(adminApiMock.users).toHaveBeenCalledTimes(1)
    expect(text).toContain('角色与权限')
    expect(text).toContain('后端无对应管理接口')
    expect(text).toContain('只读呈现')
    expect(text).toContain('不做新建角色或权限编辑')
    expect(text).toContain('user · 普通用户')
    expect(text).toContain('admin · 管理员')
    expect(text).toContain('内置能力矩阵')
    expect(text).toContain('含停用管理员')

    const distribution = wrapper.get('dl').text().replace(/\s+/g, '')
    expect(distribution).toContain('总用户6')
    expect(distribution).toContain('活跃5')
    expect(distribution).toContain('停用1')
    expect(distribution).toContain('管理员2')
    // 普通用户 = 总用户 − 管理员 = 6 - 2 = 4
    expect(distribution).toContain('普通用户4')

    const headers = wrapper.findAll('thead th').map((th) => th.text())
    expect(headers).toContain('模块')
    expect(headers).toContain('user')
    expect(headers).toContain('admin')
    wrapper.unmount()
  })

  it('按接口返回的 stats 重新计算角色分布', async () => {
    adminApiMock.users.mockResolvedValue(userPage({ total: 10, active: 8, disabled: 2, admins: 3 }))
    const wrapper = mount(AdminRolesView)
    await flushPromises()

    const distribution = wrapper.get('dl').text().replace(/\s+/g, '')
    expect(distribution).toContain('总用户10')
    expect(distribution).toContain('活跃8')
    expect(distribution).toContain('停用2')
    expect(distribution).toContain('管理员3')
    expect(distribution).toContain('普通用户7')
    wrapper.unmount()
  })

  it('加载失败展示错误态并支持重试', async () => {
    adminApiMock.users.mockRejectedValueOnce(new Error('用户接口不可用'))
    const wrapper = mount(AdminRolesView)
    await flushPromises()

    expect(wrapper.text()).toContain('用户接口不可用')
    const buttons = wrapper.findAll('button')
    expect(buttons.length).toBeGreaterThan(0)
    await buttons[buttons.length - 1]!.trigger('click')
    await flushPromises()

    expect(adminApiMock.users).toHaveBeenCalledTimes(2)
    expect(wrapper.get('dl').text()).toContain('管理员')
    wrapper.unmount()
  })
})
