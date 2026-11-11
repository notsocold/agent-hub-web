<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'

import ApprovalDetailDrawer from '@/components/approvals/ApprovalDetailDrawer.vue'
import {
  approvalRiskLabel,
  approvalRiskTone,
  approvalStatusLabel,
  approvalStatusTone,
} from '@/components/approvals/approvalMeta'
import EmptyState from '@/components/common/EmptyState.vue'
import ErrorState from '@/components/common/ErrorState.vue'
import LoadingSkeleton from '@/components/common/LoadingSkeleton.vue'
import PageHeader from '@/components/common/PageHeader.vue'
import PageShell from '@/components/common/PageShell.vue'
import StatCard from '@/components/common/StatCard.vue'
import StatusBadge from '@/components/common/StatusBadge.vue'
import { ApiRequestError } from '@/api/client'
import { approvalsApi, type ApprovalListParams } from '@/api/approvals'
import { formatDateTime } from '@/utils/format'
import type { Approval, ApprovalDecision, ApprovalDecisionResult, ApprovalStatus } from '@/types'

type ApprovalTab = 'pending' | 'history'
type HistoryStatus = Exclude<ApprovalStatus, 'pending'> | 'all'
type StatTone = 'default' | 'ok' | 'warn' | 'error'

const PAGE_LIMIT = 20
const NOTE_MAX_LENGTH = 500

const HISTORY_STATUS_OPTIONS: ReadonlyArray<{ value: HistoryStatus; label: string }> = [
  { value: 'all', label: '全部状态' },
  { value: 'approved', label: approvalStatusLabel('approved') },
  { value: 'rejected', label: approvalStatusLabel('rejected') },
  { value: 'expired', label: approvalStatusLabel('expired') },
  { value: 'canceled', label: approvalStatusLabel('canceled') },
]

const STAT_CARDS: ReadonlyArray<{ key: string; label: string; tone: StatTone }> = [
  { key: 'pending', label: '待处理', tone: 'warn' },
  { key: 'approved', label: '已批准', tone: 'ok' },
  { key: 'rejected', label: '已拒绝', tone: 'error' },
  { key: 'expired', label: '已过期', tone: 'default' },
  { key: 'canceled', label: '已取消', tone: 'default' },
]

const route = useRoute()
const router = useRouter()

function queryString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

const conversationFilter = ref(queryString(route.query.conversation_id))
const runFilter = ref(queryString(route.query.run_id))

const activeTab = ref<ApprovalTab>('pending')
const historyStatus = ref<HistoryStatus>('all')

const items = ref<Approval[]>([])
const stats = ref<Record<string, number>>({})
const loading = ref(false)
const loadingMore = ref(false)
const error = ref<string | null>(null)

const nextCursor = ref<string | null>(null)
const hasMore = ref(false)

const nowMs = ref(Date.now())

const detailOpen = ref(false)
const detailId = ref<string | null>(null)

const decisionOpen = ref(false)
const decisionTarget = ref<Approval | null>(null)
const decisionKind = ref<ApprovalDecision>('approve')
const decisionNote = ref('')
const submitting = ref(false)

const hasScopeFilter = computed(() => conversationFilter.value !== '' || runFilter.value !== '')

const conversationLabel = computed(() => {
  const matched = items.value.find((item) => item.conversation_id === conversationFilter.value)
  return matched?.conversation_title || conversationFilter.value
})

const emptyTitle = computed(() =>
  activeTab.value === 'pending' ? '暂无待处理审批' : '暂无历史审批',
)

const emptyDescription = computed(() => {
  if (hasScopeFilter.value) {
    return '当前会话或运行下没有匹配的审批记录，可清除过滤后查看全部。'
  }
  if (activeTab.value === 'pending') {
    return '高风险工具调用需要人工确认，出现后会在这里等待处理。'
  }
  return '已批准、已拒绝、已过期或已取消的审批会保留在这里，可按状态筛选。'
})

const decisionTitle = computed(() => (decisionKind.value === 'approve' ? '批准操作' : '拒绝操作'))

const decisionHint = computed(() =>
  decisionKind.value === 'approve'
    ? '批准后，该工具调用将继续执行。'
    : '拒绝后，本次工具调用不会执行，运行将继续收尾。',
)

