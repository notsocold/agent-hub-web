<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import dayjs from 'dayjs'
import { ElMessage } from 'element-plus'

import AppIcon from '@/components/common/AppIcon.vue'
import ErrorState from '@/components/common/ErrorState.vue'
import LoadingSkeleton from '@/components/common/LoadingSkeleton.vue'
import RedactedJson from '@/components/common/RedactedJson.vue'
import { auditApi } from '@/api/audit'
import { ApiRequestError } from '@/api/client'
import { useAuthStore } from '@/stores/auth'
import { AUDIT_ACTIONS, AUDIT_RESOURCE_TYPES } from '@/types'
import type { AuditLog, AuditLogQuery, PageResult } from '@/types'

/**
 * 管理台审计日志：GET /admin/audit-logs。
 * 保留动作 / 资源 / 操作者 / 资源 ID / 时间范围筛选与游标分页；表格按原型 .audit-* 样式。
 */

const PAGE_SIZE = 20

const auth = useAuthStore()
const route = useRoute()

type AuditScope = 'all' | 'own'
type RangeKey = '24h' | '7d' | '30d' | 'all' | 'custom'

const scope = ref<AuditScope>('all')
const range = ref<RangeKey>('all')
const actionFilter = ref('')
const resourceFilter = ref('')
const keyword = ref('')
const advancedOpen = ref(false)

const form = reactive({
  actorType: '',
  actorId: '',
  resourceId: '',
  start: '',
  end: '',
})

interface AppliedFilters {
  action: string
  resourceType: string
  actorType: string
  actorId: string
  resourceId: string
  start: string | null
  end: string | null
}

const applied = ref<AppliedFilters>({
  action: '',
  resourceType: '',
  actorType: '',
  actorId: '',
  resourceId: '',
  start: null,
  end: null,
})

const items = ref<AuditLog[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
const nextCursor = ref<string | null>(null)
const hasMore = ref(false)
const cursorStack = ref<string[]>([])

const activeLog = ref<AuditLog | null>(null)

let loadSeq = 0

const canGoPrev = computed(() => cursorStack.value.length > 0)

const filteredItems = computed(() => {
  const query = keyword.value.trim().toLowerCase()
  if (!query) return items.value
  return items.value.filter((log) =>
    [
      log.action,
      log.actor_type,
      log.actor_id,
      log.resource_type,
      log.resource_id,
      log.request_id,
    ].some((value) => value.toLowerCase().includes(query)),
  )
})

const ACTION_LABELS: Record<string, string> = {
  'agent.created': '注册智能体',
  'agent.deleted': '删除智能体',
  'agent.health_check': '智能体健康检查',
  'agent.refresh_failed': '智能体刷新失败',
  'agent.refreshed': '刷新智能体',
  'agent.updated': '更新智能体',
  'approval.decide': '审批决定',
  'approval.timeout_canceled': '审批超时取消',
  'attachment.delete': '删除附件',
  'attachment.upload': '上传附件',
  'attachment.upload_deduplicated': '附件去重上传',
  'instruction.update': '更新平台指令',
  'mcp.server.check': '检查 MCP Server',
  'mcp.server.create': '新建 MCP Server',
  'mcp.server.delete': '删除 MCP Server',
  'mcp.server.enable': '启停 MCP Server',
  'mcp.server.update': '更新 MCP Server',
  'mcp.tool.update': '更新 MCP 工具',
  'memory.clear': '清空记忆',
  'memory.create': '创建记忆',
  'memory.delete': '删除记忆',
  'memory.update': '更新记忆',
  'secret.create': '新建平台密钥',
  'secret.delete': '删除平台密钥',
  'secret.update': '更新平台密钥',
  'security.injection_suspected': '疑似提示词注入',
  'security.output_redacted': '输出脱敏',
  'skill.create': '创建技能',
  'skill.delete': '删除技能',
  'skill.enable': '启停技能',
  'skill.import': '导入技能',
  'skill.update': '更新技能',
  'task.authorized': '任务授权',
  'task.canceled': '取消任务',
  'task.expired': '任务过期',
  'task.rejected': '拒绝任务',
  'task.resumed': '恢复任务',
}

function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action
}

function toIso(value: string): string | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function presetStart(): string | null {
  if (range.value === '24h') return dayjs().subtract(24, 'hour').toISOString()
  if (range.value === '7d') return dayjs().subtract(7, 'day').toISOString()
  if (range.value === '30d') return dayjs().subtract(30, 'day').toISOString()
  return null
}

