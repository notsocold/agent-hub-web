import type { AuthTokens } from '@/types'

const ACCESS_TOKEN_KEY = 'agent-hub.access-token'
const REFRESH_TOKEN_KEY = 'agent-hub.refresh-token'

/**
 * 内存兜底：真实联调测试跑在 node 环境（没有 `window.localStorage`），
 * 隐私模式下 localStorage 也可能不可写；此时登录态只保留在进程内存里。
 */
const memory = new Map<string, string>()

function read(key: string): string | null {
  try {
    if (typeof window !== 'undefined') return window.localStorage.getItem(key)
  } catch {
    // 隐私模式 / 无 window：回退到内存。
  }
  return memory.get(key) ?? null
}

function write(key: string, value: string): void {
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(key, value)
      return
    }
  } catch {
    // 同上。
  }
  memory.set(key, value)
}

function remove(key: string): void {
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(key)
      return
    }
  } catch {
    // 同上。
  }
  memory.delete(key)
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
