import type { AuthTokens } from '@/types'

const ACCESS_TOKEN_KEY = 'agent-hub.access-token'
const REFRESH_TOKEN_KEY = 'agent-hub.refresh-token'

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // 隐私模式下 localStorage 不可写，登录态只保留在内存中。
  }
}

function remove(key: string): void {
  try {
    window.localStorage.removeItem(key)
  } catch {
    // 同上。
  }
}

export const storage = {
  getAccessToken(): string | null {
    return read(ACCESS_TOKEN_KEY)
  },
  getRefreshToken(): string | null {
    return read(REFRESH_TOKEN_KEY)
  },
  setTokens(tokens: AuthTokens): void {
    write(ACCESS_TOKEN_KEY, tokens.access_token)
    write(REFRESH_TOKEN_KEY, tokens.refresh_token)
  },
  clearTokens(): void {
    remove(ACCESS_TOKEN_KEY)
    remove(REFRESH_TOKEN_KEY)
  },
}
