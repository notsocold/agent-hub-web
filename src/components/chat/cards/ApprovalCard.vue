<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'

import ProcessCardShell from './ProcessCardShell.vue'
import { formatDateTime } from '@/utils/format'
import { containsSensitiveKey, redactText, redactValue } from '@/utils/redact'
import type { ApprovalProcess } from '@/types'

const props = defineProps<{
  item: ApprovalProcess
  busy?: boolean
}>()

const emit = defineEmits<{
  approve: []
  reject: []
}>()

const now = ref(Date.now())
let timer: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  timer = setInterval(() => {
    now.value = Date.now()
  }, 1000)
})

onUnmounted(() => {
  if (timer !== null) clearInterval(timer)
})

const expiresAtMs = computed(() => {
  const value = props.item.expiresAt
  if (!value) return null
  const ms = Date.parse(value)
  return Number.isNaN(ms) ? null : ms
})

const expired = computed(() => expiresAtMs.value !== null && now.value >= expiresAtMs.value)

const remainingLabel = computed(() => {
  if (expiresAtMs.value === null) return ''
  const remain = Math.max(0, expiresAtMs.value - now.value)
  const totalSeconds = Math.ceil(remain / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) return `${hours} 小时 ${minutes} 分`
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
})

const riskLabel = computed(
  () =>
    ({
      read: '只读',
      write: '写操作',
      destructive: '破坏性操作',
      unknown: '未知风险',
    })[props.item.risk] ?? props.item.risk,
)

const decidedLabel = computed(() => {
  if (props.item.decision === 'approve') return '已批准'
  if (props.item.decision === 'reject') return '已拒绝'
  if (expired.value) return '已过期'
  if (props.item.status === 'canceled') return '已取消'
  if (props.item.status === 'ok') return '已处理'
  return '等待决定'
})

const canDecide = computed(
  () =>
    !props.item.decision &&
    !expired.value &&
    !props.busy &&
    props.item.status === 'waiting',
)

const payload = computed(() => props.item.payload ?? null)
// M7：事件已带脱敏预览时不请求详情；预览文本再做一次字符串级遮罩兜底。
const previewText = computed(() =>
  props.item.payloadPreview ? redactText(props.item.payloadPreview) : '',
)
const hasSensitive = computed(() => containsSensitiveKey(payload.value))
const payloadJson = computed(() => {
  try {
    return JSON.stringify(redactValue(payload.value), null, 2)
  } catch {
    return String(payload.value)
  }
})
</script>

<template>
  <ProcessCardShell
    kind="approval"
    :title="item.toolDisplayName || item.tool"
    :status="item.status"
    :status-label="decidedLabel"
    :data-approval-id="item.approvalId"
  >
    <p v-if="item.reason" class="reason">{{ item.reason }}</p>

    <dl class="facts">
      <div v-if="item.executor">
        <dt>执行方</dt>
        <dd>{{ item.executor }}</dd>
      </div>
      <div v-if="item.target">
        <dt>目标</dt>
        <dd>{{ item.target }}</dd>
      </div>
      <div v-if="item.sideEffect">
        <dt>副作用</dt>
        <dd>{{ item.sideEffect }}</dd>
      </div>
      <div>
        <dt>风险</dt>
        <dd :class="`risk risk-${item.risk}`">{{ riskLabel }}</dd>
      </div>
      <div v-if="item.expiresAt">
        <dt>{{ expired ? '过期时间' : '剩余时间' }}</dt>
        <dd class="mono" :class="{ 'is-expired': expired }">
          {{ expired ? formatDateTime(item.expiresAt) : remainingLabel }}
        </dd>
      </div>
    </dl>

    <details v-if="payload" class="payload">
      <summary>
        查看参数
        <span v-if="hasSensitive" class="mask-note">敏感字段已遮罩</span>
      </summary>
      <pre class="payload-body mono">{{ payloadJson }}</pre>
    </details>
    <details v-else-if="previewText" class="payload" open>
      <summary>参数预览（已脱敏）</summary>
      <pre class="payload-body mono">{{ previewText }}</pre>
    </details>
    <p v-else class="payload-empty">参数预览不可用</p>

    <div v-if="canDecide" class="actions">
      <button type="button" class="btn ghost" :disabled="busy" @click="emit('reject')">拒绝</button>
      <button
        type="button"
        class="btn primary"
        data-approval-approve
        :disabled="busy"
        @click="emit('approve')"
      >
        {{ busy ? '处理中…' : '批准并执行' }}
      </button>
    </div>
    <p v-else-if="item.decision" class="resolved">
      {{ item.decision === 'approve' ? '已批准，运行将继续。' : '已拒绝，本次操作不会执行。' }}
    </p>
    <p v-else-if="expired" class="resolved is-expired">审批已过期，无法继续执行。</p>
    <p v-else-if="item.status === 'canceled'" class="resolved">审批已取消。</p>
    <p v-else class="resolved">审批已处理，运行将继续。</p>
  </ProcessCardShell>
</template>

<style scoped>
.reason {
  margin: 0 0 8px;
  color: var(--ink-2);
}

.facts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px 14px;
  margin: 0;
}

.facts div {
  min-width: 0;
}

.facts dt {
  color: var(--ink-3);
  font-size: 10px;
}

.facts dd {
  margin: 1px 0 0;
  overflow-wrap: anywhere;
  color: var(--ink);
  font-size: 11.5px;
}

.risk {
  font-weight: 600;
}

.risk-write {
  color: var(--amber-text);
}

.risk-destructive {
  color: var(--red);
}

.is-expired {
  color: var(--red);
}

.payload {
  margin-top: 9px;
  border-top: 1px dashed var(--line);
  padding-top: 8px;
}

.payload-empty {
  margin: 9px 0 0;
  color: var(--ink-3);
  font-size: 10.5px;
}

.payload summary {
  cursor: pointer;
  color: var(--ink-3);
  font-size: 10.5px;
  user-select: none;
}

.mask-note {
  margin-left: 6px;
  color: var(--amber-text);
}

.payload-body {
  max-height: 200px;
  margin: 7px 0 0;
  padding: 8px 9px;
  overflow: auto;
  border: 1px solid var(--line);
  border-radius: 5px;
  background: var(--surface-2);
  color: var(--ink-2);
  font-size: 10.5px;
  line-height: 1.55;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 12px;
}

.btn {
  height: 30px;
  padding: 0 12px;
  border: 1px solid var(--line);
  border-radius: 5px;
  background: var(--surface);
  color: var(--ink-2);
  font-size: 12px;
  font-weight: 550;
}

.btn:hover:not(:disabled) {
  border-color: var(--ink-3);
  color: var(--ink);
}

.btn.primary {
  border-color: var(--prussian);
  background: var(--prussian);
  color: var(--surface);
}

.btn.primary:hover:not(:disabled) {
  filter: brightness(1.06);
}

.btn:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.resolved {
  margin: 10px 0 0;
  color: var(--ink-3);
  font-size: 11px;
}
</style>
