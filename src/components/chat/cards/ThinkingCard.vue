<script setup lang="ts">
import { computed, ref } from 'vue'

import AppIcon from '@/components/common/AppIcon.vue'

import { formatDuration, formatTokens } from '@/utils/format'
import type { MessageReasoning } from '@/types'

const props = defineProps<{
  reasoning: MessageReasoning
  streaming?: boolean
}>()

const open = ref(false)

const label = computed(() => {
  if (!props.reasoning.done) return '正在思考…'
  return `思考 · ${formatDuration(props.reasoning.durationMs)} · ${formatTokens(props.reasoning.tokens)} tokens`
})
</script>

<template>
  <div class="thinking-card" :class="{ 'is-collapsed': !open }">
    <button class="thinking-head" type="button" :aria-expanded="open" @click="open = !open">
      <span class="thinking-spark"><AppIcon name="spark" /></span>
      <span class="thinking-title">{{ label }}</span>
      <span v-if="reasoning.tokens" class="thinking-meta">{{ reasoning.tokens }} tokens · 推理摘要</span>
      <span class="spacer"></span>
      <span class="thinking-state">{{ reasoning.done ? '完成' : '思考中' }}</span>
      <AppIcon name="chevron" class="thinking-chev" />
    </button>
    <div v-if="open" class="thinking-body">
      <p>{{ reasoning.content || '暂无思考摘要。' }}</p>
    </div>
  </div>
</template>

<style scoped>
.thinking-card.is-collapsed .thinking-chev {
  transform: none;
}

.thinking-body {
  white-space: pre-wrap;
}
</style>
