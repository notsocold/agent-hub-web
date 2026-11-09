<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'

import ErrorState from '@/components/common/ErrorState.vue'
import LoadingBlock from '@/components/common/LoadingBlock.vue'
import StatusBadge from '@/components/common/StatusBadge.vue'
import { tasksApi } from '@/api/tasks'
import { formatDateTime, formatDuration } from '@/utils/format'
import { stateLabel, stateTone } from './taskMeta'
import type { A2aTaskDetail, TaskAction } from '@/types'

const props = defineProps<{
  modelValue: boolean
  taskId: string | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  changed: [id: string]
}>()

const router = useRouter()

const open = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
})

const detail = ref<A2aTaskDetail | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)
const busy = ref<TaskAction | null>(null)

const resumeInput = ref('')
const nowMs = ref(Date.now())
const drawerSize = ref('480px')

let tickTimer: number | undefined

const openConversation = (): void => {
  const conversation = detail.value?.conversation
  if (!conversation) return
  void router.push({ path: '/chat', query: { c: conversation.id } })
}

const resumeQuestion = computed(() => detail.value?.input_request?.question ?? '')
const authScopes = computed(() => detail.value?.auth_request?.scopes ?? [])
const authorizationUrl = computed(() => detail.value?.auth_request?.authorization_url ?? null)
const expiresAt = computed(
  () => detail.value?.input_request?.expires_at ?? detail.value?.auth_request?.expires_at ?? null,
)

const expired = computed(() => {
  if (!expiresAt.value) return false
  const timestamp = Date.parse(expiresAt.value)
  return Number.isFinite(timestamp) && timestamp <= nowMs.value
})

const argsJson = computed(() =>
  detail.value?.request?.args ? JSON.stringify(detail.value.request.args, null, 2) : '',
)

const artifactEntries = computed<Array<[string, string]>>(() => {
  const data = detail.value?.result?.artifact.data
  if (!data) return []
  return Object.entries(data).map(([key, value]) => [key, formatRawValue(value)])
})

function formatRawValue(value: unknown): string {
  if (value === null) return 'null'
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value)
}

function hasAction(action: TaskAction): boolean {
  return detail.value?.available_actions.includes(action) ?? false
}

const canCancel = computed(() => hasAction('cancel'))
const canResume = computed(() => hasAction('resume') && !expired.value)
const canAuthorize = computed(() => hasAction('authorize') && !expired.value)
const canReject = computed(() => hasAction('reject') && !expired.value)

const canOpenConversation = computed(() => detail.value?.conversation != null)

watch(
  () => [props.modelValue, props.taskId] as const,
  ([isOpen, id]) => {
    if (isOpen && id) void load(id)
    if (!isOpen) resumeInput.value = ''
  },
)

const ACTIVE_STATES = new Set(['submitted', 'working', 'input_required', 'auth_required'])
let detailTimer: number | undefined

function stopDetailPolling(): void {
  if (detailTimer !== undefined) {
    window.clearInterval(detailTimer)
    detailTimer = undefined
  }
}

/** 任务进入运行/等待态后静默刷新详情，动作完成后无需手动关闭再打开。 */
function syncDetailPolling(): void {
  const shouldPoll =
    props.modelValue && detail.value !== null && ACTIVE_STATES.has(detail.value.state)
  if (!shouldPoll) {
    stopDetailPolling()
    return
  }
  if (detailTimer !== undefined) return
  detailTimer = window.setInterval(() => {
    void refreshSilently()
  }, 3000)
}

async function refreshSilently(): Promise<void> {
  const id = detail.value?.id
  if (!id) return
  const previousState = detail.value?.state
  try {
    const next = await tasksApi.get(id)
    detail.value = next
    if (next.state !== previousState) emit('changed', id)
  } catch {
    // 静默轮询失败不打断当前详情
  }
}

watch(
  [() => props.modelValue, () => detail.value?.state],
  () => syncDetailPolling(),
  { immediate: true },
)

onUnmounted(stopDetailPolling)

async function load(id: string): Promise<void> {
  loading.value = true
  error.value = null
  detail.value = null
  resumeInput.value = ''
  try {
    detail.value = await tasksApi.get(id)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '加载任务详情失败'
  } finally {
    loading.value = false
  }
}

function errorMessage(cause: unknown, fallback: string): string {
  return cause instanceof Error ? cause.message : fallback
}

async function submitResume(): Promise<void> {
  if (!detail.value) return
  const input = resumeInput.value.trim()
  if (!input) {
    ElMessage.warning('请先填写补充信息')
    return
  }
  busy.value = 'resume'
  try {
    const result = await tasksApi.resume(detail.value.id, { input })
    detail.value = result.task
    resumeInput.value = ''
    emit('changed', detail.value.id)
    ElMessage.success('已提交补充信息')
  } catch (cause) {
    ElMessage.error(errorMessage(cause, '提交补充信息失败'))
  } finally {
    busy.value = null
  }
}

function isSafeAuthUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    if (parsed.protocol === 'https:') return true
    if (parsed.protocol === 'http:') {
      return parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost'
    }
    return false
  } catch {
    return false
  }
}

