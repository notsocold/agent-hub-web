<script setup lang="ts">
import ProcessCardShell from './ProcessCardShell.vue'
import type { SkillProcess } from '@/types'
import { formatDuration } from '@/utils/format'

defineProps<{
  item: SkillProcess
}>()
</script>

<template>
  <ProcessCardShell
    kind="skill"
    :title="item.name"
    :status="item.status"
    :status-label="item.status === 'ok' ? '已加载' : undefined"
    :duration="formatDuration(item.durationMs)"
    :args="item.slug"
  >
    <p v-if="item.description" class="proc-desc">{{ item.description }}</p>
    <div class="chips">
      <span class="chip">{{ item.slug }}</span>
      <span v-if="item.scope" class="chip">{{ item.scope }}</span>
      <span v-if="item.estimatedTokens" class="chip">{{ item.estimatedTokens }} tokens</span>
    </div>
    <div class="tool-note">skill · {{ item.slug }} · source: {{ item.scope || 'builtin' }}</div>
  </ProcessCardShell>
</template>
