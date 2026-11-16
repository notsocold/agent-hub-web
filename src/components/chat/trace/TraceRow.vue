<script setup lang="ts">
import { computed } from 'vue'

import AppIcon from '@/components/common/AppIcon.vue'
import { formatClock, formatDuration } from '@/utils/format'
import { containsSensitiveKey, redactValue } from '@/utils/redact'
import { TRACE_KIND_LABELS, TRACE_STATUS_LABELS, type TraceEntry } from '@/utils/trace'

const props = defineProps<{
  entry: TraceEntry
  /** 仅用于生成稳定的详情区 id。 */
  index: number
  expanded: boolean
}>()

const emit = defineEmits<{ toggle: [id: string] }>()

const detailId = computed(() => `trace-detail-${props.index}`)
const kindLabel = computed(() => TRACE_KIND_LABELS[props.entry.kind])
const statusLabel = computed(() => TRACE_STATUS_LABELS[props.entry.status])
const timeLabel = computed(() => formatClock(props.entry.startedAt) || '—')
const durationLabel = computed(() => formatDuration(props.entry.durationMs))
const sourceLabel = computed(() => (props.entry.source === 'server' ? '服务端事件' : '实时过程'))

const statusClass = computed(() => {
  switch (props.entry.status) {
    case 'ok':
      return 'st-ok'
    case 'error':
      return 'st-error'
    case 'running':
      return 'st-live'
    case 'waiting':
      return 'st-warn'
    default:
      return 'st-muted'
  }
})

const payloadJson = computed(() => {
  const payload = props.entry.payload
  if (!payload || Object.keys(payload).length === 0) return ''
  return JSON.stringify(redactValue(payload), null, 2) ?? ''
})

const masked = computed(() => containsSensitiveKey(props.entry.payload))
</script>

<template>
  <li class="trace-row" :data-kind="entry.kind" :data-source="entry.source">
    <button
      type="button"
      class="trace-row-summary"
      :aria-expanded="expanded"
      :aria-controls="detailId"
      @click="emit('toggle', entry.id)"
    >
      <span class="trace-time mono">{{ timeLabel }}</span>
      <span class="trace-kind" :class="`tk-${entry.kind}`">
        <span class="trace-kind-dot" :class="`seg-${entry.kind}`" aria-hidden="true"></span>
        {{ kindLabel }}
      </span>
      <span class="trace-name" :title="entry.title">{{ entry.title || '未命名事件' }}</span>
      <span class="trace-arg" :title="entry.subtitle">{{ entry.subtitle || '—' }}</span>
      <span class="trace-dur mono">{{ durationLabel }}</span>
      <span class="trace-status">
        <span class="st" :class="statusClass"><span class="dot"></span>{{ statusLabel }}</span>
      </span>
      <span class="trace-chev" :class="{ 'is-open': expanded }" aria-hidden="true">
        <AppIcon name="chevron" />
      </span>
    </button>

    <div
      v-show="expanded"
      :id="detailId"
      class="trace-detail"
      role="region"
      :aria-label="`${entry.title || kindLabel} 详情`"
    >
      <dl class="trace-kv">
        <dt>事件</dt>
        <dd class="mono">{{ entry.event || '实时过程' }}</dd>
        <dt>来源</dt>
        <dd>
          {{ sourceLabel }}
          <template v-if="entry.seq !== undefined"> · seq {{ entry.seq }}</template>
        </dd>
        <template v-if="entry.error">
          <dt>错误</dt>
          <dd class="is-error">{{ entry.error }}</dd>
        </template>
        <dt>时长</dt>
        <dd class="mono">{{ durationLabel }}</dd>
      </dl>

      <p v-if="!payloadJson" class="trace-detail-empty">该事件没有可展开的详情。</p>
      <template v-else>
        <p v-if="masked" class="trace-masked-hint">
          <AppIcon name="shield" />
          敏感字段已遮罩（••••）
        </p>
        <pre class="trace-code" tabindex="0" aria-label="事件详情 JSON">{{ payloadJson }}</pre>
      </template>
    </div>
  </li>
</template>

<style scoped>
.trace-row {
  border-top: 1px solid var(--line-2);
  list-style: none;
}

