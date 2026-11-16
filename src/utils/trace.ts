/**
 * 运行轨迹归一化（D1 / WP2）。
 *
 * 抽屉同时拿到两份数据：
 * - `ProcessItem[]`：SSE 实时 reducer 产出的过程项（live）；
 * - `RunEvent[]`：`GET /runs/{id}/events` 落库事件（server）。
 *
 * 本模块把它们归一到 `TraceEntry`，按 `tool_call_id` / `step_id` / `task_id` /
 * `approval_id` / `skill_id` / `message_id` 去重合并；服务端事件用于补齐
 * payload、duration、status，但**绝不根据时间戳推导时长**（缺失即 null）。
 */

import type { ProcessItem, RunEvent } from '@/types'

export type TraceKind =
  'message' | 'skill' | 'tool' | 'mcp' | 'a2a' | 'approval' | 'workflow' | 'error'

export type TraceStatus = 'running' | 'ok' | 'error' | 'waiting' | 'canceled'

export type TraceFilter = TraceKind | 'all'

export interface TraceEntry {
  id: string
  kind: TraceKind
  title: string
  subtitle: string
  status: TraceStatus
  startedAt?: string | null
  durationMs?: number | null
  payload?: Record<string, unknown>
  source: 'live' | 'server'
  seq?: number
  /** 原始 SSE 事件名（仅服务端事件），供搜索与详情展示。 */
  event?: string | null
  /** 错误摘要（服务端事件 / 错误过程项），供搜索与详情展示。 */
  error?: string | null
}

export const TRACE_KINDS: readonly TraceKind[] = [
  'message',
  'skill',
  'tool',
  'mcp',
  'a2a',
  'approval',
  'workflow',
  'error',
]

export const TRACE_KIND_LABELS: Record<TraceKind, string> = {
  message: '消息',
  skill: '技能',
  tool: '工具',
  mcp: 'MCP',
  a2a: 'A2A',
  approval: '审批',
  workflow: '工作流',
  error: '错误',
}

export const TRACE_STATUS_LABELS: Record<TraceStatus, string> = {
  running: '运行中',
  ok: '完成',
  error: '失败',
  waiting: '等待',
  canceled: '已取消',
}

/** 与服务端 `GET /runs/{id}/events?limit=200` 的请求上限保持一致。 */
export const TRACE_EVENTS_LIMIT = 200

/**
 * 返回满一页（或后端标记 has_more）即认为“仅展示最近 200 条”。
 * 仅凭 `items.length === 200` 也成立：limit 正好一页时后端可能不给 has_more。
 */
