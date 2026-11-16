import { describe, expect, it } from 'vitest'

import {
  TRACE_EVENTS_LIMIT,
  buildTraceEntries,
  countByKind,
  filterEntries,
  groupByKind,
  isTraceEventsTruncated,
} from '@/utils/trace'
import type {
  A2aProcess,
  ApprovalProcess,
  ErrorProcess,
  NoticeProcess,
  ProcessItem,
  ReasoningProcess,
  RunEvent,
  RunEventStatus,
  RunEventType,
  SkillProcess,
  ToolProcess,
  WorkflowStepProcess,
} from '@/types'

function skillProcess(overrides: Partial<SkillProcess> = {}): SkillProcess {
  return {
    kind: 'skill',
    id: 'skill:weekly-report',
    status: 'ok',
    startedAt: '2026-11-13T10:00:01.000Z',
    durationMs: 320,
    skillId: 'weekly-report',
    slug: 'weekly-report',
    name: '周报生成',
    scope: 'system',
    description: '按工单生成周报',
    estimatedTokens: 820,
    ...overrides,
  }
}

function toolProcess(overrides: Partial<ToolProcess> = {}): ToolProcess {
  return {
    kind: 'tool',
    id: 'tool:call-search',
    status: 'running',
    startedAt: '2026-11-13T10:00:02.000Z',
    durationMs: null,
    toolCallId: 'call-search',
    tool: 'search_knowledge',
    displayName: '知识检索',
    source: 'knowledge',
    sourceId: null,
    server: '',
    risk: null,
    requiresApproval: false,
    argsPreview: 'query=Q3 客服复盘',
    resultPreview: '',
    summary: '',
    error: null,
    metadata: { top_k: 5 },
    ...overrides,
  }
}

function a2aProcess(overrides: Partial<A2aProcess> = {}): A2aProcess {
  return {
    kind: 'a2a',
    id: 'a2a:task-1',
    status: 'waiting',
    startedAt: '2026-11-13T10:00:03.000Z',
    durationMs: null,
    taskId: 'task-1',
    a2aTaskId: 'a2a-task-1',
    agent: 'data-analyst',
    agentName: 'Data Analyst',
    state: 'input_required',
    progress: null,
    requestSummary: '核对数字',
    resultSummary: '',
    artifactSummary: '',
    error: null,
    ...overrides,
  }
}

function approvalProcess(overrides: Partial<ApprovalProcess> = {}): ApprovalProcess {
  return {
    kind: 'approval',
    id: 'approval:approval-1',
    status: 'waiting',
    startedAt: '2026-11-13T10:00:04.000Z',
    durationMs: null,
    approvalId: 'approval-1',
    toolCallId: 'call-slack',
    tool: 'mcp__slack_mcp__post_message',
    toolDisplayName: 'Slack · 发送消息',
    source: 'mcp',
    executor: 'slack-mcp',
    target: '#support-weekly',
    sideEffect: '外部写操作',
    risk: 'write',
    reason: '外部写操作触发 HITL',
    payload: { channel: 'C08F3K2' },
    payloadPreview: '{"channel":"C08F3K2"}',
    expiresAt: '2026-11-13T10:30:00.000Z',
    decision: null,
    ...overrides,
  }
}

function workflowProcess(overrides: Partial<WorkflowStepProcess> = {}): WorkflowStepProcess {
  return {
    kind: 'workflow',
    id: 'workflow:step-1',
    status: 'ok',
    startedAt: '2026-11-13T10:00:05.000Z',
    durationMs: null,
    stepId: 'step-1',
    stepType: 'tool',
    stepTitle: '知识检索',
    tool: 'search_knowledge',
    ...overrides,
  }
}

function errorProcess(overrides: Partial<ErrorProcess> = {}): ErrorProcess {
  return {
    kind: 'error',
    id: 'error:1',
    status: 'error',
    startedAt: '2026-11-13T10:00:06.000Z',
    durationMs: null,
    code: 'model_error',
    message: '模型返回异常',
    ...overrides,
  }
}

