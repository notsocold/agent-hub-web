<script setup lang="ts">
import { computed } from 'vue'

import { formatDuration } from '@/utils/format'
import { TRACE_KINDS, TRACE_KIND_LABELS, type TraceEntry, type TraceKind } from '@/utils/trace'

const props = defineProps<{
  entries: TraceEntry[]
}>()

const counts = computed<Record<TraceKind, number>>(() => {
  const result: Record<TraceKind, number> = {
    message: 0,
    skill: 0,
    tool: 0,
    mcp: 0,
    a2a: 0,
    approval: 0,
    workflow: 0,
    error: 0,
  }
  for (const entry of props.entries) result[entry.kind] += 1
  return result
})

const timedEntries = computed(() =>
  props.entries.filter((entry) => typeof entry.durationMs === 'number'),
)

/** 只累加后端/实时明确给出的时长，不根据时间戳推导。 */
const totalDurationMs = computed(() =>
  timedEntries.value.reduce((sum, entry) => sum + Math.max(0, entry.durationMs ?? 0), 0),
)

const timedCount = computed(() => timedEntries.value.length)

const totalDurationLabel = computed(() =>
  timedCount.value > 0 ? formatDuration(totalDurationMs.value) : '时长未知',
)

const a2aCount = computed(() => counts.value.a2a)

const metaLabel = computed(() => {
  const parts = [`${props.entries.length} 个事件`]
  if (a2aCount.value > 0) parts.push(`${a2aCount.value} 个远程智能体`)
  return `本轮 · ${parts.join(' · ')}`
})

const okCount = computed(() => props.entries.filter((entry) => entry.status === 'ok').length)
const errorCount = computed(() => props.entries.filter((entry) => entry.status === 'error').length)
const waitingCount = computed(
  () => props.entries.filter((entry) => entry.status === 'waiting').length,
)
const runningCount = computed(
  () => props.entries.filter((entry) => entry.status === 'running').length,
)

const timelineLabel = computed(
  () => `执行时间线：${props.entries.length} 个事件，已知时长合计 ${totalDurationLabel.value}`,
)

const segments = computed(() =>
  props.entries.map((entry) => ({
    entry,
    label: TRACE_KIND_LABELS[entry.kind],
  })),
)

/** 有毫秒数按比例；缺失时长用固定最小宽度，并在 title 里标 “—”。 */
function segmentStyle(entry: TraceEntry): Record<string, string> {
  if (typeof entry.durationMs !== 'number') {
    return { flex: '0 0 5px' }
  }
  return { flexGrow: String(Math.max(entry.durationMs, 1)), flexBasis: '0' }
}

function segmentTitle(entry: TraceEntry, label: string): string {
  const duration = typeof entry.durationMs === 'number' ? formatDuration(entry.durationMs) : '—'
  return `${label} · ${entry.title || '未命名事件'} · ${duration}`
}
</script>

<template>
  <section class="traj-overview trace-overview" aria-label="执行时间线总览">
    <div class="traj-overview-head">
      <h3 class="traj-overview-title">执行时间线</h3>
      <span class="traj-overview-meta">{{ metaLabel }}</span>
      <span class="spacer"></span>
      <span class="trace-overview-total mono">{{ totalDurationLabel }}</span>
    </div>

    <div class="traj-track trace-track" role="img" :aria-label="timelineLabel">
      <span
        v-for="segment in segments"
        :key="`timeline-${segment.entry.id}`"
        class="traj-seg trace-seg"
        :class="[
          `seg-${segment.entry.kind}`,
          { 'is-unknown': typeof segment.entry.durationMs !== 'number' },
        ]"
        :style="segmentStyle(segment.entry)"
        :title="segmentTitle(segment.entry, segment.label)"
        :data-kind="segment.entry.kind"
        data-testid="trace-segment"
      ></span>
    </div>

    <div class="traj-axis trace-axis" aria-hidden="true">
      <span>0s</span>
      <span v-if="timedCount > 0">{{ totalDurationLabel }}</span>
      <span v-else>—</span>
    </div>

    <ul class="traj-legend trace-legend" aria-label="事件类型图例">
      <li v-for="kind in TRACE_KINDS" :key="`legend-${kind}`">
        <i class="legend-dot" :class="`seg-${kind}`" aria-hidden="true"></i>
        <span>{{ TRACE_KIND_LABELS[kind] }}</span>
        <span class="trace-legend-count mono">{{ counts[kind] }}</span>
      </li>
    </ul>

    <div class="trace-stats" role="group" aria-label="事件状态统计">
      <span class="trace-stat is-ok"
        >成功 <b>{{ okCount }}</b></span
      >
      <span class="trace-stat is-error"
        >失败 <b>{{ errorCount }}</b></span
      >
      <span class="trace-stat is-wait"
        >等待 <b>{{ waitingCount }}</b></span
      >
      <span v-if="runningCount > 0" class="trace-stat is-live"
        >运行中 <b>{{ runningCount }}</b></span
      >
    </div>
  </section>
</template>

<style scoped>
.trace-overview {
  flex: none;
}

.trace-overview-total {
  color: var(--ink-2);
  font-size: 9.5px;
}

.trace-track {
  min-height: 12px;
}

.trace-seg.is-unknown {
  background: var(--line);
}

.seg-workflow {
  background: var(--prussian);
}

.seg-error {
  background: var(--red);
}

.trace-axis {
  display: flex;
  justify-content: space-between;
}

.trace-legend {
  padding: 0;
  margin: 8px 0 0;
  list-style: none;
}

.trace-legend li {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.trace-legend-count {
  color: var(--ink-3);
  font-size: 9px;
}

.trace-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 14px;
  margin-top: 8px;
  font-size: 9.5px;
  color: var(--ink-3);
}

.trace-stat b {
  color: var(--ink-2);
  font-family: var(--font-mono);
  font-weight: 600;
}

.trace-stat.is-ok b {
  color: var(--green);
}

.trace-stat.is-error b {
  color: var(--red);
}

.trace-stat.is-wait b {
  color: var(--amber-text);
}

.trace-stat.is-live b {
  color: var(--amber-text);
}
</style>