let requestSeq = 0
let tickTimer: number | undefined
let silentInFlight = false
/** 已经触发过到期静默刷新的审批 id，避免每秒重复请求。 */
const expiryRefreshed = new Set<string>()

function errorMessage(cause: unknown, fallback: string): string {
  return cause instanceof Error ? cause.message : fallback
}

function effectiveStatus(): ApprovalStatus | 'all' {
  return activeTab.value === 'pending' ? 'pending' : historyStatus.value
}

function buildParams(limit: number, cursor?: string): ApprovalListParams {
  const params: ApprovalListParams = { status: effectiveStatus(), limit }
  if (conversationFilter.value) params.conversation_id = conversationFilter.value
  if (runFilter.value) params.run_id = runFilter.value
  if (cursor) params.cursor = cursor
  return params
}

async function load(options: { reset?: boolean; silent?: boolean } = {}): Promise<void> {
  const reset = options.reset ?? true
  const silent = options.silent ?? false
  const seq = ++requestSeq

  const cursor = reset ? undefined : (nextCursor.value ?? undefined)
  if (reset) {
    if (!silent) loading.value = true
    error.value = null
    nextCursor.value = null
    hasMore.value = false
    expiryRefreshed.clear()
  } else {
    if (!cursor) return
    loadingMore.value = true
  }

  try {
    const page = await approvalsApi.list(buildParams(PAGE_LIMIT, cursor))
    if (seq !== requestSeq) return
    if (reset) {
      items.value = page.items
    } else {
      const known = new Set(items.value.map((item) => item.id))
      items.value = [...items.value, ...page.items.filter((item) => !known.has(item.id))]
    }
    stats.value = page.stats ?? stats.value
    nextCursor.value = page.next_cursor
    hasMore.value = page.has_more
  } catch (cause) {
    if (seq !== requestSeq) return
    if (!silent) {
      if (reset) {
        error.value = errorMessage(cause, '加载审批列表失败')
      } else {
        ElMessage.error(errorMessage(cause, '加载更多失败'))
      }
    }
  } finally {
    if (seq === requestSeq) {
      loading.value = false
      loadingMore.value = false
    }
  }
}

function reload(): void {
  void load({ reset: true })
}

/**
 * 支持在审批页已打开时从对话页再次带 conversation_id/run_id 跳转。
 * 清除过滤时本地值会先更新，因此路由 query 同步后不会重复请求。
 */
watch(
  () => [queryString(route.query.conversation_id), queryString(route.query.run_id)] as const,
  ([conversationId, runId]) => {
    if (conversationId === conversationFilter.value && runId === runFilter.value) return
    conversationFilter.value = conversationId
    runFilter.value = runId
    reload()
  },
)

async function loadMore(): Promise<void> {
  if (loading.value || loadingMore.value || !nextCursor.value) return
  await load({ reset: false })
}

/** 静默刷新当前已加载范围，不改变筛选条件；失败时不打断用户。 */
async function refreshSilently(): Promise<void> {
  if (silentInFlight || loading.value || loadingMore.value) return
  silentInFlight = true
  const seq = ++requestSeq
  const limit = Math.min(100, Math.max(PAGE_LIMIT, items.value.length))
  try {
    const page = await approvalsApi.list(buildParams(limit))
    if (seq !== requestSeq) return
    items.value = page.items
    stats.value = page.stats ?? stats.value
    nextCursor.value = page.next_cursor
    hasMore.value = page.has_more
  } catch {
    // 静默刷新失败时保留当前列表；到期 id 已记录，不会每秒重复请求。
  } finally {
    silentInFlight = false
  }
}

function switchTab(tab: ApprovalTab): void {
  if (activeTab.value === tab) return
  activeTab.value = tab
  reload()
}

function asApproval(row: unknown): Approval {
  return row as Approval
}

function expiresAtMs(approval: Approval): number | null {
  if (!approval.expires_at) return null
  const timestamp = Date.parse(approval.expires_at)
  return Number.isFinite(timestamp) ? timestamp : null
}

/** status 已过期，或仍为 pending 但倒计时已归零。 */
function isExpired(row: unknown): boolean {
  const approval = asApproval(row)
  if (approval.status === 'expired') return true
  if (approval.status !== 'pending') return false
  const timestamp = expiresAtMs(approval)
  return timestamp !== null && timestamp <= nowMs.value
}