function reasoningProcess(): ReasoningProcess {
  return {
    kind: 'reasoning',
    id: 'reasoning:1',
    status: 'ok',
    startedAt: '2026-11-13T10:00:00.000Z',
    durationMs: 1200,
    content: '先确认口径',
    tokens: 128,
    done: true,
  }
}

function noticeProcess(overrides: Partial<NoticeProcess> = {}): NoticeProcess {
  return {
    kind: 'notice',
    id: 'notice:1',
    status: 'ok',
    startedAt: '2026-11-13T10:00:07.000Z',
    durationMs: null,
    level: 'info',
    code: 'memory_saved',
    message: '记忆已保存',
    retryable: false,
    ...overrides,
  }
}

function runEvent(
  overrides: Partial<RunEvent> & { seq: number; type: RunEventType; status?: RunEventStatus },
): RunEvent {
  const { seq, type, ...rest } = overrides
  return {
    id: `run:${seq}`,
    seq,
    ts: '2026-11-13T10:00:00.000Z',
    type,
    event: '',
    status: rest.status ?? 'ok',
    title: '',
    subtitle: '',
    duration_ms: null,
    tokens: null,
    payload: {},
    error: null,
    ...rest,
  }
}

describe('buildTraceEntries 归一化', () => {
  it('把各 live ProcessItem 归一为 TraceEntry，并跳过 reasoning/notice', () => {
    const items: ProcessItem[] = [
      reasoningProcess(),
      skillProcess(),
      toolProcess(),
      toolProcess({
        id: 'tool:call-mcp',
        toolCallId: 'call-mcp',
        tool: 'mcp__slack_mcp__post_message',
        displayName: 'Slack · 发送消息',
        source: 'mcp',
        server: 'slack-mcp',
      }),
      a2aProcess(),
      approvalProcess(),
      workflowProcess(),
      errorProcess(),
      noticeProcess(),
    ]

    const entries = buildTraceEntries(items, [])

    expect(entries.map((entry) => entry.kind)).toEqual([
      'skill',
      'tool',
      'mcp',
      'a2a',
      'approval',
      'workflow',
      'error',
    ])
    expect(entries[0]?.title).toBe('周报生成')
    expect(entries[0]?.subtitle).toContain('weekly-report')
    expect(entries[0]?.durationMs).toBe(320)
    expect(entries[1]?.title).toBe('知识检索')
    expect(entries[2]?.kind).toBe('mcp')
    expect(entries[3]?.status).toBe('waiting')
    expect(entries[4]?.title).toBe('Slack · 发送消息')
    expect(entries[4]?.payload?.payload_preview).toContain('C08F3K2')
    expect(entries[6]?.error).toBe('模型返回异常')
  })

  it('服务端事件归一：类型、状态与缺失标题回退', () => {
    const events: RunEvent[] = [
      runEvent({ seq: 1, type: 'request', event: 'run.started', status: 'running' }),
      runEvent({
        seq: 2,
        type: 'message',
        event: 'message.done',
        status: 'ok',
        title: '助手消息',
        payload: { message_id: 'msg-1', role: 'assistant' },
      }),
      runEvent({
        seq: 3,
        type: 'tool',
        event: 'tool.result',
        status: 'ok',
        title: '知识检索',
        duration_ms: 800,
        payload: { tool_call_id: 'call-1', tool: 'search_knowledge', status: 'ok' },
      }),
      runEvent({
        seq: 4,
        type: 'tool',
        event: 'tool.result',
        status: 'ok',
        payload: {
          tool_call_id: 'call-mcp',
          tool: 'mcp__slack_mcp__post_message',
          source: 'mcp',
          status: 'ok',
        },
      }),
      runEvent({
        seq: 5,
        type: 'a2a',
        event: 'a2a.task',
        status: 'running',
        payload: { task_id: 'task-1', state: 'input_required' },
      }),
      runEvent({
        seq: 6,
        type: 'workflow',
        event: 'workflow.step',
        status: 'ok',
        payload: { step_id: 'step-1', step_type: 'tool', status: 'rejected' },
      }),
      runEvent({ seq: 7, type: 'approval', event: 'approval.required', status: 'waiting' }),
      runEvent({ seq: 8, type: 'error', event: 'error', status: 'error', error: 'boom' }),
      runEvent({ seq: 9, type: 'notice', event: 'notice', payload: { level: 'info' } }),
    ]

    const entries = buildTraceEntries([], events)

    expect(entries.map((entry) => entry.kind)).toEqual([
      'message',
      'message',
      'tool',
      'mcp',
      'a2a',
      'workflow',
      'approval',
      'error',
    ])
    expect(entries[0]?.status).toBe('ok')
    expect(entries[1]?.status).toBe('ok')
    expect(entries[2]?.durationMs).toBe(800)
    expect(entries[3]?.kind).toBe('mcp')
    expect(entries[4]?.status).toBe('waiting')
    expect(entries[5]?.status).toBe('error')
    expect(entries[6]?.status).toBe('waiting')
    expect(entries[7]?.error).toBe('boom')
  })

  it('servers 事件按关联键合并去重（tool.start + tool.result）', () => {
    const events: RunEvent[] = [
      runEvent({
        seq: 10,
        type: 'tool',
        event: 'tool.start',
        status: 'running',
        payload: { tool_call_id: 'call-1', tool: 'search_knowledge', source: 'knowledge' },
      }),
      runEvent({
        seq: 11,
        type: 'tool',
        event: 'tool.result',
        status: 'ok',
        duration_ms: 800,
        payload: {
          tool_call_id: 'call-1',
          status: 'ok',
          summary: '命中 3 个片段',
        },
        error: null,
      }),
    ]

    const entries = buildTraceEntries([], events)

    expect(entries).toHaveLength(1)
    expect(entries[0]?.event).toBe('tool.result')
    expect(entries[0]?.status).toBe('ok')
    expect(entries[0]?.durationMs).toBe(800)
    expect(entries[0]?.payload?.summary).toBe('命中 3 个片段')
  })

  it('live 与 server 按 toolCallId 合并，server 补齐 payload/duration/status', () => {
    const items = [toolProcess({ status: 'running', durationMs: null, summary: '' })]
    const events: RunEvent[] = [
      runEvent({
        seq: 3,
        type: 'tool',
        event: 'tool.result',
        status: 'ok',
        duration_ms: 800,
        payload: {
          tool_call_id: 'call-search',
          status: 'ok',
          summary: '命中 3 个片段',
          result_preview: 'Q3 客服复盘 v2 (0.94)',
        },
      }),
    ]

    const entries = buildTraceEntries(items, events)

    expect(entries).toHaveLength(1)
    const entry = entries[0]!
    expect(entry.source).toBe('server')
    expect(entry.status).toBe('ok')
    expect(entry.durationMs).toBe(800)
    expect(entry.seq).toBe(3)
    expect(entry.title).toBe('知识检索')
    expect(entry.payload?.tool_call_id).toBe('call-search')
    expect(entry.payload?.args_preview).toBe('query=Q3 客服复盘')
    expect(entry.payload?.summary).toBe('命中 3 个片段')
  })

  it('相同 task_id/step_id 也合并，且不伪造时长', () => {
    const items: ProcessItem[] = [
      a2aProcess({ status: 'running', state: 'working', durationMs: null }),
      workflowProcess({ status: 'ok', durationMs: null }),
      skillProcess({ durationMs: undefined, startedAt: '2026-11-13T10:00:01.000Z' }),
    ]
    const events: RunEvent[] = [
      runEvent({
        seq: 1,
        type: 'a2a',
        event: 'a2a.task',
        status: 'running',
        payload: { task_id: 'task-1', state: 'completed', duration_ms: 1200 },
      }),
      runEvent({
        seq: 2,
        type: 'workflow',
        event: 'workflow.step',
        status: 'ok',
        duration_ms: null,
        payload: { step_id: 'step-1', step_type: 'tool', status: 'ok' },
      }),
      runEvent({
        seq: 3,
        type: 'skill',
        event: 'skill.activated',
        status: 'ok',
        duration_ms: null,
        payload: { skill_id: 'weekly-report', slug: 'weekly-report', name: '周报生成' },
      }),
    ]

    const entries = buildTraceEntries(items, events)

    expect(entries).toHaveLength(3)
    expect(entries.map((entry) => entry.kind)).toEqual(['skill', 'a2a', 'workflow'])
    expect(entries[1]?.status).toBe('ok')
    expect(entries[0]?.durationMs).toBeNull()
    expect(entries[2]?.durationMs).toBeNull()
  })

  it('空输入返回空数组，且不修改入参', () => {
    const items: ProcessItem[] = [toolProcess()]
    const events: RunEvent[] = [
      runEvent({
        seq: 1,
        type: 'tool',
        event: 'tool.result',
        payload: { tool_call_id: 'call-search', status: 'ok' },
      }),
    ]
    const itemsSnapshot = JSON.stringify(items)
    const eventsSnapshot = JSON.stringify(events)

    expect(buildTraceEntries([], [])).toEqual([])
    buildTraceEntries(items, events)

    expect(JSON.stringify(items)).toBe(itemsSnapshot)
    expect(JSON.stringify(events)).toBe(eventsSnapshot)
  })
})

