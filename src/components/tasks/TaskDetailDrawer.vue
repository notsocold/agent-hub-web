<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'

import ErrorState from '@/components/common/ErrorState.vue'
import LoadingSkeleton from '@/components/common/LoadingSkeleton.vue'
import { tasksApi } from '@/api/tasks'
import { formatDateTime } from '@/utils/format'
import { isSafeAuthorizationUrl } from './authorizationUrl'
import { stateLabel, stateTone } from './taskMeta'
import type { A2aTaskDetail, TaskAction } from '@/types'

const props = withDefaults(
  defineProps<{
    modelValue: boolean
    taskId: string | null
    /** M7：任务动作接口仅管理员可用，普通用户只能查看详情。 */
    canManage?: boolean
  }>(),
  { canManage: false },
)

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
const drawerSize = ref('520px')

let tickTimer: number | undefined

const openConversation = (): void => {
  const conversation = detail.value?.conversation
  if (!conversation) return
  void router.push({ path: '/chat', query: { c: conversation.id } })
}

const resumeQuestion = computed(() => detail.value?.input_request?.question ?? '')
const authScopes = computed(() => detail.value?.auth_request?.scopes ?? [])
const authorizationUrl = computed(() => detail.value?.auth_request?.authorization_url ?? null)
/** M7：后端会把非法/内网/超长授权链接置空；前端只渲染安全链接。 */
const hasSafeAuthorizationUrl = computed(() => isSafeAuthorizationUrl(authorizationUrl.value))
const showAuthorizationUnavailable = computed(
  () => detail.value?.state === 'auth_required' && !hasSafeAuthorizationUrl.value,
)
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

function statusClass(state: string): string {
  return `st-${stateTone(state)}`
}

function statusDotClass(state: string): string {
  const tone = stateTone(state)
  if (tone === 'live') return 'is-live'
  if (tone === 'ok') return 'is-ok'
  if (tone === 'error') return 'is-warn'
  return ''
}

function timelineTone(state: string, isLast: boolean): string {
  if (!isLast) return 'is-done'
  if (state === 'failed') return 'is-error'
  if (state === 'completed' || state === 'canceled' || state === 'rejected') return 'is-done'
  return 'is-now'
}

/** 原型时间线展示 A2A 原始状态名（下划线换成连字符）。 */
function timelineStateLabel(state: string): string {
  return state.replace(/_/g, '-')
}