function resolveStart(): string | null {
  if (range.value === 'custom') return toIso(form.start)
  return presetStart()
}

function resolveEnd(): string | null {
  if (range.value === 'custom') return toIso(form.end)
  return null
}

function snapshotFilters(): void {
  applied.value = {
    action: actionFilter.value.trim(),
    resourceType: resourceFilter.value.trim(),
    actorType: scope.value === 'all' ? form.actorType.trim() : '',
    actorId: scope.value === 'all' ? form.actorId.trim() : '',
    resourceId: scope.value === 'all' ? form.resourceId.trim() : '',
    start: resolveStart(),
    end: resolveEnd(),
  }
}

function buildQuery(cursor: string | null): AuditLogQuery {
  const filters = applied.value
  const params: AuditLogQuery = { limit: PAGE_SIZE }
  if (filters.action) params.action = filters.action
  if (filters.resourceType) params.resource_type = filters.resourceType
  if (filters.start) params.start = filters.start
  if (filters.end) params.end = filters.end
  if (scope.value === 'all') {
    if (filters.actorType) params.actor_type = filters.actorType
    if (filters.actorId) params.actor_id = filters.actorId
    if (filters.resourceId) params.resource_id = filters.resourceId
  }
  if (cursor) params.cursor = cursor
  return params
}

function requestPage(cursor: string | null): Promise<PageResult<AuditLog>> {
  const params = buildQuery(cursor)
  return scope.value === 'all' ? auditApi.all(params) : auditApi.own(params)
}

function errorMessage(cause: unknown): string {
  if (cause instanceof ApiRequestError && cause.status === 403) {
    return '没有权限查看审计日志，请确认当前账号为管理员。'
  }
  return cause instanceof Error ? cause.message : '加载审计日志失败'
}

async function load(cursor: string | null = null): Promise<void> {
  const seq = ++loadSeq
  loading.value = true
  error.value = null
  try {
    const page = await requestPage(cursor)
    if (seq !== loadSeq) return
    items.value = page.items
    nextCursor.value = page.next_cursor
    hasMore.value = page.has_more && page.next_cursor !== null
  } catch (cause) {
    if (seq !== loadSeq) return
    error.value = errorMessage(cause)
    items.value = []
    nextCursor.value = null
    hasMore.value = false
  } finally {
    if (seq === loadSeq) loading.value = false
  }
}

function resetAndLoad(): void {
  cursorStack.value = []
  snapshotFilters()
  void load()
}

function setScope(next: AuditScope): void {
  if (scope.value === next) return
  scope.value = next
  resetAndLoad()
}

function setRange(next: RangeKey): void {
  range.value = next
  resetAndLoad()
}

function applyAdvanced(): void {
  if (form.start && !toIso(form.start)) {
    ElMessage.warning('开始时间格式无效，请重新选择')
    return
  }
  if (form.end && !toIso(form.end)) {
    ElMessage.warning('结束时间格式无效，请重新选择')
    return
  }
  const start = toIso(form.start)
  const end = toIso(form.end)
  if (start && end && new Date(start).getTime() >= new Date(end).getTime()) {
    ElMessage.warning('结束时间必须晚于开始时间')
    return
  }
  if (form.start || form.end) range.value = 'custom'
  resetAndLoad()
}

function resetFilters(): void {
  actionFilter.value = ''
  resourceFilter.value = ''
  keyword.value = ''
  range.value = 'all'
  form.actorType = ''
  form.actorId = ''
  form.resourceId = ''
  form.start = ''
  form.end = ''
  resetAndLoad()
}

function goNext(): void {
  const next = nextCursor.value
  if (!next || !hasMore.value) return
  cursorStack.value = [...cursorStack.value, next]
  void load(next)
}

function goPrev(): void {
  if (cursorStack.value.length === 0) return
  cursorStack.value = cursorStack.value.slice(0, -1)
  void load(cursorStack.value[cursorStack.value.length - 1])
}

function auditTime(iso: string): string {
  const date = dayjs(iso)
  if (!date.isValid()) return '—'
  const now = dayjs()
  if (date.isSame(now, 'day')) return `今天 ${date.format('HH:mm')}`
  if (date.isSame(now.subtract(1, 'day'), 'day')) return `昨天 ${date.format('HH:mm')}`
  return date.format('MM-DD HH:mm')
}

function actorName(log: AuditLog): string {
  if (log.actor_type === 'system') return '系统'
  if (auth.user && log.actor_id === auth.user.id) return auth.user.display_name || auth.user.email
  if (log.actor_type === 'admin') return '管理员'
  if (log.actor_type === 'user') return `用户 ${log.actor_id.slice(0, 8)}`
  return log.actor_id ? log.actor_id.slice(0, 8) : '—'
}

