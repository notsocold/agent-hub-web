<script setup lang="ts">
import { computed } from 'vue'

import ProcessCardShell from './ProcessCardShell.vue'
import { formatDuration } from '@/utils/format'
import type { A2aProcess } from '@/types'

const props = defineProps<{
  item: A2aProcess
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

const progressPercent = computed(() =>
  props.item.progress === null ? null : Math.round(props.item.progress * 100),
)
</script>

<template>
  <ProcessCardShell
    kind="a2a"
    :title="item.agentName || item.agent"
    :status="item.status"
    :status-label="stateLabel"
    :duration="formatDuration(item.durationMs)"
  >
    <p v-if="item.requestSummary" class="line">{{ item.requestSummary }}</p>

    <div
      v-if="progressPercent !== null"
      class="progress"
      role="progressbar"
      :aria-valuenow="progressPercent"
    >
      <span :style="{ width: `${progressPercent}%` }"></span>
    </div>

    <p v-if="item.resultSummary" class="line result">{{ item.resultSummary }}</p>
    <p v-if="item.artifactSummary" class="line artifact">产出：{{ item.artifactSummary }}</p>
    <p v-if="item.error" class="line error">{{ item.error }}</p>
    <p class="line meta mono">
      <span>{{ item.a2aTaskId || item.taskId }}</span>
      <RouterLink
        v-if="item.taskId"
        class="task-link"
        :to="{ name: 'tasks', query: { task: item.taskId } }"
      >
        查看任务
      </RouterLink>
    </p>
  </ProcessCardShell>
</template>

<style scoped>
.line {
  margin: 0;
}

.line + .line {
  margin-top: 5px;
}

.result {
  color: var(--ink);
}

.artifact {
  color: var(--kind-a2a);
}

.error {
  color: var(--red);
}

.task-link {
  flex: none;
  color: var(--prussian);
  font-family: var(--font-sans);
  font-size: 10.5px;
}

.task-link:hover {
  text-decoration: underline;
}

.meta {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin-top: 6px;
  color: var(--ink-3);
  font-size: 10px;
}

.progress {
  height: 4px;
  margin: 7px 0;
  overflow: hidden;
  border-radius: 99px;
  background: var(--surface-2);
}

.progress span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--kind-a2a);
  transition: width 0.3s ease;
}
</style>
