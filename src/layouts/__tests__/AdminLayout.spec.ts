import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import AdminLayout from '@/layouts/AdminLayout.vue'
import { useAuthStore } from '@/stores/auth'
import type { User } from '@/types'

const ElMessageBoxMock = vi.hoisted(() => ({ confirm: vi.fn() }))

vi.mock('element-plus', async (importOriginal) => {
  const actual = await importOriginal<typeof import('element-plus')>()
  return { ...actual, ElMessageBox: ElMessageBoxMock }
})

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

async function mountLayout(routeName = 'admin-overview') {
  setActivePinia(createPinia())
  const auth = useAuthStore()
  auth.user = admin()
  auth.accessToken = 'token'
  const router = makeRouter()
  await router.push({ name: routeName })
  await router.isReady()
  const wrapper = mount(AdminLayout, {
    global: {
      plugins: [router],
      stubs: { RouterView: true },
    },
  })
  return { wrapper, router }
}

describe('AdminLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
})
