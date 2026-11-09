<script setup lang="ts">
import { computed } from 'vue'

import type { ChatRecovery } from '@/types'

const props = defineProps<{
  recovery: ChatRecovery
  busy?: boolean
}>()

const emit = defineEmits<{
  retry: []
  stop: []
  refresh: []
  approvals: []
}>()

const title = computed(() => {
  switch (props.recovery.kind) {
    case 'run_in_progress':
      return '该会话有运行中的请求'
    case 'run_interrupted':
      return '运行在等待审批或输入'
    case 'approval_resume_failed':
      return '审批已记录，运行未自动恢复'
    default:
      return '本次发送未完成'
  }
})

const tone = computed(() =>
  props.recovery.kind === 'stream_failed' || props.recovery.kind === 'approval_resume_failed'
    ? 'warn'
    : 'info',
)

const showRetry = computed(
  () => props.recovery.kind === 'stream_failed' && props.recovery.retryable,
)
const showApprovals = computed(
  () =>
    props.recovery.kind === 'run_interrupted' || props.recovery.kind === 'approval_resume_failed',
)
const showStop = computed(
  () =>
    props.recovery.kind === 'run_in_progress' ||
    props.recovery.kind === 'run_interrupted' ||
    props.recovery.kind === 'approval_resume_failed',
)
</script>

<template>
  <div class="recovery" :class="`tone-${tone}`" role="status" aria-live="polite">
    <div class="recovery-body">
      <p class="recovery-title">{{ title }}</p>
      <p class="recovery-message">{{ recovery.message }}</p>
      <p v-if="recovery.runId" class="recovery-meta mono">
        run {{ recovery.runId }}
        <span v-if="recovery.runStatus"> · {{ recovery.runStatus }}</span>
      </p>
    </div>
    <div class="recovery-actions">
      <button v-if="showApprovals" type="button" class="btn primary" :disabled="busy" @click="emit('approvals')">
        处理审批
      </button>
      <button v-if="showRetry" type="button" class="btn primary" :disabled="busy" @click="emit('retry')">
        重试发送
      </button>
      <button type="button" class="btn" :disabled="busy" @click="emit('refresh')">刷新状态</button>
      <button v-if="showStop" type="button" class="btn danger" :disabled="busy" @click="emit('stop')">
        放弃本轮
      </button>
    </div>
  </div>
</template>

<style scoped>
.recovery {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 14px;
  flex: none;
  margin: 10px 32px 0;
  padding: 10px 12px;
  border: 1px solid var(--amber-soft);
  border-radius: 8px;
  background: var(--amber-soft);
}

.recovery.tone-info {
  border-color: var(--line);
  background: var(--surface-2);
}

.recovery-body {
  flex: 1 1 320px;
  min-width: 0;
}

.recovery-title {
  color: var(--ink);
  font-size: 12px;
  font-weight: 600;
}

.recovery-message {
  margin-top: 2px;
  color: var(--ink-2);
  font-size: 11.5px;
  line-height: 1.6;
}

.recovery-meta {
  margin-top: 3px;
  color: var(--ink-3);
  font-size: 9.5px;
}

.recovery-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.btn {
  height: 28px;
  padding: 0 10px;
  border: 1px solid var(--line);
  border-radius: 5px;
  background: var(--surface);
  color: var(--ink-2);
  font-size: 11.5px;
  white-space: nowrap;
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

.btn.danger {
  border-color: var(--red);
  color: var(--red);
}

.btn:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

@media (max-width: 900px) {
  .recovery {
    margin: 8px 14px 0;
  }
}
</style>
