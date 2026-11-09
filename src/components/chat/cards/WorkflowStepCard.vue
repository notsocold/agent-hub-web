<script setup lang="ts">
import { computed } from 'vue'

import ProcessCardShell from './ProcessCardShell.vue'
import { formatDuration } from '@/utils/format'
import type { WorkflowStepProcess } from '@/types'

const props = defineProps<{
  item: WorkflowStepProcess
}>()

const stepLabel = computed(() => `步骤 ${props.item.stepIndex}`)
</script>

<template>
  <ProcessCardShell
    kind="workflow"
    :title="item.name"
    :status="item.status"
    :duration="formatDuration(item.durationMs)"
  >
    <p class="line meta">
      <span class="mono">{{ stepLabel }}</span>
      <span class="sep">·</span>
      {{ item.stepType }}
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

.sep {
  margin: 0 4px;
  opacity: 0.5;
}
</style>
