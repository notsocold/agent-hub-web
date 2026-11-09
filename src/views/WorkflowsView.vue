<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'

import EmptyState from '@/components/common/EmptyState.vue'
import ErrorState from '@/components/common/ErrorState.vue'
import LoadingBlock from '@/components/common/LoadingBlock.vue'
import PageHeader from '@/components/common/PageHeader.vue'
import PageShell from '@/components/common/PageShell.vue'
import StatCard from '@/components/common/StatCard.vue'
import StatusBadge from '@/components/common/StatusBadge.vue'
import { workflowsApi } from '@/api/workflows'
import { formatDateTime } from '@/utils/format'
import type { Workflow } from '@/types'

const items = ref<Workflow[]>([])
const stats = ref<Record<string, number>>({})
const loading = ref(false)
const error = ref<string | null>(null)
const keyword = ref('')
const statusFilter = ref<'all' | 'published' | 'draft' | 'disabled'>('all')

const filtered = computed(() =>
  items.value.filter((item) => {
    if (statusFilter.value !== 'all' && item.status !== statusFilter.value) return false
    const query = keyword.value.trim().toLowerCase()
    if (!query) return true
    return `${item.name} ${item.slug}`.toLowerCase().includes(query)
  }),
)

const total = computed(() => stats.value.total ?? items.value.length)
const published = computed(
  () => stats.value.published ?? items.value.filter((item) => item.status === 'published').length,
)
const draft = computed(
  () => stats.value.draft ?? items.value.filter((item) => item.status === 'draft').length,
)
const avgSteps = computed(() => stats.value.avg_steps ?? 0)

const STATUS_LABELS: Record<Workflow['status'], string> = {
  published: '已发布',
  draft: '草稿',
  disabled: '已停用',
}

function statusLabel(status: string): string {
  return STATUS_LABELS[status as Workflow['status']] ?? status
}

function statusTone(status: string): 'ok' | 'warn' | 'muted' {
  if (status === 'published') return 'ok'
  if (status === 'draft') return 'warn'
  return 'muted'
}

function notReady(label: string): void {
  ElMessage.info(`${label}将在 M5 接入，当前仅展示工作流列表。`)
}

async function load(): Promise<void> {
  loading.value = true
  error.value = null
  try {
    const page = await workflowsApi.list({ limit: 50 })
    items.value = page.items
    stats.value = page.stats ?? {}
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '加载工作流失败'
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <PageShell>
    <PageHeader
      eyebrow="WORKFLOWS"
      title="工作流"
      description="把技能、检索、A2A、MCP 与审批编排成有序步骤模板；运行轨迹与人工审批仍在对话中完成。"
    >
      <template #actions>
        <button type="button" class="btn" @click="notReady('工作流导入')">导入</button>
        <button type="button" class="btn primary" @click="notReady('新建工作流')">
          新建工作流
        </button>
      </template>
    </PageHeader>

    <div class="stat-row">
      <StatCard label="全部工作流" :value="total" />
      <StatCard label="已发布" :value="published" tone="ok" />
      <StatCard label="草稿" :value="draft" tone="warn" />
      <StatCard label="平均步骤" :value="avgSteps" />
    </div>

    <div class="toolbar">
      <input
        v-model="keyword"
        class="input"
        type="search"
        placeholder="搜索名称或 slug"
        aria-label="搜索工作流"
      />
      <select v-model="statusFilter" class="input" aria-label="筛选状态">
        <option value="all">全部状态</option>
        <option value="published">已发布</option>
        <option value="draft">草稿</option>
        <option value="disabled">已停用</option>
      </select>
    </div>

    <ErrorState v-if="error" :message="error" @retry="load" />
    <LoadingBlock v-else-if="loading" label="正在加载工作流…" />

    <div v-else class="table-card">
      <el-table :data="filtered" style="width: 100%">
        <el-table-column label="名称" min-width="230">
          <template #default="{ row }">
            <div class="name-cell">
              <span class="name">{{ row.name }}</span>
              <span class="slug mono">{{ row.slug }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="112">
          <template #default="{ row }">
            <StatusBadge :tone="statusTone(row.status)" :label="statusLabel(row.status)" />
          </template>
        </el-table-column>
        <el-table-column prop="version" label="版本" width="76" />
        <el-table-column prop="step_count" label="步骤" width="76" />
        <el-table-column prop="run_count" label="运行次数" width="92" />
        <el-table-column label="更新时间" width="160">
          <template #default="{ row }">
            <span class="muted mono">{{ formatDateTime(row.updated_at) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="150" fixed="right">
          <template #default>
            <button type="button" class="link" @click="notReady('工作流编辑')">编辑</button>
            <button type="button" class="link" @click="notReady('运行记录')">运行记录</button>
          </template>
        </el-table-column>
        <template #empty>
          <EmptyState
            title="还没有匹配的工作流"
            description="工作流将以有序步骤模板承载技能、检索、A2A 与审批，不会引入 BPMN 画布。"
          />
        </template>
      </el-table>
    </div>
  </PageShell>
</template>

<style scoped>
.name-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.name {
  color: var(--ink);
  font-weight: 550;
}

.slug {
  color: var(--ink-3);
  font-size: 10px;
}

.muted {
  color: var(--ink-3);
  font-size: 11px;
}

.link {
  padding: 0 6px;
  color: var(--prussian);
  font-size: 11.5px;
}

.link:hover {
  text-decoration: underline;
}
</style>
