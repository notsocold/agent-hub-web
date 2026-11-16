<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import AppIcon from '@/components/common/AppIcon.vue'
import TraceOverview from './trace/TraceOverview.vue'
import TraceRow from './trace/TraceRow.vue'
import TraceToolbar from './trace/TraceToolbar.vue'
import { runsApi } from '@/api/runs'
import { formatDuration, formatTokens } from '@/utils/format'
import {
  TRACE_EVENTS_LIMIT,
  buildTraceEntries,
  countByKind,
  filterEntries,
  isTraceEventsTruncated,
  type TraceFilter,
} from '@/utils/trace'
import type { Citation, ProcessItem, Run, RunEvent, Usage } from '@/types'

const props = withDefaults(
  defineProps<{
    items: ProcessItem[]
    runId: string | null
    streaming: boolean
    usage: Usage | null
    finishReason: string | null
    conversationTitle: string
    /** panel：常驻右栏；drawer：窄屏抽屉，额外展示可筛选的服务端事件。 */
    mode?: 'panel' | 'drawer'
  }>(),
  { mode: 'panel' },
)

const emit = defineEmits<{ 'open-events': [] }>()

const serverRun = ref<Run | null>(null)
const serverEvents = ref<RunEvent[]>([])
const eventsLoading = ref(false)
const eventsError = ref<string | null>(null)
const eventsTruncated = ref(false)

const filterKind = ref<TraceFilter>('all')
const searchQuery = ref('')
const expandedIds = ref<Set<string>>(new Set())

const totalTokens = computed(() => {
  const usage = props.usage
  if (!usage) return null
  return usage.total_tokens ?? usage.input_tokens + usage.output_tokens
})

const serverTotalTokens = computed(() => {
  const usage = serverRun.value?.usage
  if (!usage) return null
  return usage.total_tokens ?? usage.input_tokens + usage.output_tokens
})

const traceEntries = computed(() => buildTraceEntries(props.items, serverEvents.value))
const visibleEntries = computed(() =>
  filterEntries(traceEntries.value, filterKind.value, searchQuery.value),
)
const kindCounts = computed(() => countByKind(traceEntries.value))

let loadSeq = 0
let observedRunId: string | null = null

/** 只有抽屉模式需要服务端事件回放，常驻面板不额外拉接口。 */
watch(
  () => [props.runId, props.streaming, props.mode] as const,
  async ([runId, , mode]) => {
    if (mode !== 'drawer') return
    if (runId !== observedRunId) {
      observedRunId = runId
      filterKind.value = 'all'
      searchQuery.value = ''
      expandedIds.value = new Set()
    }
    const seq = ++loadSeq
    serverRun.value = null
    serverEvents.value = []
    eventsError.value = null
    eventsTruncated.value = false
    if (!runId) {
      eventsLoading.value = false
      return
    }
    eventsLoading.value = true
    try {
      const [run, page] = await Promise.all([
        runsApi.get(runId),
        runsApi.events(runId, { limit: TRACE_EVENTS_LIMIT }),
      ])
      if (seq !== loadSeq) return
      serverRun.value = run
      serverEvents.value = page.items
      // 返回满一页（或后端明确 has_more）即提示只展示最近 200 条。
      eventsTruncated.value = isTraceEventsTruncated(page.items.length, page.has_more)
    } catch (error) {
      if (seq !== loadSeq) return
      eventsError.value = error instanceof Error ? error.message : '加载运行事件失败'
    } finally {
      if (seq === loadSeq) eventsLoading.value = false
    }
  },
  { immediate: true },
)