.trace-row-summary {
  display: grid;
  grid-template-columns: 58px 52px minmax(0, 1.05fr) minmax(0, 1.2fr) 52px 64px 14px;
  gap: 9px;
  align-items: center;
  width: 100%;
  padding: 8px 4px;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.trace-row-summary:hover {
  background: rgba(20, 27, 32, 0.025);
}

.trace-row-summary:focus-visible {
  outline: 2px solid var(--prussian);
  outline-offset: -2px;
}

html[data-theme='dark'] .trace-row-summary:hover {
  background: rgba(255, 255, 255, 0.03);
}

.trace-time {
  color: var(--ink-3);
  font-size: 9px;
}

.trace-kind {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  height: 17px;
  padding: 0 5px;
  border: 1px solid transparent;
  border-radius: 3px;
  font-size: 9px;
  font-weight: 500;
  white-space: nowrap;
}

.trace-kind-dot {
  width: 5px;
  height: 5px;
  border-radius: 2px;
}

.trace-kind-dot.seg-workflow {
  background: var(--prussian);
}

.trace-kind-dot.seg-error {
  background: var(--red);
}

.tk-message {
  background: var(--prussian-soft);
  color: var(--prussian);
}

.tk-skill {
  background: var(--kind-skill-soft);
  color: var(--kind-skill);
}

.tk-tool {
  background: var(--kind-tool-soft);
  color: var(--amber-text);
}

.tk-a2a {
  background: var(--kind-a2a-soft);
  color: var(--kind-a2a);
}

.tk-mcp {
  background: var(--kind-mcp-soft);
  color: var(--kind-mcp);
}

.tk-approval {
  background: var(--kind-approval-soft);
  color: var(--kind-approval);
}

.tk-workflow {
  background: var(--prussian-soft);
  color: var(--prussian);
}

.tk-error {
  background: var(--red-soft);
  color: var(--red);
}

.trace-name {
  min-width: 0;
  overflow: hidden;
  color: var(--ink);
  font-size: 11px;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.trace-arg {
  min-width: 0;
  overflow: hidden;
  color: var(--ink-3);
  font-family: var(--font-mono);
  font-size: 9.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.trace-dur {
  color: var(--ink-2);
  font-size: 9px;
  text-align: right;
}

.trace-status {
  justify-self: end;
}

.trace-status .st {
  height: 19px;
  padding: 0 6px;
  font-size: 9px;
}

.trace-chev {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--ink-3);
  transition: transform 0.18s;
}

.trace-chev.is-open {
  transform: rotate(180deg);
}

.trace-chev .ic {
  width: 12px;
  height: 12px;
}

.trace-detail {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.25fr);
  gap: 10px 18px;
  padding: 2px 4px 12px 58px;
}

.trace-kv {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 3px 12px;
  align-content: start;
  margin: 0;
  font-size: 10px;
}

.trace-kv dt {
  color: var(--ink-3);
  white-space: nowrap;
}

.trace-kv dd {
  margin: 0;
  overflow-wrap: anywhere;
  color: var(--ink-2);
}

.trace-kv dd.is-error {
  color: var(--red);
}

.trace-detail-empty {
  margin: 0;
  color: var(--ink-3);
  font-size: 10px;
}

.trace-masked-hint {
  display: inline-flex;
  grid-column: 1 / -1;
  align-items: center;
  gap: 4px;
  margin: 0;
  color: var(--amber-text);
  font-size: 9.5px;
}

.trace-masked-hint .ic {
  width: 11px;
  height: 11px;
}

.trace-code {
  grid-column: 1 / -1;
  max-height: 220px;
  margin: 0;
  padding: 9px 10px;
  overflow: auto;
  border: 1px solid var(--line-2);
  border-radius: 5px;
  background: var(--surface-2);
  color: var(--ink-2);
  font-family: var(--font-mono);
  font-size: 9px;
  line-height: 1.6;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

@media (max-width: 760px) {
  .trace-row-summary {
    grid-template-columns: 52px 46px minmax(0, 1fr) 58px 14px;
    gap: 7px;
  }

  .trace-arg,
  .trace-dur {
    display: none;
  }

  .trace-detail {
    grid-template-columns: 1fr;
    padding-left: 4px;
  }
}
</style>
