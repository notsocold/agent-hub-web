import { apiClient } from './client'
import type {
  KnowledgeDocument,
  KnowledgeDocumentPage,
  KnowledgeDocumentStatus,
  KnowledgeRebuildRequest,
  KnowledgeRebuildResult,
  KnowledgeSearchRequest,
  KnowledgeSearchResult,
  KnowledgeUploadInput,
  KnowledgeUploadResult,
} from '@/types'

export interface KnowledgeListParams {
  q?: string
  category?: string
  status?: KnowledgeDocumentStatus
  /** `all` 仅管理员可用；普通用户传 `all` 会得到 403 forbidden。 */
  owner_scope?: 'visible' | 'all'
  limit?: number
  cursor?: string
}

export const knowledgeApi = {
  async documents(params: KnowledgeListParams = {}): Promise<KnowledgeDocumentPage> {
    const { data } = await apiClient.get<KnowledgeDocumentPage>('/knowledge/documents', {
      params,
    })
    return data
  },

  async get(id: string): Promise<KnowledgeDocument> {
    const { data } = await apiClient.get<KnowledgeDocument>(`/knowledge/documents/${id}`)
    return data
  },

  /**
   * multipart 上传并同步入库。
   *
   * 后端新建返回 201、同归属同内容幂等命中返回 200（不污染文档对象），
   * 因此这里用 HTTP 状态而不是响应体区分「新建」与「已存在」。
   */
  async upload(input: KnowledgeUploadInput): Promise<KnowledgeUploadResult> {
    const form = new FormData()
    form.append('file', input.file, input.file.name)
    if (input.title?.trim()) form.append('title', input.title.trim())
    if (input.category?.trim()) form.append('category', input.category.trim())
    if (input.scope) form.append('scope', input.scope)

    const response = await apiClient.post<KnowledgeDocument>('/knowledge/documents', form, {
      timeout: 120_000,
      onUploadProgress: (event) => {
        if (!input.onProgress || !event.total) return
        input.onProgress(Math.round((event.loaded / event.total) * 100))
      },
    })
    return { document: response.data, created: response.status === 201 }
  },

  async search(body: KnowledgeSearchRequest): Promise<KnowledgeSearchResult> {
    const { data } = await apiClient.post<KnowledgeSearchResult>('/knowledge/search', body)
    return data
  },

  async remove(id: string): Promise<void> {
    await apiClient.delete(`/knowledge/documents/${id}`)
  },

  /** 从原始文件重新解析入库；对 ready 文档等同「重建此文档」，对 failed 文档即重试。 */
  async retry(id: string): Promise<KnowledgeDocument> {
    const { data } = await apiClient.post<KnowledgeDocument>(`/knowledge/documents/${id}/retry`)
    return data
  },

  /** 仅管理员；`scope=own` 指所有用户的私有文档。 */
  async rebuild(body: KnowledgeRebuildRequest): Promise<KnowledgeRebuildResult> {
    const { data } = await apiClient.post<KnowledgeRebuildResult>('/knowledge/rebuild', body)
    return data
  },
}
