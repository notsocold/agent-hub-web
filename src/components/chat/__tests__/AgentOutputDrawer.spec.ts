import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import A2ACard from '@/components/chat/cards/A2ACard.vue'
import AgentOutputDrawer from '@/components/chat/AgentOutputDrawer.vue'
import type { A2aProcess } from '@/types'

const RouterLinkStub = {
  name: 'RouterLink',
  props: ['to'],
  template: '<a class="router-link"><slot /></a>',
}

function a2aProcess(overrides: Partial<A2aProcess> = {}): A2aProcess {
  return {
    kind: 'a2a',
    id: 'a2a:task-1',
    status: 'ok',
    startedAt: '2026-11-11T10:00:00Z',
    durationMs: 1200,
    taskId: 'task-1',
    a2aTaskId: 'a2a-1',
    agent: 'data-analyst',
    agentName: 'Data Analyst',
    state: 'completed',
    progress: 1,
    requestSummary: '汇总本周工单',
    resultSummary: '已完成汇总',
    artifactSummary: 'Markdown · 5 sections',
    error: null,
    ...overrides,
  }
}

describe('A2ACard 输出入口', () => {
  it('点击「查看输出」抛出 open-output', async () => {
    const wrapper = mount(A2ACard, {
      props: { item: a2aProcess() },
      global: { stubs: { RouterLink: RouterLinkStub } },
    })

    await wrapper.get('button.meta-link').trigger('click')
    expect(wrapper.emitted('open-output')).toHaveLength(1)
  })
})

describe('AgentOutputDrawer', () => {
  it('展示 Agent、最终结果、产出与任务跳转', () => {
    const wrapper = mount(AgentOutputDrawer, {
      props: { open: true, item: a2aProcess() },
      global: {
        stubs: { teleport: true, RouterLink: RouterLinkStub },
      },
    })

    expect(wrapper.text()).toContain('Data Analyst')
    expect(wrapper.text()).toContain('已完成汇总')
    expect(wrapper.text()).toContain('Markdown · 5 sections')
    expect(wrapper.find('a.router-link').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('尚未返回可展示的结果')
  })

  it('没有结果与 artifact 时给出空态，不伪造内容', () => {
    const wrapper = mount(AgentOutputDrawer, {
      props: {
        open: true,
        item: a2aProcess({ resultSummary: '', artifactSummary: '', state: 'working' }),
      },
      global: { stubs: { teleport: true, RouterLink: RouterLinkStub } },
    })

    expect(wrapper.text()).toContain('尚未返回可展示的结果')
  })
})
