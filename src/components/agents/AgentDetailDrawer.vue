<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'

import AgentEditDialog from '@/components/agents/AgentEditDialog.vue'
import AppIcon from '@/components/common/AppIcon.vue'
import ErrorState from '@/components/common/ErrorState.vue'
import LoadingSkeleton from '@/components/common/LoadingSkeleton.vue'
import { agentsApi } from '@/api/agents'
import { formatDateTime, formatDuration } from '@/utils/format'
import type { AgentDetail, AgentHealthStatus } from '@/types'

const props = withDefaults(
  defineProps<{
    modelValue: boolean
    agentId: string | null
    /** M7：注册表的写操作仅管理员可见，普通用户只读。 */
    canManage?: boolean
  }>(),
  { canManage: false },
)

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  changed: []
  /** 编辑保存成功：携带后端返回的最新详情，供列表页展示成功提示。 */
  edited: [agent: AgentDetail]
  removed: [id: string]
}>()

const open = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
})

const detail = ref<AgentDetail | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)
const busy = ref<'health' | 'refresh' | 'toggle' | 'delete' | null>(null)
const editOpen = ref(false)

/**
 * 后端 AgentDetailOut 目前没有系统内置标记（全局注册表，owner_user_id 也不在响应里），
 * 这里对可能的只读标记做防御性判断；字段出现时自动禁用编辑。
 */
function isBuiltinAgent(agent: AgentDetail): boolean {
  const raw = agent as AgentDetail & { is_builtin?: boolean; builtin?: boolean; system?: boolean }
  return raw.is_builtin === true || raw.builtin === true || raw.system === true
}

const canEdit = computed(
  () => props.canManage && detail.value !== null && !isBuiltinAgent(detail.value),
)

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

const healthLabel = computed(
  () =>
    detail.value ? (HEALTH_LABELS[detail.value.health_status] ?? detail.value.health_status) : '',
)
const healthTone = computed(
  () => (detail.value ? (HEALTH_TONES[detail.value.health_status] ?? 'muted') : 'muted'),
)

const skills = computed(() => detail.value?.skills ?? [])
const rawCard = computed(() =>
  detail.value?.card ? JSON.stringify(detail.value.card, null, 2) : '',
)

const initials = computed(() => {
  const source = detail.value?.slug || detail.value?.name || ''
  const parts = source.split(/[-_\s]+/).filter(Boolean)
  if (parts.length >= 2) return `${parts[0]![0] ?? ''}${parts[1]![0] ?? ''}`.toUpperCase()
  return source.slice(0, 2).toUpperCase()
})

const authLabel = computed(() => {
  const agent = detail.value
  if (!agent) return '—'
  if (agent.auth_type === 'none') return '无'
  return agent.auth_scheme || agent.auth_type
})

watch(
  () => [props.modelValue, props.agentId] as const,
  ([isOpen, id]) => {
    if (isOpen && id) void load(id)
  },
  { immediate: true },
)

async function load(id: string): Promise<void> {
  loading.value = true
  error.value = null
  try {
    detail.value = await agentsApi.get(id)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '加载智能体详情失败'
  } finally {
    loading.value = false
  }
}

async function checkHealth(): Promise<void> {
  if (!detail.value) return
  busy.value = 'health'
  try {
    const result = await agentsApi.health(detail.value.id)
    detail.value = {
      ...detail.value,
      health_status: result.health_status,
      last_checked_at: result.checked_at,
      last_latency_ms: result.latency_ms,
      last_error: result.error,
    }
    emit('changed')
    ElMessage.success(
      result.latency_ms === null
        ? '健康检查完成'
        : `健康检查通过，延迟 ${formatDuration(result.latency_ms)}`,
    )
  } catch (cause) {
    ElMessage.error(cause instanceof Error ? cause.message : '健康检查失败')
  } finally {
    busy.value = null
  }
}

async function refreshCard(): Promise<void> {
  if (!detail.value) return
  busy.value = 'refresh'
  try {
    const result = await agentsApi.refresh(detail.value.id)
    detail.value = { ...detail.value, ...result.agent }
    emit('changed')
    ElMessage.success(
      result.changed
        ? `Agent Card 已更新：${result.changed_fields.join('、') || '字段变更'}`
        : 'Agent Card 无变化',
    )
  } catch (cause) {
    ElMessage.error(cause instanceof Error ? cause.message : '刷新 Agent Card 失败')
  } finally {
    busy.value = null
  }
}