function toggleEntry(id: string): void {
  const next = new Set(expandedIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  expandedIds.value = next
}

function expandAll(): void {
  expandedIds.value = new Set(visibleEntries.value.map((entry) => entry.id))
}

function collapseAll(): void {
  expandedIds.value = new Set()
}

function resetFilters(): void {
  filterKind.value = 'all'
  searchQuery.value = ''
}

/** 执行轨道不展示思考/提示/错误这三类，它们不构成可执行步骤。 */
const trackItems = computed(() =>
  props.items.filter(
    (item) => item.kind !== 'reasoning' && item.kind !== 'notice' && item.kind !== 'error',
  ),
)

const citations = computed<Citation[]>(() => {
  const seen = new Set<string>()
  const list: Citation[] = []
  for (const item of props.items) {
    if (item.kind !== 'tool' || !item.citations) continue
    for (const citation of item.citations) {
      if (seen.has(citation.chunk_id)) continue
      seen.add(citation.chunk_id)
      list.push(citation)
    }
  }
  return list
})

interface AgentEntry {
  key: string
  name: string
  badge: string
  kind: string
  ok: boolean
}

function badgeOf(name: string): string {
  const cleaned = name.replace(/[-_.]/g, ' ').trim()
  const parts = cleaned.split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'AH'
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

const agents = computed<AgentEntry[]>(() => {
  const map = new Map<string, AgentEntry>()
  map.set('main-agent', {
    key: 'main-agent',
    name: 'main-agent',
    badge: 'MA',
    kind: '调度员 · local',
    ok: true,
  })
  for (const item of props.items) {
    if (item.kind !== 'a2a') continue
    const name = item.agentName || item.agent
    if (!name) continue
    map.set(name, {
      key: name,
      name,
      badge: badgeOf(name),
      kind: `A2A · ${item.state}`,
      ok: item.status === 'ok',
    })
  }
  return [...map.values()]
})

function kindClass(item: ProcessItem): string {
  switch (item.kind) {
    case 'skill':
      return 'kind-skill'
    case 'a2a':
      return 'kind-a2a'
    case 'approval':
      return 'kind-approval'
    case 'workflow':
      return 'kind-tool'
    case 'tool':
      return item.source.includes('mcp') ? 'kind-mcp' : 'kind-tool'
    default:
      return ''
  }
}

function stateClass(item: ProcessItem): string {
  switch (item.status) {
    case 'ok':
      return 'is-done'
    case 'running':
      return 'is-now'
    case 'error':
      return 'is-canceled'
    case 'waiting':
      return 'is-wait'
    case 'canceled':
      return 'is-canceled'
    default:
      return 'is-wait'
  }
}

function titleOf(item: ProcessItem): string {
  switch (item.kind) {
    case 'skill':
      return item.name
    case 'tool':
      return item.displayName || item.tool
    case 'a2a':
      return item.agentName || item.agent
    case 'approval':
      return item.toolDisplayName || item.tool
    case 'workflow':
      return item.stepTitle
    default:
      return ''
  }
}

function subOf(item: ProcessItem): string {
  switch (item.kind) {
    case 'skill':
      return `skill · ${item.slug}`
    case 'tool':
      return item.summary || item.resultPreview || `tool · ${item.tool}`
    case 'a2a':
      return `A2A · ${item.taskId || item.a2aTaskId}`
    case 'approval':
      return `HITL · ${item.tool}`
    case 'workflow':
      return `workflow · ${item.stepType}`
    default:
      return ''
  }
}

function durationOf(item: ProcessItem): string {
  return 'durationMs' in item ? formatDuration(item.durationMs) : '—'
}
</script>

<template>
  <div
    class="trace-scroll"
    :class="{ 'is-drawer': mode === 'drawer' }"
    tabindex="0"
    aria-label="运行轨迹滚动区"
  >
    <template v-if="mode === 'drawer'">
      <TraceOverview :entries="traceEntries" />

      <TraceToolbar
        :counts="kindCounts"
        :kind="filterKind"
        :query="searchQuery"
        @update:kind="filterKind = $event"
        @update:query="searchQuery = $event"
        @expand-all="expandAll"
        @collapse-all="collapseAll"
      />

      <p v-if="eventsTruncated" class="trace-limit-hint" role="status">
        事件数量已达 {{ TRACE_EVENTS_LIMIT }} 条上限，仅显示最近 {{ TRACE_EVENTS_LIMIT }} 条。
      </p>

      <div class="traj-ledger trace-ledger">
        <p v-if="eventsLoading" class="trace-hint" role="status">正在加载服务端事件…</p>
        <p v-if="eventsError" class="trace-hint is-error" role="alert">
          服务端事件加载失败：{{ eventsError }}。以下仅显示实时过程。
        </p>

        <template v-if="traceEntries.length === 0">
          <p v-if="!eventsLoading" class="trace-empty traj-empty">
            {{ runId ? '该运行暂无可展示的运行事件。' : '本轮还没有可展示的运行轨迹。' }}
          </p>
        </template>
        <div v-else-if="visibleEntries.length === 0" class="trace-empty traj-empty">
          <p>没有匹配的运行事件。</p>
          <button class="text-link" type="button" @click="resetFilters">清除筛选条件</button>
        </div>
        <template v-else>
          <ul class="trace-rows" aria-label="运行事件列表">
            <TraceRow
              v-for="(entry, index) in visibleEntries"
              :key="entry.id"
              :entry="entry"
              :index="index"
              :expanded="expandedIds.has(entry.id)"
              @toggle="toggleEntry"
            />
          </ul>
          <p v-if="visibleEntries.length < traceEntries.length" class="trace-visible-count">
            显示 {{ visibleEntries.length }} / {{ traceEntries.length }} 个事件
          </p>
        </template>
      </div>
    </template>

    <section v-if="mode === 'panel'" class="trace-section">
      <div class="trace-section-head">
        <h3>执行轨道</h3>
        <span class="spacer"></span>
        <span class="count">{{ trackItems.length }}</span>
      </div>
      <ol v-if="trackItems.length > 0" class="track">
        <li v-for="item in trackItems" :key="item.id" :class="[kindClass(item), stateClass(item)]">
          <span class="marker">
            <AppIcon v-if="item.status === 'ok'" name="check" />
          </span>
          <div class="label">
            {{ titleOf(item) }}
            <span class="mono">{{ durationOf(item) }}</span>
          </div>
          <div class="sub">{{ subOf(item) }}</div>
        </li>
      </ol>
      <p v-else class="trace-empty">本轮还没有可展示的执行步骤。</p>
    </section>

    <section v-if="citations.length > 0" class="trace-section">
      <div class="trace-section-head">
        <h3>引用来源</h3>
        <span class="spacer"></span>
        <span class="count">{{ citations.length }}</span>
      </div>
      <ul class="cite-list">
        <li v-for="citation in citations" :key="citation.chunk_id">
          <div class="cite-top">
            <span class="cite-name">{{ citation.title }}</span>
            <span class="cite-score">{{ citation.score.toFixed(2) }}</span>
          </div>
          <div class="cite-src">
            {{ citation.category }} · {{ citation.updated_at.slice(0, 10) }} · 知识库
          </div>
        </li>
      </ul>
    </section>

    <section class="trace-section">
      <div class="trace-section-head">
        <h3>本轮智能体</h3>
        <span class="spacer"></span>
        <span class="count">{{ agents.length }}</span>
      </div>
      <div v-for="agent in agents" :key="agent.key" class="agent-row">
        <span class="agent-badge" aria-hidden="true">{{ agent.badge }}</span>
        <div class="agent-ident">
          <div class="agent-name">
            {{ agent.name }}
            <span class="mono">{{ agent.key === 'main-agent' ? 'local' : 'a2a' }}</span>
          </div>
          <div class="agent-kind">{{ agent.kind }}</div>
        </div>
        <span class="agent-state">
          <span class="dot" :class="agent.ok ? 'is-ok' : 'is-live'"></span>
          {{ agent.ok ? '空闲' : '运行中' }}
        </span>
      </div>
    </section>

    <section v-if="mode === 'drawer'" class="trace-section">
      <div class="trace-section-head">
        <h3>运行元信息</h3>
      </div>
      <dl class="run-meta">
        <div>
          <dt>状态</dt>
          <dd>{{ serverRun?.status ?? (streaming ? '运行中' : '已结束') }}</dd>
        </div>
        <div>
          <dt>模型</dt>
          <dd class="mono">{{ serverRun?.model ?? '—' }}</dd>
        </div>
        <div>
          <dt>tokens</dt>
          <dd class="mono">{{ formatTokens(serverTotalTokens ?? totalTokens) }}</dd>
        </div>
        <div>
          <dt>耗时</dt>
          <dd class="mono">{{ formatDuration(serverRun?.duration_ms ?? null) }}</dd>
        </div>
        <div>
          <dt>结束原因</dt>
          <dd class="mono">{{ finishReason ?? serverRun?.error?.code ?? '—' }}</dd>
        </div>
        <div>
          <dt>Run ID</dt>
          <dd class="mono ellipsis">{{ runId ?? '—' }}</dd>
        </div>
      </dl>
    </section>

    <div v-if="mode === 'panel'" class="trace-foot">
      <button type="button" class="text-link" @click="emit('open-events')">
        查看运行事件
        <AppIcon name="arrow" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.trace-scroll.is-drawer {
  padding: 0;
}

.trace-scroll.is-drawer > .trace-section {
  margin-top: 0;
  padding: 14px 20px;
  border-top: 1px solid var(--line-2);
}

.trace-hint {
  margin: 0;
  padding: 8px 20px;
  border-bottom: 1px solid var(--line-2);
  color: var(--ink-3);
  font-size: 10px;
}

.trace-hint.is-error {
  color: var(--red);
}

.trace-limit-hint {
  margin: 0;
  padding: 8px 20px;
  border-bottom: 1px solid var(--line-2);
  background: var(--amber-soft);
  color: var(--amber-text);
  font-size: 10px;
}

.trace-ledger {
  padding-top: 0;
}

.trace-rows {
  margin: 0;
  padding: 0;
  list-style: none;
}

.trace-visible-count {
  margin: 8px 0 0;
  color: var(--ink-3);
  font-size: 9.5px;
}

.trace-scroll.is-drawer .trace-ledger .trace-empty {
  padding: 26px 0;
}

.trace-empty p {
  margin: 0 0 6px;
}

.trace-empty .text-link {
  margin-top: 2px;
}

.trace-empty {
  margin: 2px 0 0;
  color: var(--ink-3);
  font-size: 11px;
  line-height: 1.6;
}

.run-meta {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px 12px;
  margin: 12px 0 0;
}

.run-meta dt {
  color: var(--ink-3);
  font-size: 9.5px;
}

.run-meta dd {
  margin: 2px 0 0;
  overflow: hidden;
  color: var(--ink-2);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
