<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'

import AppIcon from '@/components/common/AppIcon.vue'
import ErrorState from '@/components/common/ErrorState.vue'
import LoadingSkeleton from '@/components/common/LoadingSkeleton.vue'
import PageHeader from '@/components/common/PageHeader.vue'
import PageShell from '@/components/common/PageShell.vue'
import StatCard from '@/components/common/StatCard.vue'
import TaskDetailDrawer from '@/components/tasks/TaskDetailDrawer.vue'
import { isSafeAuthorizationUrl } from '@/components/tasks/authorizationUrl'
import { agentsApi } from '@/api/agents'
import { tasksApi, type TaskListParams } from '@/api/tasks'
import { useAuthStore } from '@/stores/auth'
import { formatDuration, formatTime } from '@/utils/format'
import { isRunningState, stateLabel, stateTone } from '@/components/tasks/taskMeta'
import type { A2aTaskDetail, A2aTaskListItem, A2aTaskState, Agent, TaskAction } from '@/types'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const PAGE_LIMIT = 20
const POLL_INTERVAL_MS = 15_000

const items = ref<A2aTaskListItem[]>([])
const stats = ref<Record<string, number>>({})
const loading = ref(false)
const loadingMore = ref(false)
const error = ref<string | null>(null)

const stateFilter = ref<'all' | A2aTaskState>('all')
const keyword = ref('')
const agentFilter = ref('')
const from = ref('')
const to = ref('')
const showDateFilters = ref(false)

const nextCursor = ref<string | null>(null)
const hasMore = ref(false)

const agents = ref<Agent[]>([])
const agentsLoaded = ref(false)

const detailOpen = ref(false)
const detailTaskId = ref<string | null>(null)

/** 手风琴展开态：同一时间至多展开一条，默认展开列表第一条（与原型一致）。 */
const expandedId = ref<string | null>(null)
/** 展开区按需拉取详情；缓存避免反复请求，15s 静默刷新时再更新。 */
const detailCache = reactive<Record<string, A2aTaskDetail>>({})
const detailLoading = reactive<Record<string, boolean>>({})
const detailErrors = reactive<Record<string, string>>({})

let pollTimer: number | undefined
let keywordTimer: number | undefined

const STATE_OPTIONS: Array<{ value: 'all' | A2aTaskState; label: string }> = [
  { value: 'all', label: '全部状态' },
  { value: 'submitted', label: '已提交' },
  { value: 'working', label: '运行中' },
  { value: 'input_required', label: '等待输入' },
  { value: 'auth_required', label: '需要授权' },
  { value: 'completed', label: '已完成' },
  { value: 'failed', label: '失败' },
  { value: 'canceled', label: '已取消' },
  { value: 'rejected', label: '已拒绝' },
]

const agentOptions = computed<Array<{ value: string; label: string }>>(() => [
  { value: '', label: '全部 Agent' },
  ...agents.value.map((agent) => ({ value: agent.id, label: agent.name })),
])

const displayStats = computed(() => {
  const count = (state: A2aTaskState): number =>
    stats.value[state] ?? items.value.filter((item) => item.state === state).length
  return {
    total: stats.value.total ?? items.value.length,
    working: count('working'),
    input_required: count('input_required'),
    auth_required: count('auth_required'),
    completed: count('completed'),
    failed: count('failed'),
  }
})

const segOptions = computed<Array<{ value: 'all' | A2aTaskState; label: string; count: number }>>(
  () => [
    { value: 'all', label: '全部', count: displayStats.value.total },
    { value: 'working', label: '运行中', count: displayStats.value.working },
    { value: 'input_required', label: '等待输入', count: displayStats.value.input_required },
    { value: 'auth_required', label: '需要授权', count: displayStats.value.auth_required },
    { value: 'completed', label: '已完成', count: displayStats.value.completed },
    { value: 'failed', label: '失败', count: displayStats.value.failed },
  ],
)

const hasRunning = computed(() => items.value.some((item) => isRunningState(item.state)))
const hasFilters = computed(
  () =>
    stateFilter.value !== 'all' ||
    keyword.value.trim() !== '' ||
    agentFilter.value !== '' ||
    from.value !== '' ||
    to.value !== '',
)
const dateFilterActive = computed(() => from.value !== '' || to.value !== '')

