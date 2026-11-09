import { apiClient } from './client'
import type {
  KnowledgeDocument,
  KnowledgeSearchRequest,
  KnowledgeSearchResult,
  PageResult,
} from '@/types'

export interface KnowledgeListParams {
  q?: string
  category?: string
  status?: string
  limit?: number
  cursor?: string
}

export const knowledgeApi = {
  async documents(params: KnowledgeListParams = {}): Promise<PageResult<KnowledgeDocument>> {
    const { data } = await apiClient.get<PageResult<KnowledgeDocument>>(
      '/knowledge/documents',
      { params },
    )
    return data
  },

  async search(body: KnowledgeSearchRequest): Promise<KnowledgeSearchResult> {
    const { data } = await apiClient.post<KnowledgeSearchResult>('/knowledge/search', body)
    return data
  },
}
