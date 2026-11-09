import { apiClient } from './client'
import type { SystemInfo } from '@/types'

export const systemApi = {
  async info(): Promise<SystemInfo> {
    const { data } = await apiClient.get<SystemInfo>('/system/info')
    return data
  },
}
