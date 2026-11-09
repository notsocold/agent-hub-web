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
