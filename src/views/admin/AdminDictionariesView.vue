<script setup lang="ts">
import { computed, ref } from 'vue'

import AppIcon from '@/components/common/AppIcon.vue'
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
  AdminUserRole,
  AdminUserStatus,
  ApprovalRisk,
  ApprovalStatus,
  ConversationStatus,
  McpHealthStatus,
  McpTransport,
  RunStatus,
} from '@/types'

/**
 * 字典管理：前端内置枚举的只读字典。
 * 左侧字典类型 + 右侧字典项表格的结构对齐原型；后端无字典管理接口，不提供新增/编辑。
 */

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

const typeKeyword = ref('')
const itemKeyword = ref('')
const activeTitle = ref(groups[0]!.title)

const filteredGroups = computed(() => {
  const query = typeKeyword.value.trim().toLowerCase()
  if (!query) return groups
  return groups.filter((group) =>
    [group.title, group.type, group.file].some((value) => value.toLowerCase().includes(query)),
  )
})

const activeGroup = computed(
  () => groups.find((group) => group.title === activeTitle.value) ?? groups[0]!,
)

const visibleRows = computed(() => {
  const query = itemKeyword.value.trim().toLowerCase()
  const rows = activeGroup.value.rows
  if (!query) return rows
  return rows.filter((row) =>
    [row.label, row.key].some((value) => value.toLowerCase().includes(query)),
  )
})

/** 非活动分组保持完整数据在 DOM 中（仅视觉隐藏），保证只读镜像可被检索与测试覆盖。 */
function rowsFor(group: DictGroup): DictRow[] {
  if (group.title !== activeGroup.value.title) return group.rows
  return visibleRows.value
}

function setActive(title: string): void {
  activeTitle.value = title
  itemKeyword.value = ''
}
</script>

<template>
  <div class="admin-page">
    <header class="admin-page-head">
      <div>
        <h1 class="page-title">字典管理</h1>
        <p class="page-sub">
          集中维护任务状态、智能体健康、知识分类等枚举。字典值参与 API 契约，修改前请确认调用方。
        </p>
      </div>
      <div class="head-actions">
        <button
          type="button"
          class="btn btn-outline"
          @click="typeKeyword = ''; itemKeyword = ''; activeTitle = groups[0]!.title"
        >
          <AppIcon name="refresh" />
          重置筛选
        </button>
      </div>
    </header>

    <div class="prototype-note" role="note">
      <AppIcon name="alert" />
      <span>
        <b>只读字典</b>：后端无对应管理接口，以下为前端内置枚举的只读字典：键值取自 src/types/
        下的类型定义与现有 UI 的标签映射，新增或调整枚举需同步修改前端代码。
      </span>
    </div>

    <div class="dict-layout">
      <section class="panel dict-types">
        <div class="panel-head">
          <h2>字典类型</h2>
          <span class="spacer"></span>
          <span class="badge">{{ groups.length }}</span>
        </div>
        <div class="dict-search">
          <label class="search-field">
            <AppIcon name="search" />
            <input
              v-model="typeKeyword"
              type="search"
              placeholder="搜索字典"
              aria-label="搜索字典类型"
              autocomplete="off"
            />
          </label>
        </div>
        <div class="dict-type-list">
          <button
            v-for="group in filteredGroups"
            :key="group.title"
            type="button"
            class="dict-type"
            :class="{ 'is-active': activeGroup.title === group.title }"
            :aria-pressed="activeGroup.title === group.title"
            @click="setActive(group.title)"
          >
            <span class="dict-type-main">
              <b>{{ group.title }}</b>
              <small>{{ group.type }} · {{ group.rows.length }} 项</small>
            </span>
            <span class="count">{{ group.rows.length }}</span>
            <AppIcon name="arrow" />
          </button>
          <p v-if="filteredGroups.length === 0" class="empty-state">没有匹配的字典。</p>
        </div>
      </section>

      <div class="panel-stack">
        <section
          v-for="group in groups"
          v-show="activeGroup.title === group.title"
          :key="group.title"
          class="panel dict-items"
        >
          <div class="dict-head">
            <div class="dict-head-main">
              <h2>{{ group.title }}</h2>
              <p>{{ group.file }} · {{ group.type }}</p>
            </div>
            <span class="dict-code mono">{{ group.type }}</span>
            <span class="badge">{{ group.rows.length }} 项</span>
          </div>
          <div class="dict-toolbar">
            <label class="search-field">
              <AppIcon name="search" />
              <input
                v-model="itemKeyword"
                type="search"
                placeholder="搜索标签或值"
                :aria-label="`搜索 ${group.title} 字典项`"
                autocomplete="off"
              />
            </label>
            <span class="spacer"></span>
            <span class="mono count-label">{{ rowsFor(group).length }} 项</span>
          </div>
          <div class="table-wrap dict-table-wrap">
            <table class="data-table dict-item-table">
              <thead>
                <tr>
                  <th scope="col">标签</th>
                  <th scope="col">值</th>
                  <th scope="col">颜色</th>
                  <th scope="col" class="num">排序</th>
                  <th scope="col">状态</th>
                  <th scope="col" class="actions">操作</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in rowsFor(group)" :key="row.key">
                  <td>{{ row.label }}</td>
                  <td class="mono perm">{{ row.key }}</td>
                  <td><div class="color-cell"><span class="muted">—</span></div></td>
                  <td class="num"><span class="muted">—</span></td>
                  <td>
                    <span class="st st-muted"><span class="dot"></span>内置</span>
                  </td>
                  <td class="actions"><span class="muted">—</span></td>
                </tr>
                <tr v-if="rowsFor(group).length === 0">
                  <td colspan="6" class="empty">没有匹配的字典项。</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="panel-foot">
            <span>{{ group.note ?? '枚举值由前端编译内置，修改需同步类型定义与 UI 标签映射。' }}</span>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>
