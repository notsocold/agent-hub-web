<script setup lang="ts">
import { ref } from 'vue'

import A2ACard from './cards/A2ACard.vue'
import ApprovalCard from './cards/ApprovalCard.vue'
import NoticeCard from './cards/NoticeCard.vue'
import SkillCard from './cards/SkillCard.vue'
import ToolCard from './cards/ToolCard.vue'
import WorkflowStepCard from './cards/WorkflowStepCard.vue'
import type { ProcessItem } from '@/types'

defineProps<{
  items: ProcessItem[]
  busy?: boolean
}>()

const emit = defineEmits<{
  approve: [id: string]
  reject: [id: string]
}>()

const open = ref(true)
</script>

<template>
  <section class="process" aria-label="执行过程">
    <header class="process-head">
      <button class="process-toggle" type="button" :aria-expanded="open" @click="open = !open">
        <span class="dot is-live"></span>
        <span>执行过程 · {{ items.length }}</span>
        <svg class="chevron" :class="{ 'is-open': open }" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      <span class="process-note">按发生顺序排列</span>
    </header>

    <div v-if="open" class="process-list">
      <template v-for="item in items" :key="item.id">
        <SkillCard v-if="item.kind === 'skill'" :item="item" />
        <ToolCard v-else-if="item.kind === 'tool'" :item="item" />
        <A2ACard v-else-if="item.kind === 'a2a'" :item="item" />
        <WorkflowStepCard v-else-if="item.kind === 'workflow'" :item="item" />
        <NoticeCard v-else-if="item.kind === 'notice'" :item="item" />
        <ApprovalCard
          v-else-if="item.kind === 'approval'"
          :item="item"
          :busy="busy"
          @approve="emit('approve', item.approvalId)"
          @reject="emit('reject', item.approvalId)"
        />
      </template>
    </div>
  </section>
</template>

<style scoped>
.process {
  margin-bottom: 14px;
}

.process-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}

.process-toggle {
  display: flex;
  align-items: center;
  gap: 7px;
  color: var(--ink-2);
  font-size: 11.5px;
  font-weight: 600;
}

.process-toggle:hover {
  color: var(--ink);
}

.chevron {
  width: 13px;
  height: 13px;
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

.process-note {
  color: var(--ink-3);
  font-size: 10px;
}

.process-list {
  display: flex;
  flex-direction: column;
  gap: 7px;
}
</style>
