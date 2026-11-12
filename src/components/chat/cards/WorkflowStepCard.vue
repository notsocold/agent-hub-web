<script setup lang="ts">
import ProcessCardShell from './ProcessCardShell.vue'
import { formatDuration } from '@/utils/format'
import type { WorkflowStepProcess } from '@/types'

defineProps<{
  item: WorkflowStepProcess
}>()
</script>

<template>
  <ProcessCardShell
    kind="workflow"
    :title="item.stepTitle"
    :status="item.status"
    :duration="formatDuration(item.durationMs)"
  >
    <p class="line meta">
      <span class="mono">{{ item.tool }}</span>
    </p>
  </ProcessCardShell>
</template>

<style scoped>
.line {
  margin: 0;
}

.meta {
  color: var(--ink-3);
  font-size: 11px;
}
</style>
