<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'

import EmptyState from '@/components/common/EmptyState.vue'
import ErrorState from '@/components/common/ErrorState.vue'
import LoadingBlock from '@/components/common/LoadingBlock.vue'
import PageHeader from '@/components/common/PageHeader.vue'
import PageShell from '@/components/common/PageShell.vue'
import StatCard from '@/components/common/StatCard.vue'
import StatusBadge from '@/components/common/StatusBadge.vue'
import { tasksApi } from '@/api/tasks'
import { formatDateTime, formatDuration } from '@/utils/format'
import type { A2aTaskDetail, A2aTaskListItem, A2aTaskState } from '@/types'

const items = ref<A2aTaskListItem[]>([])
const stats = ref<Record<string, number>>({})
const loading = ref(false)
const error = ref<string | null>(null)
const stateFilter = ref<'all' | A2aTaskState>('all')

const detailOpen = ref(false)
const detailLoading = ref(false)
const detail = ref<A2aTaskDetail | null>(null)

const STATE_LABELS: Record<A2aTaskState, string> = {
  submitted: '已提交',
  working: '运行中',
  input_required: '等待输入',
  auth_required: '需要授权',
  completed: '已完成',
  failed: '失败',
  canceled: '已取消',
  rejected: '已拒绝',
}

const STATE_TONES: Record<A2aTaskState, 'ok' | 'warn' | 'error' | 'muted' | 'live'> = {
  submitted: 'live',
  working: 'live',
  input_required: 'warn',
  auth_required: 'warn',
  completed: 'ok',
  failed: 'error',
  canceled: 'muted',
  rejected: 'muted',
}

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

function stateLabel(state: string): string {
  return STATE_LABELS[state as A2aTaskState] ?? state
}

function stateTone(state: string): 'ok' | 'warn' | 'error' | 'muted' | 'live' {
  return STATE_TONES[state as A2aTaskState] ?? 'muted'
}

async function load(): Promise<void> {
  loading.value = true
  error.value = null
  try {
    const page = await tasksApi.list({
      state: stateFilter.value === 'all' ? undefined : stateFilter.value,
      limit: 50,
    })
    items.value = page.items
    stats.value = page.stats ?? {}
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '加载任务失败'
  } finally {
    loading.value = false
  }
}

async function openDetail(row: A2aTaskListItem): Promise<void> {
  detailOpen.value = true
  detailLoading.value = true
  detail.value = null
  try {
    detail.value = await tasksApi.get(row.id)
  } catch (cause) {
    ElMessage.error(cause instanceof Error ? cause.message : '加载任务详情失败')
  } finally {
    detailLoading.value = false
  }
}

function notReady(label: string): void {
  ElMessage.info(`${label}将在 M2 接入，当前仅展示任务列表与状态时间线。`)
}

onMounted(load)
</script>

