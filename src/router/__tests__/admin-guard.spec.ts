import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import { setupGuards } from '@/router/guards'
import { useAuthStore } from '@/stores/auth'
import type { User } from '@/types'

function adminUser(role: 'user' | 'admin'): User {
  return {
    id: 'u-1',
    email: `${role}@example.com`,
    display_name: '测试用户',
    status: 'active',
    role,
    created_at: '2026-11-01T00:00:00Z',
    last_login_at: null,
  }
}

function makeRouter() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/login', name: 'login', component: { template: '<div />' } },
      { path: '/chat', name: 'chat', component: { template: '<div />' } },
      {
        path: '/admin',
        component: { template: '<div />' },
        meta: { requiresAuth: true, requiresAdmin: true },
        children: [
          {
            path: '',
            name: 'admin-overview',
            component: { template: '<div />' },
          },
        ],
      },
      {
        path: '/admin/forbidden',
        name: 'admin-forbidden',
        component: { template: '<div />' },
        meta: { requiresAuth: true },
      },
    ],
  })
  setupGuards(router)
  return router
}

describe('管理台路由守卫', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('未登录访问 /admin 跳登录页并保留 redirect', async () => {
    const router = makeRouter()
    await router.push('/admin')
    expect(router.currentRoute.value.name).toBe('login')
    expect(router.currentRoute.value.query.redirect).toBe('/admin')
  })

  it('普通用户访问 /admin 进入无权限页', async () => {
    const auth = useAuthStore()
    auth.accessToken = 'token'
    auth.user = adminUser('user')

    const router = makeRouter()
    await router.push('/admin')
    expect(router.currentRoute.value.name).toBe('admin-forbidden')
  })

  it('管理员可以进入管理台', async () => {
    const auth = useAuthStore()
    auth.accessToken = 'token'
    auth.user = adminUser('admin')

    const router = makeRouter()
    await router.push('/admin')
    expect(router.currentRoute.value.name).toBe('admin-overview')
  })

  it('普通用户可以直接打开无权限页', async () => {
    const auth = useAuthStore()
    auth.accessToken = 'token'
    auth.user = adminUser('user')

    const router = makeRouter()
    await router.push('/admin/forbidden')
    expect(router.currentRoute.value.name).toBe('admin-forbidden')
  })
})
