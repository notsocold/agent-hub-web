<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, useId } from 'vue'

import AppIcon from '@/components/common/AppIcon.vue'
import { formatClock, formatDateTime } from '@/utils/format'
import { containsSensitiveKey, redactText, redactValue } from '@/utils/redact'
import type { ApprovalProcess } from '@/types'

const props = defineProps<{
  item: ApprovalProcess
  busy?: boolean
}>()

const emit = defineEmits<{
  approve: [note: string]
  reject: [note: string]
}>()

/** 备注上限与后端 `ApprovalDecisionRequest.note` 的展示约定一致。 */
const NOTE_MAX_LENGTH = 500
const note = ref('')
const noteId = useId()

/** 已决备注展示前再过一次字符串级遮罩（备注可能来自其他客户端/历史数据）。 */
const decisionNoteText = computed(() =>
  props.item.decisionNote ? redactText(props.item.decisionNote) : '',
)

/** 提交时截断兜底：即使浏览器未执行 maxlength，也不把超长备注发给后端。 */
function currentNote(): string {
  return note.value.slice(0, NOTE_MAX_LENGTH).trim()
}

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

/**
 * 只有仍待用户决定的卡才按截止时间判过期；已批准/已拒绝/已处理的历史卡
 * （如历史会话回放重建的卡）即使超过了 expires_at 也只展示结果。
 */
const expired = computed(
  () =>
    props.item.status === 'waiting' &&
    !props.item.decision &&
    expiresAtMs.value !== null &&
    now.value >= expiresAtMs.value,
)

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
  if (props.item.status === 'ok') return '已处理'
  if (props.item.status === 'canceled') return '已取消'
  if (expired.value) return '已过期'
  return '待审批'
})

const canDecide = computed(
  () =>
    !props.item.decision &&
    !expired.value &&
    !props.busy &&
    props.item.status === 'waiting',
)

