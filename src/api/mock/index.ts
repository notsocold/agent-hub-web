import type { AxiosInstance } from 'axios'

import { mockAdapter } from './adapter'

export { mockDb } from './db'

export function isMockEnabled(): boolean {
  return import.meta.env.VITE_USE_MOCK === 'true'
}

export function installMockAdapter(client: AxiosInstance): void {
  client.defaults.adapter = mockAdapter
}
