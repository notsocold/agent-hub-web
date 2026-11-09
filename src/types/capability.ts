/**
 * 个人能力层契约（M1.5）：指令 / 长期记忆 / 技能 / MCP。
 *
 * 字段来源：后端 `docs/api.md` 第 2.8–2.11 节与交接包
 * `docs/handoff/contract-delta.md` 第 10 节。后端尚未返回的字段一律声明为
 * 可选，页面按「有则展示、无则降级」处理，不编造展示值。
 */

// ---------------------------------------------------------------- 指令

export type InstructionSource = 'user' | 'system_default'

export interface InstructionState {
  effective: string
  source: InstructionSource
  user_value: string | null
  default_value: string
  max_chars: number
  updated_at: string | null
}

// ---------------------------------------------------------------- 长期记忆

export type MemoryKind = 'profile' | 'preference' | 'fact'
export type MemoryStatus = 'active' | 'archived'
export type MemorySourceKind = 'conversation' | 'workflow_run' | 'approval' | 'manual'

export interface MemorySource {
  kind?: MemorySourceKind
  label?: string
  conversation_title?: string
  workflow_id?: string
  approval_id?: string
  message_excerpt?: string
}

export interface Memory {
  id: string
  kind: MemoryKind
  title: string
  content: string
  source: MemorySource
  pinned: boolean
  status: MemoryStatus
  created_at: string
  updated_at: string
}

export interface MemoryCreateRequest {
  kind: MemoryKind
  title: string
  content: string
  pinned?: boolean
}

export interface MemoryUpdateRequest {
  kind?: MemoryKind
  title?: string
  content?: string
  pinned?: boolean
  status?: MemoryStatus
}

export interface MemoryStats {
  total: number
  profile: number
  preference: number
  fact: number
  active: number
  archived: number
}

export interface MemoryExport {
  exported_at: string
  memories: Memory[]
  version?: number
}

// ---------------------------------------------------------------- 技能

export type SkillScope = 'system' | 'user'

export interface SkillFile {
  path: string
  size_bytes: number
  updated_at?: string | null
}

export interface Skill {
  id: string
  slug: string
  name: string
  description: string
  /** 正文（SKILL.md）；列表接口可省略，详情接口返回。 */
  content?: string
  scope: SkillScope
  /** 系统技能不可编辑/删除；后端旧版本不返回时由 scope 推导。 */
  editable?: boolean
  enabled: boolean
  /** 系统项被用户覆盖后的实际状态；缺省时用 enabled。 */
  effective_enabled?: boolean
  /** 管理员强制停用；true 时用户无法再启用。 */
  force_disabled?: boolean
  /** 技能来源（builtin/upload/...），只做展示。 */
  source?: string
  estimated_tokens: number
  file_count: number
  size_bytes: number
  version?: string
  created_at?: string
  updated_at?: string
}

/** 技能列表后端不返回 cursor：`{items, stats}`。 */
export interface SkillListResult {
  items: Skill[]
  stats: SkillStats
}

export interface SkillCatalogItem {
  id: string
  slug: string
  name: string
  description: string
  scope: SkillScope
  estimated_tokens: number
  enabled: boolean
}

export interface SkillImportResult {
  skill: Skill
  warnings: string[]
}

export interface SkillStats {
  total: number
  system: number
  user: number
  enabled: number
}

// ---------------------------------------------------------------- MCP

export type McpTransport = 'streamable_http' | 'sse' | 'stdio'
export type McpHealthStatus = 'unknown' | 'healthy' | 'degraded' | 'unhealthy' | 'disabled'
export type McpToolRisk = 'read' | 'write' | 'destructive' | 'unknown'