describe('filterEntries / countByKind / groupByKind', () => {
  const items: ProcessItem[] = [
    toolProcess({ toolCallId: 'call-1', summary: '命中 3 个片段' }),
    approvalProcess(),
    errorProcess(),
    skillProcess(),
  ]
  const entries = buildTraceEntries(items, [
    runEvent({
      seq: 1,
      type: 'tool',
      event: 'tool.result',
      title: '知识检索',
      payload: { tool_call_id: 'call-1', status: 'ok', needle: 'zebra-payload' },
    }),
  ])

  it('按 kind 筛选并保留 all', () => {
    expect(filterEntries(entries, 'all', '').length).toBe(entries.length)
    expect(filterEntries(entries, 'tool', '').every((entry) => entry.kind === 'tool')).toBe(true)
    expect(filterEntries(entries, 'tool', '').length).toBe(1)
    expect(filterEntries(entries, 'a2a', '')).toHaveLength(0)
  })

  it('搜索标题/副标题/事件名/错误摘要，payload 不参与搜索', () => {
    expect(filterEntries(entries, 'all', '知识检索').map((entry) => entry.kind)).toContain('tool')
    expect(filterEntries(entries, 'all', 'TOOL.RESULT')).toHaveLength(1)
    expect(filterEntries(entries, 'all', '模型返回异常')).toHaveLength(1)
    expect(filterEntries(entries, 'all', 'HITL')).toHaveLength(1)
    expect(filterEntries(entries, 'all', 'zebra-payload')).toHaveLength(0)
    expect(filterEntries(entries, 'all', '   ')).toHaveLength(entries.length)
  })

  it('countByKind 覆盖所有类型并统计总数', () => {
    const counts = countByKind(entries)
    expect(counts.all).toBe(entries.length)
    expect(counts.tool).toBe(1)
    expect(counts.approval).toBe(1)
    expect(counts.error).toBe(1)
    expect(counts.skill).toBe(1)
    expect(counts.a2a).toBe(0)
  })

  it('groupByKind 按固定顺序分组且跳过空组', () => {
    const groups = groupByKind(entries)
    expect(groups.map((group) => group.kind)).toEqual(['skill', 'tool', 'approval', 'error'])
    expect(groups.flatMap((group) => group.entries)).toHaveLength(entries.length)
    expect(groups.every((group) => group.entries.length > 0)).toBe(true)
  })
})

describe('200 条上限提示', () => {
  it('返回满 200 条或 has_more 时提示', () => {
    expect(TRACE_EVENTS_LIMIT).toBe(200)
    expect(isTraceEventsTruncated(199)).toBe(false)
    expect(isTraceEventsTruncated(199, true)).toBe(true)
    expect(isTraceEventsTruncated(200)).toBe(true)
    expect(isTraceEventsTruncated(200, false)).toBe(true)
    expect(isTraceEventsTruncated(0)).toBe(false)
  })
})
