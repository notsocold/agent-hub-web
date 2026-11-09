import { apiClient } from './client'
import type { Attachment, PageResult, CursorParams } from '@/types'

export interface AttachmentListParams extends CursorParams {
  conversation_id?: string
}

export interface UploadAttachmentOptions {
  conversation_id?: string
  purpose?: string
  /** 上传进度，0–100；mock 模式不回调。 */
  onProgress?: (percent: number) => void
}

export const attachmentsApi = {
  async upload(file: File, options: UploadAttachmentOptions = {}): Promise<Attachment> {
    const form = new FormData()
    form.append('file', file, file.name)
    if (options.conversation_id) form.append('conversation_id', options.conversation_id)
    if (options.purpose) form.append('purpose', options.purpose)

    const { data } = await apiClient.post<Attachment>('/attachments', form, {
      timeout: 120_000,
      onUploadProgress: (event) => {
        if (!options.onProgress || !event.total) return
        options.onProgress(Math.round((event.loaded / event.total) * 100))
      },
    })
    return data
  },

  async list(params: AttachmentListParams = {}): Promise<PageResult<Attachment>> {
    const { data } = await apiClient.get<PageResult<Attachment>>('/attachments', { params })
    return data
  },

  async get(id: string): Promise<Attachment> {
    const { data } = await apiClient.get<Attachment>(`/attachments/${id}`)
    return data
  },

  async remove(id: string): Promise<void> {
    await apiClient.delete(`/attachments/${id}`)
  },

  /** 受控下载：必须带 Bearer，直接拼 URL 会在新标签页丢鉴权。 */
  async download(id: string): Promise<Blob> {
    const { data } = await apiClient.get<Blob>(`/attachments/${id}/download`, {
      responseType: 'blob',
      timeout: 120_000,
    })
    return data
  },
}
