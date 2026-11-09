import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import { authApi } from '@/api/auth'
import type { AuthTokens, RegisterRequest, User } from '@/types'
import { storage } from '@/utils/storage'

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const accessToken = ref<string | null>(storage.getAccessToken())
  const initialized = ref(false)

  const isAuthenticated = computed(() => Boolean(accessToken.value))

  function setSession(tokens: AuthTokens): void {
    storage.setTokens(tokens)
    accessToken.value = tokens.access_token
  }

  function setUser(next: User | null): void {
    user.value = next
  }

  function clearSession(): void {
    storage.clearTokens()
    accessToken.value = null
    user.value = null
  }

  async function login(email: string, password: string): Promise<User> {
    const tokens = await authApi.login({ email, password })
    setSession(tokens)
    const profile = await authApi.me()
    setUser(profile)
    initialized.value = true
    return profile
  }

  async function register(body: RegisterRequest): Promise<User> {
    const tokens = await authApi.register(body)
    setSession(tokens)
    const profile = await authApi.me()
    setUser(profile)
    initialized.value = true
    return profile
  }

  async function restore(): Promise<void> {
    if (initialized.value) return
    if (!storage.getAccessToken()) {
      initialized.value = true
      return
    }
    try {
      accessToken.value = storage.getAccessToken()
      user.value = await authApi.me()
    } catch {
      clearSession()
    } finally {
      initialized.value = true
    }
  }

  async function logout(): Promise<void> {
    try {
      await authApi.logout()
    } catch {
      // 后端不可达时也必须完成本地登出。
    } finally {
      clearSession()
      initialized.value = true
    }
  }

  return {
    user,
    accessToken,
    initialized,
    isAuthenticated,
    login,
    register,
    restore,
    logout,
    setUser,
    clearSession,
  }
})