function buildParams(limit: number, cursor?: string): TaskListParams {
  return {
    state: stateFilter.value === 'all' ? undefined : stateFilter.value,
    q: keyword.value.trim() || undefined,
    agent_id: agentFilter.value || undefined,
    from: from.value ? new Date(`${from.value}T00:00:00`).toISOString() : undefined,
    to: to.value ? new Date(`${to.value}T23:59:59.999`).toISOString() : undefined,
    limit,
    cursor,
  }
}

function errorMessage(cause: unknown, fallback: string): string {
  return cause instanceof Error ? cause.message : fallback
}

function queryTaskId(): string | null {
  const value = route.query.task
  return typeof value === 'string' && value ? value : null
}

/** 首屏/筛选/刷新后：优先展开深链任务，其次保留当前展开项，最后默认展开第一条。 */
function syncExpandedAfterLoad(): void {
  const requested = queryTaskId()
  const requestedTask = requested
    ? items.value.find((item) => item.id === requested || item.a2a_task_id === requested)
    : undefined
  if (requestedTask) {
    expandedId.value = requestedTask.id
    return
  }
  if (expandedId.value && items.value.some((item) => item.id === expandedId.value)) return
  expandedId.value = items.value[0]?.id ?? null
}

async function load(): Promise<void> {
  loading.value = true
  error.value = null
  nextCursor.value = null
  hasMore.value = false
  try {
    const page = await tasksApi.list(buildParams(PAGE_LIMIT))
    items.value = page.items
    stats.value = page.stats ?? {}
    nextCursor.value = page.next_cursor
    hasMore.value = page.has_more
    syncExpandedAfterLoad()
  } catch (cause) {
    error.value = errorMessage(cause, '加载任务失败')
  } finally {
    loading.value = false
  }
}

async function loadMore(): Promise<void> {
  if (loadingMore.value || !nextCursor.value) return
  loadingMore.value = true
  try {
    const page = await tasksApi.list(buildParams(PAGE_LIMIT, nextCursor.value))
    items.value = [...items.value, ...page.items]
    stats.value = page.stats ?? stats.value
    nextCursor.value = page.next_cursor
    hasMore.value = page.has_more
  } catch (cause) {
    ElMessage.error(errorMessage(cause, '加载更多失败'))
  } finally {
    loadingMore.value = false
  }
}

/** 静默刷新：不显示 loading，保持当前已加载数量（近似）以便列表不闪烁。 */
async function silentRefresh(): Promise<void> {
  if (loading.value || loadingMore.value) return
  const limit = Math.min(100, Math.max(PAGE_LIMIT, items.value.length))
  try {
    const page = await tasksApi.list(buildParams(limit))
    items.value = page.items
    stats.value = page.stats ?? {}
    nextCursor.value = page.next_cursor
    hasMore.value = page.has_more
    if (expandedId.value && !items.value.some((item) => item.id === expandedId.value)) {
      expandedId.value = null
    } else if (expandedId.value) {
      void ensureDetail(expandedId.value, true)
    }
  } catch {
    // 轮询失败静默忽略，避免打扰用户
  }
}

async function loadAgents(): Promise<void> {
  try {
    const page = await agentsApi.list({ limit: 100 })
    agents.value = page.items
    agentsLoaded.value = true
  } catch {
    agents.value = []
    agentsLoaded.value = false
  }
}

function onKeywordInput(): void {
  if (keywordTimer !== undefined) window.clearTimeout(keywordTimer)
  keywordTimer = window.setTimeout(() => {
    void load()
  }, 400)
}

function onSegFilter(value: 'all' | A2aTaskState): void {
  if (stateFilter.value === value) return
  stateFilter.value = value
  void load()
}

function resetFilters(): void {
  stateFilter.value = 'all'
  keyword.value = ''
  agentFilter.value = ''
  from.value = ''
  to.value = ''
  void load()
}

function clearDateRange(): void {
  from.value = ''
  to.value = ''
  void load()
}

/* ------------------------------------------------------------------ */
/* 展开详情（按需拉取 GET /tasks/{id}，只为展开行取请求/产出/时间线） */
/* ------------------------------------------------------------------ */

function toggleExpanded(task: A2aTaskListItem): void {
  expandedId.value = expandedId.value === task.id ? null : task.id
}

watch(expandedId, (id) => {
  if (id) void ensureDetail(id)
})

