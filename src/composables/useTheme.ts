import { ref } from 'vue'

export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'agent-hub.theme'
const theme = ref<Theme>('light')

function readInitial(): Theme {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored === 'light' || stored === 'dark') return stored
  } catch {
    // localStorage 不可用时退回系统偏好。
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function applyTheme(next: Theme): void {
  theme.value = next
  document.documentElement.dataset.theme = next
  document.documentElement.classList.toggle('dark', next === 'dark')
  try {
    window.localStorage.setItem(STORAGE_KEY, next)
  } catch {
    // 忽略隐私模式写入失败。
  }
}

export function useTheme() {
  function toggle(): void {
    applyTheme(theme.value === 'dark' ? 'light' : 'dark')
  }

  return { theme, toggle, setTheme: applyTheme }
}

if (typeof document !== 'undefined') {
  applyTheme(readInitial())
}
