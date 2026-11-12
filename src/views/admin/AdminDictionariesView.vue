<script setup lang="ts">
import PageHeader from '@/components/common/PageHeader.vue'
import { STATE_LABELS } from '@/components/tasks/taskMeta'
import { KNOWLEDGE_STATUS_LABELS } from '@/utils/knowledge'
import {
  APPROVAL_STATUSES,
  CONVERSATION_STATUSES,
  KNOWLEDGE_STATUSES,
  MCP_HEALTH_LABELS,
  MCP_TRANSPORT_LABELS,
  RUN_STATUSES,
  TASK_STATES,
} from '@/types'
import type {
  AdminUserStatus,
  AdminUserRole,
  ApprovalRisk,
  ApprovalStatus,
  ConversationStatus,
  McpHealthStatus,
  McpTransport,
  RunStatus,
} from '@/types'

interface DictRow {
  key: string
  label: string
}

interface DictGroup {
  title: string
  /** 来源 union 类型名。 */
  type: string
  /** 来源类型文件。 */
  file: string
  note?: string
  rows: DictRow[]
}

/** 键列表全部取自 @/types 导出的真实枚举；labels 用 Record<枚举, string> 强制全覆盖。 */
function toRows<T extends string>(keys: readonly T[], labels: Record<T, string>): DictRow[] {
  return keys.map((key) => ({ key, label: labels[key] }))
}

// @/types 未导出常量数组的枚举，这里以 union 类型约束字面量数组，类型漂移时类型检查会报错。
const USER_ROLES: readonly AdminUserRole[] = ['user', 'admin']
const USER_STATUSES: readonly AdminUserStatus[] = ['active', 'disabled']
const MCP_TRANSPORTS: readonly McpTransport[] = ['streamable_http', 'sse', 'stdio']
const MCP_HEALTH_STATUSES: readonly McpHealthStatus[] = [
  'unknown',
  'healthy',
  'degraded',
  'unhealthy',
  'disabled',
]
const APPROVAL_RISKS: readonly ApprovalRisk[] = ['read', 'write', 'destructive', 'unknown']

const RUN_STATUS_LABELS: Record<RunStatus, string> = {
  queued: '排队',
  running: '运行中',
  succeeded: '成功',
  failed: '失败',
  canceled: '已取消',
  interrupted: '等待审批',
}

const USER_ROLE_LABELS: Record<AdminUserRole, string> = {
  user: '普通用户',
  admin: '管理员',
}

const USER_STATUS_LABELS: Record<AdminUserStatus, string> = {
  active: '活跃',
  disabled: '停用',
}

const CONVERSATION_STATUS_LABELS: Record<ConversationStatus, string> = {
  active: '活跃',
  archived: '已归档',
}

const APPROVAL_STATUS_LABELS: Record<ApprovalStatus, string> = {
  pending: '等待决定',
  approved: '已批准',
  rejected: '已拒绝',
  expired: '已过期',
  canceled: '已取消',
}

const APPROVAL_RISK_LABELS: Record<ApprovalRisk, string> = {
  read: '只读',
  write: '写入',
  destructive: '破坏性',
  unknown: '未知',
}

