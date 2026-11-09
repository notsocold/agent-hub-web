import { apiClient } from './client'
import type { ChatMessage, Conversation, ConversationDetail, PageResult } from '@/types'

export interface ConversationListParams {
  q?: string
  status?: 'active' | 'archived' | 'all'
  limit?: number
  cursor?: string
}

export interface MessageListParams {
  limit?: number
  cursor?: string
  before?: string
}

export const conversationsApi = {
  async list(params: ConversationListParams = {}): Promise<PageResult<Conversation>> {
    const { data } = await apiClient.get<PageResult<Conversation>>('/conversations', { params })
    return data
  },

  async create(title = '新会话'): Promise<Conversation> {
    const { data } = await apiClient.post<Conversation>('/conversations', { title })
    return data
  },

  async get(id: string): Promise<ConversationDetail> {
    const { data } = await apiClient.get<ConversationDetail>(`/conversations/${id}`)
    return data
  },

  async update(
    id: string,
    body: { title?: string; status?: 'active' | 'archived' },
  ): Promise<Conversation> {
    const { data } = await apiClient.patch<Conversation>(`/conversations/${id}`, body)
    return data
  },

  async remove(id: string): Promise<void> {
    await apiClient.delete(`/conversations/${id}`)
  },

  async messages(id: string, params: MessageListParams = {}): Promise<PageResult<ChatMessage>> {
    const { data } = await apiClient.get<PageResult<ChatMessage>>(`/conversations/${id}/messages`, {
      params,
    })
    return data
  },
}