async function toggleEnabled(): Promise<void> {
  if (!detail.value) return
  busy.value = 'toggle'
  const next = !detail.value.enabled
  try {
    const updated = await agentsApi.update(detail.value.id, { enabled: next })
    detail.value = { ...detail.value, ...updated }
    emit('changed')
    ElMessage.success(next ? '已启用该智能体' : '已禁用该智能体')
  } catch (cause) {
    ElMessage.error(cause instanceof Error ? cause.message : '启停失败')
  } finally {
    busy.value = null
  }
}

async function removeAgent(): Promise<void> {
  if (!detail.value) return
  const target = detail.value
  try {
    await ElMessageBox.confirm(
      `将从注册表移除「${target.name}」，其技能不再出现在工具目录；历史任务记录保留。`,
      '删除智能体？',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  busy.value = 'delete'
  try {
    await agentsApi.remove(target.id)
    ElMessage.success('已删除')
    emit('removed', target.id)
    emit('changed')
    open.value = false
  } catch (cause) {
    ElMessage.error(cause instanceof Error ? cause.message : '删除失败')
  } finally {
    busy.value = null
  }
}

/** 编辑保存成功：用响应刷新详情；changed 驱动列表刷新，edited 供页面提示成功。 */
function onAgentSaved(updated: AgentDetail): void {
  detail.value = { ...(detail.value ?? updated), ...updated }
  emit('changed')
  emit('edited', updated)
}
</script>

<template>
  <el-drawer v-model="open" title="智能体详情" size="480px" :append-to-body="true">
    <LoadingSkeleton v-if="loading" variant="card" />
    <ErrorState v-else-if="error" :message="error" @retry="agentId && load(agentId)" />

    <div v-else-if="detail" class="detail">
      <header class="agent-drawer-ident">
        <span class="agent-badge">{{ initials }}</span>
        <div class="agent-card-ident">
          <div class="agent-name">{{ detail.name }}</div>
          <div class="agent-slug">{{ detail.slug }} · A2A {{ detail.protocol_version }}</div>
        </div>
        <span class="st" :class="`st-${healthTone}`">
          <span class="dot"></span>{{ healthLabel }}
        </span>
      </header>

      <div class="agent-card-url" :title="detail.url">
        <AppIcon name="external" />
        <span class="url-text">{{ detail.url }}</span>
      </div>

      <p v-if="detail.description" class="detail-note">{{ detail.description }}</p>

      <dl class="kv detail-kv">
        <dt>协议</dt>
        <dd>A2A {{ detail.protocol_version }}</dd>
        <dt>鉴权</dt>
        <dd class="mono">
          {{ authLabel }}
          <span v-if="detail.auth_hint"> · {{ detail.auth_hint }}</span>
        </dd>
        <dt>状态</dt>
        <dd>{{ detail.enabled ? '已启用' : '已禁用' }}</dd>
        <dt>最近检查</dt>
        <dd class="mono">{{ formatDateTime(detail.last_checked_at) }}</dd>
        <dt>延迟</dt>
        <dd class="mono">{{ formatDuration(detail.last_latency_ms) }}</dd>
        <dt>流式</dt>
        <dd>{{ detail.capabilities.streaming ? '支持' : '不支持' }}</dd>
        <dt>推送通知</dt>
        <dd>{{ detail.capabilities.push_notifications ? '支持' : '不支持' }}</dd>
      </dl>

      <p v-if="detail.last_error" class="error-line is-error-text">
        最近错误：{{ detail.last_error }}
      </p>

      <section class="detail-block">
        <h4>技能（{{ skills.length }}）</h4>
        <div v-if="skills.length > 0" class="skill-list">
          <div v-for="skill in skills" :key="skill.id" class="skill-row">
            <span class="skill-name">{{ skill.name }}</span>
            <span class="skill-chip">{{ skill.id }}</span>
            <span v-if="skill.description" class="skill-desc">{{ skill.description }}</span>
          </div>
        </div>
        <p v-else class="detail-note">Agent Card 未声明技能。</p>
      </section>

      <section v-if="detail.recent_tasks && detail.recent_tasks.length > 0" class="detail-block">
        <h4>最近任务</h4>
        <ul class="tasks">
          <li v-for="task in detail.recent_tasks" :key="task.id">
            <span class="mono">{{ task.a2a_task_id }}</span>
            <span class="muted">{{ task.state }}</span>
            <span class="mono muted">{{ formatDuration(task.duration_ms) }}</span>
            <span class="mono muted">{{ formatDateTime(task.finished_at) }}</span>
          </li>
        </ul>
      </section>

      <details v-if="rawCard" class="agent-extra">
        <summary>
          原始 Agent Card<AppIcon name="chevron" class="agent-extra-chev" />
        </summary>
        <div class="agent-extra-body">
          <pre class="raw-card">{{ rawCard }}</pre>
        </div>
      </details>

      <div v-if="props.canManage" class="actions">
        <button
          v-if="canEdit"
          type="button"
          class="btn btn-outline btn-sm"
          data-testid="agent-edit-open"
          :disabled="busy !== null"
          @click="editOpen = true"
        >
          编辑
        </button>
        <button
          type="button"
          class="btn btn-outline btn-sm"
          :disabled="busy !== null"
          @click="checkHealth"
        >
          {{ busy === 'health' ? '检查中…' : '健康检查' }}
        </button>
        <button
          type="button"
          class="btn btn-ghost btn-sm"
          :disabled="busy !== null"
          @click="refreshCard"
        >
          {{ busy === 'refresh' ? '刷新中…' : '刷新 Card' }}
        </button>
        <button
          type="button"
          class="btn btn-ghost btn-sm"
          :disabled="busy !== null"
          @click="toggleEnabled"
        >
          {{ busy === 'toggle' ? '处理中…' : detail.enabled ? '禁用' : '启用' }}
        </button>
        <button
          type="button"
          class="btn btn-ghost btn-sm is-danger-text"
          :disabled="busy !== null"
          @click="removeAgent"
        >
          {{ busy === 'delete' ? '删除中…' : '删除' }}
        </button>
      </div>

      <AgentEditDialog
        v-if="detail"
        v-model="editOpen"
        :agent="detail"
        @saved="onAgentSaved"
      />
    </div>
  </el-drawer>
</template>

<style scoped>
.detail {
  display: flex;
  flex-direction: column;
  gap: 14px;
  color: var(--ink-2);
  font-size: 12px;
}

.agent-drawer-ident {
  display: flex;
  align-items: flex-start;
  gap: 9px;
}

.agent-drawer-ident > .st {
  margin-left: auto;
  flex: none;
}

.detail-kv {
  grid-template-columns: 92px minmax(0, 1fr);
  gap: 5px 14px;
  margin-top: 0;
  padding-top: 11px;
  border-top: 1px solid var(--line-2);
}

.detail-block h4 {
  margin-bottom: 6px;
  color: var(--ink-3);
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.03em;
}

.skill-list {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.skill-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 8px;
}

.skill-name {
  color: var(--ink);
  font-size: 11.5px;
  font-weight: 550;
}

.skill-desc {
  flex-basis: 100%;
  color: var(--ink-3);
  font-size: 10px;
  line-height: 1.55;
}

.tasks {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.tasks li {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 10px;
  padding: 6px 8px;
  border: 1px solid var(--line-2);
  border-radius: 4px;
  background: var(--surface-2);
  font-size: 10.5px;
}

.raw-card {
  max-height: 240px;
  margin: 6px 0 0;
  padding: 8px;
  overflow: auto;
  border: 1px solid var(--line-2);
  border-radius: 5px;
  background: var(--surface-2);
  font-family: var(--font-mono);
  font-size: 10px;
  line-height: 1.55;
  white-space: pre-wrap;
}

.url-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.error-line {
  padding: 7px 9px;
  border-radius: 4px;
  background: var(--red-soft);
  font-size: 10.5px;
  line-height: 1.6;
}

.muted {
  color: var(--ink-3);
  font-size: 10.5px;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding-top: 3px;
  border-top: 1px solid var(--line-2);
}
</style>
