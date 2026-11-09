<script setup lang="ts">
import ProcessCardShell from './ProcessCardShell.vue'
import type { SkillProcess } from '@/types'

defineProps<{
  item: SkillProcess
}>()
</script>

<template>
  <ProcessCardShell
    kind="skill"
    :title="item.name"
    :status="item.status"
    :duration="item.estimatedTokens ? `${item.estimatedTokens} tokens` : undefined"
  >
    <p v-if="item.description" class="line">{{ item.description }}</p>
    <p class="line meta mono">
      {{ item.slug }}
      <template v-if="item.scope"> · {{ item.scope }}</template>
    </p>
  </ProcessCardShell>
</template>

<style scoped>
.line {
  margin: 0;
}

.line + .line {
  margin-top: 4px;
}

.meta {
  color: var(--ink-3);
  font-size: 10.5px;
}
</style>
