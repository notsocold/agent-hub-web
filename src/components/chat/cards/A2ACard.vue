<script setup lang="ts">
import { computed } from 'vue'

import AppIcon from '@/components/common/AppIcon.vue'
import { formatDuration } from '@/utils/format'
import type { A2aProcess } from '@/types'

const props = defineProps<{
  item: A2aProcess
}>()

const emit = defineEmits<{
  'open-output': []
}>()

const stateLabel = computed(
  () =>
    ({
      submitted: '已提交',
      working: '运行中',
      input_required: '等待输入',
      auth_required: '需要授权',
      completed: '已完成',
      failed: '失败',
      canceled: '已取消',
      rejected: '已拒绝',
    })[props.item.state],
)

const isDone = computed(() => props.item.state === 'completed')
const isFailed = computed(
  () => props.item.state === 'failed' || props.item.state === 'canceled' || props.item.state === 'rejected',
)

const badge = computed(() => {
  const name = props.item.agentName || props.item.agent || 'A2A'
  const parts = name.replace(/[-_.]/g, ' ').trim().split(/\s+/).filter(Boolean)
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
})

const stateClass = computed(() => {
  if (isDone.value) return 'is-done'
  if (isFailed.value) return 'is-error'
  return 'is-running'
})
</script>

<template>
  <li class="entry entry-a2a">
    <span class="node" aria-hidden="true"></span>
    <div class="entry-body">
      <div class="delegation">
        <div class="delegation-head">
          <span class="delegation-title">远程委派</span>
          <span class="tag">A2A</span>
          <span class="delegation-count">{{ item.agentName || item.agent }}</span>
          <span class="spacer"></span>
          <span class="delegation-state">{{ stateLabel }}</span>
        </div>

        <div
          class="a2a-row"
          :class="{ 'is-done': isDone }"
          role="button"
          tabindex="0"
          :aria-label="`查看 ${item.agentName || item.agent} 的远程任务产出`"
          @click="emit('open-output')"
          @keydown.enter.prevent="emit('open-output')"
        >
          <span class="agent-badge" aria-hidden="true">{{ badge }}</span>
          <div class="a2a-row-ident">
            <div class="a2a-name">{{ item.agentName || item.agent }}</div>
            <div class="a2a-task">{{ item.requestSummary || '远程任务' }}</div>
            <div v-if="item.resultSummary" class="a2a-row-result" :class="{ 'is-error': isFailed }">
              <AppIcon :name="isFailed ? 'x' : 'check'" />
              {{ item.resultSummary }}
            </div>
            <div v-else-if="item.error" class="a2a-row-result is-error">
              <AppIcon name="x" />
              {{ item.error }}
            </div>
          </div>
          <div class="a2a-row-state">
            <span class="a2a-status" :class="stateClass">
              <span class="dot" :class="isDone ? 'is-ok' : isFailed ? 'is-warn' : 'is-live'"></span>
              {{ stateLabel }}
            </span>
            <span class="a2a-row-meta">{{ item.a2aTaskId || item.taskId }}</span>
            <button
              type="button"
              class="a2a-stream-hint meta-link"
              @click.stop="emit('open-output')"
            >
              查看输出
              <AppIcon name="arrow" />
            </button>
          </div>
        </div>

        <div class="delegation-foot">
          <span class="mono">{{ item.a2aTaskId || item.taskId }}</span>
          <span>·</span>
          <span>{{ formatDuration(item.durationMs) }}</span>
          <span>·</span>
          <span>A2A 1.0</span>
        </div>
      </div>
    </div>
  </li>
</template>

<style scoped>
.a2a-row-result.is-error {
  color: var(--red);
}

.a2a-status.is-error {
  color: var(--red);
}

.a2a-status.is-running {
  color: var(--amber-text);
}
</style>
