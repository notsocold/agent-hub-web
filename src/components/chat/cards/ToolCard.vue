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

const SOURCE_LABELS: Record<string, string> = {
  knowledge: '知识检索',
  native: '本地工具',
  mcp: 'MCP',
  a2a: '远程 Agent',
}

const sourceLabel = computed(() => SOURCE_LABELS[props.item.source] ?? props.item.source)

const RISK_LABELS: Record<string, string> = {
  read: '只读',
  write: '写入',
  destructive: '破坏性',
  unknown: '未知',
}
</script>

<template>
  <ProcessCardShell
    kind="tool"
    :title="item.displayName || item.tool"
    :status="item.status"
    :duration="formatDuration(item.durationMs)"
  >
    <p class="line meta">
      <span v-if="sourceLabel" class="tag">{{ sourceLabel }}</span>
      <span v-if="item.server" class="tag">{{ item.server }}</span>
      <span v-if="item.risk" class="tag is-risk">{{ RISK_LABELS[item.risk] ?? item.risk }}</span>
      <span v-if="item.requiresApproval" class="tag is-approval">需审批</span>
      <span class="mono tool-name">{{ item.tool }}</span>
    </p>

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

.line.meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  margin-bottom: 5px;
}

.tag {
  padding: 0 5px;
  border: 1px solid var(--line-2);
  border-radius: 4px;
  color: var(--ink-3);
  font-size: 9px;
}

.tag.is-risk {
  border-color: var(--amber-soft);
  background: var(--amber-soft);
  color: var(--amber-text);
}

.tag.is-approval {
  border-color: var(--red-soft);
  background: var(--red-soft);
  color: var(--red);
}

.tool-name {
  overflow: hidden;
  color: var(--ink-3);
  font-size: 9.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
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
