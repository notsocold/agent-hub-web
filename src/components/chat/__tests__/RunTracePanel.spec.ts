import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import RunTracePanel from '@/components/chat/RunTracePanel.vue'
import { runsApi } from '@/api/runs'
import type { PageResult, Run, RunEvent } from '@/types'

vi.mock('@/api/runs', () => ({
  runsApi: {
    get: vi.fn(),
    events: vi.fn(),
  },
}))

function run(id: string): Run {
  return {
    id,
    conversation_id: 'c1',
    status: 'running',
    model: 'deepseek-chat',
    usage: null,
    duration_ms: null,
    error: null,
  } as unknown as Run
}

const emptyEvents = {
  items: [],
  has_more: false,
  next_cursor: null,
  stats: {},
} as unknown as PageResult<RunEvent>

function mountPanel(overrides: { runId?: string | null; streaming?: boolean } = {}) {
  return mount(RunTracePanel, {
    props: {
      items: [],
      runId: overrides.runId === undefined ? 'run-1' : overrides.runId,
      streaming: overrides.streaming ?? true,
      usage: null,
      finishReason: null,
      conversationTitle: '测试会话',
      // 服务端事件回放位于抽屉模式（常驻右栏不再重复拉事件接口）。
      mode: 'drawer',
    },
  })
}

describe('RunTracePanel', () => {
  beforeEach(() => {
    vi.mocked(runsApi.get).mockReset()
    vi.mocked(runsApi.events).mockReset()
    vi.mocked(runsApi.get).mockResolvedValue(run('run-1'))
    vi.mocked(runsApi.events).mockResolvedValue(emptyEvents)
  })

  it('run 开始时加载，流式结束后再次刷新事件回放', async () => {
    const wrapper = mountPanel({ streaming: true })
    await flushPromises()
    expect(runsApi.get).toHaveBeenCalledWith('run-1')
    expect(runsApi.get).toHaveBeenCalledTimes(1)

    await wrapper.setProps({ streaming: false })
    await flushPromises()
    expect(runsApi.get).toHaveBeenCalledTimes(2)
    wrapper.unmount()
  })

  it('切换 runId 时请求新 run，旧请求不覆盖新结果', async () => {
    const wrapper = mountPanel({ runId: 'run-1', streaming: false })
    await flushPromises()

    vi.mocked(runsApi.get).mockResolvedValue(run('run-2'))
    await wrapper.setProps({ runId: 'run-2' })
    await flushPromises()

    expect(runsApi.get).toHaveBeenLastCalledWith('run-2')
    expect(wrapper.text()).toContain('run-2')
    wrapper.unmount()
  })

  it('runId 为空时清空摘要，不发起请求', async () => {
    const wrapper = mountPanel({ runId: null, streaming: false })
    await flushPromises()
    expect(runsApi.get).not.toHaveBeenCalled()
    // 会话标题改由抽屉头部承载；面板内保留事件回放区块与计数。
    expect(wrapper.text()).toContain('服务端事件回放')
    expect(wrapper.text()).toContain('0')
    wrapper.unmount()
  })
})
