<script setup lang="ts">
import { computed } from 'vue'

import ProcessCardShell from './ProcessCardShell.vue'
import { formatDuration } from '@/utils/format'
import type { ToolProcess } from '@/types'

const props = defineProps<{
  item: ToolProcess
}>()

const metadataEntries = computed(() =>
  Object.entries(props.item.metadata).filter(([, value]) => typeof value !== 'object'),
)
</script>

<template>
  <ProcessCardShell
    kind="tool"
    :title="item.displayName || item.tool"
    :status="item.status"
    :duration="formatDuration(item.durationMs)"
  >
    <p v-if="item.argsPreview" class="line mono">{{ item.argsPreview }}</p>
    <p v-if="item.summary" class="line summary">{{ item.summary }}</p>

    <details v-if="item.resultPreview || item.error || metadataEntries.length" class="details">
      <summary>查看结果</summary>
      <p v-if="item.error" class="error">{{ item.error }}</p>
      <p v-if="item.resultPreview" class="line mono">{{ item.resultPreview }}</p>
      <dl v-if="metadataEntries.length" class="metadata">
        <template v-for="[key, value] in metadataEntries" :key="key">
          <dt>{{ key }}</dt>
          <dd class="mono">{{ value }}</dd>
        </template>
      </dl>
    </details>
  </ProcessCardShell>
</template>

<style scoped>
.line {
  margin: 0;
  overflow-wrap: anywhere;
}

.line + .line {
  margin-top: 4px;
}

.summary {
  color: var(--ink);
}

.details {
  margin-top: 8px;
}

.details summary {
  color: var(--ink-3);
  font-size: 11px;
  cursor: pointer;
}

.details summary:hover {
  color: var(--ink);
}

.error {
  margin: 6px 0 0;
  color: var(--red);
}

.metadata {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 2px 10px;
  margin: 6px 0 0;
  font-size: 10.5px;
}

.metadata dt {
  color: var(--ink-3);
}

.metadata dd {
  margin: 0;
  overflow-wrap: anywhere;
}
</style>
