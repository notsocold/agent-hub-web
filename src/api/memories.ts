import { apiClient } from './client'
import type {
  CursorParams,
  Memory,
  MemoryCreateRequest,
  MemoryExport,
  MemoryKind,
  MemoryStatus,
  MemoryUpdateRequest,
  PageResult,
} from '@/types'

export interface MemoryListParams extends CursorParams {
  kind?: MemoryKind
  status?: MemoryStatus | 'all'
  q?: string
}

export const memoriesApi = {
  async list(params: MemoryListParams = {}): Promise<PageResult<Memory>> {
    const { data } = await apiClient.get<PageResult<Memory>>('/memories', { params })
    return data
  },

  async create(body: MemoryCreateRequest): Promise<Memory> {
    const { data } = await apiClient.post<Memory>('/memories', body)
    return data
  },

  async get(id: string): Promise<Memory> {
    const { data } = await apiClient.get<Memory>(`/memories/${id}`)
    return data
  },

  async update(id: string, body: MemoryUpdateRequest): Promise<Memory> {
    const { data } = await apiClient.patch<Memory>(`/memories/${id}`, body)
    return data
  },

  async remove(id: string): Promise<void> {
    await apiClient.delete(`/memories/${id}`)
  },

  async clear(): Promise<void> {
    await apiClient.delete('/memories', { params: { confirm: true } })
  },

  async exportAll(): Promise<MemoryExport> {
    // 后端返回 {version, exported_at, items}；统一成前端使用的 memories 字段。
    const { data } = await apiClient.get<
      MemoryExport | { exported_at: string; items: Memory[]; version?: number }
    >('/memories/export')
    if ('memories' in data) return data
    return { exported_at: data.exported_at, memories: data.items, version: data.version }
  },
}