async function ensureDetail(id: string, force = false): Promise<void> {
  if (detailLoading[id]) return
  if (!force && detailCache[id]) return
  detailLoading[id] = true
  delete detailErrors[id]
  try {
    detailCache[id] = await tasksApi.get(id)
  } catch (cause) {
    detailErrors[id] = errorMessage(cause, '加载任务详情失败')
  } finally {
    detailLoading[id] = false
  }
}

function detailFor(task: A2aTaskListItem): A2aTaskDetail | null {
  return detailCache[task.id] ?? null
}

function detailError(task: A2aTaskListItem): string {
  return detailErrors[task.id] ?? ''
}

function isDetailLoading(task: A2aTaskListItem): boolean {
  return Boolean(detailLoading[task.id])
}

/** 动作完成后同步刷新列表与已展开行的详情。 */
async function refreshAfterAction(id: string): Promise<void> {
  delete detailCache[id]
  delete detailErrors[id]
  await load()
  if (expandedId.value === id) void ensureDetail(id, true)
}

interface KvRow {
  label: string
  value: string
  mono?: boolean
}

function requestHeading(task: A2aTaskListItem): string {
  if (task.state === 'failed') return '错误'
  if (task.state === 'input_required' || task.state === 'auth_required') return '远程请求'
  return '请求'
}

function requestRows(task: A2aTaskListItem): KvRow[] {
  const detail = detailFor(task)
  if (task.state === 'input_required') {
    return [
      { label: '任务', value: task.a2a_task_id, mono: true },
      { label: '状态', value: 'A2A input-required' },
      { label: 'Run', value: task.run_id || '—', mono: true },
    ]
  }
  if (task.state === 'auth_required') {
    const scopes = detail?.auth_request?.scopes ?? []
    return [
      { label: '任务', value: task.a2a_task_id, mono: true },
      { label: '状态', value: 'A2A auth-required' },
      { label: '要求', value: scopes.length ? scopes.join(' · ') : '—' },
    ]
  }
  if (task.state === 'failed') {
    return [
      { label: '错误', value: detail?.error?.code ?? '—', mono: true },
      { label: '说明', value: detail?.error?.message ?? task.error_summary ?? '—' },
      { label: 'Run', value: task.run_id || '—', mono: true },
    ]
  }
  return [
    { label: '工具', value: detail?.request?.tool ?? '—', mono: true },
    { label: '参数', value: detail?.request?.summary ?? task.request_summary },
    { label: 'Run', value: task.run_id || '—', mono: true },
  ]
}

function requestNote(task: A2aTaskListItem): string {
  const detail = detailFor(task)
  if (task.state === 'input_required') return detail?.input_request?.question ?? ''
  if (task.state === 'auth_required') {
    const scopes = detail?.auth_request?.scopes ?? []
    return scopes.length ? `远程 Agent 请求授权：${scopes.join('、')}。` : ''
  }
  return ''
}

function safeAuthUrl(task: A2aTaskListItem): string | null {
  const url = detailFor(task)?.auth_request?.authorization_url ?? null
  return isSafeAuthorizationUrl(url) ? url : null
}

function operationHeading(task: A2aTaskListItem): string {
  if (task.state === 'completed' || task.state === 'working' || task.state === 'submitted') {
    return '产出'
  }
  return '操作'
}

function outputNote(task: A2aTaskListItem): string {
  const detail = detailFor(task)
  if (task.state === 'completed') {
    const summary = detail?.result?.artifact?.summary ?? detail?.result?.summary ?? ''
    return summary ? `产出：${summary}` : '已完成，但后端未返回产出摘要。'
  }
  if (task.state === 'failed') return '失败原因已记录到任务详情，可在所属会话中重试。'
  if (task.state === 'input_required') {
    return '补充信息后沿用同一 taskId 继续，不创建新任务；超时未补会进入 canceled。'
  }
  if (task.state === 'auth_required') {
    return safeAuthUrl(task)
      ? '授权只作用于本次远程任务；拒绝后任务进入 rejected，不会重试。'
      : '授权只作用于本次远程任务；拒绝后任务进入 rejected，不会重试。授权链接不可用，请联系管理员。'
  }
  if (task.state === 'canceled') return '任务已取消，远程运行已停止。'
  if (task.state === 'rejected') return '任务已被拒绝，不会重试。'
  return '尚未产出。任务完成后写入 artifact，并更新所属会话。'
}