const groups: DictGroup[] = [
  {
    title: 'A2A 任务状态',
    type: 'A2aTaskState',
    file: 'src/types/task.ts',
    rows: toRows(TASK_STATES, STATE_LABELS),
  },
  {
    title: '运行状态',
    type: 'RunStatus',
    file: 'src/types/run.ts',
    rows: toRows(RUN_STATUSES, RUN_STATUS_LABELS),
  },
  {
    title: '知识库文档状态',
    type: 'KnowledgeDocumentStatus',
    file: 'src/types/knowledge.ts',
    rows: toRows(KNOWLEDGE_STATUSES, KNOWLEDGE_STATUS_LABELS),
  },
  {
    title: '用户角色',
    type: 'AdminUserRole',
    file: 'src/types/admin.ts',
    rows: toRows(USER_ROLES, USER_ROLE_LABELS),
  },
  {
    title: '用户状态',
    type: 'AdminUserStatus',
    file: 'src/types/admin.ts',
    rows: toRows(USER_STATUSES, USER_STATUS_LABELS),
  },
  {
    title: '会话状态',
    type: 'ConversationStatus',
    file: 'src/types/conversation.ts',
    note: 'deleted 为概览里的软删会话计数字段，不是会话状态枚举值。',
    rows: toRows(CONVERSATION_STATUSES, CONVERSATION_STATUS_LABELS),
  },
  {
    title: 'MCP 传输方式',
    type: 'McpTransport',
    file: 'src/types/capability.ts',
    rows: toRows(MCP_TRANSPORTS, MCP_TRANSPORT_LABELS),
  },
  {
    title: 'MCP 健康状态',
    type: 'McpHealthStatus',
    file: 'src/types/capability.ts',
    rows: toRows(MCP_HEALTH_STATUSES, MCP_HEALTH_LABELS),
  },
  {
    title: '审批状态',
    type: 'ApprovalStatus',
    file: 'src/types/approval.ts',
    rows: toRows(APPROVAL_STATUSES, APPROVAL_STATUS_LABELS),
  },
  {
    title: '审批风险等级',
    type: 'ApprovalRisk',
    file: 'src/types/approval.ts',
    rows: toRows(APPROVAL_RISKS, APPROVAL_RISK_LABELS),
  },
]
</script>

<template>
  <div class="admin-page">
    <PageHeader
      eyebrow="ADMIN · DICTIONARIES"
      title="字典管理"
      description="前端内置枚举的只读字典（任务 / 运行 / 知识库 / 用户 / 会话 / MCP / 审批）。后端无对应管理接口，本页为只读呈现。"
    />

    <section class="notice" role="note" aria-label="只读说明">
      <p class="notice-tag mono">READ-ONLY · 只读呈现</p>
      <p class="notice-body">
        后端无字典管理接口，以下为前端内置枚举的只读字典：键值取自 src/types/ 下的类型定义与现有 UI
        的标签映射，新增或调整枚举需同步修改前端代码。
      </p>
    </section>

    <section class="groups">
      <article v-for="group in groups" :key="group.title" class="panel">
        <h2>
          {{ group.title }}
          <span class="count mono">{{ group.rows.length }}</span>
        </h2>
        <table>
          <thead>
            <tr>
              <th scope="col">键</th>
              <th scope="col">中文含义</th>
              <th scope="col">来源</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in group.rows" :key="row.key">
              <td class="mono">{{ row.key }}</td>
              <td>{{ row.label }}</td>
              <td class="source">
                <span class="mono">{{ group.type }}</span>
                <span class="file">{{ group.file }}</span>
              </td>
            </tr>
          </tbody>
        </table>
        <p v-if="group.note" class="note">{{ group.note }}</p>
      </article>
    </section>
  </div>
</template>

<style scoped>
.admin-page {
  display: flex;
  flex-direction: column;
  gap: 18px;
  max-width: 1120px;
}

.notice {
  padding: 12px 16px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--surface-2);
}

.notice-tag {
  margin: 0 0 4px;
  color: var(--amber-text);
  font-size: 9.5px;
  letter-spacing: 0.13em;
}

.notice-body {
  margin: 0;
  color: var(--ink-2);
  font-size: 12px;
  line-height: 1.7;
}

.groups {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(330px, 1fr));
  gap: 12px;
  align-items: start;
}

.panel {
  padding: 14px 16px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--surface);
}

.panel h2 {
  margin: 0 0 10px;
  font-size: 12px;
  font-weight: 650;
  color: var(--ink-2);
}

.count {
  margin-left: 8px;
  color: var(--ink-3);
  font-size: 10.5px;
  font-weight: 400;
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

th,
td {
  padding: 6px 10px;
  border-bottom: 1px solid var(--line-2);
  color: var(--ink);
  font-weight: 400;
  text-align: left;
  vertical-align: top;
}

thead th {
  border-bottom: 1px solid var(--line);
  color: var(--ink-3);
  font-size: 11px;
  font-weight: 550;
  white-space: nowrap;
}

tbody tr:last-child th,
tbody tr:last-child td {
  border-bottom: none;
}

td.source span {
  display: block;
}

td.source .file {
  margin-top: 2px;
  color: var(--ink-3);
  font-size: 10.5px;
}

.note {
  margin: 10px 0 0;
  color: var(--ink-3);
  font-size: 10.5px;
  line-height: 1.7;
}
</style>
