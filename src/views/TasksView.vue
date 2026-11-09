<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'

import EmptyState from '@/components/common/EmptyState.vue'
import ErrorState from '@/components/common/ErrorState.vue'
import LoadingBlock from '@/components/common/LoadingBlock.vue'
import PageHeader from '@/components/common/PageHeader.vue'
import PageShell from '@/components/common/PageShell.vue'
import StatCard from '@/components/common/StatCard.vue'
import StatusBadge from '@/components/common/StatusBadge.vue'
import TaskDetailDrawer from '@/components/tasks/TaskDetailDrawer.vue'
import { agentsApi } from '@/api/agents'
import { tasksApi, type TaskListParams } from '@/api/tasks'
import { formatDateTime, formatDuration } from '@/utils/format'
import { isRunningState, stateLabel, stateTone } from '@/components/tasks/taskMeta'
import type { A2aTaskListItem, A2aTaskState, Agent, TaskAction } from '@/types'

const route = useRoute()
const router = useRouter()

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

const nextCursor = ref<string | null>(null)
const hasMore = ref(false)

const agents = ref<Agent[]>([])
const agentsLoaded = ref(false)

const detailOpen = ref(false)
const detailTaskId = ref<string | null>(null)

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

const displayStats = computed(() => ({
  total: stats.value.total ?? items.value.length,
  input_required:
    stats.value.input_required ??
    items.value.filter((item) => item.state === 'input_required').length,
  auth_required:
    stats.value.auth_required ?? items.value.filter((item) => item.state === 'auth_required').length,
  failed: stats.value.failed ?? items.value.filter((item) => item.state === 'failed').length,
}))

const hasRunning = computed(() => items.value.some((item) => isRunningState(item.state)))

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

function resetFilters(): void {
  stateFilter.value = 'all'
  keyword.value = ''
  agentFilter.value = ''
  from.value = ''
  to.value = ''
  void load()
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
  const taskId = route.query.task
  if (typeof taskId !== 'string' || !taskId) return
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

function onDetailChanged(): void {
  void load()
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
    void load()
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
    void load()
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
    void load()
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
    void load()
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
      eyebrow="A2A TASKS"
      title="任务"
      description="跟踪主智能体发起的远程 A2A 任务；等待输入、需要授权与终态都会反映在同一条状态时间线上。"
    >
      <template #actions>
        <button type="button" class="btn" :disabled="loading" @click="load">刷新</button>
      </template>
    </PageHeader>

    <div class="stat-row">
      <StatCard label="全部任务" :value="displayStats.total" />
      <StatCard label="等待输入" :value="displayStats.input_required" tone="warn" />
      <StatCard label="需要授权" :value="displayStats.auth_required" tone="warn" />
      <StatCard label="失败" :value="displayStats.failed" tone="error" />
    </div>

    <div class="toolbar">
      <select v-model="stateFilter" class="input" aria-label="按状态筛选" @change="load">
        <option v-for="option in STATE_OPTIONS" :key="option.value" :value="option.value">
          {{ option.label }}
        </option>
      </select>

      <select
        v-if="agentsLoaded"
        v-model="agentFilter"
        class="input"
        aria-label="按 Agent 筛选"
        @change="load"
      >
        <option v-for="option in agentOptions" :key="option.value" :value="option.value">
          {{ option.label }}
        </option>
      </select>

      <input
        v-model="keyword"
        class="input search"
        type="search"
        placeholder="搜索任务 ID / 摘要 / Agent"
        aria-label="搜索任务"
        @input="onKeywordInput"
      />

      <label class="date-range">
        <span class="date-label">从</span>
        <input v-model="from" class="input" type="date" aria-label="开始日期" @change="load" />
      </label>
      <label class="date-range">
        <span class="date-label">至</span>
        <input v-model="to" class="input" type="date" aria-label="结束日期" @change="load" />
      </label>

      <button type="button" class="btn" @click="resetFilters">重置筛选</button>
    </div>

    <ErrorState v-if="error" :message="error" @retry="load" />
    <LoadingBlock v-else-if="loading" label="正在加载任务…" />

    <div v-else class="table-card">
      <el-table :data="items" style="width: 100%" @row-click="openDetail">
        <el-table-column label="任务 ID" width="120">
          <template #default="{ row }">
            <span class="mono">{{ row.a2a_task_id }}</span>
          </template>
        </el-table-column>
        <el-table-column label="智能体" min-width="150">
          <template #default="{ row }">{{ row.agent.name }}</template>
        </el-table-column>
        <el-table-column label="状态" width="112">
          <template #default="{ row }">
            <StatusBadge :tone="stateTone(row.state)" :label="stateLabel(row.state)" />
          </template>
        </el-table-column>
        <el-table-column label="请求摘要" min-width="240">
          <template #default="{ row }">
            <span class="summary">{{ row.request_summary }}</span>
          </template>
        </el-table-column>
        <el-table-column label="耗时" width="92">
          <template #default="{ row }">
            <span class="muted mono">{{ formatDuration(row.duration_ms) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="所属会话" min-width="170">
          <template #default="{ row }">
            <span class="muted ellipsis">{{ row.conversation?.title ?? '—' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="创建时间" width="150">
          <template #default="{ row }">
            <span class="muted mono">{{ formatDateTime(row.created_at) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="230">
          <template #default="{ row }">
            <div class="row-actions" @click.stop>
              <button
                v-if="hasAction(row, 'resume')"
                type="button"
                class="link"
                @click="quickResume(row)"
              >
                补充
              </button>
              <button
                v-if="hasAction(row, 'authorize')"
                type="button"
                class="link"
                @click="quickAuthorize(row)"
              >
                授权
              </button>
              <button
                v-if="hasAction(row, 'reject')"
                type="button"
                class="link danger"
                @click="quickReject(row)"
              >
                拒绝
              </button>
              <button
                v-if="hasAction(row, 'cancel')"
                type="button"
                class="link danger"
                @click="quickCancel(row)"
              >
                取消
              </button>
              <button
                v-if="!row.available_actions.length"
                type="button"
                class="link"
                @click="openDetail(row)"
              >
                查看
              </button>
            </div>
          </template>
        </el-table-column>
        <template #empty>
          <EmptyState
            title="还没有匹配的任务"
            description="主智能体调用远程 Agent 后，任务会出现在这里；点击任意行查看请求、结果与时间线。"
          />
        </template>
      </el-table>

      <div v-if="hasMore" class="load-more">
        <button type="button" class="btn" :disabled="loadingMore" @click="loadMore">
          {{ loadingMore ? '加载中…' : '加载更多' }}
        </button>
      </div>
    </div>

    <TaskDetailDrawer
      v-model="detailOpen"
      :task-id="detailTaskId"
      @changed="onDetailChanged"
    />
  </PageShell>
</template>

<style scoped>
.muted {
  color: var(--ink-3);
  font-size: 11px;
}

.summary {
  color: var(--ink-2);
}

.ellipsis {
  display: inline-block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: bottom;
}

.search {
  min-width: 220px;
  flex: 1;
  max-width: 320px;
}

.date-range {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.date-label {
  color: var(--ink-3);
  font-size: 11px;
}

.row-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.link {
  color: var(--prussian);
  font-size: 11.5px;
  white-space: nowrap;
}

.link:hover {
  text-decoration: underline;
}

.link.danger {
  color: var(--red);
}

.load-more {
  display: flex;
  justify-content: center;
  padding: 14px;
  border-top: 1px solid var(--line-2);
}
</style>
