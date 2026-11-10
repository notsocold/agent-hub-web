import { apiClient } from './client'
import type { AuditLog, AuditLogQuery, PageResult } from '@/types'

/**
 * M5 审计日志。
 *
 * - `own`：`GET /audit-logs`，后端固定 `actor_type=user` + 当前用户；
 * - `all`：`GET /admin/audit-logs`，仅管理员，额外支持 actor/resource_id 筛选。
 */
export const auditApi = {
  async own(params: AuditLogQuery = {}): Promise<PageResult<AuditLog>> {
    const { data } = await apiClient.get<PageResult<AuditLog>>('/audit-logs', { params })
    return data
  },

  async all(params: AuditLogQuery = {}): Promise<PageResult<AuditLog>> {
    const { data } = await apiClient.get<PageResult<AuditLog>>('/admin/audit-logs', { params })
    return data
  },
}
