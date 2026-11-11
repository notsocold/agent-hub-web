import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import ProcessTimeline from '@/components/chat/ProcessTimeline.vue'
import type { A2aProcess, ApprovalProcess, ProcessItem, ToolProcess } from '@/types'

const RouterLinkStub = {
  name: 'RouterLink',
  props: ['to'],
  template: '<a class="router-link"><slot /></a>',
}

function tool(id: string): ToolProcess {
  return {
    kind: 'tool',
    id,
    status: 'ok',
    startedAt: '2026-11-11T10:00:00Z',
    durationMs: 620,
    toolCallId: id,
    tool: 'tickets.aggregate',
    displayName: 'tickets.aggregate',
    source: 'native',
    sourceId: null,
    server: '',
    risk: 'read',
    requiresApproval: false,
    argsPreview: '',
    resultPreview: '',
    summary: '128 rows',
    error: null,
    metadata: {},
  }
}

function a2a(id: string): A2aProcess {
  return {
    kind: 'a2a',
    id,
    status: 'ok',
    startedAt: '2026-11-11T10:00:00Z',
    durationMs: 1200,
    taskId: 'task-1',
    a2aTaskId: 'a2a-1',
    agent: 'data-analyst',
    agentName: 'Data Analyst',
    state: 'completed',
    progress: 1,
    requestSummary: '汇总工单',
    resultSummary: '完成',
    artifactSummary: 'markdown',
    error: null,
  }
}

function approval(id: string): ApprovalProcess {
  return {
    kind: 'approval',
    id,
    status: 'waiting',
    startedAt: '2026-11-11T10:00:00Z',
    approvalId: id,
    tool: 'mcp_slack__post_message',
    toolDisplayName: 'Slack · 发送消息',
    source: 'mcp',
    executor: 'slack-mcp',
    target: '#support-weekly',
    sideEffect: '外部写操作',
    risk: 'write',
    reason: '发布周报',
    expiresAt: null,
    decision: null,
  }
}

describe('ProcessTimeline 摘要栏', () => {
  it('汇总思考时长、步骤数、远程智能体与审批数', () => {
    const items: ProcessItem[] = [tool('t1'), a2a('a1'), approval('p1')]
    const wrapper = mount(ProcessTimeline, {
      props: { items, reasoningMs: 12_400 },
      global: { stubs: { RouterLink: RouterLinkStub } },
    })

    const header = wrapper.get('.process-toggle').text()
    expect(header).toContain('思考 12s')
    expect(header).toContain('3 步')
    expect(header).toContain('1 个远程智能体')
    expect(header).toContain('1 个审批')
    wrapper.unmount()
  })

  it('没有思考与审批时只显示步骤数', () => {
    const wrapper = mount(ProcessTimeline, {
      props: { items: [tool('t1')] },
      global: { stubs: { RouterLink: RouterLinkStub } },
    })

    const header = wrapper.get('.process-toggle').text()
    expect(header).toContain('1 步')
    expect(header).not.toContain('思考')
    expect(header).not.toContain('审批')
    wrapper.unmount()
  })

  it('点击 A2A 卡的“查看输出”向上抛出 open-output', async () => {
    const wrapper = mount(ProcessTimeline, {
      props: { items: [a2a('a1')] },
      global: { stubs: { RouterLink: RouterLinkStub } },
    })

    await wrapper.get('button.meta-link').trigger('click')
    const emitted = wrapper.emitted('open-output')
    expect(emitted).toHaveLength(1)
    const first = emitted?.[0]?.[0] as A2aProcess | undefined
    expect(first?.id).toBe('a1')
    wrapper.unmount()
  })
})
