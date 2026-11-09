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
import { agentsApi } from '@/api/agents'
import { formatDateTime, formatDuration } from '@/utils/format'
import type { Agent, AgentHealthStatus } from '@/types'

const items = ref<Agent[]>([])
const stats = ref<Record<string, number>>({})
const loading = ref(false)
const error = ref<string | null>(null)
const keyword = ref('')
const healthFilter = ref<'all' | AgentHealthStatus>('all')
const checkingId = ref<string | null>(null)

const HEALTH_LABELS: Record<AgentHealthStatus, string> = {
  unknown: '未检查',
  healthy: '健康',
  degraded: '降级',
  unhealthy: '不可用',
}

const HEALTH_TONES: Record<AgentHealthStatus, 'ok' | 'warn' | 'error' | 'muted'> = {
  unknown: 'muted',
  healthy: 'ok',
  degraded: 'warn',
  unhealthy: 'error',
}

function healthLabel(status: string): string {
  return HEALTH_LABELS[status as AgentHealthStatus] ?? status
}

function healthTone(status: string): 'ok' | 'warn' | 'error' | 'muted' {
  return HEALTH_TONES[status as AgentHealthStatus] ?? 'muted'
}

const filtered = computed(() =>
  items.value.filter((item) => {
    if (healthFilter.value !== 'all' && item.health_status !== healthFilter.value) return false
    const query = keyword.value.trim().toLowerCase()
    if (!query) return true
    return `${item.name} ${item.slug} ${item.url}`.toLowerCase().includes(query)
  }),
)

const total = computed(() => stats.value.total ?? items.value.length)
const healthy = computed(
  () =>
    stats.value.healthy ?? items.value.filter((item) => item.health_status === 'healthy').length,
)
const degraded = computed(
  () =>
    stats.value.degraded ?? items.value.filter((item) => item.health_status === 'degraded').length,
)
const disabled = computed(
  () => stats.value.disabled ?? items.value.filter((item) => !item.enabled).length,
)

async function load(): Promise<void> {
  loading.value = true
  error.value = null
  try {
    const page = await agentsApi.list({ limit: 50 })
    items.value = page.items
    stats.value = page.stats ?? {}
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '加载智能体失败'
  } finally {
    loading.value = false
  }
}

async function checkHealth(id: string): Promise<void> {
  const agent = items.value.find((item) => item.id === id)
  if (!agent) return
  checkingId.value = agent.id
  try {
    const result = await agentsApi.health(agent.id)
    agent.health_status = result.health_status
    agent.last_checked_at = result.checked_at
    agent.last_latency_ms = result.latency_ms
    agent.last_error = result.error
    ElMessage.success(
      result.latency_ms === null
        ? '健康检查完成'
        : `健康检查通过，延迟 ${formatDuration(result.latency_ms)}`,
    )
  } catch (cause) {
    ElMessage.error(cause instanceof Error ? cause.message : '健康检查失败')
  } finally {
    checkingId.value = null
  }
}

function notReady(label: string): void {
  ElMessage.info(`${label}将在 M2 接入，当前仅展示注册表与健康状态。`)
}

onMounted(load)
</script>

<template>
  <PageShell>
    <PageHeader
      eyebrow="AGENTS"
      title="智能体"
      description="管理通过 A2A 注册的远程智能体，查看 Agent Card、技能与健康状态；写操作受权限控制。"
    >
      <template #actions>
        <button type="button" class="btn" @click="notReady('刷新 Agent Card')">刷新 Card</button>
        <button type="button" class="btn primary" @click="notReady('注册智能体')">
          注册智能体
        </button>
      </template>
    </PageHeader>

    <div class="stat-row">
      <StatCard label="已注册" :value="total" />
      <StatCard label="健康" :value="healthy" tone="ok" />
      <StatCard label="降级" :value="degraded" tone="warn" />
      <StatCard label="已禁用" :value="disabled" />
    </div>

    <div class="toolbar">
      <input
        v-model="keyword"
        class="input"
        type="search"
        placeholder="搜索名称、slug 或地址"
        aria-label="搜索智能体"
      />
      <select v-model="healthFilter" class="input" aria-label="筛选健康状态">
        <option value="all">全部健康状态</option>
        <option value="healthy">健康</option>
        <option value="degraded">降级</option>
        <option value="unhealthy">不可用</option>
        <option value="unknown">未检查</option>
      </select>
    </div>

    <ErrorState v-if="error" :message="error" @retry="load" />
    <LoadingBlock v-else-if="loading" label="正在加载智能体…" />

    <div v-else class="table-card">
      <el-table :data="filtered" style="width: 100%">
        <el-table-column label="名称" min-width="210">
          <template #default="{ row }">
            <div class="name-cell">
              <span class="name">{{ row.name }}</span>
              <span class="slug mono">{{ row.slug }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="地址" min-width="200">
          <template #default="{ row }">
            <span class="mono muted ellipsis">{{ row.url }}</span>
          </template>
        </el-table-column>
        <el-table-column label="健康" width="108">
          <template #default="{ row }">
            <StatusBadge
              :tone="healthTone(row.health_status)"
              :label="healthLabel(row.health_status)"
            />
          </template>
        </el-table-column>
        <el-table-column prop="skill_count" label="技能" width="72" />
        <el-table-column label="最近检查" width="160">
          <template #default="{ row }">
            <span class="muted mono">{{ formatDateTime(row.last_checked_at) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="延迟" width="92">
          <template #default="{ row }">
            <span class="muted mono">{{ formatDuration(row.last_latency_ms) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="126" fixed="right">
          <template #default="{ row }">
            <button
              type="button"
              class="link"
              :disabled="checkingId === row.id"
              @click="checkHealth(row.id)"
            >
              {{ checkingId === row.id ? '检查中…' : '健康检查' }}
            </button>
          </template>
        </el-table-column>
        <template #empty>
          <EmptyState
            title="还没有匹配的智能体"
            description="通过 A2A 注册远程智能体后，可在这里查看 Agent Card、技能与健康状态。"
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

.ellipsis {
  display: inline-block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: bottom;
}

.link {
  padding: 0 6px;
  color: var(--prussian);
  font-size: 11.5px;
}

.link:hover:not(:disabled) {
  text-decoration: underline;
}

.link:disabled {
  color: var(--ink-3);
  cursor: wait;
}
</style>
