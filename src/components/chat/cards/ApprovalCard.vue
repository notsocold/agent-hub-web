<script setup lang="ts">
import { computed } from 'vue'

import ProcessCardShell from './ProcessCardShell.vue'
import { formatDateTime } from '@/utils/format'
import type { ApprovalProcess } from '@/types'

const props = defineProps<{
  item: ApprovalProcess
  busy?: boolean
}>()

const emit = defineEmits<{
  approve: []
  reject: []
}>()

const riskLabel = computed(
  () =>
    ({
      read: '只读',
      write: '写操作',
      destructive: '破坏性操作',
      unknown: '未知风险',
    })[props.item.risk] ?? props.item.risk,
)

const expired = computed(
  () => Boolean(props.item.expiresAt) && Date.now() > Date.parse(props.item.expiresAt ?? ''),
)

const decidedLabel = computed(() => {
  if (props.item.decision === 'approve') return '已批准'
  if (props.item.decision === 'reject') return '已拒绝'
  return expired.value ? '已过期' : '等待决定'
})

const canDecide = computed(
  () => !props.item.decision && !expired.value && !props.busy,
)
</script>

<template>
  <ProcessCardShell
    kind="approval"
    :title="item.toolDisplayName || item.tool"
    :status="item.status"
    :status-label="decidedLabel"
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
        <dt>过期时间</dt>
        <dd class="mono">{{ formatDateTime(item.expiresAt) }}</dd>
      </div>
    </dl>

    <div v-if="canDecide" class="actions">
      <button type="button" class="btn ghost" :disabled="busy" @click="emit('reject')">
        拒绝
      </button>
      <button type="button" class="btn primary" :disabled="busy" @click="emit('approve')">
        {{ busy ? '处理中…' : '批准并继续' }}
      </button>
    </div>
    <p v-else-if="item.decision" class="resolved">
      {{ item.decision === 'approve' ? '已批准，运行将继续。' : '已拒绝，本次操作不会执行。' }}
    </p>
    <p v-else class="resolved">审批已过期，无法继续执行。</p>
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
