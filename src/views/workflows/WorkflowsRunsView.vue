<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'

import EmptyState from '@/components/common/EmptyState.vue'
import ErrorState from '@/components/common/ErrorState.vue'
import LoadingSkeleton from '@/components/common/LoadingSkeleton.vue'
import PageHeader from '@/components/common/PageHeader.vue'
import PageShell from '@/components/common/PageShell.vue'
import StatusBadge from '@/components/common/StatusBadge.vue'
import { ApiRequestError } from '@/api/client'
import { workflowsApi } from '@/api/workflows'
import { formatDateTime, formatDuration } from '@/utils/format'
import type { WorkflowRun } from '@/types'

const route = useRoute()
const router = useRouter()

const items = ref<WorkflowRun[]>([])
const loading = ref(true)
const loadingMore = ref(false)
const error = ref<string | null>(null)
/** 出错时的 ApiRequestError.code（业务错误 not_found/forbidden 展示固定文案）。 */
const errorCode = ref<string | null>(null)
const nextCursor = ref<string | null>(null)
const hasMore = ref(false)

const workflowId = computed(() => String(route.params.id ?? ''))

/** not_found/forbidden 是业务错误：重试无意义，ErrorState 隐藏重试按钮。 */
const isBizError = computed(
  () => errorCode.value === 'not_found' || errorCode.value === 'forbidden',
)

/** 「加载更多」仅在后端确认还有下一页且给了游标时显示。 */
const canLoadMore = computed(() => hasMore.value && nextCursor.value !== null)

/**
 * run 状态 → StatusBadge 语义色（plan F3 指定值）：
 * succeeded→ok；running/failed→warn；canceled/interrupted→muted；未知值降级 muted。
 */
const STATUS_TONES: Record<string, 'ok' | 'warn' | 'muted'> = {
  succeeded: 'ok',
  running: 'warn',
  failed: 'warn',
  canceled: 'muted',
  interrupted: 'muted',
}

/** run 状态中文标签（与 AdminDictionariesView 的枚举字典对齐；历史快照视角用「已中断」）。 */
const STATUS_LABELS: Record<string, string> = {
  queued: '排队',
  running: '运行中',
  succeeded: '成功',
  failed: '失败',
  canceled: '已取消',
  interrupted: '已中断',
}

function statusTone(status: string): 'ok' | 'warn' | 'muted' {
  return STATUS_TONES[status] ?? 'muted'
}

function statusLabel(status: string | null): string {
  if (!status) return '—'
  return STATUS_LABELS[status] ?? status
}

/**
 * 错误分支按 ApiRequestError.code 判定（错误 message 可能被 client 层统一改写，
 * 不能直接展示）：404 → 工作流不存在；403（系统模板）→ 仅模板创建者可查看；
 * 其余错误透传原始 message（可重试）。
 */
function errorInfo(cause: unknown): { message: string; code: string | null } {
  if (cause instanceof ApiRequestError) {
    if (cause.code === 'not_found') {
      return { message: '工作流不存在', code: cause.code }
    }
    if (cause.code === 'forbidden') {
      return { message: '运行历史仅模板创建者可查看', code: cause.code }
    }
    return { message: cause.message || '加载运行历史失败', code: cause.code }
  }
  return { message: cause instanceof Error ? cause.message : '加载运行历史失败', code: null }
}

async function load(): Promise<void> {
  loading.value = true
  error.value = null
  errorCode.value = null
  nextCursor.value = null
  hasMore.value = false
  try {
    const page = await workflowsApi.listRuns(workflowId.value)
    items.value = page.items
    nextCursor.value = page.next_cursor
    hasMore.value = page.has_more
  } catch (cause) {
    const info = errorInfo(cause)
    error.value = info.message
    errorCode.value = info.code
  } finally {
    loading.value = false
  }
}

/** 游标追加下一页：只追加不重置，失败用 toast 提示并保留已加载记录。 */
async function loadMore(): Promise<void> {
  if (loadingMore.value || !nextCursor.value) return
  loadingMore.value = true
  try {
    const page = await workflowsApi.listRuns(workflowId.value, { cursor: nextCursor.value })
    items.value = [...items.value, ...page.items]
    nextCursor.value = page.next_cursor
    hasMore.value = page.has_more
  } catch {
    ElMessage.error('加载更多失败')
  } finally {
    loadingMore.value = false
  }
}

async function copyRunId(run: WorkflowRun): Promise<void> {
  try {
    await navigator.clipboard.writeText(run.run_id)
    ElMessage.success('已复制 run_id')
  } catch {
    ElMessage.error('复制失败，请手动选择内容')
  }
}

onMounted(() => {
  void load()
})
</script>

<template>
  <PageShell>
    <PageHeader
      eyebrow="WORKFLOWS"
      title="运行历史"
      description="查看该模板发起的执行记录快照；完整的运行轨迹与人工审批仍在对话中完成。"
    >
      <template #actions>
        <button
          type="button"
          class="btn"
          data-testid="runs-back"
          @click="router.push('/workflows')"
        >
          返回列表
        </button>
      </template>
    </PageHeader>

    <!-- 业务错误（not_found/forbidden）重试无意义，隐藏重试按钮 -->
    <ErrorState
      v-if="error"
      :message="error"
      :retryable="!isBizError"
      @retry="load"
    />
    <LoadingSkeleton v-else-if="loading" />
    <EmptyState
      v-else-if="items.length === 0"
      title="该模板还没有运行记录"
      description="在对话中发起这条工作流后，每次执行都会在这里留下一条记录。"
    />

    <div v-else class="runs-list">
      <article
        v-for="run in items"
        :key="run.id"
        class="run-row"
        data-testid="run-row"
      >
        <div class="run-main">
          <StatusBadge :tone="statusTone(run.status)" :label="statusLabel(run.status)" />
          <button
            type="button"
            class="run-id mono"
            data-testid="run-copy"
            :title="`点击复制 run_id：${run.run_id}`"
            @click="copyRunId(run)"
          >
            {{ run.run_id }}
          </button>
        </div>
        <div class="run-meta mono">
          <span>发起 {{ formatDateTime(run.created_at) }}</span>
          <span>·</span>
          <span>终态 {{ statusLabel(run.run_status) }}</span>
          <span>·</span>
          <span>耗时 {{ formatDuration(run.run_duration_ms) }}</span>
          <span>·</span>
          <span>错误码 {{ run.run_error_code ?? '—' }}</span>
        </div>
      </article>
    </div>

    <div v-if="canLoadMore" class="load-more">
      <button
        type="button"
        class="btn"
        data-testid="runs-load-more"
        :disabled="loadingMore"
        @click="loadMore"
      >
        {{ loadingMore ? '加载中…' : '加载更多' }}
      </button>
    </div>
  </PageShell>
</template>

<style scoped>
.runs-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.run-row {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 16px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--surface);
}

.run-main {
  display: flex;
  align-items: center;
  gap: 10px;
}

.run-id {
  max-width: 320px;
  overflow: hidden;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--ink-2);
  font-size: 11px;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
}

.run-id:hover {
  color: var(--ink);
}

.run-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  color: var(--ink-3);
  font-size: 10px;
}

.load-more {
  display: flex;
  justify-content: center;
}
</style>
