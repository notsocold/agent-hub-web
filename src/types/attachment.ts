/**
 * 对话附件契约（M1.5）。
 *
 * 附件是「对话输入的一部分」，与知识库文档是两套资源：上传成功后把
 * `attachment.id` 放进 `chat/stream` 的 `attachments`，不重复上传。
 */
export type AttachmentStatus = 'processing' | 'ready' | 'failed' | 'deleted'

export interface Attachment {
  id: string
  filename: string
  mime_type: string
  size_bytes: number
  /** `sha256:<hex>`；mock 也遵循该格式。 */
  checksum: string
  status: AttachmentStatus
  /** 默认 `chat`；保留扩展位，前端不据此推断知识库。 */
  purpose?: string
  conversation_id?: string | null
  /** 同用户 + 同 checksum 命中已有附件时为 true（上传响应可选）。 */
  duplicate?: boolean
  created_at: string
  expires_at: string | null
}

/** `text/*` 等可直接预览的类型；下载仍走受控端点。 */
export function isTextAttachment(attachment: Pick<Attachment, 'mime_type'>): boolean {
  return (
    attachment.mime_type.startsWith('text/') ||
    attachment.mime_type === 'application/json' ||
    attachment.mime_type === 'application/xml'
  )
}
