import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, describe, expect, it } from 'vitest'

import { routes } from '@/router'
import { setupGuards } from '@/router/guards'
import type { AuthTokens } from '@/types'
import { storage } from '@/utils/storage'

const tokens: AuthTokens = {
  access_token: 'access-token',
  refresh_token: 'refresh-token',
  token_type: 'bearer',
  expires_in: 3600,
}

function createTestRouter() {
  const router = createRouter({ history: createMemoryHistory(), routes })
  setupGuards(router)
  return router
}

describe('路由守卫', () => {
  beforeEach(() => {
    storage.clearTokens()
    setActivePinia(createPinia())
  })

  it('未登录访问业务页跳到登录并带 redirect', async () => {
    const router = createTestRouter()
    await router.push('/chat')

    expect(router.currentRoute.value.name).toBe('login')
    expect(router.currentRoute.value.query.redirect).toBe('/chat')
  })

  it('已登录访问登录页跳到对话', async () => {
    storage.setTokens(tokens)
    setActivePinia(createPinia())
    const router = createTestRouter()

    await router.push('/login')

    expect(router.currentRoute.value.name).toBe('chat')
  })

  it('根路径重定向到对话', async () => {
    storage.setTokens(tokens)
    setActivePinia(createPinia())
    const router = createTestRouter()

    await router.push('/')

    expect(router.currentRoute.value.name).toBe('chat')
  })
})