export function isTraceEventsTruncated(count: number, hasMore = false): boolean {
  return hasMore || count >= TRACE_EVENTS_LIMIT
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function asNumberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function isTerminalStatus(status: TraceStatus): boolean {
  return status === 'ok' || status === 'error' || status === 'canceled'
}

function liveStatus(item: ProcessItem): TraceStatus {
  switch (item.status) {
    case 'running':
      return 'running'
    case 'waiting':
      return 'waiting'
    case 'error':
      return 'error'
    case 'canceled':
    case 'skipped':
      return 'canceled'
    default:
      return 'ok'
  }
}

function normalizeStatus(value: string, fallback: TraceStatus): TraceStatus {
  switch (value) {
    case 'running':
      return 'running'
    case 'ok':
      return 'ok'
    case 'error':
    case 'failed':
    case 'rejected':
      return 'error'
    case 'waiting':
    case 'interrupted':
      return 'waiting'
    case 'canceled':
    case 'cancelled':
    case 'skipped':
      return 'canceled'
    default:
      return fallback
  }
}

function isMcpTool(tool: string, source: string, server = ''): boolean {
  const haystack = `${tool} ${source} ${server}`.toLowerCase()
  return haystack.includes('mcp')
}

/* ------------------------------------------------------------------ */
/* live ProcessItem                                                    */
/* ------------------------------------------------------------------ */

function liveKind(item: ProcessItem): TraceKind | null {
  switch (item.kind) {
    case 'reasoning':
      return null
    case 'notice':
      return item.level === 'error' ? 'error' : null
    case 'error':
      return 'error'
    case 'skill':
      return 'skill'
    case 'tool':
      return isMcpTool(item.tool, item.source, item.server) ? 'mcp' : 'tool'
    case 'a2a':
      return 'a2a'
    case 'approval':
      return 'approval'
    case 'workflow':
      return 'workflow'
    default:
      return null
  }
}

function liveCorrelationKey(item: ProcessItem): string | null {
  switch (item.kind) {
    case 'tool':
      return item.toolCallId || null
    case 'workflow':
      return item.stepId || null
    case 'a2a':
      return item.taskId || item.a2aTaskId || null
    case 'approval':
      return item.approvalId || item.toolCallId || null
    case 'skill':
      return item.skillId || item.slug || null
    default:
      return null
  }
}

function liveTitle(item: ProcessItem): string {
  switch (item.kind) {
    case 'skill':
      return item.name || item.slug || '技能'
    case 'tool':
      return item.displayName || item.tool || '工具调用'
    case 'a2a':
      return item.agentName || item.agent || 'A2A 任务'
    case 'approval':
      return item.toolDisplayName || item.tool || '审批请求'
    case 'workflow':
      return item.stepTitle || item.stepType || '工作流步骤'
    case 'error':
      return item.code || '运行错误'
    case 'notice':
      return item.code || '系统提示'
    default:
      return '过程项'
  }
}

function liveSubtitle(item: ProcessItem): string {
  switch (item.kind) {
    case 'skill':
      return ['skill', item.slug].filter(Boolean).join(' · ')
    case 'tool':
      return item.summary || item.resultPreview || `tool · ${item.tool}`
    case 'a2a':
      return (
        item.resultSummary ||
        item.requestSummary ||
        ['A2A', item.a2aTaskId || item.taskId].filter(Boolean).join(' · ')
      )
    case 'approval':
      return ['HITL', item.tool, item.target].filter(Boolean).join(' · ')
    case 'workflow':
      return ['workflow', item.stepType].filter(Boolean).join(' · ')
    case 'error':
      return item.message
    case 'notice':
      return item.message
    default:
      return ''
  }
}

function livePayload(item: ProcessItem): Record<string, unknown> {
  switch (item.kind) {
    case 'skill':
      return {
        skill_id: item.skillId,
        slug: item.slug,
        name: item.name,
        scope: item.scope,
        description: item.description,
        estimated_tokens: item.estimatedTokens,
      }
    case 'tool':
      return {
        tool_call_id: item.toolCallId,
        tool: item.tool,
        display_name: item.displayName,
        source: item.source,
        source_id: item.sourceId,
        server: item.server,
        risk: item.risk,
        requires_approval: item.requiresApproval,
        args_preview: item.argsPreview,
        result_preview: item.resultPreview,
        summary: item.summary,
        error: item.error,
        metadata: item.metadata,
      }
    case 'a2a':
      return {
        task_id: item.taskId,
        a2a_task_id: item.a2aTaskId,
        agent: item.agent,
        agent_name: item.agentName,
        state: item.state,
        progress: item.progress,
        request_summary: item.requestSummary,
        result_summary: item.resultSummary,
        artifact_summary: item.artifactSummary,
        error: item.error,
      }
    case 'approval':
      return {
        approval_id: item.approvalId,
        tool_call_id: item.toolCallId ?? null,
        tool: item.tool,
        tool_display_name: item.toolDisplayName,
        source: item.source,
        executor: item.executor,
        target: item.target,
        side_effect: item.sideEffect,
        risk: item.risk,
        reason: item.reason,
        payload: item.payload ?? null,
        payload_preview: item.payloadPreview ?? null,
        expires_at: item.expiresAt,
        decision: item.decision,
      }
    case 'workflow':
      return {
        step_id: item.stepId,
        step_type: item.stepType,
        step_title: item.stepTitle,
        tool: item.tool,
      }
    case 'error':
      return { code: item.code, message: item.message }
    case 'notice':
      return {
        level: item.level,
        code: item.code,
        message: item.message,
        retryable: item.retryable,
      }
    default:
      return {}
  }
}

function entryFromLive(item: ProcessItem): TraceEntry | null {
  const kind = liveKind(item)
  if (!kind) return null
  const key = liveCorrelationKey(item)
  return {
    id: key ? `trace:${kind}:${key}` : `live:${item.id}`,
    kind,
    title: liveTitle(item),
    subtitle: liveSubtitle(item),
    status: liveStatus(item),
    startedAt: item.startedAt ?? null,
    durationMs: asNumberOrNull(item.durationMs),
    payload: livePayload(item),
    source: 'live',
    event: null,
    error:
      (item.kind === 'error' || item.kind === 'notice' ? item.message : null) ??
      (item.kind === 'tool' ? item.error : null),
  }
}

/* ------------------------------------------------------------------ */
/* server RunEvent                                                     */
/* ------------------------------------------------------------------ */

const EVENT_TITLES: Record<string, string> = {
  'run.started': '运行开始',
  'run.interrupted': '运行挂起',
  'run.resumed': '运行恢复',
  'message.created': '用户消息',
  'message.started': '助手开始回复',
  'message.done': '助手消息',
  'tool.start': '工具调用',
  'tool.result': '工具结果',
  'skill.activated': '技能激活',
  'a2a.task': 'A2A 任务',
  'a2a.artifact': 'A2A 产物',
  'a2a.input_required': 'A2A 等待输入',
  'a2a.auth_required': 'A2A 等待授权',
  'approval.required': '审批请求',
  'workflow.step': '工作流步骤',
  'memory.saved': '记忆已保存',
  notice: '系统提示',
  error: '运行错误',
}

function serverKind(event: RunEvent): TraceKind | null {
  const payload = asRecord(event.payload) ?? {}
  switch (event.type) {
    case 'request':
    case 'run':
    case 'message':
      return 'message'
    case 'skill':
      return 'skill'
    case 'tool':
      return isMcpTool(asString(payload.tool), asString(payload.source), asString(payload.server))
        ? 'mcp'
        : 'tool'
    case 'mcp':
      return 'mcp'
    case 'a2a':
      return 'a2a'
    case 'approval':
      return 'approval'
    case 'workflow':
      return 'workflow'
    case 'error':
      return 'error'
    case 'notice':
      return asString(payload.level) === 'error' ? 'error' : null
    default:
      return null
  }
}

function serverCorrelationKey(kind: TraceKind, payload: Record<string, unknown>): string | null {
  switch (kind) {
    case 'tool':
    case 'mcp':
      return asString(payload.tool_call_id) || null
    case 'workflow':
      return asString(payload.step_id) || null
    case 'a2a':
      return asString(payload.task_id) || asString(payload.a2a_task_id) || null
    case 'approval':
      return asString(payload.approval_id) || asString(payload.tool_call_id) || null
    case 'skill':
      return asString(payload.skill_id) || asString(payload.slug) || null
    case 'message':
      return asString(payload.message_id) || null
    default:
      return null
  }
}

function serverStatus(event: RunEvent, kind: TraceKind): TraceStatus {
  const payload = asRecord(event.payload) ?? {}
  if (kind === 'a2a') {
    switch (asString(payload.state)) {
      case 'submitted':
      case 'working':
        return 'running'
      case 'input_required':
      case 'auth_required':
        return 'waiting'
      case 'completed':
        return 'ok'
      case 'failed':
        return 'error'
      case 'canceled':
      case 'rejected':
        return 'canceled'
      default:
        break
    }
  }
  if (kind === 'workflow') {
    const status = asString(payload.status)
    if (status) return status === 'ok' ? 'ok' : 'error'
  }
  if (kind === 'tool' || kind === 'mcp') {
    switch (asString(payload.status)) {
      case 'ok':
        return 'ok'
      case 'error':
        return 'error'
      case 'rejected':
      case 'canceled':
        return 'canceled'
      case 'running':
        return 'running'
      default:
        break
    }
  }
  // `run.started` 等历史事件在回放时已经发生，不应长期显示“运行中”。
  if (event.type === 'request' || event.type === 'run') {
    if (event.event === 'run.interrupted') return 'waiting'
    return 'ok'
  }
  return normalizeStatus(asString(event.status), 'ok')
}

function serverTitle(event: RunEvent, kind: TraceKind): string {
  if (event.title) return event.title
  const payload = asRecord(event.payload) ?? {}
  switch (kind) {
    case 'message': {
      const role = asString(payload.role)
      if (role === 'user') return '用户消息'
      if (role === 'assistant') return '助手消息'
      return EVENT_TITLES[event.event] ?? '消息事件'
    }
    case 'skill':
      return asString(payload.name) || asString(payload.slug) || '技能'
    case 'tool':
    case 'mcp':
      return (
        asString(payload.display_name) ||
        asString(payload.tool) ||
        EVENT_TITLES[event.event] ||
        '工具'
      )
    case 'a2a':
      return (
        asString(payload.agent_name) ||
        asString(payload.agent) ||
        EVENT_TITLES[event.event] ||
        'A2A 任务'
      )
    case 'approval':
      return (
        asString(payload.tool_display_name) ||
        asString(payload.tool) ||
        EVENT_TITLES[event.event] ||
        '审批请求'
      )
    case 'workflow':
      return asString(payload.step_title) || EVENT_TITLES[event.event] || '工作流步骤'
    case 'error':
      return asString(payload.code) || EVENT_TITLES[event.event] || '运行错误'
    default:
      return EVENT_TITLES[event.event] ?? event.event ?? '事件'
  }
}

function serverSubtitle(event: RunEvent, kind: TraceKind): string {
  if (event.subtitle) return event.subtitle
  const payload = asRecord(event.payload) ?? {}
  switch (kind) {
    case 'message':
      return event.event || '消息事件'
    case 'skill':
      return ['skill', asString(payload.slug) || asString(payload.skill_id)]
        .filter(Boolean)
        .join(' · ')
    case 'tool':
    case 'mcp': {
      const parts = [
        asString(payload.tool),
        asString(payload.summary) ||
          asString(payload.result_preview) ||
          asString(payload.error) ||
          asString(payload.args_preview),
      ].filter(Boolean)
      return parts.join(' · ') || event.event
    }
    case 'a2a':
      return (
        asString(payload.result_summary) ||
        asString(payload.request_summary) ||
        ['A2A', asString(payload.a2a_task_id) || asString(payload.task_id)]
          .filter(Boolean)
          .join(' · ')
      )
    case 'approval':
      return (
        asString(payload.target) || ['HITL', asString(payload.tool)].filter(Boolean).join(' · ')
      )
    case 'workflow':
      return ['workflow', asString(payload.step_type), asString(payload.tool)]
        .filter(Boolean)
        .join(' · ')
    case 'error':
      return asString(payload.message) || event.event
    default:
      return event.event
  }
}

function entryFromServer(event: RunEvent): TraceEntry | null {
  const kind = serverKind(event)
  if (!kind) return null
  const payload = asRecord(event.payload) ?? {}
  const key = serverCorrelationKey(kind, payload)
  return {
    id: key ? `trace:${kind}:${key}` : `server:${event.id}`,
    kind,
    title: serverTitle(event, kind),
    subtitle: serverSubtitle(event, kind),
    status: serverStatus(event, kind),
    startedAt: event.ts || null,
    durationMs: asNumberOrNull(event.duration_ms),
    payload,
    source: 'server',
    seq: event.seq,
    event: event.event || event.type,
    error: event.error,
  }
}

/* ------------------------------------------------------------------ */
/* merge / build                                                       */
/* ------------------------------------------------------------------ */

/** 同一关联键的多个服务端事件（如 tool.start + tool.result）合成一条。 */
function mergeServerEvents(previous: TraceEntry, next: TraceEntry): TraceEntry {
  return {
    ...previous,
    title: next.title || previous.title,
    subtitle: next.subtitle || previous.subtitle,
    status: next.status,
    durationMs: next.durationMs ?? previous.durationMs ?? null,
    payload: Object.assign({}, previous.payload, next.payload),
    seq: next.seq,
    event: next.event ?? previous.event ?? null,
    error: next.error ?? previous.error ?? null,
  }
}

/** live + server：服务端优先补齐 payload / duration / status。 */
function mergeLiveAndServer(live: TraceEntry, server: TraceEntry): TraceEntry {
  return {
    ...live,
    title: live.title || server.title,
    subtitle: live.subtitle || server.subtitle,
    // 服务端终态优先；实时侧先看到终态时保留实时侧（避免事件回放滞后）。
    status: isTerminalStatus(server.status)
      ? server.status
      : isTerminalStatus(live.status)
        ? live.status
        : server.status,
    startedAt: live.startedAt ?? server.startedAt ?? null,
    durationMs: server.durationMs ?? live.durationMs ?? null,
    payload: Object.assign({}, live.payload, server.payload),
    source: 'server',
    id: server.id,
    seq: server.seq,
    event: server.event ?? null,
    error: server.error ?? live.error ?? null,
  }
}

function timeValue(entry: TraceEntry): number | null {
  if (!entry.startedAt) return null
  const parsed = Date.parse(entry.startedAt)
  return Number.isNaN(parsed) ? null : parsed
}

/** 时间线按开始时间排序；缺时间戳时退回 seq / 原始顺序，保证稳定。 */
function sortEntries(entries: Array<{ entry: TraceEntry; order: number }>): TraceEntry[] {
  return entries
    .sort((left, right) => {
      const leftTime = timeValue(left.entry)
      const rightTime = timeValue(right.entry)
      if (leftTime !== null && rightTime !== null && leftTime !== rightTime) {
        return leftTime - rightTime
      }
      if (leftTime !== null && rightTime === null) return -1
      if (leftTime === null && rightTime !== null) return 1
      if (
        left.entry.seq !== undefined &&
        right.entry.seq !== undefined &&
        left.entry.seq !== right.entry.seq
      ) {
        return left.entry.seq - right.entry.seq
      }
      return left.order - right.order
    })
    .map((item) => item.entry)
}

/**
 * 归一并合并 live 过程项与服务端事件。
 *
 * - 同一 kind + 关联键只保留一条（server 事件按 seq 升序合并）；
 * - server 事件补齐 payload / duration / status，但缺失时长保持 null；
 * - 输入数组不被修改。
 */
export function buildTraceEntries(items: ProcessItem[], events: RunEvent[]): TraceEntry[] {
  const liveEntries = items
    .map((item) => entryFromLive(item))
    .filter((entry): entry is TraceEntry => entry !== null)

  const serverEntries: TraceEntry[] = []
  const serverIndex = new Map<string, number>()
  const orderedEvents = [...events].sort((left, right) => left.seq - right.seq)
  for (const event of orderedEvents) {
    const entry = entryFromServer(event)
    if (!entry) continue
    const key = serverCorrelationKey(entry.kind, asRecord(event.payload) ?? {})
    const lookup = key ? `${entry.kind}:${key}` : null
    if (lookup) {
      const existingIndex = serverIndex.get(lookup)
      if (existingIndex !== undefined) {
        serverEntries[existingIndex] = mergeServerEvents(serverEntries[existingIndex]!, entry)
        continue
      }
      serverIndex.set(lookup, serverEntries.length)
    }
    serverEntries.push(entry)
  }

  const merged: Array<{ entry: TraceEntry; order: number }> = []
  const usedServer = new Set<number>()
  const liveLookup = new Map<string, number>()
  for (const entry of liveEntries) {
    const key = liveCorrelationKeyOf(entry)
    const lookup = key ? `${entry.kind}:${key}` : null
    if (lookup && !liveLookup.has(lookup)) {
      liveLookup.set(lookup, merged.length)
    }
    merged.push({ entry, order: merged.length })
  }

  for (const [lookup, liveIndex] of liveLookup) {
    const serverIdx = serverIndex.get(lookup)
    if (serverIdx === undefined) continue
    const live = merged[liveIndex]!.entry
    merged[liveIndex] = {
      entry: mergeLiveAndServer(live, serverEntries[serverIdx]!),
      order: merged[liveIndex]!.order,
    }
    usedServer.add(serverIdx)
  }

  for (let index = 0; index < serverEntries.length; index += 1) {
    if (usedServer.has(index)) continue
    merged.push({ entry: serverEntries[index]!, order: merged.length })
  }

  return sortEntries(merged)
}

/**
 * 从归一化条目反推关联键。
 * live 条目在 entryFromLive 时已经按同一规则生成 id，但 id 里同时有 kind 与 key；
 * 这里直接用 payload 字段重新读取，避免解析字符串。
 */
function liveCorrelationKeyOf(entry: TraceEntry): string | null {
  return serverCorrelationKey(entry.kind, entry.payload ?? {})
}

/* ------------------------------------------------------------------ */
/* filter / count / group                                              */
/* ------------------------------------------------------------------ */

/**
 * 按类型与关键词筛选。
 *
 * 搜索只覆盖标题、副标题、事件名和错误摘要；payload 不参与检索，
 * 避免敏感内容/大对象被搜索命中。
 */
export function filterEntries(
  entries: readonly TraceEntry[],
  kind: TraceFilter = 'all',
  query = '',
): TraceEntry[] {
  const needle = query.trim().toLowerCase()
  return entries.filter((entry) => {
    if (kind !== 'all' && entry.kind !== kind) return false
    if (!needle) return true
    return [entry.title, entry.subtitle, entry.event, entry.error].some((field) => {
      return typeof field === 'string' && field.toLowerCase().includes(needle)
    })
  })
}

export function countByKind(entries: readonly TraceEntry[]): Record<TraceFilter, number> {
  const counts: Record<TraceFilter, number> = {
    all: entries.length,
    message: 0,
    skill: 0,
    tool: 0,
    mcp: 0,
    a2a: 0,
    approval: 0,
    workflow: 0,
    error: 0,
  }
  for (const entry of entries) counts[entry.kind] += 1
  return counts
}

export interface TraceKindGroup {
  kind: TraceKind
  label: string
  entries: TraceEntry[]
}

/** 按固定 kind 顺序分组，空分组不返回（供列表分组/折叠扩展）。 */
export function groupByKind(entries: readonly TraceEntry[]): TraceKindGroup[] {
  return TRACE_KINDS.map((kind) => ({
    kind,
    label: TRACE_KIND_LABELS[kind],
    entries: entries.filter((entry) => entry.kind === kind),
  })).filter((group) => group.entries.length > 0)
}
