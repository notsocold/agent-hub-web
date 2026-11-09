<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'

import AgentDetailDrawer from '@/components/agents/AgentDetailDrawer.vue'
import AgentRegisterDialog from '@/components/agents/AgentRegisterDialog.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import ErrorState from '@/components/common/ErrorState.vue'
import LoadingBlock from '@/components/common/LoadingBlock.vue'
import PageHeader from '@/components/common/PageHeader.vue'
import PageShell from '@/components/common/PageShell.vue'
import StatCard from '@/components/common/StatCard.vue'
import StatusBadge from '@/components/common/StatusBadge.vue'
import { agentsApi } from '@/api/agents'
import { useSystemStore } from '@/stores/system'
import { formatDateTime, formatDuration } from '@/utils/format'
import type { Agent, AgentHealthStatus } from '@/types'

const system = useSystemStore()

const items = ref<Agent[]>([])
const stats = ref<Record<string, number>>({})
const loading = ref(false)
const error = ref<string | null>(null)
const keyword = ref('')
const healthFilter = ref<'all' | AgentHealthStatus>('all')
const enabledFilter = ref<'all' | 'enabled' | 'disabled'>('all')
const checkingId = ref<string | null>(null)
const togglingId = ref<string | null>(null)

const registerOpen = ref(false)
const detailOpen = ref(false)
const activeAgentId = ref<string | null>(null)

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
    if (enabledFilter.value === 'enabled' && !item.enabled) return false
    if (enabledFilter.value === 'disabled' && item.enabled) return false
    const query = keyword.value.trim().toLowerCase()
    if (!query) return true
    return `${item.name} ${item.slug} ${item.url} ${item.description}`
      .toLowerCase()
      .includes(query)
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
    const page = await agentsApi.list({ limit: 100 })
    items.value = page.items
    stats.value = page.stats ?? {}
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '加载智能体失败'
  } finally {
    loading.value = false
  }
}

function openDetail(row: unknown): void {
  const agent = row as Agent
  activeAgentId.value = agent.id
  detailOpen.value = true
}

function onCreated(): void {
  void load()
}

function onChanged(): void {
  void load()
}

function onRemoved(id: string): void {
  items.value = items.value.filter((item) => item.id !== id)
  if (activeAgentId.value === id) activeAgentId.value = null
}

