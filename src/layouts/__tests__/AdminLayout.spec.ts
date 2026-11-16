import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { nextTick } from 'vue'

import AdminLayout from '@/layouts/AdminLayout.vue'
import { useAuthStore } from '@/stores/auth'
import type { AdminUserPage, User } from '@/types'

const ElMessageBoxMock = vi.hoisted(() => ({ confirm: vi.fn() }))

vi.mock('element-plus', async (importOriginal) => {
  const actual = await importOriginal<typeof import('element-plus')>()
  return { ...actual, ElMessageBox: ElMessageBoxMock }
})

const adminApiMock = vi.hoisted(() => ({
  users: vi.fn(),
}))

vi.mock('@/api/admin', () => ({ adminApi: adminApiMock }))

function adminUserPage(): AdminUserPage {
  return {
    items: [],
    next_cursor: null,
    has_more: false,
    stats: { total: 3, active: 2, disabled: 1, admins: 1 },
  }
}

function admin(): User {
  return {
    id: 'u-1',
    email: 'admin@example.com',
    display_name: '周丹',
    status: 'active',
    role: 'admin',
    created_at: '2026-11-01T00:00:00Z',
    last_login_at: null,
  }
}

function makeRouter() {
  const stub = { template: '<div />' }
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/chat', name: 'chat', component: stub },
      { path: '/login', name: 'login', component: stub },
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

async function mountLayout(
  routeName = 'admin-overview',
  options: { attachTo?: HTMLElement } = {},
) {
  setActivePinia(createPinia())
  const auth = useAuthStore()
  auth.user = admin()
  auth.accessToken = 'token'
  const router = makeRouter()
  await router.push({ name: routeName })
  await router.isReady()
  const wrapper = mount(AdminLayout, {
    attachTo: options.attachTo,
    global: {
      plugins: [router],
      stubs: { RouterView: true },
    },
  })
  await flushPromises()
  return { wrapper, router }
}

function pressOnDocument(key: string, init: KeyboardEventInit = {}): void {
  document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...init }))
}

describe('AdminLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    adminApiMock.users.mockResolvedValue(adminUserPage())
    document.body.innerHTML = ''
  })

  it('渲染深墨侧栏的七个管理入口与账号区', async () => {
    const { wrapper } = await mountLayout()

    const text = wrapper.text()
    for (const label of [
      '概览',
      '用户管理',
      '角色与权限',
      '菜单管理',
      '字典管理',
      '系统设置',
      '审计日志',
    ]) {
      expect(text).toContain(label)
    }
    expect(text).toContain('管理控制台')
    expect(text).toContain('管理员')
    expect(text).toContain('周丹')
    expect(wrapper.find('[aria-label="管理导航"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('当前路由对应的导航项标记 aria-current', async () => {
    const { wrapper } = await mountLayout('admin-users')

    const active = wrapper.findAll('.rail-link.is-active')
    expect(active).toHaveLength(1)
    expect(active[0]!.attributes('aria-current')).toBe('page')
    expect(active[0]!.text()).toContain('用户管理')
    wrapper.unmount()
  })

  it('移动端菜单按钮展开侧栏抽屉', async () => {
    const { wrapper } = await mountLayout()

    await wrapper.get('[aria-label="打开管理导航"]').trigger('click')
    expect(wrapper.find('.admin-rail.is-open').exists()).toBe(true)
    expect(wrapper.find('.admin-scrim').exists()).toBe(true)
    wrapper.unmount()
  })

  it('返回工作台跳转对话页', async () => {
    const { wrapper, router } = await mountLayout()

    await wrapper.get('.rail-back').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('chat')
    wrapper.unmount()
  })

  it('顶栏搜索入口带快捷键提示，点击打开管理台搜索', async () => {
    const { wrapper } = await mountLayout()
    const trigger = wrapper.get('[aria-label="搜索管理台（Ctrl+K 或 /）"]')

    expect(trigger.text()).toContain('搜索')
    // 快捷键提示由 CSS 内容渲染（不进入可访问名，避免 WCAG 2.5.3 label-content-name-mismatch）。
    expect(trigger.find('kbd').text()).toBe('')
    expect(trigger.find('kbd').attributes('aria-hidden')).toBe('true')
    expect(trigger.attributes('aria-keyshortcuts')).toContain('Control+K')

    await trigger.trigger('click')
    await nextTick()
    expect(wrapper.get('[role="dialog"]').attributes('aria-label')).toBe('管理台搜索')
    expect(wrapper.get('[role="combobox"]').attributes('aria-label')).toBe(
      '搜索管理台页面、用户或审计动作',
    )
    wrapper.unmount()
  })

  it('Ctrl+K 打开、Esc 关闭并把焦点还给搜索按钮', async () => {
    const { wrapper } = await mountLayout('admin-overview', { attachTo: document.body })
    const trigger = wrapper.get<HTMLButtonElement>('[aria-label="搜索管理台（Ctrl+K 或 /）"]')
    trigger.element.focus()

    pressOnDocument('k', { ctrlKey: true })
    await flushPromises()
    await nextTick()
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true)
    expect(document.activeElement).toBe(wrapper.get('[role="combobox"]').element)

    pressOnDocument('Escape')
    await flushPromises()
    await nextTick()
    await nextTick()
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    expect(document.activeElement).toBe(trigger.element)
    wrapper.unmount()
  })

  it("'/' 打开搜索；焦点在输入控件内时不触发", async () => {
    const { wrapper } = await mountLayout('admin-overview', { attachTo: document.body })

    pressOnDocument('/')
    await flushPromises()
    await nextTick()
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true)

    pressOnDocument('Escape')
    await flushPromises()
    await nextTick()

    const outside = document.createElement('input')
    document.body.appendChild(outside)
    outside.focus()
    outside.dispatchEvent(new KeyboardEvent('keydown', { key: '/', bubbles: true }))
    await flushPromises()
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    outside.remove()
    wrapper.unmount()
  })

  it('键盘选择结果并按 Enter 进入管理页面', async () => {
    const { wrapper, router } = await mountLayout()

    await wrapper.get('[aria-label="搜索管理台（Ctrl+K 或 /）"]').trigger('click')
    await nextTick()
    const input = wrapper.get('[role="combobox"]')
    await input.setValue('审计')
    await flushPromises()

    const options = wrapper.findAll('[role="option"]')
    expect(options.length).toBeGreaterThan(0)
    await input.trigger('keydown', { key: 'Enter' })
    await flushPromises()

    expect(router.currentRoute.value.name).toBe('admin-audit')
    wrapper.unmount()
  })
})
