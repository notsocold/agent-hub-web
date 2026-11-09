<script setup lang="ts">
import { computed, ref } from 'vue'

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
  <div class="thinking">
    <button class="thinking-head" type="button" :aria-expanded="open" @click="open = !open">
      <span class="dot" :class="{ 'is-live': !reasoning.done }"></span>
      <span class="label">{{ label }}</span>
      <svg class="chevron" :class="{ 'is-open': open }" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 9l6 6 6-6" />
      </svg>
    </button>
    <div v-if="open" class="thinking-body">
      <p>{{ reasoning.content || '暂无思考摘要。' }}</p>
    </div>
  </div>
</template>

<style scoped>
.thinking {
  margin-bottom: 10px;
  border: 1px dashed var(--line);
  border-radius: 8px;
  background: var(--surface-2);
}

.thinking-head {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 7px 11px;
  color: var(--ink-2);
  font-size: 11.5px;
  text-align: left;
}

.thinking-head:hover {
  color: var(--ink);
}

.label {
  flex: 1;
}

.chevron {
  width: 14px;
  height: 14px;
  color: var(--ink-3);
  fill: none;
  stroke: currentColor;
  stroke-width: 1.7;
  stroke-linecap: round;
  stroke-linejoin: round;
  transition: transform 0.15s;
}

.chevron.is-open {
  transform: rotate(180deg);
}

.thinking-body {
  padding: 0 11px 9px;
  color: var(--ink-3);
  font-size: 11.5px;
  line-height: 1.7;
  white-space: pre-wrap;
}
</style>