function goAuthorize(): void {
  const url = authorizationUrl.value
  if (!url) return
  if (!isSafeAuthUrl(url)) {
    ElMessage.error('授权地址不安全，已阻止打开')
    return
  }
  window.open(url, '_blank', 'noopener,noreferrer')
  ElMessage.info('完成外部授权后，回到这里点击「已授权」')
}

async function confirmAuthorize(): Promise<void> {
  if (!detail.value) return
  busy.value = 'authorize'
  try {
    const updated = await tasksApi.authorize(detail.value.id, { scopes: authScopes.value })
    detail.value = updated
    emit('changed', detail.value.id)
    ElMessage.success('已授权，任务将继续')
  } catch (cause) {
    ElMessage.error(errorMessage(cause, '授权失败'))
  } finally {
    busy.value = null
  }
}

async function confirmReject(): Promise<void> {
  if (!detail.value) return
  let reason = ''
  try {
    const result = await ElMessageBox.prompt('请输入拒绝原因（可选）。拒绝后任务进入「已拒绝」，不会再重试。', '拒绝任务？', {
      inputPlaceholder: '例如：暂不需要此授权',
      confirmButtonText: '确认拒绝',
      cancelButtonText: '取消',
    })
    reason = result.value.trim()
  } catch {
    return
  }
  busy.value = 'reject'
  try {
    const updated = await tasksApi.reject(detail.value.id, { reason })
    detail.value = updated
    emit('changed', detail.value.id)
    ElMessage.success('已拒绝')
  } catch (cause) {
    ElMessage.error(errorMessage(cause, '拒绝失败'))
  } finally {
    busy.value = null
  }
}

async function confirmCancel(): Promise<void> {
  if (!detail.value) return
  try {
    await ElMessageBox.confirm(`将取消任务 ${detail.value.a2a_task_id}，远程运行会停止。`, '取消任务？', {
      type: 'warning',
      confirmButtonText: '取消任务',
      cancelButtonText: '返回',
    })
  } catch {
    return
  }
  busy.value = 'cancel'
  try {
    const updated = await tasksApi.cancel(detail.value.id)
    detail.value = updated
    emit('changed', detail.value.id)
    ElMessage.success('已取消')
  } catch (cause) {
    ElMessage.error(errorMessage(cause, '取消失败'))
  } finally {
    busy.value = null
  }
}

function syncDrawerSize(): void {
  drawerSize.value = window.innerWidth < 700 ? '100%' : '480px'
}

onMounted(() => {
  syncDrawerSize()
  window.addEventListener('resize', syncDrawerSize)
  tickTimer = window.setInterval(() => {
    nowMs.value = Date.now()
  }, 1000)
})

onUnmounted(() => {
  if (tickTimer !== undefined) window.clearInterval(tickTimer)
  window.removeEventListener('resize', syncDrawerSize)
})
</script>

