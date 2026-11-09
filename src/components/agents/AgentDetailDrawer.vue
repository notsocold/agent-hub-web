<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'

import ErrorState from '@/components/common/ErrorState.vue'
import LoadingBlock from '@/components/common/LoadingBlock.vue'
import StatusBadge from '@/components/common/StatusBadge.vue'
import { agentsApi } from '@/api/agents'
import { formatDateTime, formatDuration } from '@/utils/format'
import type { AgentDetail, AgentHealthStatus } from '@/types'

const props = defineProps<{
  modelValue: boolean
  agentId: string | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  changed: []
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
</script>

<template>
  <el-drawer v-model="open" title="智能体详情" size="480px" :append-to-body="true">
    <LoadingBlock v-if="loading" label="正在加载智能体详情…" />
    <ErrorState v-else-if="error" :message="error" @retry="agentId && load(agentId)" />

    <div v-else-if="detail" class="detail">
      <header class="head">
        <div class="title">
          <h2>{{ detail.name }}</h2>
          <span class="mono slug">{{ detail.slug }}</span>
        </div>
        <StatusBadge :tone="healthTone" :label="healthLabel" />
      </header>

      <p v-if="detail.description" class="desc">{{ detail.description }}</p>

      <dl class="facts">
        <div>
          <dt>地址</dt>
          <dd class="mono ellipsis">{{ detail.url }}</dd>
        </div>
        <div>
          <dt>协议版本</dt>
          <dd class="mono">{{ detail.protocol_version }}</dd>
        </div>
        <div>
          <dt>鉴权</dt>
          <dd>
            {{ detail.auth_type === 'none' ? '无' : detail.auth_scheme || detail.auth_type }}
            <span v-if="detail.auth_hint" class="mono muted"> · {{ detail.auth_hint }}</span>
          </dd>
        </div>
        <div>
          <dt>状态</dt>
          <dd>{{ detail.enabled ? '已启用' : '已禁用' }}</dd>
        </div>
        <div>
          <dt>最近检查</dt>
          <dd class="mono">{{ formatDateTime(detail.last_checked_at) }}</dd>
        </div>
        <div>
          <dt>延迟</dt>
          <dd class="mono">{{ formatDuration(detail.last_latency_ms) }}</dd>
        </div>
        <div>
          <dt>流式</dt>
          <dd>{{ detail.capabilities.streaming ? '支持' : '不支持' }}</dd>
        </div>
        <div>
          <dt>推送通知</dt>
          <dd>{{ detail.capabilities.push_notifications ? '支持' : '不支持' }}</dd>
        </div>
      </dl>

      <p v-if="detail.last_error" class="error-line">最近错误：{{ detail.last_error }}</p>

      <section>
        <h3>技能（{{ skills.length }}）</h3>
        <ul class="skills">
          <li v-for="skill in skills" :key="skill.id">
            <span class="skill-name">{{ skill.name }}</span>
            <span class="mono muted">{{ skill.id }}</span>
            <span v-if="skill.description" class="skill-desc">{{ skill.description }}</span>
          </li>
          <li v-if="skills.length === 0" class="empty">Agent Card 未声明技能。</li>
        </ul>
      </section>

      <section v-if="detail.recent_tasks && detail.recent_tasks.length > 0">
        <h3>最近任务</h3>
        <ul class="tasks">
          <li v-for="task in detail.recent_tasks" :key="task.id">
            <span class="mono">{{ task.a2a_task_id }}</span>
            <span class="muted">{{ task.state }}</span>
            <span class="mono muted">{{ formatDuration(task.duration_ms) }}</span>
            <span class="mono muted">{{ formatDateTime(task.finished_at) }}</span>
          </li>
        </ul>
      </section>

      <details v-if="rawCard" class="raw">
        <summary>原始 Agent Card</summary>
        <pre>{{ rawCard }}</pre>
      </details>

      <div class="actions">
        <button
          type="button"
          class="btn"
          :disabled="busy !== null"
          @click="checkHealth"
        >
          {{ busy === 'health' ? '检查中…' : '健康检查' }}
        </button>
        <button
          type="button"
          class="btn"
          :disabled="busy !== null"
          @click="refreshCard"
        >
          {{ busy === 'refresh' ? '刷新中…' : '刷新 Card' }}
        </button>
        <button
          type="button"
          class="btn"
          :disabled="busy !== null"
          @click="toggleEnabled"
        >
          {{ busy === 'toggle' ? '处理中…' : detail.enabled ? '禁用' : '启用' }}
        </button>
        <button
          type="button"
          class="btn danger"
          :disabled="busy !== null"
          @click="removeAgent"
        >
          {{ busy === 'delete' ? '删除中…' : '删除' }}
        </button>
      </div>
    </div>
  </el-drawer>
</template>

<style scoped>
.detail {
  display: flex;
  flex-direction: column;
  gap: 16px;
  color: var(--ink-2);
  font-size: 12px;
}

.head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.title h2 {
  color: var(--ink);
  font-size: 15px;
  font-weight: 650;
}

.slug {
  color: var(--ink-3);
  font-size: 10px;
}

.desc {
  line-height: 1.7;
}

.facts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px 14px;
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
  margin-bottom: 6px;
  color: var(--ink);
  font-size: 11.5px;
  font-weight: 600;
}

.skills,
.tasks {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.skills li,
.tasks li {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 10px;
  padding: 6px 8px;
  border: 1px solid var(--line-2);
  border-radius: 6px;
  background: var(--surface);
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
}

.tasks li {
  justify-content: space-between;
}

.empty {
  color: var(--ink-3);
  font-size: 10.5px;
}

.error-line {
  padding: 8px 10px;
  border: 1px solid var(--red-soft);
  border-radius: 6px;
  background: var(--red-soft);
  color: var(--red);
  line-height: 1.6;
}

.muted {
  color: var(--ink-3);
  font-size: 10.5px;
}

.ellipsis {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.raw summary {
  color: var(--ink-3);
  font-size: 10.5px;
  cursor: pointer;
}

.raw pre {
  max-height: 240px;
  margin: 6px 0 0;
  padding: 8px;
  overflow: auto;
  border: 1px solid var(--line-2);
  border-radius: 6px;
  background: var(--surface);
  font-family: var(--font-mono);
  font-size: 10px;
  line-height: 1.55;
  white-space: pre-wrap;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding-top: 4px;
}

.btn.danger {
  border-color: var(--red-soft);
  color: var(--red);
}

.btn.danger:hover:not(:disabled) {
  border-color: var(--red);
}
</style>
