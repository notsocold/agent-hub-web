export type ConversationStatus = 'active' | 'archived'
export type MessageRole = 'user' | 'assistant' | 'tool' | 'system'
export type MessageStatus = 'completed' | 'failed' | 'canceled'
export type ContentType = 'markdown' | 'text'

export interface Conversation {
  id: string
  title: string
  status: ConversationStatus
  message_count: number
  last_message_preview: string
  last_message_at: string | null
  pending_approval_count: number
  created_at: string
  updated_at: string
}

export interface ConversationDetail extends Conversation {
  archived_at: string | null
  last_run: {
    id: string
    status: string
    model: string | null
    finished_at: string | null
  } | null
}

export interface Citation {
  index: number
  document_id: string
  chunk_id: string
  title: string
  category: string
  score: number
  updated_at: string
}

export interface MessageAttachment {
  id: string
  filename: string
  mime_type: string
  size_bytes: number
}

export interface ArtifactMetadata {
  sections?: string[]
  source_count?: number
  [key: string]: unknown
}

export interface MessageArtifact {
  id: string
  name: string
  mime_type: string
  size_bytes: number
  kind: string
  content?: string | null
  download_url?: string | null
  metadata?: ArtifactMetadata
}

export interface MessageCapabilities {
  skills: string[]
  mcp_servers: string[]
  mcp_tools: string[]
  knowledge_categories: string[]
  workflow_id?: string | null
}

export interface Usage {
  input_tokens: number
  output_tokens: number
  reasoning_tokens?: number | null
  total_tokens?: number | null
}

export interface MessageError {
  code: string
  message: string
  retryable?: boolean
}

/** 服务端消息；前端视图模型见 ChatMessageView。 */
export interface ChatMessage {
  id: string
  role: MessageRole
  content: string
  content_type: ContentType
  run_id: string | null
  client_message_id: string | null
  status: MessageStatus
  citations: Citation[]
  attachments: MessageAttachment[]
  capabilities: MessageCapabilities
  artifacts: MessageArtifact[]
  usage: Usage | null
  error: MessageError | null
  created_at: string
  metadata?: Record<string, unknown>
}