function actorInitials(log: AuditLog): string {
  if (log.actor_type === 'system') return 'SY'
  if (auth.user && log.actor_id === auth.user.id) {
    return (auth.user.display_name || auth.user.email).slice(0, 2).toUpperCase()
  }
  if (log.actor_type === 'user') return '用'
  if (log.actor_type === 'admin') return '管'
  return log.actor_id ? log.actor_id.slice(0, 2).toUpperCase() : '—'
}

function resourceText(log: AuditLog): string {
  const type = log.resource_type || '—'
  const id = log.resource_id || '—'
  return `${type} · ${id}`
}

/**
 * M7：`AuditLog.ip/result` 是前向兼容的可选字段，后端补齐后自动显示；
 * 无值时保持「—」，不伪造数据。
 */
function auditIp(log: AuditLog): string {
  const value = log.ip
  return typeof value === 'string' && value.trim() ? value.trim() : '—'
}

function auditResult(log: AuditLog): string {
  const value = log.result
  return typeof value === 'string' && value.trim() ? value.trim() : '—'
}

/** 结果字段补齐后按常见值着色，未知值用中性徽标，不做语义猜测。 */
function auditResultTone(result: string): string {
  const normalized = result.trim().toLowerCase()
  if (['success', 'succeeded', 'ok'].includes(normalized)) return 'st-ok'
  if (['failure', 'failed', 'error', 'denied', 'rejected'].includes(normalized)) {
    return 'st-error'
  }
  return 'st-muted'
}

function openDetail(log: AuditLog): void {
  activeLog.value = log
}

function closeDetail(): void {
  activeLog.value = null
}

async function copyRequestId(): Promise<void> {
  const requestId = activeLog.value?.request_id
  if (!requestId) return
  try {
    if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable')
    await navigator.clipboard.writeText(requestId)
    ElMessage.success('已复制 request_id')
  } catch {
    ElMessage.warning('复制失败，请手动选中 request_id 后复制')
  }
}

function exportCsv(): void {
  const rows = filteredItems.value
  if (rows.length === 0) {
    ElMessage.warning('当前没有可导出的审计记录')
    return
  }
  const header = ['id', 'created_at', 'actor_type', 'actor_id', 'action', 'resource_type', 'resource_id', 'request_id']
  const escape = (value: string): string => `"${value.replaceAll('"', '""')}"`
  const lines = [
    header.join(','),
    ...rows.map((log) =>
      [
        String(log.id),
        log.created_at,
        log.actor_type,
        log.actor_id,
        log.action,
        log.resource_type,
        log.resource_id,
        log.request_id,
      ]
        .map(escape)
        .join(','),
    ),
  ]
  const blob = new Blob([`${lines.join('\n')}\n`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `audit-logs-${dayjs().format('YYYYMMDD-HHmm')}.csv`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
  ElMessage.success(`已导出当前页 ${rows.length} 条记录`)
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && activeLog.value) closeDetail()
}

/**
 * M9 搜索深链：命令面板跳 `/admin/audit?action=<动作>` 时预填动作筛选。
 * - query 可能是单值或多值，现有筛选状态是单选，取第一个合法动作；
 * - 非字符串 / 不在 AUDIT_ACTIONS 的动作视为非法值，忽略并保留「全部操作」；
 * - 只在 onMounted 读取一次，改 ref 不会触发 select 的 @change；
 *   随后 `resetAndLoad()` 同样只发一次首屏请求，不存在重复加载。
 */
function prefillActionFromQuery(): void {
  const raw = route.query.action
  const candidates = Array.isArray(raw) ? raw : [raw]
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue
    const action = candidate.trim()
    if (!action || !AUDIT_ACTIONS.includes(action)) continue
    actionFilter.value = action
    return
  }
}

onMounted(() => {
  document.addEventListener('keydown', onKeydown)
  prefillActionFromQuery()
  resetAndLoad()
})

