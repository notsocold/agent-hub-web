import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { authApi } from '@/api/auth'
import { useAuthStore } from '@/stores/auth'
import type { AuthTokens, User } from '@/types'
import { storage } from '@/utils/storage'

vi.mock('@/api/auth', () => ({
  authApi: {
    login: vi.fn(),
    register: vi.fn(),
    refresh: vi.fn(),
    logout: vi.fn(),
    me: vi.fn(),
    updateMe: vi.fn(),
    changePassword: vi.fn(),
  },
}))

const tokens: AuthTokens = {
  access_token: 'access-1',
  refresh_token: 'refresh-1',
  token_type: 'bearer',
  expires_in: 3600,
}

const user: User = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'you@example.com',
  display_name: '周丹',
  status: 'active',
  role: 'user',
  created_at: '2026-10-01T08:00:00Z',
  last_login_at: '2026-11-09T08:00:00Z',
}

describe('auth store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    storage.clearTokens()
    vi.clearAllMocks()
  })

  it('登录后写入 token 与用户信息', async () => {
    vi.mocked(authApi.login).mockResolvedValue(tokens)
    vi.mocked(authApi.me).mockResolvedValue(user)

    const auth = useAuthStore()
    const profile = await auth.login('you@example.com', 'password123')

    expect(profile.email).toBe('you@example.com')
    expect(auth.isAuthenticated).toBe(true)
    expect(auth.user?.display_name).toBe('周丹')
    expect(storage.getAccessToken()).toBe('access-1')
    expect(storage.getRefreshToken()).toBe('refresh-1')
  })

  it('restore 失败时清空本地会话', async () => {
    storage.setTokens(tokens)
    vi.mocked(authApi.me).mockRejectedValue(new Error('401'))

    const auth = useAuthStore()
    await auth.restore()

    expect(auth.isAuthenticated).toBe(false)
    expect(auth.user).toBeNull()
    expect(storage.getAccessToken()).toBeNull()
    expect(storage.getRefreshToken()).toBeNull()
  })

  it('restore 成功时恢复用户信息', async () => {
    storage.setTokens(tokens)
    vi.mocked(authApi.me).mockResolvedValue(user)

    const auth = useAuthStore()
    await auth.restore()

    expect(auth.isAuthenticated).toBe(true)
    expect(auth.user?.email).toBe('you@example.com')
  })

  it('登出清空本地状态，即使后端不可达', async () => {
    vi.mocked(authApi.login).mockResolvedValue(tokens)
    vi.mocked(authApi.me).mockResolvedValue(user)
    vi.mocked(authApi.logout).mockRejectedValue(new Error('network'))

    const auth = useAuthStore()
    await auth.login('you@example.com', 'password123')
    await auth.logout()

    expect(auth.isAuthenticated).toBe(false)
    expect(auth.user).toBeNull()
    expect(storage.getAccessToken()).toBeNull()
  })
})
