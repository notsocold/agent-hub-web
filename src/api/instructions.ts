import { apiClient } from './client'
import type { InstructionState } from '@/types'

export const instructionsApi = {
  async get(): Promise<InstructionState> {
    const { data } = await apiClient.get<InstructionState>('/instructions')
    return data
  },

  /** `value=null` 表示恢复平台默认。 */
  async save(value: string | null): Promise<InstructionState> {
    const { data } = await apiClient.put<InstructionState>('/instructions', { content: value })
    return data
  },
}