const chipClass = computed(() => {
  if (canDecide.value) return 'is-warn'
  if (props.item.decision === 'approve') return 'is-ok'
  if (props.item.decision === 'reject' || expired.value) return 'is-warn'
  if (props.item.status === 'ok') return 'is-ok'
  return 'is-warn'
})

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
  <li
    class="entry entry-approval"
    :class="{ 'is-decided': !canDecide }"
    :data-approval-id="item.approvalId"
  >
    <span class="node" aria-hidden="true"></span>
    <div class="entry-head">
      <span class="who">审批</span>
      <span class="who-sub">外部写操作 · HITL</span>
      <span class="spacer"></span>
      <time v-if="item.startedAt">{{ formatClock(item.startedAt) }}</time>
    </div>
    <div class="entry-body">
      <div class="approval-card" :class="{ 'is-resolved': !canDecide }">
        <div class="approval-head">
          <AppIcon name="shield" />
          <span class="approval-title">需要你的决定</span>
          <span class="status-chip" :class="chipClass">{{ decidedLabel }}</span>
        </div>
        <div class="approval-body">
          <p v-if="item.reason" class="approval-action">{{ item.reason }}</p>
          <dl class="risk-list">
            <dt>执行工具</dt>
            <dd><span class="mono">{{ item.tool }}</span></dd>
            <dt v-if="item.executor">执行方</dt>
            <dd v-if="item.executor">{{ item.executor }}</dd>
            <dt v-if="item.target">目标</dt>
            <dd v-if="item.target">{{ item.target }}</dd>
            <dt v-if="item.sideEffect">副作用</dt>
            <dd v-if="item.sideEffect">{{ item.sideEffect }}</dd>
            <dt>风险</dt>
            <dd :class="`risk risk-${item.risk}`">{{ riskLabel }}</dd>
            <dt v-if="item.expiresAt">超时</dt>
            <dd v-if="item.expiresAt" class="mono" :class="{ 'is-expired': expired }">
              {{
                expired
                  ? `已过期 · ${formatDateTime(item.expiresAt)}`
                  : item.status === 'waiting' && !item.decision
                    ? remainingLabel
                    : formatDateTime(item.expiresAt)
              }}
            </dd>
          </dl>

          <details v-if="payload" class="payload">
            <summary>
              查看参数
              <span v-if="hasSensitive" class="mask-note">敏感字段已遮罩</span>
            </summary>
            <pre class="payload-body mono">{{ payloadJson }}</pre>
          </details>
          <details v-else-if="previewText" class="payload">
            <summary>参数预览（已脱敏）</summary>
            <pre class="payload-body mono">{{ previewText }}</pre>
          </details>
          <p v-else class="payload-empty">参数预览不可用</p>
        </div>

        <div v-if="canDecide" class="approval-note">
          <label :for="noteId" class="approval-note-label">审批备注（可选）</label>
          <textarea
            :id="noteId"
            v-model="note"
            class="approval-note-input"
            :maxlength="NOTE_MAX_LENGTH"
            rows="2"
            placeholder="填写批准/拒绝理由，会记录到审批历史"
          ></textarea>
          <div class="approval-note-meta">
            <span>备注可选，不影响批准/拒绝</span>
            <span class="mono">{{ note.length }} / {{ NOTE_MAX_LENGTH }}</span>
          </div>
        </div>

        <div v-if="canDecide" class="approval-actions">
          <span class="spacer"></span>
          <button
            type="button"
            class="btn btn-outline"
            :disabled="busy"
            @click="emit('reject', currentNote())"
          >
            拒绝
          </button>
          <button
            type="button"
            class="btn btn-primary"
            data-approval-approve
            :disabled="busy"
            @click="emit('approve', currentNote())"
          >
            {{ busy ? '处理中…' : '批准并执行' }}
          </button>
        </div>
        <div v-else class="resolved-note">
          <AppIcon :name="expired || item.decision === 'reject' ? 'x' : 'check'" />
          <span v-if="item.decision === 'approve'">已批准，运行将继续。</span>
          <span v-else-if="item.decision === 'reject'">已拒绝，本次操作不会执行。</span>
          <span v-else-if="expired">审批已过期，无法继续执行。</span>
          <span v-else-if="item.status === 'canceled'">审批已取消。</span>
          <span v-else>审批已处理，运行将继续。</span>
        </div>
        <p v-if="!canDecide && decisionNoteText" class="approval-decision-note">
          <strong>备注：</strong>{{ decisionNoteText }}
        </p>
      </div>
    </div>
  </li>
</template>

<style scoped>
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
  margin-top: 10px;
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

.risk {
  font-weight: 600;
}

.approval-note {
  padding: 9px 15px 10px;
  border-top: 1px solid var(--line-2);
  background: var(--surface-2);
}

.approval-note-label {
  display: block;
  margin-bottom: 5px;
  color: var(--ink-2);
  font-size: 10.5px;
  font-weight: 600;
}

.approval-note-input {
  display: block;
  width: 100%;
  min-height: 46px;
  padding: 6px 8px;
  resize: vertical;
  border: 1px solid var(--line);
  border-radius: 5px;
  background: var(--surface);
  color: var(--ink);
  font: inherit;
  font-size: 11.5px;
  line-height: 1.6;
}

.approval-note-input:focus {
  outline: none;
  border-color: var(--prussian);
}

.approval-note-meta {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin-top: 4px;
  color: var(--ink-3);
  font-size: 9.5px;
}

.approval-decision-note {
  margin: 0;
  padding: 8px 15px 10px;
  border-top: 1px dashed var(--line-2);
  background: var(--surface-2);
  color: var(--ink-2);
  font-size: 11.5px;
  line-height: 1.6;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.approval-decision-note strong {
  color: var(--ink-3);
  font-weight: 600;
}

.approval-card.is-resolved .resolved-note {
  background: var(--surface-2);
  color: var(--ink-2);
}
</style>
