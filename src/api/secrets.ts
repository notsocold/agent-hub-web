import { apiClient } from './client'
import type {
  PlatformSecret,
  PlatformSecretCreateRequest,
  PlatformSecretUpdateRequest,
} from '@/types'

/**
 * M5 平台密钥（仅管理员）。
 *
 * 后端永不回显明文/密文；未配置 `CAPABILITY_SECRET_KEY` 时写入返回
 * 503 `secret_store_unavailable`，前端需单独提示。
 */
export const secretsApi = {
  async list(enabled?: boolean): Promise<PlatformSecret[]> {
    const { data } = await apiClient.get<{ items: PlatformSecret[] }>('/admin/secrets', {
      params: enabled === undefined ? undefined : { enabled },
    })
    return data.items
  },

  async create(body: PlatformSecretCreateRequest): Promise<PlatformSecret> {
    const { data } = await apiClient.post<PlatformSecret>('/admin/secrets', body)
    return data
  },

  async update(name: string, body: PlatformSecretUpdateRequest): Promise<PlatformSecret> {
    const { data } = await apiClient.patch<PlatformSecret>(
      `/admin/secrets/${encodeURIComponent(name)}`,
      body,
    )
    return data
  },

  async remove(name: string): Promise<void> {
    await apiClient.delete(`/admin/secrets/${encodeURIComponent(name)}`)
  },
}