function canDecide(row: unknown): boolean {
  const approval = asApproval(row)
  return approval.status === 'pending' && !isExpired(approval)
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function formatCountdown(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000))
  const days = Math.floor(totalSeconds / 86_400)
  const hours = Math.floor((totalSeconds % 86_400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (days > 0) {
    return `${days} 天 ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
  }
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
}

function countdownLabel(row: unknown): string {
  const approval = asApproval(row)
  if (!approval.expires_at) return '—'
  if (approval.status === 'expired') return '已过期'
  if (approval.status !== 'pending') return '—'
  const timestamp = expiresAtMs(approval)
  if (timestamp === null) return '—'
  const remaining = timestamp - nowMs.value
  if (remaining <= 0) return '已过期'
  return `剩 ${formatCountdown(remaining)}`
}

function handleTick(): void {
  nowMs.value = Date.now()
  if (loading.value || loadingMore.value) return

  // 行被处理、已过期或到期时间被延长后，允许未来再次触发刷新。
  for (const id of expiryRefreshed) {
    const item = items.value.find((candidate) => candidate.id === id)
    if (!item || item.status !== 'pending' || !isExpired(item)) {
      expiryRefreshed.delete(id)
    }
  }

  const expiredNow = items.value.filter(
    (item) => item.status === 'pending' && isExpired(item) && !expiryRefreshed.has(item.id),
  )
  if (expiredNow.length === 0) return
  // 正在静默刷新时先不记 id，等下一 tick 再补一次，避免并发请求丢掉到期事件。
  if (silentInFlight) return
  for (const item of expiredNow) expiryRefreshed.add(item.id)
  // 同一 tick 内多个到期只刷新一次。
  void refreshSilently()
}

function openDetail(row: unknown): void {
  const approval = row as Approval
  detailId.value = approval.id
  detailOpen.value = true
}

function openDecision(row: unknown, decision: ApprovalDecision): void {
  const approval = row as Approval
  if (!canDecide(approval)) return
  decisionTarget.value = approval
  decisionKind.value = decision
  decisionNote.value = ''
  decisionOpen.value = true
}

function closeDecision(): void {
  if (submitting.value) return
  decisionOpen.value = false
}

function onDecisionClosed(): void {
  // 关闭过渡尚未结束时又打开了下一单，不要清空新的目标。
  if (decisionOpen.value) return
  decisionTarget.value = null
  decisionNote.value = ''
}

function notifyDecisionResult(kind: ApprovalDecision, result: ApprovalDecisionResult): void {
  if (result.resumed) {
    ElMessage.success(kind === 'approve' ? '已批准，运行将继续' : '已拒绝，运行将继续')
    return
  }
  if (result.resume_error === '本轮还有其他审批待处理') {
    ElMessage.info('已记录，本轮还有其他审批待处理')
    return
  }
  if (result.resume_error === '运行已结束' || result.resume_error === '运行不存在') {
    ElMessage.warning('审批已记录，运行已结束')
    return
  }
  ElMessage.warning(
    result.resume_error
      ? `审批已记录，但运行未能恢复：${result.resume_error}`
      : '审批已记录，但运行未能自动恢复',
  )
}

async function submitDecision(): Promise<void> {
  const target = decisionTarget.value
  if (!target || submitting.value) return
  submitting.value = true
  const kind = decisionKind.value
  const note = decisionNote.value.trim().slice(0, NOTE_MAX_LENGTH)
  try {
    const result = await approvalsApi.decide(target.id, {
      decision: kind,
      note: note || undefined,
    })
    decisionOpen.value = false
    notifyDecisionResult(kind, result)
    await load({ reset: true })
  } catch (cause) {
    if (cause instanceof ApiRequestError && cause.status === 409) {
      if (cause.code === 'approval_expired') {
        ElMessage.warning('审批已过期')
        decisionOpen.value = false
        await load({ reset: true })
        return
      }
      if (cause.code === 'approval_already_decided') {
        ElMessage.warning('审批已处理')
        decisionOpen.value = false
        await load({ reset: true })
        return
      }
    }
    ElMessage.error(errorMessage(cause, '提交决策失败'))
  } finally {
    submitting.value = false
  }
}

function clearScopeFilter(): void {
  if (!hasScopeFilter.value) return
  conversationFilter.value = ''
  runFilter.value = ''
  const query = { ...route.query }
  delete query.conversation_id
  delete query.run_id
  void router.replace({ query })
  reload()
}

onMounted(() => {
  tickTimer = window.setInterval(handleTick, 1000)
  void load({ reset: true })
})

onUnmounted(() => {
  if (tickTimer !== undefined) {
    window.clearInterval(tickTimer)
    tickTimer = undefined
  }
})
</script>

<template>
  <PageShell>
    <PageHeader
      eyebrow="APPROVALS"
      title="审批"
      description="高风险工具调用需要人工确认；批准后运行继续，拒绝则跳过该次调用。"
    >
      <template #actions>
        <button type="button" class="btn" :disabled="loading" @click="reload">刷新</button>
      </template>
    </PageHeader>

    <div v-if="hasScopeFilter" class="scope-bar" data-testid="scope-filter">
      <span class="scope-prefix">当前筛选</span>
      <span v-if="conversationFilter" class="scope-chip" :title="`会话 ID：${conversationFilter}`">
        会话：{{ conversationLabel }}
      </span>
      <span v-if="runFilter" class="scope-chip mono" :title="`Run ID：${runFilter}`">
        Run：{{ runFilter }}
      </span>
      <button
        type="button"
        class="link scope-clear"
        data-testid="clear-scope-filter"
        @click="clearScopeFilter"
      >
        清除会话过滤
      </button>
    </div>

    <div class="stat-row" data-testid="approval-stats">
      <StatCard
        v-for="card in STAT_CARDS"
        :key="card.key"
        :label="card.label"
        :value="stats[card.key] ?? 0"
        :tone="card.tone"
      />
    </div>

    <div class="list-head">
      <div class="tabs" role="tablist" aria-label="审批分类">
        <button
          type="button"
          role="tab"
          class="tab"
          :class="{ 'is-active': activeTab === 'pending' }"
          :aria-selected="activeTab === 'pending'"
          data-testid="approval-tab-pending"
          @click="switchTab('pending')"
        >
          待处理
        </button>
        <button
          type="button"
          role="tab"
          class="tab"
          :class="{ 'is-active': activeTab === 'history' }"
          :aria-selected="activeTab === 'history'"
          data-testid="approval-tab-history"
          @click="switchTab('history')"
        >
          历史
        </button>
      </div>

      <select
        v-if="activeTab === 'history'"
        v-model="historyStatus"
        class="input history-filter"
        data-testid="history-status-filter"
        aria-label="按状态筛选历史审批"
        @change="reload"
      >
        <option v-for="option in HISTORY_STATUS_OPTIONS" :key="option.value" :value="option.value">
          {{ option.label }}
        </option>
      </select>

      <span class="list-count mono">{{ items.length }}{{ hasMore ? '+' : '' }}</span>
    </div>

    <ErrorState v-if="error" :message="error" @retry="reload" />
    <LoadingSkeleton v-else-if="loading" />

    <div v-else class="table-card">
      <el-table :data="items" style="width: 100%" @row-click="openDetail">
        <el-table-column label="工具" min-width="172">
          <template #default="{ row }">
            <div class="tool-cell">
              <span class="tool-name" data-testid="approval-tool">
                {{ row.tool_display_name || row.tool_name }}
              </span>
              <span
                v-if="row.tool_display_name && row.tool_display_name !== row.tool_name"
                class="tool-sub mono"
              >
                {{ row.tool_name }}
              </span>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="风险" width="108">
          <template #default="{ row }">
            <StatusBadge :tone="approvalRiskTone(row.risk)" :label="approvalRiskLabel(row.risk)" />
          </template>
        </el-table-column>

        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <StatusBadge
              :tone="approvalStatusTone(row.status)"
              :label="approvalStatusLabel(row.status)"
            />
          </template>
        </el-table-column>

        <el-table-column label="来源" width="96">
          <template #default="{ row }">
            <span class="muted">{{ row.source || '—' }}</span>
          </template>
        </el-table-column>

        <el-table-column label="会话" min-width="160">
          <template #default="{ row }">
            <span class="ellipsis" :title="row.conversation_title">
              {{ row.conversation_title || '—' }}
            </span>
          </template>
        </el-table-column>

        <el-table-column label="目标" min-width="170">
          <template #default="{ row }">
            <span class="target" :title="row.target">{{ row.target || '—' }}</span>
          </template>
        </el-table-column>

        <el-table-column label="创建时间" width="150">
          <template #default="{ row }">
            <span class="muted mono">{{ formatDateTime(row.created_at) }}</span>
          </template>
        </el-table-column>

        <el-table-column label="过期倒计时" width="138">
          <template #default="{ row }">
            <span class="mono countdown" :class="{ 'is-expired': isExpired(row) }">
              {{ countdownLabel(row) }}
            </span>
          </template>
        </el-table-column>

        <el-table-column label="操作" width="196">
          <template #default="{ row }">
            <div class="row-actions" @click.stop>
              <button
                type="button"
                class="link"
                :data-testid="`view-${row.id}`"
                @click="openDetail(row)"
              >
                查看
              </button>
              <template v-if="row.status === 'pending' || row.status === 'expired'">
                <button
                  type="button"
                  class="link"
                  :disabled="!canDecide(row)"
                  :data-testid="`approve-${row.id}`"
                  @click="openDecision(row, 'approve')"
                >
                  批准
                </button>
                <button
                  type="button"
                  class="link danger"
                  :disabled="!canDecide(row)"
                  :data-testid="`reject-${row.id}`"
                  @click="openDecision(row, 'reject')"
                >
                  拒绝
                </button>
              </template>
            </div>
          </template>
        </el-table-column>

        <template #empty>
          <EmptyState :title="emptyTitle" :description="emptyDescription" />
        </template>
      </el-table>

      <div v-if="hasMore" class="load-more">
        <button
          type="button"
          class="btn"
          data-testid="load-more"
          :disabled="loadingMore"
          @click="loadMore"
        >
          {{ loadingMore ? '加载中…' : '加载更多' }}
        </button>
      </div>
    </div>

    <ApprovalDetailDrawer v-model="detailOpen" :approval-id="detailId" />

    <el-dialog
      v-model="decisionOpen"
      :title="decisionTitle"
      width="min(460px, 92vw)"
      :close-on-click-modal="false"
      :close-on-press-escape="!submitting"
      :show-close="!submitting"
      @closed="onDecisionClosed"
    >
      <div v-if="decisionTarget" class="decision">
        <p class="decision-lead">{{ decisionHint }}</p>

        <p
          v-if="decisionKind === 'approve' && decisionTarget.risk === 'destructive'"
          class="decision-warning"
        >
          该操作具有破坏性，请确认目标与影响范围。
        </p>

        <dl class="decision-facts">
          <div>
            <dt>工具</dt>
            <dd>{{ decisionTarget.tool_display_name || decisionTarget.tool_name }}</dd>
          </div>
          <div>
            <dt>风险</dt>
            <dd>
              <StatusBadge
                :tone="approvalRiskTone(decisionTarget.risk)"
                :label="approvalRiskLabel(decisionTarget.risk)"
              />
            </dd>
          </div>
          <div class="wide">
            <dt>目标</dt>
            <dd>{{ decisionTarget.target || '—' }}</dd>
          </div>
          <div v-if="decisionTarget.reason" class="wide">
            <dt>原因</dt>
            <dd>{{ decisionTarget.reason }}</dd>
          </div>
        </dl>

        <label class="note-label" for="decision-note">备注（可选，500 字以内）</label>
        <textarea
          id="decision-note"
          v-model="decisionNote"
          class="note-input"
          data-testid="decision-note"
          rows="3"
          :maxlength="NOTE_MAX_LENGTH"
          placeholder="补充批准或拒绝的说明，可留空"
        ></textarea>
        <p class="note-count mono">{{ decisionNote.length }} / {{ NOTE_MAX_LENGTH }}</p>
      </div>

      <template #footer>
        <div class="dialog-actions">
          <button type="button" class="btn" :disabled="submitting" @click="closeDecision">
            取消
          </button>
          <button
            type="button"
            class="btn"
            :class="decisionKind === 'approve' ? 'primary' : 'danger-solid'"
            data-testid="confirm-decision"
            :disabled="submitting || !decisionTarget"
            @click="submitDecision"
          >
            {{ submitting ? '提交中…' : decisionKind === 'approve' ? '确认批准' : '确认拒绝' }}
          </button>
        </div>
      </template>
    </el-dialog>
  </PageShell>
</template>

<style scoped>
.scope-bar {
  display: flex;
  flex: none;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border: 1px solid var(--amber-soft);
  border-radius: 8px;
  background: var(--amber-soft);
  color: var(--ink-2);
  font-size: 11px;
}

.scope-prefix {
  color: var(--ink-3);
  font-size: 10px;
  letter-spacing: 0.04em;
}

.scope-chip {
  overflow: hidden;
  max-width: 320px;
  padding: 1px 8px;
  border: 1px solid var(--line);
  border-radius: 99px;
  background: var(--surface);
  color: var(--ink-2);
  font-size: 10.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.scope-clear {
  margin-left: auto;
  font-size: 11px;
}

.list-head {
  display: flex;
  flex: none;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.tabs {
  display: inline-flex;
  gap: 2px;
  padding: 2px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface-2);
}

.tab {
  height: 28px;
  padding: 0 16px;
  border-radius: 6px;
  color: var(--ink-3);
  font-size: 12px;
  font-weight: 550;
  transition:
    background 0.15s,
    color 0.15s;
}

.tab:hover {
  color: var(--ink);
}

.tab.is-active {
  background: var(--surface);
  box-shadow: var(--shadow-sm);
  color: var(--ink);
}

.history-filter {
  width: 118px;
}

.list-count {
  margin-left: auto;
  color: var(--ink-3);
  font-size: 10.5px;
}

.tool-cell {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.tool-name {
  overflow: hidden;
  color: var(--ink);
  font-size: 12px;
  font-weight: 550;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tool-sub {
  overflow: hidden;
  color: var(--ink-3);
  font-size: 9.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.muted {
  color: var(--ink-3);
  font-size: 11px;
}

.ellipsis,
.target {
  display: inline-block;
  overflow: hidden;
  max-width: 100%;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: bottom;
}

.ellipsis {
  color: var(--ink-2);
  font-size: 11.5px;
}

.target {
  color: var(--ink-2);
  font-size: 11px;
}

.countdown {
  color: var(--ink-2);
  font-size: 11px;
  white-space: nowrap;
}

.countdown.is-expired {
  color: var(--red);
  font-weight: 600;
}

.row-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.link {
  color: var(--prussian);
  font-size: 11.5px;
  white-space: nowrap;
}

.link:hover:not(:disabled) {
  text-decoration: underline;
}

.link.danger {
  color: var(--red);
}

.link:disabled {
  cursor: not-allowed;
  opacity: 0.4;
}

.load-more {
  display: flex;
  justify-content: center;
  padding: 14px;
  border-top: 1px solid var(--line-2);
}

.decision {
  display: flex;
  flex-direction: column;
  gap: 9px;
}

.decision-lead {
  color: var(--ink-2);
  font-size: 12px;
  line-height: 1.65;
}

.decision-warning {
  padding: 7px 9px;
  border: 1px solid var(--red-soft);
  border-radius: 6px;
  background: var(--red-soft);
  color: var(--red);
  font-size: 11px;
}

.decision-facts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 7px 14px;
  margin: 0;
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: 7px;
  background: var(--surface-2);
}

.decision-facts .wide {
  grid-column: 1 / -1;
}

.decision-facts dt {
  color: var(--ink-3);
  font-size: 10px;
}

.decision-facts dd {
  margin: 2px 0 0;
  overflow-wrap: anywhere;
  color: var(--ink);
  font-size: 11.5px;
}

.note-label {
  margin-top: 2px;
  color: var(--ink-3);
  font-size: 10.5px;
}

.note-input {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--surface);
  color: var(--ink);
  font: inherit;
  font-size: 12px;
  line-height: 1.6;
  resize: vertical;
}

.note-input:focus {
  border-color: var(--ink-3);
}

.note-input::placeholder {
  color: var(--ink-3);
}

.note-count {
  margin-top: -4px;
  color: var(--ink-3);
  font-size: 10px;
  text-align: right;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.btn.danger-solid {
  border-color: var(--red);
  background: var(--red);
  color: var(--surface);
}

.btn.danger-solid:hover:not(:disabled) {
  filter: brightness(1.06);
}

@media (max-width: 700px) {
  .scope-clear {
    margin-left: 0;
  }

  .list-count {
    margin-left: 0;
  }
}
</style>
