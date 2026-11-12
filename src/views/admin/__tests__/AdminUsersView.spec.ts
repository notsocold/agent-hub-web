import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiRequestError } from '@/api/client'
import { useAuthStore } from '@/stores/auth'
import type { AdminUser, AdminUserPage } from '@/types'
import AdminUsersView from '@/views/admin/AdminUsersView.vue'

const adminApiMock = vi.hoisted(() => ({
  users: vi.fn(),
  updateUser: vi.fn(),
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

function userRow(overrides: Partial<AdminUser> = {}): AdminUser {
  return {
    id: 'u-1',
    email: 'alice@example.com',
    display_name: 'Alice',
    role: 'user',
    status: 'active',
    last_login_at: '2026-11-11T08:00:00Z',
    created_at: '2026-11-01T02:00:00Z',
    updated_at: '2026-11-11T08:00:00Z',
    ...overrides,
  }
}

function userPage(overrides: Partial<AdminUserPage> = {}): AdminUserPage {
  return {
    items: [userRow()],
    next_cursor: null,
    has_more: false,
    stats: { total: 1, active: 1, disabled: 0, admins: 0 },
    ...overrides,
  }
}

const SELF_ID = 'self-0000-0000'

function selfRow(): AdminUser {
  return userRow({
    id: SELF_ID,
    email: 'me@example.com',
    display_name: '当前管理员',
    role: 'admin',
  })
}

function defaultPage(): AdminUserPage {
  return userPage({
    items: [selfRow(), userRow()],
    stats: { total: 2, active: 2, disabled: 0, admins: 1 },
  })
}

async function mountView(): Promise<VueWrapper> {
  setActivePinia(createPinia())
  const auth = useAuthStore()
  auth.user = selfRow()
  const wrapper = mount(AdminUsersView)
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  vi.clearAllMocks()
  adminApiMock.users.mockResolvedValue(defaultPage())
  adminApiMock.updateUser.mockResolvedValue(userRow())
  messageBoxMock.confirm.mockResolvedValue(true)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('AdminUsersView', () => {
  it('渲染列表、统计摘要与自己的行禁用控件', async () => {
    const wrapper = await mountView()

    const text = wrapper.text()
    expect(text).toContain('用户管理')
    expect(text).toContain('2 用户')
    expect(text).toContain('管理员（含停用）')
    expect(text).toContain('alice@example.com')

    // 自己的行：角色下拉与停用按钮都禁用，避免点出 422。
    const selects = wrapper.findAll('select.role-select')
    expect(selects).toHaveLength(2)
    const selfSelect = selects.find((select) => select.attributes('disabled') !== undefined)
    expect(selfSelect).toBeDefined()
    const disabledAction = wrapper
      .findAll('tbody button')
      .find((button) => button.attributes('disabled') !== undefined)
    expect(disabledAction).toBeDefined()
    expect(disabledAction!.text()).toBe('停用')

    adminApiMock.updateUser.mockRejectedValue(new Error('不应触发'))
    await disabledAction!.trigger('click')
    expect(adminApiMock.updateUser).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('搜索防抖 400ms 后带 q 请求', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      const wrapper = await mountView()
      const initialCalls = adminApiMock.users.mock.calls.length

      await wrapper.find('input[type="search"]').setValue('ali')
      expect(adminApiMock.users.mock.calls.length).toBe(initialCalls)

      await vi.advanceTimersByTimeAsync(400)
      await flushPromises()

      expect(adminApiMock.users.mock.calls.length).toBe(initialCalls + 1)
      const lastCall = adminApiMock.users.mock.calls.at(-1)![0]!
      expect(lastCall.q).toBe('ali')
      wrapper.unmount()
    } finally {
      vi.useRealTimers()
    }
  })

  it('筛选变更重置游标并带上筛选参数', async () => {
    adminApiMock.users.mockResolvedValue(
      userPage({
        has_more: true,
        next_cursor: 'cursor-1',
        stats: { total: 30, active: 25, disabled: 5, admins: 2 },
      }),
    )
    const wrapper = await mountView()

    // 先翻到第二页，产生游标栈。
    adminApiMock.users.mockResolvedValue(userPage())
    await wrapper.findAll('.table-foot button')[1]!.trigger('click')
    await flushPromises()
    expect(adminApiMock.users.mock.calls.at(-1)![0]!.cursor).toBe('cursor-1')

    // 筛选变更后回到第一页且不带 cursor。
    await wrapper.findAll('select.select')[0]!.setValue('admin')
    await flushPromises()
    const lastCall = adminApiMock.users.mock.calls.at(-1)![0]!
    expect(lastCall.role).toBe('admin')
    expect(lastCall.cursor).toBeUndefined()
    wrapper.unmount()
  })

  it('下一页带 cursor、上一页回退', async () => {
    adminApiMock.users.mockResolvedValue(userPage({ has_more: true, next_cursor: 'cursor-1' }))
    const wrapper = await mountView()

    adminApiMock.users.mockResolvedValue(userPage())
    const footButtons = wrapper.findAll('.table-foot button')
    await footButtons[1]!.trigger('click')
    await flushPromises()
    expect(adminApiMock.users.mock.calls.at(-1)![0]!.cursor).toBe('cursor-1')

    await footButtons[0]!.trigger('click')
    await flushPromises()
    // 回到第一页：栈空，不带 cursor。
    expect(adminApiMock.users.mock.calls.at(-1)![0]!.cursor).toBeUndefined()
    wrapper.unmount()
  })

  it('确认后调整角色并更新行', async () => {
    const wrapper = await mountView()
    adminApiMock.updateUser.mockResolvedValue(userRow({ role: 'admin' }))
    const otherSelect = wrapper
      .findAll('select.role-select')
      .find((select) => select.attributes('disabled') === undefined)!
    await otherSelect.setValue('admin')

    expect(messageBoxMock.confirm).toHaveBeenCalled()
    expect(adminApiMock.updateUser).toHaveBeenCalledWith('u-1', { role: 'admin' })
    expect(messageMock.success).toHaveBeenCalledWith('角色已更新')
    expect(wrapper.text()).toContain('管理员')
    wrapper.unmount()
  })

  it('取消确认不提交且恢复服务端值', async () => {
    messageBoxMock.confirm.mockRejectedValue('cancel')
    const wrapper = await mountView()
    const callsBefore = adminApiMock.users.mock.calls.length

    const otherSelect = wrapper
      .findAll('select.role-select')
      .find((select) => select.attributes('disabled') === undefined)!
    await otherSelect.setValue('admin')
    await flushPromises()

    expect(adminApiMock.updateUser).not.toHaveBeenCalled()
    // 取消后刷新当前页恢复 select 与服务端一致。
    expect(adminApiMock.users.mock.calls.length).toBeGreaterThan(callsBefore)
    wrapper.unmount()
  })

  it('cannot_change_own_role 提示并刷新', async () => {
    adminApiMock.updateUser.mockRejectedValue(
      new ApiRequestError('不能修改自己的角色', {
        code: 'cannot_change_own_role',
        status: 422,
      }),
    )
    const wrapper = await mountView()
    const callsBefore = adminApiMock.users.mock.calls.length

    // 服务端仍是最终防线：以其他行触发同一错误码分支，验证提示与刷新逻辑。
    const otherSelect = wrapper
      .findAll('select.role-select')
      .find((select) => select.attributes('disabled') === undefined)!
    await otherSelect.setValue('admin')
    await flushPromises()

    expect(messageMock.error).toHaveBeenCalledWith('不能修改自己的角色')
    expect(adminApiMock.users.mock.calls.length).toBeGreaterThan(callsBefore)
    wrapper.unmount()
  })

  it('last_admin_protected 提示保留管理员并刷新列表', async () => {
    adminApiMock.users.mockResolvedValue(
      userPage({
        items: [userRow({ role: 'admin' })],
        stats: { total: 1, active: 1, disabled: 0, admins: 1 },
      }),
    )
    adminApiMock.updateUser.mockRejectedValue(
      new ApiRequestError('系统至少需要保留一名活跃管理员', {
        code: 'last_admin_protected',
        status: 409,
        details: { active_admins: 1 },
      }),
    )
    const wrapper = await mountView()
    const callsBefore = adminApiMock.users.mock.calls.length

    const otherSelect = wrapper
      .findAll('select.role-select')
      .find((select) => select.attributes('disabled') === undefined)!
    await otherSelect.setValue('user')
    await flushPromises()

    expect(messageMock.error).toHaveBeenCalledWith('系统至少需要保留一名活跃管理员')
    expect(adminApiMock.users.mock.calls.length).toBeGreaterThan(callsBefore)
    wrapper.unmount()
  })

  it('停用成功更新状态标签', async () => {
    const wrapper = await mountView()
    const action = wrapper
      .findAll('tbody button')
      .find((button) => button.attributes('disabled') === undefined)!

    adminApiMock.updateUser.mockResolvedValue(userRow({ status: 'disabled' }))
    await action.trigger('click')
    await flushPromises()

    expect(adminApiMock.updateUser).toHaveBeenCalledWith('u-1', { status: 'disabled' })
    expect(wrapper.text()).toContain('停用')
    expect(messageMock.success).toHaveBeenCalledWith('账号已停用')
    wrapper.unmount()
  })

  it('非法游标 422 后回到第一页', async () => {
    adminApiMock.users.mockResolvedValue(userPage({ has_more: true, next_cursor: 'cursor-1' }))
    const wrapper = await mountView()

    adminApiMock.users
      .mockRejectedValueOnce(
        new ApiRequestError('游标无效', { code: 'validation_error', status: 422 }),
      )
      .mockResolvedValue(userPage())
    await wrapper.findAll('.table-foot button')[1]!.trigger('click')
    await flushPromises()

    expect(messageMock.warning).toHaveBeenCalledWith('游标已失效，已回到第一页')
    const lastCall = adminApiMock.users.mock.calls.at(-1)![0]!
    expect(lastCall.cursor).toBeUndefined()
    wrapper.unmount()
  })
})