export interface McpTool {
  id: string
  server_id: string
  /** 原始工具名，如 `conversations.info`。 */
  name: string
  /** 暴露给模型的名称，如 `mcp__slack_mcp__conversations_info`。 */
  exposed_name: string
  description: string
  input_schema: Record<string, unknown>
  risk: McpToolRisk
  requires_approval: boolean
  /** 系统 MCP 的写工具可能仅管理员可用。 */
  admin_only: boolean
  /** 当前用户是否允许调用；普通用户对系统写工具为 false。 */
  user_allowed: boolean
  enabled: boolean
}

export interface McpServer {
  id: string
  slug: string
  name: string
  description?: string
  url: string | null
  transport: McpTransport
  scope: 'system' | 'user'
  enabled: boolean
  effective_enabled?: boolean
  /** 管理员强制停用。 */
  force_disabled?: boolean
  auto_inject: boolean
  health_status: McpHealthStatus
  last_error: string | null
  last_checked_at: string | null
  latency_ms: number | null
  tool_count: number
  /** 普通用户是否可使用该系统 MCP 的写工具（后端未返回时按未知处理）。 */
  write_tools_allowed?: boolean
  admin_only_write_tools?: boolean
  /** 凭据提示（`env:XXX` / `Bearer ****9f2a`），不返回密钥。 */
  auth_hint?: string
  /** 后端实际字段名；`auth_hint` 是其前端别名。 */
  credentials_hint?: string
  created_at?: string
  updated_at?: string
}

export interface McpServerCreateRequest {
  name: string
  /** 后端要求 slug；缺省时由页面按 name 生成。 */
  slug?: string
  description?: string
  url: string
  transport?: McpTransport
  /** 只保存引用（如 `Authorization: Bearer env:SLACK_MCP_TOKEN`），不要传明文密钥。 */
  headers?: Record<string, string>
  auto_inject?: boolean
}

export interface McpServerUpdateRequest {
  name?: string
  description?: string
  url?: string
  headers?: Record<string, string>
  auto_inject?: boolean
}

/** 前端归一化后的检查结果；后端原始字段见 api/mcp.ts。 */
export interface McpCheckResult {
  health_status: McpHealthStatus
  latency_ms: number | null
  tool_count: number
  checked_at: string | null
  error: string | null
}

export interface McpAvailableServer {
  id: string
  slug: string
  name: string
  scope: 'system' | 'user'
  transport?: McpTransport
  tool_count: number
  enabled: boolean
  effective_enabled?: boolean
  health_status: McpHealthStatus
}

export interface McpAvailableTool {
  id: string
  server_id: string
  name: string
  exposed_name: string
  risk: McpToolRisk
  requires_approval: boolean
}

export interface McpAvailable {
  servers: McpAvailableServer[]
  tools: McpAvailableTool[]
}

export interface McpToolUpdateRequest {
  enabled?: boolean
  requires_approval?: boolean
}

export interface McpStats {
  total: number
  system: number
  user: number
  healthy: number
  enabled: number
}

// ---------------------------------------------------------------- 常量

export const MEMORY_KIND_LABELS: Record<MemoryKind, string> = {
  profile: '档案',
  preference: '偏好',
  fact: '事实',
}

export const MEMORY_SOURCE_LABELS: Record<MemorySourceKind, string> = {
  conversation: '会话',
  workflow_run: '工作流运行',
  approval: '审批记录',
  manual: '手动保存',
}

export const SKILL_SCOPE_LABELS: Record<SkillScope, string> = {
  system: '系统',
  user: '用户',
}

export const MCP_TRANSPORT_LABELS: Record<McpTransport, string> = {
  streamable_http: 'Streamable HTTP',
  sse: 'SSE',
  stdio: 'stdio',
}

export const MCP_HEALTH_LABELS: Record<McpHealthStatus, string> = {
  unknown: '未检查',
  healthy: '健康',
  degraded: '降级',
  unhealthy: '不可用',
  disabled: '已停用',
}

export const MCP_RISK_LABELS: Record<McpToolRisk, string> = {
  read: '只读',
  write: '写入',
  destructive: '破坏性',
  unknown: '未知',
}
