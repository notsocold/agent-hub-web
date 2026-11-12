import type { Agent } from './agent'
import type { McpServer, Skill } from './capability'

// ---------------------------------------------------------------- 用户

export type AdminUserRole = 'user' | 'admin'
export type AdminUserStatus = 'active' | 'disabled'

/** M8 管理端用户视图；后端永不返回 `password_hash`。 */
export interface AdminUser {
  id: string
  email: string
  display_name: string
  role: AdminUserRole
  status: AdminUserStatus
  last_login_at: string | null
  created_at: string
  updated_at: string
}

/** 当前筛选条件下的全量计数（不含游标）；`admins` 含停用管理员。 */
export interface AdminUserStats {
  total: number
  active: number
  disabled: number
  admins: number
}

export interface AdminUserPage {
  items: AdminUser[]
  next_cursor: string | null
  has_more: boolean
  stats: AdminUserStats
}

/** `PATCH /admin/users/{id}`：只接受 role/status，至少一项。 */
export interface AdminUserUpdateRequest {
  role?: AdminUserRole
  status?: AdminUserStatus
}

export interface AdminUserListParams {
  q?: string
  role?: AdminUserRole
  status?: AdminUserStatus
  limit?: number
  cursor?: string
}

// ---------------------------------------------------------------- 概览

export interface AdminOverviewUserCounts {
  total: number
  active: number
  disabled: number
  admins: number
}

export interface AdminOverviewConversationCounts {
  total: number
  active: number
  archived: number
  /** 软删会话单列，仍计入 total。 */
  deleted: number
}

export interface AdminOverviewRunCounts {
  total: number
  queued: number
  running: number
  succeeded: number
  failed: number
  /** 后端单 L 拼写。 */
  canceled: number
  interrupted: number
}

export interface AdminOverviewA2aCounts {
  total: number
  submitted: number
  working: number
  input_required: number
  auth_required: number
  completed: number
  failed: number
  canceled: number
  rejected: number
}

export interface AdminOverviewKnowledgeCounts {
  documents: number
  chunks: number
  documents_pending: number
  documents_indexing: number
  documents_ready: number
  documents_failed: number
}

export interface AdminOverviewAttachmentCounts {
  /** 排除 deleted 行。 */
  total: number
  storage_bytes: number
  deleted: number
}

export interface AdminOverview {
  generated_at: string
  users: AdminOverviewUserCounts
  conversations: AdminOverviewConversationCounts
  messages: { total: number }
  runs: AdminOverviewRunCounts
  a2a_tasks: AdminOverviewA2aCounts
  knowledge: AdminOverviewKnowledgeCounts
  attachments: AdminOverviewAttachmentCounts
}

// ---------------------------------------------------------------- 平台指令

export interface AdminInstruction {
  content: string
  is_default: boolean
  max_chars: number
  user_override_count: number
  updated_by: string | null
  updated_by_email: string | null
  updated_at: string | null
}

export interface AdminInstructionUpdateRequest {
  /** `null` 或纯空白等价于恢复内置默认。 */
  content: string | null
}

// ---------------------------------------------------------------- 系统技能

export interface AdminSkillStats {
  total: number
  enabled: number
  force_disabled: number
}

export interface AdminSkillList {
  items: Skill[]
  stats: AdminSkillStats
}

// ---------------------------------------------------------------- 系统 MCP

export interface AdminMcpServerStats {
  total: number
  system: number
  user: number
  enabled: number
  healthy: number
}

export interface AdminMcpServerList {
  items: McpServer[]
  stats: AdminMcpServerStats
}

/** PATCH 白名单：slug/transport/command/args 只读。 */
export interface AdminMcpServerUpdateRequest {
  name?: string
  description?: string
  url?: string
  headers?: Record<string, string>
  auto_inject?: boolean
  enabled?: boolean
  force_disabled?: boolean
}

/** 系统 MCP 新建（复用用户侧字段，创建后 scope=system）。 */
export interface AdminMcpServerCreateRequest {
  name: string
  slug: string
  description?: string
  transport?: 'streamable_http' | 'sse' | 'stdio'
  url?: string
  headers?: Record<string, string>
  command?: string
  args?: string[]
}

// ---------------------------------------------------------------- 全局 Agent

/** 管理端可写的 auth：支持 `secret:` 平台密钥引用。 */
export interface AdminAgentAuthInput {
  type: 'none' | 'api_key' | 'oauth2'
  secret_ref?: string
}

/** PATCH 白名单：slug/url/description/card 等只读。 */
export interface AdminAgentUpdateRequest {
  name?: string
  enabled?: boolean
  requires_approval?: boolean
  auth?: AdminAgentAuthInput
  headers?: Record<string, string>
}

export interface AdminAgentListParams {
  health_status?: string
  enabled?: string
  q?: string
  limit?: number
  cursor?: string
}

export interface AdminAgentList {
  items: Agent[]
  next_cursor: string | null
  has_more: boolean
  stats: Record<string, number>
}
