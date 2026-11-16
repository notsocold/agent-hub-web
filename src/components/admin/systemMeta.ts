import type { SystemCapabilities, SystemLimits } from '@/types'

/**
 * `/system/info` 的 capabilities / limits 展示元数据。
 *
 * 键与 `src/types/system.ts` 的类型严格绑定：后端新增字段时，这里漏补会触发
 * `keyof` 类型检查提示（但不会自动出现，需同步维护）。
 */

export interface CapabilityMeta {
  key: keyof SystemCapabilities
  label: string
}

export const CAPABILITY_META: readonly CapabilityMeta[] = [
  { key: 'instructions', label: '平台指令' },
  { key: 'memories', label: '记忆' },
  { key: 'skills', label: '技能' },
  { key: 'mcp', label: 'MCP' },
  { key: 'knowledge', label: '知识库' },
  { key: 'attachments', label: '附件' },
  { key: 'workflows', label: '工作流' },
  { key: 'approvals', label: '审批' },
  { key: 'agents', label: '智能体' },
  { key: 'tasks', label: '任务' },
]

export interface LimitMeta {
  key: keyof SystemLimits
  label: string
}

export const LIMIT_META: readonly LimitMeta[] = [
  { key: 'skills_per_message', label: '单条消息技能上限' },
  { key: 'mcp_servers_per_message', label: '单条消息 MCP Server 上限' },
  { key: 'mcp_tools_per_message', label: '单条消息 MCP 工具上限' },
  { key: 'knowledge_categories_per_message', label: '单条消息知识分类上限' },
  { key: 'attachments_per_message', label: '单条消息附件上限' },
  { key: 'attachment_max_bytes', label: '单附件字节上限' },
  { key: 'message_max_chars', label: '单条消息字符上限' },
]
