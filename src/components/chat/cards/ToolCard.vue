<script setup lang="ts">
import { computed } from 'vue'

import { RouterLink } from 'vue-router'

import ProcessCardShell from './ProcessCardShell.vue'
import { formatDuration } from '@/utils/format'
import { formatScore } from '@/utils/knowledge'
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

/** 原型把检索与 MCP 画成独立色卡；这里按来源切换卡片色板，数据仍是同一条工具过程。 */
const cardKind = computed<'tool' | 'vector' | 'mcp'>(() => {
  if (props.item.source === 'knowledge') return 'vector'
  if (props.item.source === 'mcp') return 'mcp'
  return 'tool'
})

const RISK_LABELS: Record<string, string> = {
  read: '只读',
  write: '写入',
  destructive: '破坏性',
  unknown: '未知',
}
</script>

<template>
  <ProcessCardShell
    :kind="cardKind"
    :title="item.displayName || item.tool"
    :status="item.status"
    :status-label="item.status === 'canceled' && item.requiresApproval ? '已拒绝' : undefined"
    :duration="formatDuration(item.durationMs)"
    :args="item.argsPreview || item.tool"
    :result-icon="cardKind === 'vector' ? 'search' : 'check'"
  >
    <template v-if="cardKind === 'vector'">
      <div class="vector-meta">{{ sourceLabel }} · {{ item.tool }} · {{ item.summary || '检索结果' }}</div>
      <p v-if="(item.citations ?? []).length > 0" class="block-label">引用来源</p>
      <RouterLink
        v-for="citation in item.citations ?? []"
        :key="citation.chunk_id"
        class="vhit"
        :to="{
          name: 'knowledge',
          query: { document_id: citation.document_id, q: citation.title },
        }"
      >
        <div class="vhit-main">
          <span class="vhit-title">{{ citation.title }}</span>
          <span class="vhit-score">{{ formatScore(citation.score) }}</span>
        </div>
        <div class="vhit-sub">
          {{ citation.chunk_id }} · {{ citation.category }} · {{ citation.updated_at.slice(0, 10) }}
        </div>
      </RouterLink>
      <div class="tool-note">{{ sourceLabel }} · {{ item.tool }} · {{ formatDuration(item.durationMs) }}</div>
    </template>

    <template v-else-if="cardKind === 'mcp'">
      <div class="mcp-line">
        <span class="mcp-server">{{ item.server || item.source }}</span>
        <span v-if="item.source" class="tag">{{ item.source }}</span>
        <span class="mcp-ok"><span class="dot is-ok"></span>已连接</span>
      </div>
      <dl class="kv">
        <dt>工具</dt>
        <dd class="mono">{{ item.tool }}</dd>
        <dt v-if="item.risk">风险</dt>
        <dd v-if="item.risk">{{ RISK_LABELS[item.risk] ?? item.risk }}</dd>
        <dt v-if="item.requiresApproval">审批</dt>
        <dd v-if="item.requiresApproval">需要用户确认</dd>
      </dl>
      <div class="tool-note">{{ item.summary || item.tool }} · {{ formatDuration(item.durationMs) }}</div>
    </template>

    <template v-else>
      <div v-if="item.summary" class="hit">
        <span class="hit-title">{{ item.summary }}</span>
      </div>
      <div v-if="item.argsPreview" class="hit">
        <span class="hit-title">{{ item.argsPreview }}</span>
      </div>
      <div class="tool-note">{{ item.tool }} · {{ formatDuration(item.durationMs) }}</div>
    </template>

    <p v-if="item.error" class="card-error">{{ item.error }}</p>

    <details v-if="item.resultPreview || metadataEntries.length" class="result-details">
      <summary>查看结果</summary>
      <p v-if="item.resultPreview" class="result-raw mono">{{ item.resultPreview }}</p>
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
.block-label {
  margin: 8px 0 2px;
  color: var(--ink-3);
  font-size: 10px;
}

.vhit {
  display: block;
}

.vhit:hover .vhit-title {
  text-decoration: underline;
  text-underline-offset: 3px;
}

.card-error {
  margin-top: 6px;
  color: var(--red);
  font-size: 11.5px;
}

.result-details {
  margin-top: 8px;
}

.result-details summary {
  color: var(--ink-3);
  font-size: 10.5px;
  cursor: pointer;
}

.result-raw {
  margin-top: 5px;
  padding: 6px 8px;
  border-radius: 4px;
  background: var(--paper-2);
  color: var(--ink-2);
  font-size: 10.5px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.metadata {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 2px 10px;
  margin-top: 6px;
  font-size: 10.5px;
}

.metadata dt {
  color: var(--ink-3);
}

.metadata dd {
  margin: 0;
  color: var(--ink-2);
  overflow-wrap: anywhere;
}
</style>
