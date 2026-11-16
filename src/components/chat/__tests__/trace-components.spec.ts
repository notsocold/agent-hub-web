import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import RunTraceDrawer from '@/components/chat/RunTraceDrawer.vue'
import RunTracePanel from '@/components/chat/RunTracePanel.vue'
import { runsApi } from '@/api/runs'
import type {
  A2aProcess,
  PageResult,
  ProcessItem,
  Run,
  RunEvent,
  RunEventStatus,
  RunEventType,
  ToolProcess,
} from '@/types'

vi.mock('@/api/runs', () => ({
  runsApi: {
    get: vi.fn(),
    events: vi.fn(),
  },
}))

function run(id = 'run-1'): Run {
  return {
    id,
    conversation_id: 'c1',
    status: 'succeeded',
    model: 'deepseek-chat',
    usage: null,
    started_at: '2026-11-13T10:00:00.000Z',
    finished_at: '2026-11-13T10:00:10.000Z',
    duration_ms: 10_000,
    error: null,
  } as unknown as Run
}

function toolProcess(overrides: Partial<ToolProcess> = {}): ToolProcess {
  return {
    kind: 'tool',
    id: 'tool:call-1',
    status: 'running',
    startedAt: '2026-11-13T10:00:02.000Z',
    durationMs: null,
    toolCallId: 'call-1',
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

function runEvent(
  overrides: Partial<RunEvent> & { seq: number; type: RunEventType; status?: RunEventStatus },
): RunEvent {
  const { seq, type, ...rest } = overrides
  return {
    id: `run-1:${seq}`,
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

function page(events: RunEvent[]): PageResult<RunEvent> {
  return {
    items: events,
    has_more: false,
    next_cursor: null,
    stats: {},
  }
}

const defaultItems: ProcessItem[] = [toolProcess(), a2aProcess()]

const defaultEvents: RunEvent[] = [
  runEvent({
    seq: 1,
    type: 'request',
    event: 'run.started',
    status: 'running',
    title: '运行开始',
    subtitle: '整理 Q3 客服周报',
  }),
  runEvent({
    seq: 2,
    type: 'tool',
    event: 'tool.result',
    status: 'ok',
    title: '知识检索',
    subtitle: 'query=Q3 客服复盘 · 工单分类口径',
    duration_ms: 800,
    payload: {
      tool_call_id: 'call-1',
      tool: 'search_knowledge',
      status: 'ok',
      summary: '命中 3 个片段',
      api_token: 'super-secret-token',
    },
  }),
  runEvent({
    seq: 3,
    type: 'a2a',
    event: 'a2a.task',
    status: 'running',
    title: 'Data Analyst',
    subtitle: '12/12 项数字核对通过',
    payload: { task_id: 'task-1', state: 'completed' },
  }),
  runEvent({
    seq: 4,
    type: 'message',
    event: 'message.done',
    title: '助手消息',
    subtitle: 'Q3 共收到 128 条工单',
    payload: { message_id: 'msg-1', role: 'assistant' },
  }),
  runEvent({
    seq: 5,
    type: 'workflow',
    event: 'workflow.step',
    title: '生成周报',
    payload: { step_id: 'step-1', step_type: 'tool', step_title: '生成周报', status: 'ok' },
  }),
  runEvent({
    seq: 6,
    type: 'approval',
    event: 'approval.required',
    status: 'waiting',
    title: 'Slack · 发送消息',
    payload: { approval_id: 'approval-1', tool: 'mcp__slack_mcp__post_message' },
  }),
  runEvent({
    seq: 7,
    type: 'error',
    event: 'error',
    status: 'error',
    title: '运行错误',
    error: '模型返回异常',
    payload: { code: 'model_error', message: '模型返回异常' },
  }),
]

function mountDrawer(overrides: { items?: ProcessItem[]; runId?: string | null } = {}) {
  return mount(RunTraceDrawer, {
    global: { stubs: { teleport: true } },
    props: {
      open: true,
      items: overrides.items ?? defaultItems,
      runId: overrides.runId === undefined ? 'run-1' : overrides.runId,
      streaming: false,
      usage: null,
      finishReason: 'stop',
      conversationTitle: '测试会话',
    },
  })
}

describe('运行轨迹抽屉交互（D1 / WP2）', () => {
  beforeEach(() => {
    vi.mocked(runsApi.get).mockReset()
    vi.mocked(runsApi.events).mockReset()
    vi.mocked(runsApi.get).mockResolvedValue(run())
    vi.mocked(runsApi.events).mockResolvedValue(page(defaultEvents))
  })

  it('渲染时间线、图例计数与成功/失败/等待统计', async () => {
    const wrapper = mountDrawer()
    await flushPromises()

    expect(wrapper.find('.trace-overview').exists()).toBe(true)
    expect(wrapper.find('[role="img"][aria-label^="执行时间线"]').exists()).toBe(true)

    const legend = wrapper.get('[aria-label="事件类型图例"]')
    expect(legend.findAll('li')).toHaveLength(8)
    expect(legend.text()).toContain('消息')
    expect(legend.text()).toContain('工具')
    expect(legend.text()).toContain('审批')
    expect(wrapper.text()).toContain('成功')
    expect(wrapper.text()).toContain('失败')
    expect(wrapper.text()).toContain('等待')
    expect(wrapper.findAll('.trace-row')).toHaveLength(7)
    wrapper.unmount()
  })

  it('类型筛选切换后行数变化，aria-pressed 同步', async () => {
    const wrapper = mountDrawer()
    await flushPromises()

    expect(wrapper.findAll('.trace-row')).toHaveLength(7)
    await wrapper.get('[data-filter="tool"]').trigger('click')

    expect(wrapper.findAll('.trace-row')).toHaveLength(1)
    expect(wrapper.get('[data-filter="tool"]').attributes('aria-pressed')).toBe('true')
    expect(wrapper.get('[data-filter="all"]').attributes('aria-pressed')).toBe('false')

    await wrapper.get('[data-filter="all"]').trigger('click')
    expect(wrapper.findAll('.trace-row')).toHaveLength(7)
    wrapper.unmount()
  })

  it('时间线按时长画段，缺失时长用最小宽度并标 “—”，统计正确', async () => {
    const wrapper = mountDrawer()
    await flushPromises()

    const segments = wrapper.findAll('[data-testid="trace-segment"]')
    expect(segments).toHaveLength(7)

    const toolSegment = segments.find((segment) => segment.attributes('data-kind') === 'tool')
    expect(toolSegment).toBeTruthy()
    expect(toolSegment!.attributes('style')).toContain('flex-grow: 800')
    expect(toolSegment!.attributes('title')).toContain('800ms')

    const unknownSegments = segments.filter((segment) =>
      segment.attributes('class')?.includes('is-unknown'),
    )
    expect(unknownSegments.length).toBeGreaterThan(0)
    expect(unknownSegments[0]!.attributes('title')).toContain('—')

    const stats = wrapper.get('[aria-label="事件状态统计"]').text()
    expect(stats).toContain('成功 5')
    expect(stats).toContain('失败 1')
    expect(stats).toContain('等待 1')
    wrapper.unmount()
  })

  it('搜索命中标题，payload 中的敏感值不参与搜索', async () => {
    const wrapper = mountDrawer()
    await flushPromises()

    const input = wrapper.get('input[aria-label="搜索运行事件"]')
    await input.setValue('知识检索')
    expect(wrapper.findAll('.trace-row')).toHaveLength(1)
    expect(wrapper.text()).toContain('知识检索')

    await input.setValue('super-secret-token')
    expect(wrapper.findAll('.trace-row')).toHaveLength(0)
    expect(wrapper.text()).toContain('没有匹配的运行事件。')

    await wrapper.get('button[aria-label="清除搜索"]').trigger('click')
    expect(wrapper.findAll('.trace-row')).toHaveLength(7)
    wrapper.unmount()
  })

  it('展开行显示脱敏 JSON，敏感键被遮罩', async () => {
    const wrapper = mountDrawer()
    await flushPromises()

    const toolRow = wrapper
      .findAll('.trace-row')
      .find((row) => row.attributes('data-kind') === 'tool')
    expect(toolRow).toBeTruthy()
    const summary = toolRow!.get('button.trace-row-summary')
    expect(summary.attributes('aria-expanded')).toBe('false')

    await summary.trigger('click')
    expect(summary.attributes('aria-expanded')).toBe('true')

    const code = toolRow!.get('pre.trace-code')
    expect(code.text()).toContain('"api_token": "••••"')
    expect(code.text()).not.toContain('super-secret-token')
    expect(toolRow!.text()).toContain('敏感字段已遮罩')

    await summary.trigger('click')
    expect(summary.attributes('aria-expanded')).toBe('false')
    wrapper.unmount()
  })

  it('全部展开/全部折叠控制所有可见行', async () => {
    const wrapper = mountDrawer()
    await flushPromises()

    const expandButton = wrapper.findAll('.trace-expand-actions button')[0]!
    const collapseButton = wrapper.findAll('.trace-expand-actions button')[1]!
    await expandButton.trigger('click')

    for (const button of wrapper.findAll('.trace-row-summary')) {
      expect(button.attributes('aria-expanded')).toBe('true')
    }

    await collapseButton.trigger('click')
    for (const button of wrapper.findAll('.trace-row-summary')) {
      expect(button.attributes('aria-expanded')).toBe('false')
    }
    wrapper.unmount()
  })

  it('加载中/错误/空态都有中文提示', async () => {
    vi.mocked(runsApi.events).mockReturnValue(new Promise(() => {}))
    const loading = mountDrawer()
    await flushPromises()
    expect(loading.text()).toContain('正在加载服务端事件…')
    loading.unmount()

    vi.mocked(runsApi.events).mockRejectedValue(new Error('事件接口 500'))
    const failed = mountDrawer()
    await flushPromises()
    expect(failed.text()).toContain('服务端事件加载失败：事件接口 500')
    expect(failed.findAll('.trace-row').length).toBeGreaterThan(0)
    failed.unmount()

    vi.mocked(runsApi.events).mockResolvedValue(page([]))
    const empty = mountDrawer({ items: [] })
    await flushPromises()
    expect(empty.text()).toContain('该运行暂无可展示的运行事件。')
    empty.unmount()

    vi.mocked(runsApi.get).mockClear()
    const noRun = mountDrawer({ items: [], runId: null })
    await flushPromises()
    expect(runsApi.get).not.toHaveBeenCalled()
    expect(noRun.text()).toContain('本轮还没有可展示的运行轨迹。')
    noRun.unmount()
  })

  it('服务端返回满 200 条时提示仅显示最近 200 条', async () => {
    const many = Array.from({ length: 200 }, (_, index) =>
      runEvent({
        seq: index + 1,
        type: 'message',
        event: 'message.done',
        title: `事件 ${index + 1}`,
        payload: { message_id: `msg-${index + 1}`, role: 'assistant' },
      }),
    )
    vi.mocked(runsApi.events).mockResolvedValue(page(many))

    const wrapper = mountDrawer({ items: [] })
    await flushPromises()

    expect(runsApi.events).toHaveBeenCalledWith('run-1', { limit: 200 })
    expect(wrapper.text()).toContain('仅显示最近 200 条')
    wrapper.unmount()
  })

  it('抽屉外壳：关闭按钮与 Escape 均触发 close', async () => {
    const wrapper = mountDrawer()
    await flushPromises()

    expect(wrapper.get('[role="dialog"]').attributes('aria-labelledby')).toBe('run-trace-title')
    expect(wrapper.get('#run-trace-title').text()).toBe('运行事件')

    await wrapper.get('button[aria-label="关闭运行事件"]').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await flushPromises()
    expect(wrapper.emitted('close')).toHaveLength(2)
    wrapper.unmount()
  })

  it('panel 模式保持概要，不渲染抽屉工具栏', async () => {
    const wrapper = mount(RunTracePanel, {
      props: {
        items: [toolProcess()],
        runId: 'run-1',
        streaming: false,
        usage: null,
        finishReason: null,
        conversationTitle: '测试会话',
        mode: 'panel',
      },
    })
    await flushPromises()

    expect(wrapper.text()).toContain('执行轨道')
    expect(wrapper.find('.trace-toolbar').exists()).toBe(false)
    expect(wrapper.find('.trace-overview').exists()).toBe(false)
    expect(runsApi.get).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})