async function checkHealth(id: string): Promise<void> {
  const agent = items.value.find((item) => item.id === id)
  if (!agent) return
  checkingId.value = id
  try {
    const result = await agentsApi.health(id)
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

function onToggle(row: unknown, value: string | number | boolean): void {
  void toggleEnabled(row as Agent, Boolean(value))
}

async function toggleEnabled(row: Agent, next: boolean): Promise<void> {
  togglingId.value = row.id
  try {
    const updated = await agentsApi.update(row.id, { enabled: next })
    Object.assign(row, updated)
    ElMessage.success(next ? '已启用' : '已禁用')
  } catch (cause) {
    ElMessage.error(cause instanceof Error ? cause.message : '启停失败')
  } finally {
    togglingId.value = null
  }
}

onMounted(() => {
  void system.load()
  void load()
})
</script>

<template>
  <PageShell>
    <PageHeader
      eyebrow="AGENTS"
      title="智能体"
      description="注册远程 A2A 智能体，查看 Agent Card、技能与健康状态；注册前先预览 Card，确认后才落库。"
    >
      <template #actions>
        <button type="button" class="btn" :disabled="loading" @click="load">刷新列表</button>
        <button type="button" class="btn primary" @click="registerOpen = true">注册智能体</button>
      </template>
    </PageHeader>

    <div v-if="system.loaded && !system.enabled('agents')" class="capability-note">
      后端尚未启用远程智能体能力（capabilities.agents=false）；注册与调用需在后端 M2 开启后进行。
    </div>

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
        placeholder="搜索名称、slug、地址或描述"
        aria-label="搜索智能体"
      />
      <select v-model="healthFilter" class="input" aria-label="筛选健康状态">
        <option value="all">全部健康状态</option>
        <option value="healthy">健康</option>
        <option value="degraded">降级</option>
        <option value="unhealthy">不可用</option>
        <option value="unknown">未检查</option>
      </select>
      <select v-model="enabledFilter" class="input" aria-label="筛选启停状态">
        <option value="all">全部启停状态</option>
        <option value="enabled">已启用</option>
        <option value="disabled">已禁用</option>
      </select>
      <span class="toolbar-count mono">{{ filtered.length }} / {{ items.length }}</span>
    </div>

    <ErrorState v-if="error" :message="error" @retry="load" />
    <LoadingBlock v-else-if="loading" label="正在加载智能体…" />

    <div v-else class="table-card">
      <el-table :data="filtered" style="width: 100%" @row-click="openDetail">
        <el-table-column label="名称" min-width="200">
          <template #default="{ row }">
            <div class="name-cell">
              <span class="name">{{ row.name }}</span>
              <span class="slug mono">{{ row.slug }}</span>
              <span v-if="row.description" class="desc">{{ row.description }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="地址" min-width="190">
          <template #default="{ row }">
            <span class="mono muted ellipsis">{{ row.url }}</span>
          </template>
        </el-table-column>
        <el-table-column label="健康" width="104">
          <template #default="{ row }">
            <StatusBadge
              :tone="healthTone(row.health_status)"
              :label="healthLabel(row.health_status)"
            />
          </template>
        </el-table-column>
        <el-table-column label="技能" width="68">
          <template #default="{ row }">
            <span class="mono">{{ row.skill_count }}</span>
          </template>
        </el-table-column>
        <el-table-column label="启用" width="76">
          <template #default="{ row }">
            <span @click.stop>
              <el-switch
                :model-value="row.enabled"
                :loading="togglingId === row.id"
                size="small"
                :aria-label="`${row.enabled ? '禁用' : '启用'} ${row.name}`"
                @change="onToggle(row, $event)"
              />
            </span>
          </template>
        </el-table-column>
        <el-table-column label="最近检查" width="150">
          <template #default="{ row }">
            <span class="muted mono">{{ formatDateTime(row.last_checked_at) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="延迟" width="88">
          <template #default="{ row }">
            <span class="muted mono">{{ formatDuration(row.last_latency_ms) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="120" fixed="right">
          <template #default="{ row }">
            <span class="row-actions" @click.stop>
              <button
                type="button"
                class="link"
                :disabled="checkingId === row.id"
                @click="checkHealth(row.id)"
              >
                {{ checkingId === row.id ? '检查中…' : '健康检查' }}
              </button>
              <button type="button" class="link" @click="openDetail(row)">详情</button>
            </span>
          </template>
        </el-table-column>
        <template #empty>
          <EmptyState
            title="还没有匹配的智能体"
            description="点击右上角「注册智能体」，先拉取 Agent Card 预览技能，再确认注册。"
          />
        </template>
      </el-table>
    </div>

    <AgentRegisterDialog v-model="registerOpen" @created="onCreated" />

    <AgentDetailDrawer
      v-model="detailOpen"
      :agent-id="activeAgentId"
      @changed="onChanged"
      @removed="onRemoved"
    />
  </PageShell>
</template>

<style scoped>
.capability-note {
  padding: 8px 12px;
  border: 1px solid var(--amber-soft);
  border-radius: 7px;
  background: var(--amber-soft);
  color: var(--amber-text);
  font-size: 11px;
}

.name-cell {
  display: flex;
  flex-direction: column;
  gap: 1px;
  cursor: pointer;
}

.name {
  color: var(--ink);
  font-weight: 550;
}

.slug {
  color: var(--ink-3);
  font-size: 10px;
}

.desc {
  overflow: hidden;
  color: var(--ink-3);
  font-size: 10.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
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

.toolbar-count {
  margin-left: auto;
  color: var(--ink-3);
  font-size: 10px;
}

.row-actions {
  display: inline-flex;
  gap: 8px;
}

.link {
  padding: 0 2px;
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
