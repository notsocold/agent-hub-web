<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'

import AgentDetailDrawer from '@/components/agents/AgentDetailDrawer.vue'
import AgentRegisterDialog from '@/components/agents/AgentRegisterDialog.vue'
import AppIcon from '@/components/common/AppIcon.vue'
import ErrorState from '@/components/common/ErrorState.vue'
import LoadingSkeleton from '@/components/common/LoadingSkeleton.vue'
import PageHeader from '@/components/common/PageHeader.vue'
import PageShell from '@/components/common/PageShell.vue'
import StatCard from '@/components/common/StatCard.vue'
import { agentsApi } from '@/api/agents'
import { useAuthStore } from '@/stores/auth'
import { useSystemStore } from '@/stores/system'
import { formatDateTime, formatDuration, formatTime } from '@/utils/format'
import type { Agent, AgentHealthStatus } from '@/types'

const auth = useAuthStore()
const system = useSystemStore()

type StatusFilter = 'all' | 'healthy' | 'degraded' | 'disabled'

const items = ref<Agent[]>([])
const stats = ref<Record<string, number>>({})
const loading = ref(false)
const error = ref<string | null>(null)
const keyword = ref('')
const statusFilter = ref<StatusFilter>('all')
const checkingId = ref<string | null>(null)
const refreshingId = ref<string | null>(null)
const togglingId = ref<string | null>(null)
const deletingId = ref<string | null>(null)

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

/** 卡片左上角徽标：取 slug 前两段首字母，与原型 DA/ER/CA 一致。 */
function initials(agent: Agent): string {
  const source = agent.slug || agent.name
  const parts = source.split(/[-_\s]+/).filter(Boolean)
  if (parts.length >= 2) return `${parts[0]![0] ?? ''}${parts[1]![0] ?? ''}`.toUpperCase()
  return source.slice(0, 2).toUpperCase()
}

function authLabel(agent: Agent): string {
  if (agent.auth_type === 'none') return '无'
  return agent.auth_scheme || agent.auth_type
}

function authRef(agent: Agent): string {
  if (agent.auth_hint) return agent.auth_hint
  return agent.auth_type === 'none' ? '无' : '—'
}

/** 最近检查列：失败优先展示 HTTP 状态码，其次延迟。 */
function lastCheckText(agent: Agent): string {
  if (agent.last_error) return agent.last_error.match(/^\d{3}/)?.[0] ?? agent.last_error
  if (agent.last_latency_ms !== null) return formatDuration(agent.last_latency_ms)
  return formatDateTime(agent.last_checked_at)
}

function recentTaskText(agent: Agent): string {
  const task = agent.recent_task
  if (!task) return '无最近调用'
  const duration = task.duration_ms === null ? '' : ` · ${formatDuration(task.duration_ms)}`
  return `${task.a2a_task_id} · ${task.state}${duration}`
}

const filtered = computed(() =>
  items.value.filter((item) => {
    if (statusFilter.value === 'healthy' && item.health_status !== 'healthy') return false
    if (statusFilter.value === 'degraded' && item.health_status !== 'degraded') return false
    if (statusFilter.value === 'disabled' && item.enabled) return false
    const query = keyword.value.trim().toLowerCase()
    if (!query) return true
    return `${item.name} ${item.slug} ${item.url} ${item.description}`.toLowerCase().includes(query)
  }),
)

const total = computed(() => stats.value.total ?? items.value.length)
const healthy = computed(
  () => items.value.filter((item) => item.health_status === 'healthy').length,
)
const degraded = computed(
  () => items.value.filter((item) => item.health_status === 'degraded').length,
)
const enabled = computed(() => items.value.filter((item) => item.enabled).length)
const disabled = computed(() => items.value.filter((item) => !item.enabled).length)