/** 与任务页一致：短任务保留秒/毫秒，长任务用 00:12 形式。 */
function formatTaskDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return '—'
  if (ms < 10_000) {
    if (ms < 1000) return `${Math.round(ms)}ms`
    return `${(ms / 1000).toFixed(1)}s`
  }
  const totalSeconds = Math.round(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function hasAction(action: TaskAction): boolean {
  return detail.value?.available_actions.includes(action) ?? false
}

const canCancel = computed(() => props.canManage && hasAction('cancel'))
const canResume = computed(() => props.canManage && hasAction('resume') && !expired.value)
const canAuthorize = computed(() => props.canManage && hasAction('authorize') && !expired.value)
const canReject = computed(() => props.canManage && hasAction('reject') && !expired.value)

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

function goAuthorize(): void {
  const url = authorizationUrl.value
  if (!url) return
  if (!isSafeAuthorizationUrl(url)) {
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
  drawerSize.value = window.innerWidth < 700 ? '100%' : '520px'
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
    <LoadingSkeleton v-if="loading" variant="card" />
    <ErrorState v-else-if="error" :message="error" @retry="taskId && load(taskId)" />

    <div v-else-if="detail" class="detail">
      <div class="res-summary head">
        <span class="st" :class="statusClass(detail.state)">
          <span class="dot" :class="statusDotClass(detail.state)"></span>
          {{ stateLabel(detail.state) }}
        </span>
        <span class="mono task-id">{{ detail.a2a_task_id }}</span>
        <span class="spacer"></span>
        <span class="mono muted">{{ formatTaskDuration(detail.duration_ms) }}</span>
      </div>

      <dl class="kv facts">
        <dt>智能体</dt>
        <dd>
          {{ detail.agent.name }}
          <span class="mono muted"> · {{ detail.agent.slug }}</span>
        </dd>
        <dt>所属会话</dt>
        <dd>
          <button v-if="canOpenConversation" type="button" class="link" @click="openConversation">
            {{ detail.conversation?.title }}
          </button>
          <span v-else class="muted">—</span>
        </dd>
        <dt>Run</dt>
        <dd class="mono ellipsis">{{ detail.run_id }}</dd>
        <dt>创建时间</dt>
        <dd class="mono">{{ formatDateTime(detail.created_at) }}</dd>
        <dt>更新时间</dt>
        <dd class="mono">{{ formatDateTime(detail.updated_at) }}</dd>
      </dl>

      <section v-if="detail.request" class="res-section">
        <h3>请求</h3>
        <p class="res-note">{{ detail.request.summary }}</p>
        <details v-if="argsJson" class="res-raw">
          <summary>请求参数</summary>
          <pre class="res-json">{{ argsJson }}</pre>
        </details>
      </section>

      <section v-if="detail.result" class="res-section">
        <h3>结果</h3>
        <p class="res-note">{{ detail.result.summary }}</p>
        <template v-if="detail.result.artifact.summary">
          <p class="res-note">产出：{{ detail.result.artifact.summary }}</p>
        </template>
        <template v-if="artifactEntries.length > 0">
          <dl class="artifact-data kv">
            <template v-for="[key, value] in artifactEntries" :key="key">
              <dt class="mono">{{ key }}</dt>
              <dd class="mono">{{ value }}</dd>
            </template>
          </dl>
        </template>
      </section>

      <section v-if="detail.error" class="res-section">
        <h3>错误</h3>
        <div class="res-error">
          <p>
            <span class="mono">{{ detail.error.code }}</span>
            <span v-if="detail.error.retryable" class="tag">可重试</span>
          </p>
          <p>{{ detail.error.message }}</p>
          <p v-if="detail.error.at" class="mono muted">{{ formatDateTime(detail.error.at) }}</p>
        </div>
      </section>

      <section v-if="detail.input_request" class="callout">
        <h3>等待补充信息</h3>
        <p class="res-note">{{ resumeQuestion }}</p>
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
          <button type="button" class="btn btn-primary" :disabled="busy !== null" @click="submitResume">
            {{ busy === 'resume' ? '提交中…' : '提交补充信息' }}
          </button>
        </template>
      </section>

      <section v-if="detail.auth_request" class="callout">
        <h3>需要授权</h3>
        <p class="res-note">
          授权范围：
          <span class="mono">{{ authScopes.length ? authScopes.join('、') : '—' }}</span>
        </p>
        <p v-if="expiresAt" class="expires mono">到期时间：{{ formatDateTime(expiresAt) }}</p>
        <p v-if="expired" class="expired">已超时</p>
      </section>

      <section class="res-section">
        <h3>状态时间线</h3>
        <ol class="task-timeline">
          <li
            v-for="(entry, index) in detail.timeline"
            :key="`${entry.state}-${entry.at}`"
            :class="timelineTone(entry.state, index === detail.timeline.length - 1)"
          >
            <span class="tl-dot"></span>
            <div>
              <b>{{ timelineStateLabel(entry.state) }}</b>
              <small>
                {{ formatDateTime(entry.at) }}<template v-if="entry.note"> · {{ entry.note }}</template>
              </small>
            </div>
          </li>
        </ol>
      </section>

      <p v-if="showAuthorizationUnavailable" class="auth-unavailable" role="status">
        授权链接不可用，请联系管理员。
      </p>

      <div class="actions">
        <button
          v-if="hasSafeAuthorizationUrl && canAuthorize"
          type="button"
          class="btn btn-outline"
          :disabled="busy !== null"
          @click="goAuthorize"
        >
          前往授权
        </button>
        <button
          v-if="canAuthorize"
          type="button"
          class="btn btn-primary"
          :disabled="busy !== null"
          @click="confirmAuthorize"
        >
          {{ busy === 'authorize' ? '处理中…' : '已授权' }}
        </button>
        <button
          v-if="canReject"
          type="button"
          class="btn btn-outline is-danger-text"
          :disabled="busy !== null"
          @click="confirmReject"
        >
          {{ busy === 'reject' ? '处理中…' : '拒绝' }}
        </button>
        <button
          v-if="canCancel"
          type="button"
          class="btn btn-outline is-danger-text"
          :disabled="busy !== null"
          @click="confirmCancel"
        >
          {{ busy === 'cancel' ? '取消中…' : '取消任务' }}
        </button>
        <button
          v-if="canOpenConversation"
          type="button"
          class="btn btn-ghost"
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
  gap: 14px;
  color: var(--ink-2);
  font-size: 12px;
}

.head {
  padding-bottom: 12px;
  border-bottom: 1px solid var(--line-2);
}

.task-id {
  color: var(--ink-3);
  font-size: 10.5px;
}

.spacer {
  flex: 1;
}

.facts {
  margin-top: 0;
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

.artifact-data {
  margin-top: 8px;
}

.artifact-data dt {
  white-space: nowrap;
}

.artifact-data dd {
  overflow-wrap: anywhere;
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

.callout {
  padding: 10px 12px;
  border: 1px solid var(--amber-soft);
  border-radius: 7px;
  background: var(--amber-soft);
}

.callout h3 {
  margin-bottom: 5px;
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

.auth-unavailable {
  margin: 0;
  padding: 7px 9px;
  border: 1px solid var(--amber-soft, var(--line));
  border-radius: 6px;
  background: var(--amber-bg, var(--surface-2));
  color: var(--amber-text, var(--ink-2));
  font-size: 11px;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding-top: 4px;
}
</style>
