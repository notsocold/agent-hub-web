<script setup lang="ts">
import { computed } from 'vue'

import type { ProcessStatus } from '@/types'

const props = defineProps<{
  kind: 'skill' | 'tool' | 'a2a' | 'approval' | 'workflow' | 'notice' | 'error'
  title: string
  status: ProcessStatus
  statusLabel?: string
  duration?: string
}>()

const kindLabel = computed(
  () =>
    ({
      skill: '技能',
      tool: '工具',
      a2a: 'A2A',
      approval: '审批',
      workflow: '工作流',
      notice: '提示',
      error: '错误',
    })[props.kind],
)

const statusText = computed(
  () =>
    ({
      running: '运行中',
      waiting: '等待',
      ok: '完成',
      error: '失败',
      skipped: '跳过',
      canceled: '已取消',
    })[props.status],
)
</script>

<template>
  <article class="pcard" :class="`kind-${kind}`">
    <header class="pcard-head">
      <span class="badge">{{ kindLabel }}</span>
      <span class="title">{{ title }}</span>
      <span class="status" :class="`is-${status}`">
        <span class="dot"></span>
        {{ statusLabel ?? statusText }}
      </span>
      <span v-if="duration" class="duration mono">{{ duration }}</span>
    </header>
    <div class="pcard-body">
      <slot />
    </div>
  </article>
</template>

<style scoped>
.pcard {
  --kind-color: var(--ink-2);
  --kind-bg: var(--surface-2);
  overflow: hidden;
  border: 1px solid var(--line);
  border-left: 3px solid var(--kind-color);
  border-radius: 8px;
  background: var(--surface);
  box-shadow: var(--shadow-sm);
}

.kind-skill {
  --kind-color: var(--kind-skill);
  --kind-bg: var(--kind-skill-soft);
}

.kind-tool {
  --kind-color: var(--kind-tool);
  --kind-bg: var(--kind-tool-soft);
}

.kind-a2a {
  --kind-color: var(--kind-a2a);
  --kind-bg: var(--kind-a2a-soft);
}

.kind-approval {
  --kind-color: var(--kind-approval);
  --kind-bg: var(--kind-approval-soft);
}

.kind-workflow {
  --kind-color: var(--kind-vector);
  --kind-bg: var(--kind-vector-soft);
}

.kind-notice {
  --kind-color: var(--ink-3);
  --kind-bg: var(--surface-2);
}

.kind-error {
  --kind-color: var(--red);
  --kind-bg: var(--red-soft);
}

.pcard-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 12px;
  border-bottom: 1px solid var(--line-2);
  background: color-mix(in srgb, var(--kind-bg) 48%, var(--surface));
}

.badge {
  flex: none;
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--kind-bg);
  color: var(--kind-color);
  font-size: 10px;
  font-weight: 650;
  letter-spacing: 0.03em;
}

.title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  color: var(--ink);
  font-size: 12.5px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 5px;
  color: var(--ink-3);
  font-size: 10.5px;
  white-space: nowrap;
}

.status .dot {
  width: 5px;
  height: 5px;
  background: var(--ink-3);
}

.status.is-running .dot {
  background: var(--amber);
  animation: pulse 1.6s ease-in-out infinite;
}

.status.is-waiting .dot {
  background: var(--amber);
}

.status.is-ok .dot {
  background: var(--green);
}

.status.is-error .dot {
  background: var(--red);
}

.status.is-canceled .dot {
  background: var(--ink-3);
}

.duration {
  flex: none;
  color: var(--ink-3);
  font-size: 10px;
}

.pcard-body {
  padding: 10px 12px;
  color: var(--ink-2);
  font-size: 12px;
  line-height: 1.65;
}
</style>
