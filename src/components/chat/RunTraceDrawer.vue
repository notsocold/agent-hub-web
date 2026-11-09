<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import { runsApi } from '@/api/runs'
import { formatDuration, formatTokens } from '@/utils/format'
import type { ProcessItem, Run, RunEvent, Usage } from '@/types'

const props = defineProps<{
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

const serverRun = ref<Run | null>(null)
const serverEvents = ref<RunEvent[]>([])
const eventsLoading = ref(false)
const eventsError = ref<string | null>(null)

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

watch(
  () => [props.open, props.runId] as const,
  async ([open, runId]) => {
    if (!open || !runId) return
    eventsLoading.value = true
    eventsError.value = null
    try {
      const [run, page] = await Promise.all([
        runsApi.get(runId),
        runsApi.events(runId, { limit: 200 }),
      ])
      serverRun.value = run
      serverEvents.value = page.items
    } catch (error) {
      eventsError.value = error instanceof Error ? error.message : '加载运行事件失败'
    } finally {
      eventsLoading.value = false
    }
  },
  { immediate: true },
)

function eventTokens(event: RunEvent): string {
  const input = event.tokens?.input_tokens
  const output = event.tokens?.output_tokens
  if (typeof input !== 'number' && typeof output !== 'number') return '—'
  return `${formatTokens(input ?? 0)} / ${formatTokens(output ?? 0)}`
}

function kindLabel(kind: ProcessItem['kind']): string {
  return (
    {
      reasoning: '思考',
      skill: '技能',
      tool: '工具',
      a2a: 'A2A',
      approval: '审批',
      workflow: '工作流',
      notice: '提示',
      error: '错误',
    } as const
  )[kind]
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
      return item.name
    case 'notice':
      return item.message
    case 'error':
      return item.message
    case 'reasoning':
      return '思考摘要'
    default:
      return ''
  }
}

function statusLabel(item: ProcessItem): string {
  return (
    {
      running: '运行中',
      waiting: '等待',
      ok: '完成',
      error: '失败',
      skipped: '跳过',
      canceled: '已取消',
    } as const
  )[item.status]
}

function durationOf(item: ProcessItem): string {
  return 'durationMs' in item ? formatDuration(item.durationMs) : '—'
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="trace-scrim" @click="emit('close')"></div>
    <aside v-if="open" class="trace" aria-label="运行详情">
      <header class="trace-head">
        <div>
          <p class="eyebrow mono">RUN DETAILS</p>
          <h2>运行详情</h2>
        </div>
        <button type="button" class="close" aria-label="关闭运行详情" @click="emit('close')">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </header>

      <div class="trace-scroll">
        <section class="summary">
          <p class="conv">{{ conversationTitle || '未命名会话' }}</p>
          <dl>
            <div>
              <dt>状态</dt>
              <dd>
                {{
                  serverRun?.status ??
                  (streaming ? '运行中' : finishReason === 'canceled' ? '已取消' : '已结束')
                }}
              </dd>
            </div>
            <div>
              <dt>Run ID</dt>
              <dd class="mono ellipsis">{{ runId ?? '—' }}</dd>
            </div>
            <div>
              <dt>模型</dt>
              <dd class="mono">{{ serverRun?.model ?? '—' }}</dd>
            </div>
            <div>
              <dt>总 tokens</dt>
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
          </dl>
        </section>

        <section class="events">
          <p class="block-label">服务端事件回放 · {{ serverEvents.length }}</p>
          <p v-if="eventsLoading" class="empty">正在加载运行事件…</p>
          <p v-else-if="eventsError" class="empty is-error">{{ eventsError }}</p>
          <ol v-else-if="serverEvents.length > 0" class="server-events">
            <li v-for="event in serverEvents" :key="event.id">
              <span class="seq mono">#{{ event.seq }}</span>
              <span class="kind" :class="`kind-${event.type}`">{{ event.type }}</span>
              <span class="title">{{ event.title || event.subtitle || event.id }}</span>
              <span class="status mono">{{ event.status }}</span>
              <span class="duration mono">{{ formatDuration(event.duration_ms) }}</span>
              <span class="tokens mono">{{ eventTokens(event) }}</span>
              <span v-if="event.error" class="event-error">{{ event.error }}</span>
            </li>
          </ol>
          <p v-else-if="runId" class="empty">该运行暂无可回放事件。</p>
        </section>

        <section class="events">
          <p class="block-label">本轮过程 · {{ items.length }}</p>
          <ol v-if="items.length > 0">
            <li v-for="item in items" :key="item.id">
              <span class="kind" :class="`kind-${item.kind}`">{{ kindLabel(item.kind) }}</span>
              <span class="title">{{ titleOf(item) }}</span>
              <span class="status mono">{{ statusLabel(item) }}</span>
              <span class="duration mono">{{ durationOf(item) }}</span>
            </li>
          </ol>
          <p v-else class="empty">本轮还没有可展示的实时过程。发送一条消息后再打开这里。</p>
        </section>
      </div>
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

.trace-scroll {
  flex: 1;
  min-height: 0;
  padding: 14px 18px 24px;
  overflow-y: auto;
}

.summary {
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
}

.conv {
  margin-bottom: 9px;
  overflow: hidden;
  font-size: 12.5px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.summary dl {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px 12px;
  margin: 0;
}

.summary dt {
  color: var(--ink-3);
  font-size: 9.5px;
}

.summary dd {
  margin: 2px 0 0;
  overflow: hidden;
  color: var(--ink-2);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.events {
  margin-top: 18px;
}

.block-label {
  margin-bottom: 8px;
  color: var(--ink-3);
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.03em;
}

.events li {
  display: grid;
  grid-template-columns: 48px minmax(0, 1fr) auto auto;
  gap: 8px;
  align-items: center;
  padding: 7px 0;
  border-bottom: 1px solid var(--line-2);
  font-size: 11px;
}

.server-events li {
  grid-template-columns: 30px 48px minmax(0, 1fr) auto auto auto;
}

.seq {
  color: var(--ink-3);
  font-size: 9px;
}

.tokens {
  color: var(--ink-3);
  font-size: 9px;
}

.event-error {
  grid-column: 1 / -1;
  padding: 4px 6px;
  border-radius: 4px;
  background: var(--red-soft);
  color: var(--red);
  font-size: 10px;
}

.empty.is-error {
  color: var(--red);
}

.ellipsis {
  display: inline-block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: bottom;
}

.kind {
  padding: 1px 5px;
  border-radius: 4px;
  background: var(--surface-2);
  color: var(--ink-3);
  font-size: 9px;
  text-align: center;
}

.kind-tool {
  color: var(--kind-tool);
  background: var(--kind-tool-soft);
}

.kind-skill {
  color: var(--kind-skill);
  background: var(--kind-skill-soft);
}

.kind-a2a {
  color: var(--kind-a2a);
  background: var(--kind-a2a-soft);
}

.kind-approval {
  color: var(--kind-approval);
  background: var(--kind-approval-soft);
}

.title {
  overflow: hidden;
  color: var(--ink-2);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status {
  color: var(--ink-3);
  font-size: 9px;
}

.duration {
  color: var(--ink-3);
  font-size: 9px;
}

.empty {
  padding: 20px 0;
  color: var(--ink-3);
  font-size: 11.5px;
  line-height: 1.7;
}
</style>