<template>
  <el-drawer v-model="open" title="任务详情" :size="drawerSize" :append-to-body="true">
    <LoadingBlock v-if="loading" label="正在加载任务详情…" />
    <ErrorState v-else-if="error" :message="error" @retry="taskId && load(taskId)" />

    <div v-else-if="detail" class="detail">
      <header class="head">
        <StatusBadge :tone="stateTone(detail.state)" :label="stateLabel(detail.state)" />
        <span class="mono task-id">{{ detail.a2a_task_id }}</span>
      </header>

      <dl class="facts">
        <div>
          <dt>智能体</dt>
          <dd>
            {{ detail.agent.name }}
            <span class="mono muted"> · {{ detail.agent.slug }}</span>
          </dd>
        </div>
        <div>
          <dt>所属会话</dt>
          <dd>
            <button
              v-if="canOpenConversation"
              type="button"
              class="link"
              @click="openConversation"
            >
              {{ detail.conversation?.title }}
            </button>
            <span v-else class="muted">—</span>
          </dd>
        </div>
        <div>
          <dt>Run</dt>
          <dd class="mono ellipsis">{{ detail.run_id }}</dd>
        </div>
        <div>
          <dt>耗时</dt>
          <dd class="mono">{{ formatDuration(detail.duration_ms) }}</dd>
        </div>
        <div>
          <dt>创建时间</dt>
          <dd class="mono">{{ formatDateTime(detail.created_at) }}</dd>
        </div>
        <div>
          <dt>更新时间</dt>
          <dd class="mono">{{ formatDateTime(detail.updated_at) }}</dd>
        </div>
      </dl>

      <section v-if="detail.request">
        <h3>请求</h3>
        <p class="body-text">{{ detail.request.summary }}</p>
        <details v-if="argsJson" class="raw">
          <summary>请求参数</summary>
          <pre>{{ argsJson }}</pre>
        </details>
      </section>

      <section v-if="detail.result">
        <h3>结果</h3>
        <p class="body-text">{{ detail.result.summary }}</p>
        <template v-if="detail.result.artifact.summary">
          <p class="artifact-summary">产出：{{ detail.result.artifact.summary }}</p>
        </template>
        <template v-if="artifactEntries.length > 0">
          <dl class="artifact-data">
            <div v-for="[key, value] in artifactEntries" :key="key">
              <dt class="mono">{{ key }}</dt>
              <dd class="mono">{{ value }}</dd>
            </div>
          </dl>
        </template>
      </section>

      <section v-if="detail.error" class="callout is-error">
        <h3>错误</h3>
        <p class="body-text">
          <span class="mono">{{ detail.error.code }}</span>
          <span v-if="detail.error.retryable" class="tag">可重试</span>
        </p>
        <p class="body-text">{{ detail.error.message }}</p>
        <p v-if="detail.error.at" class="muted mono">{{ formatDateTime(detail.error.at) }}</p>
      </section>

      <section v-if="detail.input_request" class="callout">
        <h3>等待补充信息</h3>
        <p class="body-text">{{ resumeQuestion }}</p>
        <p v-if="expiresAt" class="expires mono">到期时间：{{ formatDateTime(expiresAt) }}</p>
        <p v-if="expired" class="expired">已超时</p>
        <template v-else-if="canResume">
          <textarea
            v-model="resumeInput"
            class="resume-input"
            rows="4"
            maxlength="2000"
            placeholder="请输入补充信息（2000 字以内）"
          ></textarea>
          <div class="hint mono">{{ resumeInput.length }} / 2000</div>
          <button
            type="button"
            class="btn primary"
            :disabled="busy !== null"
            @click="submitResume"
          >
            {{ busy === 'resume' ? '提交中…' : '提交补充信息' }}
          </button>
        </template>
      </section>

      <section v-if="detail.auth_request" class="callout">
        <h3>需要授权</h3>
        <p class="body-text">
          授权范围：
          <span class="mono">{{ authScopes.length ? authScopes.join('、') : '—' }}</span>
        </p>
        <p v-if="expiresAt" class="expires mono">到期时间：{{ formatDateTime(expiresAt) }}</p>
        <p v-if="expired" class="expired">已超时</p>
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
        <button
          v-if="authorizationUrl && canAuthorize"
          type="button"
          class="btn"
          :disabled="busy !== null"
          @click="goAuthorize"
        >
          前往授权
        </button>
        <button
          v-if="canAuthorize"
          type="button"
          class="btn primary"
          :disabled="busy !== null"
          @click="confirmAuthorize"
        >
          {{ busy === 'authorize' ? '处理中…' : '已授权' }}
        </button>
        <button
          v-if="canReject"
          type="button"
          class="btn danger"
          :disabled="busy !== null"
          @click="confirmReject"
        >
          {{ busy === 'reject' ? '处理中…' : '拒绝' }}
        </button>
        <button
          v-if="canCancel"
          type="button"
          class="btn danger"
          :disabled="busy !== null"
          @click="confirmCancel"
        >
          {{ busy === 'cancel' ? '取消中…' : '取消任务' }}
        </button>
        <button
          v-if="canOpenConversation"
          type="button"
          class="btn"
          :disabled="busy !== null"
          @click="openConversation"
        >
          打开会话
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
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.task-id {
  color: var(--ink-3);
  font-size: 11px;
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

.body-text {
  margin: 0;
  line-height: 1.7;
}

.artifact-summary {
  margin: 6px 0 0;
  line-height: 1.7;
}

.artifact-data {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 8px;
}

.artifact-data div {
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding: 5px 8px;
  border: 1px solid var(--line-2);
  border-radius: 6px;
  background: var(--surface);
}

.artifact-data dt {
  flex: none;
  color: var(--ink-3);
  font-size: 10px;
}

.artifact-data dd {
  color: var(--ink);
  font-size: 11px;
  overflow-wrap: anywhere;
}

.muted {
  color: var(--ink-3);
  font-size: 10.5px;
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
  color: var(--prussian);
  font-size: 11.5px;
  text-align: left;
}

.link:hover {
  text-decoration: underline;
}

.raw summary {
  margin-top: 6px;
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
  overflow-wrap: anywhere;
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

.tag {
  display: inline-block;
  margin-left: 6px;
  padding: 0 6px;
  border: 1px solid var(--amber);
  border-radius: 99px;
  color: var(--amber-text);
  font-size: 10px;
}

.expires {
  margin-top: 6px;
  color: var(--ink-3);
  font-size: 10.5px;
}

.expired {
  margin-top: 6px;
  color: var(--red);
  font-size: 11px;
  font-weight: 600;
}

.resume-input {
  width: 100%;
  margin-top: 8px;
  padding: 8px 10px;
  border: 1px solid var(--line);
  border-radius: 6px;
  outline: none;
  background: var(--surface);
  color: var(--ink);
  font: inherit;
  font-size: 12px;
  resize: vertical;
}

.resume-input:focus {
  border-color: var(--ink-3);
}

.hint {
  margin: 4px 0 8px;
  color: var(--ink-3);
  font-size: 10px;
  text-align: right;
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

.timeline .tone-live {
  background: var(--prussian);
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

.btn.danger {
  border-color: var(--red-soft);
  color: var(--red);
}

.btn.danger:hover:not(:disabled) {
  border-color: var(--red);
}
</style>
