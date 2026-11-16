/** M5 审计日志：对应后端 `AuditLogOut`。 */
export interface AuditLog {
  id: number
  actor_type: string
  actor_id: string
  action: string
  resource_type: string
  resource_id: string
  detail: Record<string, unknown>
  request_id: string
  created_at: string
  /**
   * M7 前向兼容字段：后端 `AuditLogOut` 当前尚未输出 ip / result。
   * 可选、无默认值；前端只在有值时渲染，无值显示 —，不伪造数据。
   */
  ip?: string | null
  result?: string | null
}

export interface AuditLogQuery {
  /** 仅管理员全局检索支持。 */
  actor_type?: string
  /** 仅管理员全局检索支持。 */
  actor_id?: string
  action?: string
  resource_type?: string
  /** 仅管理员全局检索支持。 */
  resource_id?: string
  /** ISO 8601，含。 */
  start?: string
  /** ISO 8601，不含。 */
  end?: string
  limit?: number
  cursor?: string
}

/** 后端实际写入的审计动作；用于筛选下拉，允许多选自由输入。 */
export const AUDIT_ACTIONS: readonly string[] = [
  'agent.created',
  'agent.deleted',
  'agent.health_check',
  'agent.refresh_failed',
  'agent.refreshed',
  'agent.updated',
  'approval.decide',
  'approval.timeout_canceled',
  'attachment.delete',
  'attachment.upload',
  'attachment.upload_deduplicated',
  'capability.override',
  'instruction.update',
  'mcp.server.check',
  'mcp.server.create',
  'mcp.server.delete',
  'mcp.server.enable',
  'mcp.server.update',
  'mcp.tool.update',
  'memory.clear',
  'memory.create',
  'memory.delete',
  'memory.update',
  'secret.create',
  'secret.delete',
  'secret.update',
  'security.injection_suspected',
  'security.output_redacted',
  'skill.create',
  'skill.delete',
  'skill.enable',
  'skill.import',
  'skill.update',
  'task.authorized',
  'task.canceled',
  'task.expired',
  'task.rejected',
  'task.resumed',
]

export const AUDIT_RESOURCE_TYPES: readonly string[] = [
  'agent',
  'approval',
  'attachment',
  'conversation',
  'instruction',
  'knowledge',
  'mcp_server',
  'mcp_tool',
  'memory',
  'run',
  'secret',
  'skill',
  'task',
]