const emptyDescription = computed(() =>
  items.value.length > 0
    ? '没有匹配的智能体。清除筛选后重试。'
    : auth.isAdmin
      ? '点击右上角「注册智能体」，先拉取 Agent Card 预览技能，再确认注册。'
      : '当前没有可查看的智能体；注册入口仅对管理员开放。',
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

function openDetail(agent: Agent): void {
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
  if (stats.value.total !== undefined) {
    stats.value.total = Math.max(0, stats.value.total - 1)
  }
}

async function checkHealth(agent: Agent): Promise<void> {
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

async function refreshCard(agent: Agent): Promise<void> {
  refreshingId.value = agent.id
  try {
    const result = await agentsApi.refresh(agent.id)
    Object.assign(agent, result.agent)
    ElMessage.success(
      result.changed
        ? `Agent Card 已更新：${result.changed_fields.join('、') || '字段变更'}`
        : 'Agent Card 无变化',
    )
  } catch (cause) {
    ElMessage.error(cause instanceof Error ? cause.message : '刷新 Agent Card 失败')
  } finally {
    refreshingId.value = null
  }
}

async function toggleEnabled(agent: Agent, next: boolean): Promise<void> {
  togglingId.value = agent.id
  try {
    const updated = await agentsApi.update(agent.id, { enabled: next })
    Object.assign(agent, updated)
    ElMessage.success(next ? '已启用' : '已停用')
  } catch (cause) {
    ElMessage.error(cause instanceof Error ? cause.message : '启停失败')
  } finally {
    togglingId.value = null
  }
}

async function removeAgent(agent: Agent): Promise<void> {
  try {
    await ElMessageBox.confirm(
      `将从注册表移除「${agent.name}」，其技能不再出现在工具目录；历史任务记录保留。`,
      '删除智能体？',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  deletingId.value = agent.id
  try {
    await agentsApi.remove(agent.id)
    ElMessage.success('已删除')
    onRemoved(agent.id)
    if (activeAgentId.value === null) detailOpen.value = false
  } catch (cause) {
    ElMessage.error(cause instanceof Error ? cause.message : '删除失败')
  } finally {
    deletingId.value = null
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
      title="智能体"
      description="管理通过 A2A 注册的远程智能体，查看 Agent Card、技能与健康状态。"
    >
      <template #actions>
        <button type="button" class="btn btn-outline" :disabled="loading" @click="load">
          <AppIcon name="refresh" />刷新<span class="sr-only">列表</span>
        </button>
        <button
          v-if="auth.isAdmin"
          type="button"
          class="btn btn-primary"
          @click="registerOpen = true"
        >
          <AppIcon name="plus" />注册智能体
        </button>
      </template>
    </PageHeader>

    <p v-if="!auth.isAdmin" class="note permission-note">
      写操作需要管理员权限；注册、启停、健康检查、刷新与删除仅管理员可用。
    </p>

    <div v-if="system.loaded && !system.enabled('agents')" class="capability-note">
      后端尚未启用远程智能体能力（capabilities.agents=false）；注册与调用需在后端 M2 开启后进行。
    </div>

    <div class="stats">
      <StatCard label="已注册" :value="total" />
      <StatCard label="健康" :value="healthy" />
      <StatCard label="降级" :value="degraded" />
      <StatCard label="已启用" :value="enabled" />
    </div>

    <div class="toolbar">
      <div class="seg" role="group" aria-label="按状态筛选">
        <button
          type="button"
          :class="{ 'is-active': statusFilter === 'all' }"
          @click="statusFilter = 'all'"
        >
          全部 <span>{{ total }}</span>
        </button>
        <button
          type="button"
          :class="{ 'is-active': statusFilter === 'healthy' }"
          @click="statusFilter = 'healthy'"
        >
          健康 <span>{{ healthy }}</span>
        </button>
        <button
          type="button"
          :class="{ 'is-active': statusFilter === 'degraded' }"
          @click="statusFilter = 'degraded'"
        >
          降级 <span>{{ degraded }}</span>
        </button>
        <button
          type="button"
          :class="{ 'is-active': statusFilter === 'disabled' }"
          @click="statusFilter = 'disabled'"
        >
          已禁用 <span>{{ disabled }}</span>
        </button>
      </div>
      <label class="tool-search">
        <AppIcon name="search" />
        <input
          v-model="keyword"
          type="search"
          placeholder="搜索名称或 slug"
          autocomplete="off"
          aria-label="搜索智能体"
        />
      </label>
    </div>

    <ErrorState v-if="error" :message="error" @retry="load" />
    <LoadingSkeleton v-else-if="loading" />

    <div v-else class="agent-cards">
      <article
        v-for="agent in filtered"
        :key="agent.id"
        class="agent-card"
        :data-health="agent.health_status"
      >
        <header class="agent-card-head">
          <span class="agent-badge">{{ initials(agent) }}</span>
          <div class="agent-card-ident">
            <div class="agent-name">{{ agent.name }}</div>
            <div class="agent-slug">{{ agent.slug }} · A2A {{ agent.protocol_version }}</div>
          </div>
          <div class="agent-card-ops">
            <span class="st" :class="`st-${healthTone(agent.health_status)}`">
              <span class="dot"></span>{{ healthLabel(agent.health_status) }}
            </span>
            <span class="agent-switch-label">{{ agent.enabled ? '已启用' : '已停用' }}</span>
            <button
              v-if="auth.isAdmin"
              type="button"
              class="wf-switch"
              :class="{ 'is-on': agent.enabled }"
              role="switch"
              :aria-checked="agent.enabled"
              :aria-label="`${agent.enabled ? '停用' : '启用'} ${agent.name}`"
              :disabled="togglingId === agent.id"
              @click="toggleEnabled(agent, !agent.enabled)"
            >
              <span></span>
            </button>
          </div>
        </header>

        <div class="agent-card-url" :title="agent.url">
          <AppIcon name="external" />
          <span class="url-text">{{ agent.url }}</span>
        </div>

        <div v-if="agent.skills.length > 0" class="agent-card-skills">
          <span
            v-for="skill in agent.skills.slice(0, 6)"
            :key="skill.id"
            class="skill-chip"
            :title="skill.name"
          >
            {{ skill.id }}
          </span>
          <span v-if="agent.skills.length > 6" class="skill-chip">
            +{{ agent.skills.length - 6 }}
          </span>
        </div>

        <div
          v-if="agent.health_status === 'degraded' || agent.health_status === 'unhealthy'"
          class="agent-card-alert"
        >
          <span class="dot is-warn"></span>
          最近调用失败 · {{ agent.last_error || '健康检查未通过' }}
        </div>

        <dl class="agent-card-meta">
          <div>
            <dt>协议</dt>
            <dd>A2A {{ agent.protocol_version }}</dd>
          </div>
          <div>
            <dt>鉴权</dt>
            <dd class="mono">{{ authLabel(agent) }}</dd>
          </div>
          <div>
            <dt>最近检查</dt>
            <dd
              class="mono"
              :class="{ 'is-error-text': Boolean(agent.last_error) }"
              :title="agent.last_error ?? undefined"
            >
              {{ lastCheckText(agent) }}
            </dd>
          </div>
        </dl>

        <details class="agent-extra">
          <summary>
            Agent Card 与最近调用<AppIcon name="chevron" class="agent-extra-chev" />
          </summary>
          <div class="agent-extra-body">
            <dl class="kv">
              <dt>鉴权引用</dt>
              <dd class="mono">{{ authRef(agent) }}</dd>
              <dt>最近检查</dt>
              <dd>
                <template v-if="agent.last_checked_at">
                  {{ formatTime(agent.last_checked_at) }}
                </template>
                <template v-else>未检查</template>
                <template v-if="agent.last_error">
                  ·
                  <span class="is-error-text">{{ agent.last_error }}</span>
                </template>
                <template v-else-if="agent.last_latency_ms !== null">
                  · {{ formatDuration(agent.last_latency_ms) }}
                </template>
              </dd>
              <dt>最近任务</dt>
              <dd>{{ recentTaskText(agent) }}</dd>
            </dl>
            <div class="agent-extra-actions">
              <button type="button" class="btn btn-outline btn-sm" @click="openDetail(agent)">
                查看原始 Card
              </button>
            </div>
          </div>
        </details>

        <footer class="agent-card-foot">
          <template v-if="auth.isAdmin">
            <button
              type="button"
              class="btn btn-outline btn-sm"
              :disabled="checkingId === agent.id"
              @click="checkHealth(agent)"
            >
              {{ checkingId === agent.id ? '检查中…' : '健康检查' }}
            </button>
            <button
              type="button"
              class="btn btn-ghost btn-sm"
              :disabled="refreshingId === agent.id"
              @click="refreshCard(agent)"
            >
              {{ refreshingId === agent.id ? '刷新中…' : '刷新 Card' }}
            </button>
          </template>
          <button type="button" class="btn btn-ghost btn-sm" @click="openDetail(agent)">详情</button>
          <span class="spacer"></span>
          <button
            v-if="auth.isAdmin"
            type="button"
            class="btn btn-ghost btn-sm is-danger-text"
            :disabled="deletingId === agent.id"
            @click="removeAgent(agent)"
          >
            {{ deletingId === agent.id ? '删除中…' : '删除' }}
          </button>
        </footer>
      </article>

      <div v-if="filtered.length === 0" class="empty-state">{{ emptyDescription }}</div>
    </div>

    <AgentRegisterDialog v-model="registerOpen" @created="onCreated" />

    <AgentDetailDrawer
      v-model="detailOpen"
      :agent-id="activeAgentId"
      :can-manage="auth.isAdmin"
      @changed="onChanged"
      @removed="onRemoved"
    />
  </PageShell>
</template>

<style scoped>
.capability-note {
  margin-top: 12px;
  padding: 8px 12px;
  border: 1px solid var(--amber-soft);
  border-radius: 6px;
  background: var(--amber-soft);
  color: var(--amber-text);
  font-size: 11px;
}

.permission-note {
  margin-top: 10px;
}

.url-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
