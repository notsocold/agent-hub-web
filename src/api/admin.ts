import { apiClient } from './client'
import type {
  AdminAgentList,
  AdminAgentListParams,
  AdminAgentUpdateRequest,
  AdminInstruction,
  AdminMcpServerCreateRequest,
  AdminMcpServerList,
  AdminMcpServerUpdateRequest,
  AdminOverview,
  AdminSkillList,
  AdminUser,
  AdminUserListParams,
  AdminUserPage,
  AdminUserUpdateRequest,
  Skill,
} from '@/types'

/**
 * M8 管理台 API（15 个 `/admin/*` 端点）。
 *
 * 全部要求管理员：未登录 401、非管理员 403 `forbidden` +
 * `details.required_role="admin"`；错误判断一律用 `error.code`。
 * 配置面接口在能力总开关关闭时仍可读写（R1），页面不要按
 * `/system/info` 的能力开关隐藏管理入口。
 */
export const adminApi = {
  users(params: AdminUserListParams = {}): Promise<AdminUserPage> {
    return apiClient.get<AdminUserPage>('/admin/users', { params }).then(({ data }) => data)
  },

  user(id: string): Promise<AdminUser> {
    return apiClient
      .get<AdminUser>(`/admin/users/${encodeURIComponent(id)}`)
      .then(({ data }) => data)
  },

  updateUser(id: string, body: AdminUserUpdateRequest): Promise<AdminUser> {
    return apiClient
      .patch<AdminUser>(`/admin/users/${encodeURIComponent(id)}`, body)
      .then(({ data }) => data)
  },

  overview(): Promise<AdminOverview> {
    return apiClient.get<AdminOverview>('/admin/overview').then(({ data }) => data)
  },

  instruction(): Promise<AdminInstruction> {
    return apiClient
      .get<AdminInstruction>('/admin/settings/instruction')
      .then(({ data }) => data)
  },

  saveInstruction(content: string | null): Promise<AdminInstruction> {
    return apiClient
      .put<AdminInstruction>('/admin/settings/instruction', { content })
      .then(({ data }) => data)
  },

  skills(q?: string): Promise<AdminSkillList> {
    return apiClient
      .get<AdminSkillList>('/admin/skills', { params: q ? { q } : undefined })
      .then(({ data }) => data)
  },

  setSkillEnabled(id: string, enabled: boolean): Promise<Skill> {
    return apiClient
      .put<Skill>(`/admin/skills/${encodeURIComponent(id)}/enabled`, { enabled })
      .then(({ data }) => data)
  },

  setSkillForceDisabled(id: string, forceDisabled: boolean): Promise<Skill> {
    return apiClient
      .put<Skill>(`/admin/skills/${encodeURIComponent(id)}/force-disable`, {
        force_disabled: forceDisabled,
      })
      .then(({ data }) => data)
  },

  mcpServers(): Promise<AdminMcpServerList> {
    return apiClient.get<AdminMcpServerList>('/admin/mcp/servers').then(({ data }) => data)
  },

  createMcpServer(body: AdminMcpServerCreateRequest): Promise<unknown> {
    return apiClient.post('/admin/mcp/servers', body).then(({ data }) => data)
  },

  updateMcpServer(id: string, body: AdminMcpServerUpdateRequest): Promise<unknown> {
    return apiClient
      .patch(`/admin/mcp/servers/${encodeURIComponent(id)}`, body)
      .then(({ data }) => data)
  },

  deleteMcpServer(id: string): Promise<void> {
    return apiClient.delete(`/admin/mcp/servers/${encodeURIComponent(id)}`).then(() => undefined)
  },

  agents(params: AdminAgentListParams = {}): Promise<AdminAgentList> {
    return apiClient.get<AdminAgentList>('/admin/agents', { params }).then(({ data }) => data)
  },

  updateAgent(id: string, body: AdminAgentUpdateRequest): Promise<unknown> {
    return apiClient
      .patch(`/admin/agents/${encodeURIComponent(id)}`, body)
      .then(({ data }) => data)
  },
}
