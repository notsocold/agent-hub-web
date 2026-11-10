export type KnowledgeDocumentStatus = 'pending' | 'indexing' | 'ready' | 'failed'

export interface KnowledgeOwner {
  id: string
  display_name: string
}

export interface KnowledgeDocument {
  id: string
  title: string
  category: string
  status: KnowledgeDocumentStatus
  chunk_count: number
  size_bytes: number
  source_uri: string
  owner: KnowledgeOwner | null
  error: string | null
  created_at: string
  updated_at: string
}

export interface KnowledgeSearchHit {
  chunk_id: string
  document_id: string
  title: string
  document_title: string
  document_filename: string
  category: string
  chunk_index: number
  content: string
  score: number
  updated_at: string
}

export interface KnowledgeSearchResult {
  hits: KnowledgeSearchHit[]
  elapsed_ms: number
}

export interface KnowledgeSearchRequest {
  query: string
  top_k?: number
  filters?: {
    category?: string
  }
}

/** 列表统计：可见范围内全量，不随 q/category/status 变化（后端 6 键）。 */
export interface KnowledgeStats {
  documents: number
  chunks: number
  ready: number
  indexing: number
  pending: number
  failed: number
}

/** 文档列表：游标分页 + 6 键统计。 */
export interface KnowledgeDocumentPage {
  items: KnowledgeDocument[]
  next_cursor: string | null
  has_more: boolean
  stats: KnowledgeStats
}

export type KnowledgeDocumentScope = 'user' | 'system'

export interface KnowledgeUploadInput {
  file: File
  title?: string
  category?: string
  /** `system` 仅管理员可用；缺省 `user`。 */
  scope?: KnowledgeDocumentScope
  /** 上传进度，0–100；mock 模式不回调。 */
  onProgress?: (percent: number) => void
}

export interface KnowledgeUploadResult {
  document: KnowledgeDocument
  /** false = 同内容幂等命中（HTTP 200）；true = 新建（HTTP 201）。 */
  created: boolean
}

export interface KnowledgeRebuildRequest {
  /** `own` = 所有用户的私有文档，不是管理员本人的文档。 */
  scope: 'all' | 'system' | 'own'
}

export interface KnowledgeRebuildResult {
  /** 本次处理的文档总数（含失败）。 */
  documents: number
  /** 重建成功后成功写入的分块总数。 */
  chunks: number
  /** `documents` 中失败的条数。 */
  failed: number
  elapsed_ms: number
}