<template>
  <PageShell>
    <PageHeader
      eyebrow="A2A TASKS"
      title="任务"
      description="跟踪主智能体发起的远程 A2A 任务；等待输入、需要授权与终态都会反映在同一条状态时间线上。"
    >
      <template #actions>
        <button type="button" class="btn" @click="notReady('任务筛选导出')">导出</button>
      </template>
    </PageHeader>

    <div class="stat-row">
      <StatCard label="全部任务" :value="stats.total ?? items.length" />
      <StatCard label="等待输入" :value="stats.input_required ?? 0" tone="warn" />
      <StatCard label="需要授权" :value="stats.auth_required ?? 0" tone="warn" />
      <StatCard label="失败" :value="stats.failed ?? 0" tone="error" />
    </div>

    <div class="toolbar">
      <select v-model="stateFilter" class="input" aria-label="按状态筛选" @change="load">
        <option v-for="option in STATE_OPTIONS" :key="option.value" :value="option.value">
          {{ option.label }}
        </option>
      </select>
    </div>

    <ErrorState v-if="error" :message="error" @retry="load" />
    <LoadingBlock v-else-if="loading" label="正在加载任务…" />

    <div v-else class="table-card">
      <el-table :data="items" style="width: 100%" @row-click="openDetail">
        <el-table-column label="任务 ID" width="130">
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
        <el-table-column label="创建时间" width="160">
          <template #default="{ row }">
            <span class="muted mono">{{ formatDateTime(row.created_at) }}</span>
          </template>
        </el-table-column>
        <template #empty>
          <EmptyState
            title="还没有匹配的任务"
            description="主智能体调用远程 Agent 后，任务会出现在这里；点击任意行查看请求、结果与时间线。"
          />
        </template>
      </el-table>
    </div>

    <el-drawer v-model="detailOpen" title="任务详情" size="440px" :append-to-body="true">
      <LoadingBlock v-if="detailLoading" label="正在加载任务详情…" />

      <div v-else-if="detail" class="detail">
        <div class="detail-head">
          <StatusBadge :tone="stateTone(detail.state)" :label="stateLabel(detail.state)" />
          <span class="mono muted">{{ detail.a2a_task_id }}</span>
        </div>

        <dl class="facts">
          <div>
            <dt>智能体</dt>
            <dd>{{ detail.agent.name }}</dd>
          </div>
          <div>
            <dt>会话</dt>
            <dd>{{ detail.conversation?.title ?? '—' }}</dd>
          </div>
          <div>
            <dt>Run</dt>
            <dd class="mono ellipsis">{{ detail.run_id }}</dd>
          </div>
          <div>
            <dt>耗时</dt>
            <dd class="mono">{{ formatDuration(detail.duration_ms) }}</dd>
          </div>
        </dl>

        <section v-if="detail.request">
          <h3>请求</h3>
          <p>{{ detail.request.summary }}</p>
        </section>

        <section v-if="detail.result">
          <h3>结果</h3>
          <p>{{ detail.result.summary }}</p>
        </section>

        <section v-if="detail.input_request" class="callout">
          <h3>等待补充信息</h3>
          <p>{{ detail.input_request.question }}</p>
        </section>

        <section v-if="detail.auth_request" class="callout">
          <h3>需要授权</h3>
          <p>scopes：{{ detail.auth_request.scopes.join(', ') || '—' }}</p>
        </section>

        <section v-if="detail.error" class="callout is-error">
          <h3>错误</h3>
          <p>{{ detail.error.message }}</p>
        </section>

        <section>
          <h3>状态时间线</h3>
          <ol class="timeline">
            <li v-for="entry in detail.timeline" :key="`${entry.state}-${entry.at}`">
              <span class="dot" :class="`tone-${stateTone(entry.state)}`"></span>
              <span class="timeline-state">{{ stateLabel(entry.state) }}</span>
              <span class="muted mono">{{ formatDateTime(entry.at) }}</span>
              <span v-if="entry.note" class="timeline-note">{{ entry.note }}</span>
            </li>
          </ol>
        </section>

        <div class="actions">
          <button type="button" class="btn" @click="notReady('补充信息')">补充信息</button>
          <button type="button" class="btn" @click="notReady('前往授权')">前往授权</button>
          <button type="button" class="btn" @click="notReady('拒绝任务')">拒绝</button>
          <button type="button" class="btn primary" @click="notReady('取消任务')">取消任务</button>
        </div>
      </div>
    </el-drawer>
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

.detail {
  display: flex;
  flex-direction: column;
  gap: 16px;
  color: var(--ink-2);
  font-size: 12px;
}

.detail-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.facts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px 14px;
  margin: 0;
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
}

.facts dt {
  color: var(--ink-3);
  font-size: 10px;
}

.facts dd {
  margin: 2px 0 0;
  color: var(--ink);
  font-size: 11.5px;
}

h3 {
  margin: 0 0 5px;
  color: var(--ink);
  font-size: 11.5px;
  font-weight: 600;
}

section p {
  margin: 0;
  line-height: 1.7;
}

.callout {
  padding: 10px 12px;
  border: 1px solid var(--amber-soft);
  border-radius: 7px;
  background: var(--amber-soft);
}

.callout.is-error {
  border-color: var(--red-soft);
  background: var(--red-soft);
  color: var(--red);
}

.timeline {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.timeline li {
  display: grid;
  grid-template-columns: 8px auto auto 1fr;
  gap: 8px;
  align-items: center;
}

.timeline .dot {
  width: 6px;
  height: 6px;
  background: var(--ink-3);
}

.timeline .tone-ok {
  background: var(--green);
}

.timeline .tone-warn {
  background: var(--amber);
}

.timeline .tone-error {
  background: var(--red);
}

.timeline-state {
  color: var(--ink);
  font-size: 11.5px;
}

.timeline-note {
  color: var(--ink-3);
  font-size: 10.5px;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding-top: 4px;
}
</style>
