<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'

import EmptyState from '@/components/common/EmptyState.vue'
import ErrorState from '@/components/common/ErrorState.vue'
import LoadingSkeleton from '@/components/common/LoadingSkeleton.vue'
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

// M9 最小对齐版：仅移除已废除字段的引用（slug/status/step_count/run_count），
// 列表页卡片化重写在 Task 3 落地。
const filtered = computed(() =>
  items.value.filter((item) => {
    const query = keyword.value.trim().toLowerCase()
    if (!query) return true
    return item.name.toLowerCase().includes(query)
  }),
)

const total = computed(() => stats.value.total ?? items.value.length)
const enabled = computed(
  () => stats.value.enabled ?? items.value.filter((item) => item.enabled).length,
)
const disabled = computed(
  () => stats.value.disabled ?? items.value.filter((item) => !item.enabled).length,
)
const avgSteps = computed(() => stats.value.avg_steps ?? 0)

function enabledTone(enabled: boolean): 'ok' | 'muted' {
  return enabled ? 'ok' : 'muted'
}

function enabledLabel(enabled: boolean): string {
  return enabled ? '已启用' : '已停用'
}

function notReady(label: string): void {
  ElMessage.info(`${label}将在 M9 接入，当前仅展示工作流列表。`)
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
      <StatCard label="已启用" :value="enabled" tone="ok" />
      <StatCard label="已停用" :value="disabled" />
      <StatCard label="平均步骤" :value="avgSteps" />
    </div>

    <div class="toolbar">
      <input
        v-model="keyword"
        class="input"
        type="search"
        placeholder="搜索名称"
        aria-label="搜索工作流"
      />
    </div>

    <ErrorState v-if="error" :message="error" @retry="load" />
    <LoadingSkeleton v-else-if="loading" />

    <div v-else class="table-card">
      <el-table :data="filtered" style="width: 100%">
        <el-table-column label="名称" min-width="230">
          <template #default="{ row }">
            <span class="name">{{ row.name }}</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="112">
          <template #default="{ row }">
            <StatusBadge
              :tone="enabledTone(Boolean(row.enabled))"
              :label="enabledLabel(Boolean(row.enabled))"
            />
          </template>
        </el-table-column>
        <el-table-column prop="version" label="版本" width="76" />
        <el-table-column label="步骤" width="76">
          <template #default="{ row }">
            {{ Array.isArray(row.steps) ? row.steps.length : 0 }}
          </template>
        </el-table-column>
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
.name {
  color: var(--ink);
  font-weight: 550;
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
