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
    :status-label="item.status === 'error' || item.status === 'canceled' ? '已拒绝' : undefined"
    :duration="formatDuration(item.durationMs)"
    :args="item.stepType"
  >
    <p class="proc-desc mono">{{ item.tool }}</p>
    <div class="tool-note">workflow · {{ item.stepId }} · {{ item.stepType }}</div>
  </ProcessCardShell>
</template>
