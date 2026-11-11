import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'

import MessageList from '@/components/chat/MessageList.vue'
import type { ChatMessageView, ProcessItem } from '@/types'

// jsdom 没有真实滚动尺寸，替换虚拟列表，避免 scrollTo 内部报错。
vi.mock('virtua/vue', async () => {
  const { defineComponent, h } = await import('vue')
  return {
    VList: defineComponent({
      name: 'VList',
      props: { data: { type: Array, default: () => [] } },
      setup(_props, { expose }) {
        expose({
          scrollToIndex: () => undefined,
          scrollTo: () => undefined,
        })
        return () => h('div', { class: 'vlist-stub' })
      },
    }),
  }
})

function message(overrides: Partial<ChatMessageView> = {}): ChatMessageView {
  return {
    id: 'm-1',
    role: 'assistant',
    content: '第一段内容',
    content_type: 'markdown',
    run_id: 'run-1',
    client_message_id: null,
    status: 'completed',
    citations: [],
    attachments: [],
    capabilities: { skills: [], mcp_servers: [], mcp_tools: [], knowledge_categories: [] },
    artifacts: [],
    usage: null,
    error: null,
    created_at: '2026-11-11T00:00:00Z',
    ...overrides,
  }
}

function waitingApproval(): ProcessItem {
  return {
    kind: 'approval',
    id: 'approval:approval-1',
    status: 'waiting',
    approvalId: 'approval-1',
    tool: 'shell',
    toolDisplayName: '执行命令',
    source: 'builtin',
    executor: 'backend',
    target: '/tmp',
    sideEffect: '写文件',
    risk: 'medium',
    reason: '需要用户确认',
    expiresAt: null,
    decision: null,
  }
}

function mountList(props: Record<string, unknown> = {}) {
  return mount(MessageList, {
    props: {
      messages: [],
      process: [],
      streaming: false,
      loading: false,
      resolvingApproval: false,
      ...props,
    },
  })
}

function liveText(wrapper: ReturnType<typeof mountList>): string {
  return wrapper.get('.sr-only').text()
}

describe('MessageList 流式状态播报', () => {
  it('进入已有历史消息的会话时不播报「回复完成」', () => {
    const wrapper = mountList({ messages: [message()], currentRunId: 'run-1' })
    expect(liveText(wrapper)).toBe('')
  })

  it('切换会话后不沿用上一会话的流式经历', async () => {
    const wrapper = mountList({
      messages: [message()],
      currentRunId: 'run-1',
      conversationId: 'conv-1',
    })
    await wrapper.setProps({ streaming: true })
    expect(liveText(wrapper)).toBe('助手开始回复')

    await wrapper.setProps({
      messages: [message({ id: 'm-2' })],
      streaming: false,
      conversationId: 'conv-2',
    })
    expect(liveText(wrapper)).toBe('')
  })

  it('流式开始与完成只播报状态节点', async () => {
    const wrapper = mountList({ messages: [message()], currentRunId: 'run-1' })
    await wrapper.setProps({ streaming: true })
    expect(liveText(wrapper)).toBe('助手开始回复')

    await wrapper.setProps({
      messages: [message({ content: '完整回复正文' })],
      streaming: false,
    })
    expect(liveText(wrapper)).toBe('回复完成')
  })

  it('消息正文增量不会改变播报文本', async () => {
    const wrapper = mountList({
      messages: [message({ content: '第一段' })],
      streaming: true,
      currentRunId: 'run-1',
    })
    expect(liveText(wrapper)).toBe('助手开始回复')

    await wrapper.setProps({
      messages: [message({ content: '第一段追加了很多正文' })],
    })
    expect(liveText(wrapper)).toBe('助手开始回复')
  })

  it('等待审批与生成失败会播报', async () => {
    const wrapper = mountList({
      messages: [message({ streaming: true })],
      streaming: true,
      currentRunId: 'run-1',
    })
    await wrapper.setProps({ process: [waitingApproval()] })
    expect(liveText(wrapper)).toBe('等待审批')

    await wrapper.setProps({
      process: [],
      streaming: false,
      messages: [message({ status: 'failed', error: { code: 'stream_error', message: '失败' } })],
    })
    expect(liveText(wrapper)).toBe('生成失败')
  })
})