interface TimelineRow {
  state: A2aTaskState
  at: string
  tone: string
  caption: string
}

/** 原型时间线展示 A2A 原始状态名（下划线换成连字符）。 */
function timelineStateLabel(state: string): string {
  return state.replace(/_/g, '-')
}

function timelineTone(state: A2aTaskState, isLast: boolean): string {
  if (!isLast) return 'is-done'
  if (state === 'failed') return 'is-error'
  if (state === 'completed' || state === 'canceled' || state === 'rejected') return 'is-done'
  return 'is-now'
}

/** 原型耗时：短任务保留秒/毫秒，长任务用 00:12 形式。 */
function formatTaskDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return '—'
  if (ms < 10_000) return formatDuration(ms)
  const totalSeconds = Math.round(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function timelineFor(task: A2aTaskListItem): TimelineRow[] {
  const detail = detailFor(task)
  const entries: Array<{
    state: A2aTaskState
    at: string
    note: string
    duration_ms: number | null
  }> = (detail?.timeline ?? []).map((entry) => ({
    state: entry.state,
    at: entry.at,
    note: entry.note,
    duration_ms: entry.duration_ms,
  }))

  if (!entries.some((entry) => entry.state === 'submitted')) {
    entries.unshift({ state: 'submitted', at: task.created_at, note: '', duration_ms: null })
  }
  // 详情尚未返回时，用列表里的 created/updated 时间给出一条真实的最小时间线。
  if (!detail && task.state !== 'submitted') {
    entries.push({
      state: task.state,
      at: task.updated_at,
      note: '',
      duration_ms: task.duration_ms,
    })
  }

  const seen = new Set<string>()
  const unique = entries.filter((entry) => {
    const key = `${entry.state}-${entry.at}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  const rows: TimelineRow[] = unique.map((entry, index) => ({
    state: entry.state,
    at: entry.at,
    tone: timelineTone(entry.state, index === unique.length - 1),
    caption: [
      formatTime(entry.at),
      entry.note,
      entry.duration_ms !== null ? `耗时 ${formatTaskDuration(entry.duration_ms)}` : '',
    ]
      .filter(Boolean)
      .join(' · '),
  }))

  // 与原型一致：进行中的任务在时间线末尾补一条灰色的「等待中」状态。
  const effectiveState = detail?.state ?? task.state
  if (effectiveState === 'working' || effectiveState === 'submitted') {
    rows.push({
      state: effectiveState === 'submitted' ? 'working' : 'completed',
      at: '',
      tone: '',
      caption: '等待中',
    })
  }
  return rows
}

function statusClass(state: string): string {
  return `st-${stateTone(state)}`
}

function statusDotClass(state: string): string {
  const tone = stateTone(state)
  if (tone === 'live') return 'is-live'
  if (tone === 'ok') return 'is-ok'
  if (tone === 'error') return 'is-warn'
  return ''
}

function openConversation(task: A2aTaskListItem): void {
  if (!task.conversation) return
  void router.push({ path: '/chat', query: { c: task.conversation.id } })
}

function openDetail(row: unknown): void {
  const task = row as A2aTaskListItem
  detailTaskId.value = task.id
  detailOpen.value = true
  if (route.query.task !== task.id) {
    void router.replace({ query: { ...route.query, task: task.id } })
  }
}

/** 允许从对话里的 A2A 卡片直接打开 `/tasks?task=<local-id>`。 */
function openFromQuery(): void {
  const taskId = queryTaskId()
  if (!taskId) return
  detailTaskId.value = taskId
  detailOpen.value = true
}

function onDetailClosed(): void {
  if (typeof route.query.task !== 'string') return
  const query = { ...route.query }
  delete query.task
  void router.replace({ query })
}

watch(detailOpen, (open) => {
  if (!open) onDetailClosed()
})

function onDetailChanged(id: string): void {
  void refreshAfterAction(id)
}

function hasAction(row: unknown, action: TaskAction): boolean {
  return (row as A2aTaskListItem).available_actions.includes(action)
}

async function quickCancel(input: unknown): Promise<void> {
  const row = input as A2aTaskListItem
  try {
    await ElMessageBox.confirm(`将取消任务 ${row.a2a_task_id}，远程运行会停止。`, '取消任务？', {
      type: 'warning',
      confirmButtonText: '取消任务',
      cancelButtonText: '返回',
    })
  } catch {
    return
  }
  try {
    await tasksApi.cancel(row.id)
    ElMessage.success('已取消')
    void refreshAfterAction(row.id)
  } catch (cause) {
    ElMessage.error(errorMessage(cause, '取消失败'))
  }
}

async function quickResume(raw: unknown): Promise<void> {
  const row = raw as A2aTaskListItem
  let input = ''
  try {
    const result = await ElMessageBox.prompt('请输入补充信息（2000 字以内）。', '补充信息', {
      inputPlaceholder: '例如：按创建时间统计',
      confirmButtonText: '提交',
      cancelButtonText: '取消',
      inputValidator: (value) => (value && value.trim().length > 0) || '补充信息不能为空',
    })
    input = result.value.trim()
  } catch {
    return
  }
  try {
    await tasksApi.resume(row.id, { input })
    ElMessage.success('已提交补充信息')
    void refreshAfterAction(row.id)
  } catch (cause) {
    ElMessage.error(errorMessage(cause, '提交补充信息失败'))
  }
}

async function quickAuthorize(raw: unknown): Promise<void> {
  const row = raw as A2aTaskListItem
  try {
    await ElMessageBox.confirm('确认你已在外部完成授权？确认后任务将重试。', '确认已授权？', {
      type: 'info',
      confirmButtonText: '已授权',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }
  try {
    await tasksApi.authorize(row.id, {})
    ElMessage.success('已授权')
    void refreshAfterAction(row.id)
  } catch (cause) {
    ElMessage.error(errorMessage(cause, '授权失败'))
  }
}

async function quickReject(raw: unknown): Promise<void> {
  const row = raw as A2aTaskListItem
  let reason = ''
  try {
    const result = await ElMessageBox.prompt('请输入拒绝原因（可选）。拒绝后任务进入「已拒绝」，不会再重试。', '拒绝任务？', {
      inputPlaceholder: '例如：暂不需要此授权',
      confirmButtonText: '确认拒绝',
      cancelButtonText: '取消',
    })
    reason = result.value.trim()
  } catch {
    return
  }
  try {
    await tasksApi.reject(row.id, { reason })
    ElMessage.success('已拒绝')
    void refreshAfterAction(row.id)
  } catch (cause) {
    ElMessage.error(errorMessage(cause, '拒绝失败'))
  }
}

function pageVisible(): boolean {
  return document.visibilityState === 'visible'
}

function stopPolling(): void {
  if (pollTimer !== undefined) {
    window.clearInterval(pollTimer)
    pollTimer = undefined
  }
}

function syncPolling(): void {
  if (hasRunning.value && pageVisible()) {
    if (pollTimer === undefined) {
      pollTimer = window.setInterval(() => {
        void silentRefresh()
      }, POLL_INTERVAL_MS)
    }
  } else {
    stopPolling()
  }
}

function onVisibilityChange(): void {
  if (pageVisible() && hasRunning.value) void silentRefresh()
  syncPolling()
}

watch(hasRunning, syncPolling)

onMounted(() => {
  document.addEventListener('visibilitychange', onVisibilityChange)
  void load()
  void loadAgents()
  openFromQuery()
})

onUnmounted(() => {
  document.removeEventListener('visibilitychange', onVisibilityChange)
  stopPolling()
  if (keywordTimer !== undefined) window.clearTimeout(keywordTimer)
})
</script>

<template>
  <PageShell>
    <PageHeader
      title="任务"
      description="跟踪主智能体发起的 A2A 任务，查看状态、产出与耗时。"
    >
      <template #actions>
        <button type="button" class="btn btn-outline" :disabled="loading" @click="load">
          <AppIcon name="refresh" />
          刷新
        </button>
      </template>
    </PageHeader>

    <div class="stats">
      <StatCard label="全部任务" :value="displayStats.total" />
      <StatCard label="运行中" :value="displayStats.working" />
      <StatCard label="等待输入" :value="displayStats.input_required" />
      <StatCard label="需要授权" :value="displayStats.auth_required" />
      <StatCard label="已完成" :value="displayStats.completed" />
      <StatCard label="失败" :value="displayStats.failed" />
    </div>

    <p v-if="!auth.isAdmin" class="note permission-note">写操作需要管理员权限。</p>

    <div class="toolbar task-toolbar">
      <div class="seg seg-wrap" role="group" aria-label="按状态筛选任务">
        <button
          v-for="option in segOptions"
          :key="option.value"
          type="button"
          :class="{ 'is-active': stateFilter === option.value }"
          @click="onSegFilter(option.value)"
        >
          {{ option.label }} <span>{{ option.count }}</span>
        </button>
      </div>

      <div class="toolbar-end">
        <label class="tool-search">
          <AppIcon name="search" />
          <input
            v-model="keyword"
            type="search"
            placeholder="任务 ID / 摘要 / Agent"
            aria-label="搜索任务"
            @input="onKeywordInput"
          />
        </label>

        <select
          v-model="stateFilter"
          class="select select-sm"
          aria-label="按状态筛选"
          @change="load"
        >
          <option v-for="option in STATE_OPTIONS" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>

        <select
          v-if="agentsLoaded"
          v-model="agentFilter"
          class="select select-sm"
          aria-label="按 Agent 筛选"
          @change="load"
        >
          <option v-for="option in agentOptions" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>

        <button
          type="button"
          class="btn btn-outline btn-sm filter-toggle"
          :class="{ 'is-on': dateFilterActive }"
          aria-label="按时间范围筛选"
          :aria-expanded="showDateFilters"
          @click="showDateFilters = !showDateFilters"
        >
          <AppIcon name="filter" />
          时间
        </button>

        <button
          v-if="hasFilters"
          type="button"
          class="text-link reset-link"
          @click="resetFilters"
        >
          重置筛选
        </button>
      </div>
    </div>

    <div v-show="showDateFilters" class="date-filters">
      <label class="date-field">
        <span>从</span>
        <input v-model="from" class="input date-input" type="date" aria-label="开始日期" @change="load" />
      </label>
      <label class="date-field">
        <span>至</span>
        <input v-model="to" class="input date-input" type="date" aria-label="结束日期" @change="load" />
      </label>
      <button v-if="dateFilterActive" type="button" class="btn btn-ghost btn-sm" @click="clearDateRange">
        清除时间范围
      </button>
      <span class="note">按任务创建时间筛选</span>
    </div>

    <ErrorState v-if="error" :message="error" @retry="load" />
    <LoadingSkeleton v-else-if="loading" />

    <template v-else>
      <div v-if="items.length > 0" class="task-table">
        <div class="task-head" aria-hidden="true">
          <span>任务</span>
          <span>远程智能体</span>
          <span>状态</span>
          <span>耗时</span>
          <span>所属会话</span>
          <span></span>
        </div>

        <details
          v-for="task in items"
          :key="task.id"
          class="task-item"
          :open="expandedId === task.id"
        >
          <summary
            class="task-summary"
            :title="task.request_summary"
            @click.prevent="toggleExpanded(task)"
          >
            <span class="task-main">
              <span class="task-id mono">{{ task.a2a_task_id }}</span>
            </span>
            <span class="task-agent">{{ task.agent.name }} <small>a2a</small></span>
            <span>
              <span class="st" :class="statusClass(task.state)">
                <span class="dot" :class="statusDotClass(task.state)"></span>
                {{ stateLabel(task.state) }}
              </span>
            </span>
            <span class="task-duration mono">{{ formatTaskDuration(task.duration_ms) }}</span>
            <span class="task-conv">{{ task.conversation?.title ?? '—' }}</span>
            <AppIcon name="chevron" class="task-chev" />
          </summary>

          <div class="task-detail">
            <div class="detail-block">
              <h4>{{ requestHeading(task) }}</h4>
              <p v-if="requestNote(task)" class="detail-note">{{ requestNote(task) }}</p>
              <p v-if="isDetailLoading(task)" class="detail-note">正在加载任务详情…</p>
              <p v-if="detailError(task)" class="detail-note is-error-text">{{ detailError(task) }}</p>
              <dl class="kv">
                <template v-for="row in requestRows(task)" :key="row.label">
                  <dt>{{ row.label }}</dt>
                  <dd :class="{ mono: row.mono }">{{ row.value }}</dd>
                </template>
              </dl>
            </div>

            <div class="detail-block">
              <h4>状态时间线</h4>
              <ol v-if="timelineFor(task).length > 0" class="task-timeline">
                <li v-for="entry in timelineFor(task)" :key="`${entry.state}-${entry.at}`" :class="entry.tone">
                  <span class="tl-dot"></span>
                  <div>
                    <b>{{ timelineStateLabel(entry.state) }}</b>
                    <small>{{ entry.caption }}</small>
                  </div>
                </li>
              </ol>
              <p v-else class="detail-note">暂无状态记录。</p>
            </div>

            <div class="detail-block wide">
              <h4>{{ operationHeading(task) }}</h4>
              <p class="detail-note" :class="{ 'is-error-text': task.state === 'failed' }">
                {{ outputNote(task) }}
              </p>

              <div class="detail-actions">
                <a
                  v-if="safeAuthUrl(task)"
                  class="btn btn-primary btn-sm"
                  :href="safeAuthUrl(task) ?? undefined"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  前往授权
                </a>
                <div class="row-actions">
                  <button
                    v-if="auth.isAdmin && hasAction(task, 'resume')"
                    type="button"
                    class="btn btn-primary btn-sm"
                    title="补充信息"
                    @click="quickResume(task)"
                  >
                    补充
                  </button>
                  <button
                    v-if="auth.isAdmin && hasAction(task, 'authorize')"
                    type="button"
                    class="btn btn-sm"
                    :class="safeAuthUrl(task) ? 'btn-outline' : 'btn-primary'"
                    title="授权"
                    @click="quickAuthorize(task)"
                  >
                    授权
                  </button>
                  <button
                    v-if="auth.isAdmin && hasAction(task, 'reject')"
                    type="button"
                    class="btn btn-outline btn-sm is-danger-text"
                    title="拒绝授权"
                    @click="quickReject(task)"
                  >
                    拒绝
                  </button>
                  <button
                    v-if="auth.isAdmin && hasAction(task, 'cancel')"
                    type="button"
                    class="btn btn-outline btn-sm is-danger-text"
                    title="取消任务"
                    @click="quickCancel(task)"
                  >
                    取消
                  </button>
                  <button
                    v-if="!auth.isAdmin || task.available_actions.length === 0"
                    type="button"
                    class="btn btn-outline btn-sm"
                    @click="openDetail(task)"
                  >
                    查看
                  </button>
                </div>

                <button
                  v-if="task.conversation"
                  type="button"
                  class="btn btn-ghost btn-sm"
                  @click="openConversation(task)"
                >
                  打开会话
                </button>
                <button
                  v-if="auth.isAdmin && task.available_actions.length > 0"
                  type="button"
                  class="btn btn-ghost btn-sm"
                  @click="openDetail(task)"
                >
                  查看详情
                </button>
              </div>
            </div>
          </div>
        </details>
      </div>

      <div v-else class="empty-state">
        还没有匹配的任务。主智能体调用远程 Agent 后，任务会出现在这里。
      </div>

      <div v-if="hasMore" class="load-more">
        <button type="button" class="btn btn-outline btn-sm" :disabled="loadingMore" @click="loadMore">
          {{ loadingMore ? '加载中…' : '加载更多' }}
        </button>
      </div>
    </template>

    <TaskDetailDrawer
      v-model="detailOpen"
      :task-id="detailTaskId"
      :can-manage="auth.isAdmin"
      @changed="onDetailChanged"
    />
  </PageShell>
</template>

<style scoped>
.toolbar-end {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
  min-width: 0;
}

.task-toolbar {
  row-gap: 8px;
}

.task-toolbar .tool-search {
  flex: 0 1 220px;
  min-width: 170px;
}

.select-sm {
  width: 106px;
  height: 28px;
  padding: 0 22px 0 8px;
  font-size: 11px;
}

.filter-toggle.is-on {
  border-color: var(--ink-3);
  color: var(--ink);
}

.reset-link {
  flex: none;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--ink-3);
  font-size: 10.5px;
  white-space: nowrap;
}

.reset-link:hover {
  color: var(--ink);
  text-decoration: underline;
}

.date-filters {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  margin: -2px 0 12px;
  padding: 8px 10px;
  border: 1px solid var(--line-2);
  border-radius: 6px;
  background: var(--surface-2);
}

.date-field {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 10px;
  color: var(--ink-3);
}

.date-input {
  height: 28px;
  font-size: 11px;
}

.permission-note {
  margin: -8px 0 14px;
}

.row-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}

.detail-note.is-error-text {
  color: var(--red);
}

.load-more {
  display: flex;
  justify-content: center;
  padding: 14px;
  border-top: 1px solid var(--line-2);
}
</style>
