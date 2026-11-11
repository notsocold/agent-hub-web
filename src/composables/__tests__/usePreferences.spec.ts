import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Density } from '@/composables/usePreferences'

const STORAGE_KEY = 'agent-hub.preferences'

type PreferencesModule = typeof import('@/composables/usePreferences')

async function loadPreferences(): Promise<PreferencesModule> {
  vi.resetModules()
  return import('@/composables/usePreferences')
}

function readStoredDensity(): Density | null {
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (raw === null) return null
  return (JSON.parse(raw) as { density: Density }).density
}

describe('usePreferences', () => {
  beforeEach(() => {
    window.localStorage.clear()
    document.documentElement.removeAttribute('data-density')
    vi.resetModules()
  })

  it('localStorage 为空时默认 cozy，并在模块初始化时同步到 html', async () => {
    const { usePreferences } = await loadPreferences()
    const { density } = usePreferences()

    expect(density.value).toBe('cozy')
    expect(document.documentElement.dataset.density).toBe('cozy')
  })

  it("setDensity('compact') 写入 localStorage 并同步 html data-density", async () => {
    const { usePreferences } = await loadPreferences()
    const { density, setDensity } = usePreferences()

    setDensity('compact')

    expect(density.value).toBe('compact')
    expect(readStoredDensity()).toBe('compact')
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe(JSON.stringify({ density: 'compact' }))
    expect(document.documentElement.dataset.density).toBe('compact')
  })

  it('JSON 损坏时回退 cozy 且不抛错', async () => {
    window.localStorage.setItem(STORAGE_KEY, '{oops')
    const { usePreferences } = await loadPreferences()

    expect(() => usePreferences()).not.toThrow()
    expect(usePreferences().density.value).toBe('cozy')
    expect(document.documentElement.dataset.density).toBe('cozy')
  })

  it('未知密度值回退 cozy', async () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ density: 'huge' }))
    const { usePreferences } = await loadPreferences()

    expect(usePreferences().density.value).toBe('cozy')
    expect(document.documentElement.dataset.density).toBe('cozy')
  })

  it('已保存的合法密度在模块初始化时恢复', async () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ density: 'comfortable' }))
    const { usePreferences } = await loadPreferences()

    expect(usePreferences().density.value).toBe('comfortable')
    expect(document.documentElement.dataset.density).toBe('comfortable')
  })
})