onUnmounted(() => {
  document.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div class="admin-page">
    <header class="admin-page-head">
      <div>
        <h1 class="page-title">审计日志</h1>
        <p class="page-sub">
          记录登录、权限、菜单、字典、工作流与系统配置变更。只读，保留 365 天。
        </p>
      </div>
      <div class="head-actions">
        <button type="button" class="btn btn-outline" :disabled="filteredItems.length === 0" @click="exportCsv">
          <AppIcon name="download" />
          导出
        </button>
        <button type="button" class="btn btn-outline" :disabled="loading" @click="resetAndLoad">
          <AppIcon name="refresh" />
          {{ loading ? '刷新中…' : '刷新' }}
        </button>
      </div>
    </header>

    <div class="prototype-note" role="note">
      <AppIcon name="alert" />
      <span>
        <b>字段说明</b>：IP 与结果字段后端暂未输出，显示为 —。
        <br />
        管理端契约补齐后本页会自动渲染真实值，前端不伪造数据。
      </span>
    </div>

    <form class="toolbar" @submit.prevent="resetAndLoad">
      <label class="search-field">
        <AppIcon name="search" />
        <input
          v-model="keyword"
          type="search"
          placeholder="搜索操作者、对象或动作"
          aria-label="搜索审计记录"
          autocomplete="off"
        />
      </label>
      <select v-model="actionFilter" class="select" aria-label="按操作筛选" @change="resetAndLoad">
        <option value="">全部操作</option>
        <option v-for="action in AUDIT_ACTIONS" :key="action" :value="action">
          {{ actionLabel(action) }} · {{ action }}
        </option>
      </select>
      <select
        v-model="resourceFilter"
        class="select"
        aria-label="按资源类型筛选"
        @change="resetAndLoad"
      >
        <option value="">全部资源</option>
        <option v-for="type in AUDIT_RESOURCE_TYPES" :key="type" :value="type">{{ type }}</option>
      </select>
      <div class="seg" role="group" aria-label="审计范围">
        <button
          type="button"
          :class="{ 'is-active': scope === 'all' }"
          :aria-pressed="scope === 'all'"
          @click="setScope('all')"
        >
          全局
        </button>
        <button
          type="button"
          :class="{ 'is-active': scope === 'own' }"
          :aria-pressed="scope === 'own'"
          @click="setScope('own')"
        >
          我的
        </button>
      </div>
      <select
        :value="range"
        class="select"
        aria-label="时间范围"
        @change="setRange(($event.target as HTMLSelectElement).value as RangeKey)"
      >
        <option value="24h">近 24 小时</option>
        <option value="7d">近 7 天</option>
        <option value="30d">近 30 天</option>
        <option value="all">全部时间</option>
        <option value="custom">自定义</option>
      </select>
      <button
        type="button"
        class="btn btn-ghost btn-sm"
        :aria-expanded="advancedOpen"
        @click="advancedOpen = !advancedOpen"
      >
        <AppIcon name="filter" />
        更多筛选
      </button>
      <span class="spacer"></span>
      <span class="mono count-label">{{ filteredItems.length }} 条</span>
    </form>

    <fieldset v-if="advancedOpen" class="audit-advanced">
      <legend class="sr-only">更多筛选</legend>
      <label class="field">
        <span>操作者类型</span>
        <input
          v-model="form.actorType"
          class="input mono"
          list="audit-actor-types"
          placeholder="全部，如 user"
          autocomplete="off"
        />
      </label>
      <label class="field">
        <span>操作者 ID</span>
        <input
          v-model="form.actorId"
          class="input mono"
          placeholder="按操作者 ID 精确筛选"
          autocomplete="off"
        />
      </label>
      <label class="field">
        <span>资源 ID</span>
        <input
          v-model="form.resourceId"
          class="input mono"
          placeholder="按资源 ID 精确筛选"
          autocomplete="off"
        />
      </label>
      <label class="field">
        <span>开始时间</span>
        <input v-model="form.start" class="input mono" type="datetime-local" />
      </label>
      <label class="field">
        <span>结束时间（不含）</span>
        <input v-model="form.end" class="input mono" type="datetime-local" />
      </label>
      <div class="actions">
        <button type="button" class="btn btn-primary btn-sm" @click="applyAdvanced">应用筛选</button>
        <button type="button" class="btn btn-ghost btn-sm" @click="resetFilters">重置</button>
      </div>
      <p class="audit-advanced-hint">
        自定义开始/结束时间时，时间范围会自动切换为「自定义」；时间为本地时区。
      </p>
      <datalist id="audit-actor-types">
        <option value="user" />
        <option value="admin" />
        <option value="system" />
      </datalist>
    </fieldset>

    <LoadingSkeleton v-if="loading && items.length === 0" :rows="4" />
    <ErrorState v-else-if="error" :message="error" :retryable="true" @retry="resetAndLoad" />
    <p v-else-if="items.length === 0" class="empty-state">没有匹配的审计记录。</p>

    <div v-else class="table-wrap">
      <table class="data-table audit-table">
        <thead>
          <tr>
            <th scope="col">时间</th>
            <th scope="col">操作者</th>
            <th scope="col">操作</th>
            <th scope="col">对象</th>
            <th scope="col" title="后端接口暂未输出该字段，待契约补齐">IP</th>
            <th scope="col" title="后端接口暂未输出该字段，待契约补齐">结果</th>
            <th scope="col" class="actions">详情</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="log in filteredItems" :key="log.id">
            <td class="mono time-cell">{{ auditTime(log.created_at) }}</td>
            <td>
              <div class="audit-actor">
                <span class="avatar" aria-hidden="true">{{ actorInitials(log) }}</span>
                <b>{{ actorName(log) }}</b>
              </div>
            </td>
            <td>
              <div class="audit-action">
                {{ actionLabel(log.action) }}
                <small>{{ log.action }}</small>
              </div>
            </td>
            <td>
              <span class="audit-resource" :title="resourceText(log)">{{ resourceText(log) }}</span>
            </td>
            <td class="audit-ip">{{ auditIp(log) }}</td>
            <td>
              <span class="st" :class="auditResultTone(auditResult(log))">
                {{ auditResult(log) }}
              </span>
            </td>
            <td class="actions">
              <button type="button" class="text-link" @click="openDetail(log)">查看</button>
            </td>
          </tr>
        </tbody>
      </table>
      <div class="table-foot">
        <span>显示 {{ filteredItems.length }} 条记录{{ hasMore ? ' · 还有更多' : '' }}</span>
        <span class="spacer"></span>
        <span>审计数据不可编辑</span>
        <div class="pagination">
          <button
            type="button"
            aria-label="上一页"
            :disabled="!canGoPrev || loading"
            @click="goPrev"
          >
            ‹
          </button>
          <span class="page-indicator mono" aria-current="page">{{ cursorStack.length + 1 }}</span>
          <button type="button" aria-label="下一页" :disabled="!hasMore || loading" @click="goNext">
            ›
          </button>
        </div>
      </div>
    </div>

    <template v-if="activeLog">
      <div class="drawer-scrim is-open" @click="closeDetail"></div>
      <aside class="drawer is-open" role="dialog" aria-modal="true" aria-labelledby="audit-detail-title">
        <header class="drawer-head">
          <div>
            <h2 id="audit-detail-title">审计详情</h2>
            <p class="drawer-sub">记录 ID {{ activeLog.id }} · 只读</p>
          </div>
          <button type="button" class="drawer-close" aria-label="关闭" @click="closeDetail">
            <AppIcon name="x" />
          </button>
        </header>
        <div class="drawer-body">
          <div class="audit-detail">
            <dl class="audit-meta">
              <dt>时间</dt>
              <dd class="mono">{{ auditTime(activeLog.created_at) }}</dd>
              <dt>操作者类型</dt>
              <dd class="mono">{{ activeLog.actor_type || '—' }}</dd>
              <dt>操作者</dt>
              <dd>{{ actorName(activeLog) }}</dd>
              <dt>操作者 ID</dt>
              <dd class="mono">{{ activeLog.actor_id || '—' }}</dd>
              <dt>动作</dt>
              <dd>{{ actionLabel(activeLog.action) }}</dd>
              <dt>动作标识</dt>
              <dd class="mono">{{ activeLog.action }}</dd>
              <dt>资源类型</dt>
              <dd class="mono">{{ activeLog.resource_type || '—' }}</dd>
              <dt>资源 ID</dt>
              <dd class="mono">{{ activeLog.resource_id || '—' }}</dd>
              <dt>IP</dt>
              <dd class="mono">{{ auditIp(activeLog) }}</dd>
              <dt>结果</dt>
              <dd>{{ auditResult(activeLog) }}</dd>
              <dt>request_id</dt>
              <dd class="mono">{{ activeLog.request_id || '—' }}</dd>
            </dl>
            <div>
              <button
                type="button"
                class="btn btn-outline btn-sm"
                :disabled="!activeLog.request_id"
                @click="copyRequestId"
              >
                <AppIcon name="copy" />
                复制 request_id
              </button>
            </div>
            <section>
              <h3 class="detail-section-title">detail</h3>
              <RedactedJson :value="activeLog.detail" />
            </section>
          </div>
        </div>
        <footer class="drawer-foot">
          <span class="mono">不可编辑</span>
          <span class="spacer"></span>
          <button type="button" class="btn btn-ghost btn-sm" @click="closeDetail">关闭</button>
        </footer>
      </aside>
    </template>
  </div>
</template>
