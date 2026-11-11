import { ref, type Ref } from 'vue'

export type Density = 'compact' | 'cozy' | 'comfortable'

const STORAGE_KEY = 'agent-hub.preferences'
const DEFAULT_DENSITY: Density = 'cozy'

const density = ref<Density>(DEFAULT_DENSITY)

function isDensity(value: unknown): value is Density {
  return value === 'compact' || value === 'cozy' || value === 'comfortable'
}

function readInitial(): Density {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_DENSITY

    const parsed: unknown = JSON.parse(raw)
    if (parsed !== null && typeof parsed === 'object' && 'density' in parsed) {
      const value = (parsed as { density?: unknown }).density
      if (isDensity(value)) return value
    }
  } catch {
    // localStorage 不可用或 JSON 损坏时回退默认密度。
  }
  return DEFAULT_DENSITY
}

function applyDensity(next: Density): void {
  density.value = next
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.density = next
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ density: next }))
  } catch {
    // 忽略隐私模式等场景下的 localStorage 写入失败。
  }
}

export function usePreferences(): {
  density: Ref<Density>
  setDensity: (next: Density) => void
} {
  return { density, setDensity: applyDensity }
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  applyDensity(readInitial())
}
