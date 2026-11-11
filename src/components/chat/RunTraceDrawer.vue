<script setup lang="ts">
import RunTracePanel from './RunTracePanel.vue'
import type { ProcessItem, Usage } from '@/types'

defineProps<{
  open: boolean
  items: ProcessItem[]
  runId: string | null
  streaming: boolean
  usage: Usage | null
  finishReason: string | null
  conversationTitle: string
}>()

const emit = defineEmits<{
  close: []
}>()
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="trace-scrim" @click="emit('close')"></div>
    <aside v-if="open" class="trace" aria-label="运行详情">
      <header class="trace-head">
        <div>
          <p class="eyebrow mono">RUN DETAILS</p>
          <h2>运行轨迹</h2>
        </div>
        <button type="button" class="close" aria-label="关闭运行详情" @click="emit('close')">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </header>

      <RunTracePanel
        :items="items"
        :run-id="runId"
        :streaming="streaming"
        :usage="usage"
        :finish-reason="finishReason"
        :conversation-title="conversationTitle"
      />
    </aside>
  </Teleport>
</template>

<style scoped>
.trace-scrim {
  position: fixed;
  inset: 0;
  z-index: 70;
  background: rgba(20, 27, 32, 0.32);
}

.trace {
  position: fixed;
  inset: 0 0 0 auto;
  z-index: 80;
  display: flex;
  flex-direction: column;
  width: min(392px, 92vw);
  border-left: 1px solid var(--line);
  background: var(--paper);
  box-shadow: var(--shadow-lg);
}

.trace-head {
  display: flex;
  flex: none;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 18px 18px 12px;
  border-bottom: 1px solid var(--line);
}

.eyebrow {
  margin-bottom: 5px;
  color: var(--amber-text);
  font-size: 9px;
  letter-spacing: 0.12em;
}

h2 {
  font-size: 16px;
  font-weight: 650;
}

.close {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 5px;
  color: var(--ink-3);
}

.close:hover {
  background: var(--surface-2);
  color: var(--ink);
}

.close svg {
  width: 15px;
  height: 15px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.7;
  stroke-linecap: round;
}
</style>
