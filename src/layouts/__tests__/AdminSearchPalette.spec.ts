import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { nextTick } from 'vue'

import CommandPalette from '@/components/common/CommandPalette.vue'
import type { AdminUser, AdminUserPage } from '@/types'

const adminApiMock = vi.hoisted(() => ({
  users: vi.fn(),
}))

vi.mock('@/api/admin', () => ({ adminApi: adminApiMock }))

function makeRouter(): Router {
  const stub = { template: '<div />' }
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/admin', name: 'admin-overview', component: stub },
      { path: '/admin/users', name: 'admin-users', component: stub },
      { path: '/admin/roles', name: 'admin-roles', component: stub },
      { path: '/admin/menus', name: 'admin-menus', component: stub },
      { path: '/admin/dictionaries', name: 'admin-dictionaries', component: stub },
      { path: '/admin/audit', name: 'admin-audit', component: stub },
      { path: '/admin/settings', name: 'admin-settings', component: stub },
    ],
  })
}

function adminUser(overrides: Partial<AdminUser> = {}): AdminUser {
  return {
    id: '11111111-1111-4111-8111-111111111112',
    email: 'alice@example.com',
    display_name: 'Alice Chen',
    role: 'user',
    status: 'active',
    last_login_at: '2026-11-15T08:00:00Z',
    created_at: '2026-10-01T08:00:00Z',
    updated_at: '2026-11-15T08:00:00Z',
    ...overrides,
  }
}

function userPage(items: AdminUser[] = []): AdminUserPage {
  return {
    items,
    next_cursor: null,
    has_more: false,
    stats: {
      total: items.length,
      active: items.filter((item) => item.status === 'active').length,
      disabled: items.filter((item) => item.status === 'disabled').length,
      admins: items.filter((item) => item.role === 'admin').length,
    },
  }
}

async function mountPalette(): Promise<{ wrapper: VueWrapper; router: Router }> {
  setActivePinia(createPinia())
  const router = makeRouter()
  await router.push({ name: 'admin-overview' })
  await router.isReady()
  const wrapper = mount(CommandPalette, {
    props: { open: true, mode: 'admin' },
    global: { plugins: [router] },
  })
  await flushPromises()
  return { wrapper, router }
}

function optionByText(wrapper: VueWrapper, text: string) {
  return wrapper.findAll('[role="option"]').find((option) => option.text().includes(text))
}

beforeEach(() => {
  vi.clearAllMocks()
  adminApiMock.users.mockResolvedValue(userPage())
})

afterEach(() => {
  vi.useRealTimers()
})

describe('管理台命令面板', () => {
  it('空查询展示七页管理台路由，不请求用户搜索', async () => {
    const { wrapper } = await mountPalette()

    expect(wrapper.get('[role="dialog"]').attributes('aria-label')).toBe('管理台搜索')
    expect(wrapper.get('[role="combobox"]').attributes('aria-label')).toBe(
      '搜索管理台页面、用户或审计动作',
    )
    const labels = wrapper.findAll('[role="option"]').map((option) => option.text())
    expect(labels).toHaveLength(7)
    for (const label of [
      '管理概览',
      '用户管理',
      '角色与权限',
      '菜单管理',
      '字典管理',
      '系统设置',
      '审计日志',
    ]) {
      expect(labels.some((text) => text.includes(label))).toBe(true)
    }
    expect(adminApiMock.users).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('用户搜索防抖 400ms、最多 8 条，点击跳用户页并携带 q', async () => {
    vi.useFakeTimers()
    adminApiMock.users.mockResolvedValue(userPage([adminUser()]))
    const { wrapper, router } = await mountPalette()
    const input = wrapper.get('[role="combobox"]')

    await input.setValue('alice')
    expect(adminApiMock.users).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(399)
    expect(adminApiMock.users).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    await nextTick()
    expect(adminApiMock.users).toHaveBeenCalledWith({ q: 'alice', limit: 8 })

    const option = optionByText(wrapper, 'Alice Chen')
    expect(option).toBeTruthy()
    await option!.trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.name).toBe('admin-users')
    expect(router.currentRoute.value.query.q).toBe('alice')
    wrapper.unmount()
  })

  it('审计动作命中后跳审计页并携带 action', async () => {
    vi.useFakeTimers()
    const { wrapper, router } = await mountPalette()
    const input = wrapper.get('[role="combobox"]')

    await input.setValue('approval.decide')
    await vi.advanceTimersByTimeAsync(400)
    await nextTick()

    const option = optionByText(wrapper, '审批决定')
    expect(option).toBeTruthy()
    await option!.trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.name).toBe('admin-audit')
    expect(router.currentRoute.value.query.action).toBe('approval.decide')
    wrapper.unmount()
  })

  it('无匹配结果显示空态', async () => {
    vi.useFakeTimers()
    adminApiMock.users.mockResolvedValue(userPage())
    const { wrapper } = await mountPalette()
    const input = wrapper.get('[role="combobox"]')

    await input.setValue('不存在的管理项')
    await vi.advanceTimersByTimeAsync(400)
    await nextTick()
    await nextTick()

    expect(wrapper.text()).toContain('没有匹配结果')
    expect(wrapper.findAll('[role="option"]')).toHaveLength(0)
    wrapper.unmount()
  })
})
