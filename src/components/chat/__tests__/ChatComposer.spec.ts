import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import ChatComposer from '@/components/chat/ChatComposer.vue'

function mountComposer(props: Record<string, unknown> = {}) {
  return mount(ChatComposer, {
    props: {
      streaming: false,
      model: 'deepseek-chat',
      reasoningEffort: 'low',
      models: [],
      reasoningEfforts: [],
      ...props,
    },
  })
}

const limits = {
  skills_per_message: 3,
  mcp_servers_per_message: 5,
  mcp_tools_per_message: 10,
  knowledge_categories_per_message: 5,
  attachments_per_message: 5,
  attachment_max_bytes: 20 * 1024 * 1024,
  message_max_chars: 8000,
}

const capabilities = {
  instructions: true,
  memories: true,
  skills: true,
  mcp: true,
  knowledge: false,
  attachments: true,
  workflows: false,
  approvals: true,
  agents: true,
  tasks: true,
}

const skills = [
  {
    id: 'skill-1',
    slug: 'weekly-report',
    name: '周报生成',
    description: '固定章节',
    scope: 'system' as const,
    estimated_tokens: 820,
    enabled: true,
  },
]

const mcpServers = [
  {
    id: 'server-1',
    slug: 'slack-mcp',
    name: 'Slack',
    scope: 'system' as const,
    tool_count: 2,
    enabled: true,
    health_status: 'healthy' as const,
  },
]

const mcpTools = [
  {
    id: 'tool-1',
    server_id: 'server-1',
    name: 'conversations.info',
    exposed_name: 'mcp__slack_mcp__conversations_info',
    risk: 'read' as const,
    requires_approval: false,
  },
]


describe('ChatComposer', () => {
  it('Enter 发送并清空输入', async () => {
    const wrapper = mountComposer()
    const textarea = wrapper.find('textarea')
    await textarea.setValue('整理一份周报')
    await textarea.trigger('keydown', { key: 'Enter' })

    expect(wrapper.emitted('send')?.[0]).toEqual([{ text: '整理一份周报', context: {} }])
    expect((textarea.element as HTMLTextAreaElement).value).toBe('')
  })

  it('Shift+Enter 不发送', async () => {
    const wrapper = mountComposer()
    const textarea = wrapper.find('textarea')
    await textarea.setValue('换行内容')
    await textarea.trigger('keydown', { key: 'Enter', shiftKey: true })

    expect(wrapper.emitted('send')).toBeUndefined()
  })

  it('空内容不发送', async () => {
    const wrapper = mountComposer()
    const textarea = wrapper.find('textarea')
    await textarea.setValue('   ')
    await textarea.trigger('keydown', { key: 'Enter' })

    expect(wrapper.emitted('send')).toBeUndefined()
  })

  it('流式中按钮变为停止并触发 stop', async () => {
    const wrapper = mountComposer({ streaming: true })
    const button = wrapper.find('button.send')

    expect(button.attributes('aria-label')).toBe('停止生成')
    await button.trigger('click')
    expect(wrapper.emitted('stop')).toHaveLength(1)
  })

  it('发送按钮在无内容时禁用', () => {
    const wrapper = mountComposer()
    const button = wrapper.find('button.send')
    expect(button.attributes('disabled')).toBeDefined()
  })

  it('选择技能后随本轮请求发送并在发送后清空', async () => {
    const wrapper = mountComposer({ skills, limits, capabilities })
    await wrapper.find('[data-testid="composer-plus"]').trigger('click')
    await wrapper.find('[data-testid="ctx-skill"]').trigger('click')
    await wrapper.find('[data-testid="skill-option"]').trigger('click')
    expect(wrapper.findAll('[data-testid="chip-skill"]')).toHaveLength(1)

    const textarea = wrapper.find('textarea')
    await textarea.setValue('生成本周周报')
    await textarea.trigger('keydown', { key: 'Enter' })

    const payload = wrapper.emitted('send')?.[0]?.[0] as {
      context: { skills?: string[] }
    }
    expect(payload.context.skills).toEqual(['skill-1'])
    expect(wrapper.findAll('[data-testid="chip-skill"]')).toHaveLength(0)

    const second = wrapper.find('textarea')
    await second.setValue('再发一条')
    await second.trigger('keydown', { key: 'Enter' })
    const next = wrapper.emitted('send')?.[1]?.[0] as { context: Record<string, unknown> }
    expect(next.context.skills).toBeUndefined()
  })

  it('选择 MCP 服务器与工具后发送 context', async () => {
    const wrapper = mountComposer({ mcpServers, mcpTools, limits, capabilities })
    await wrapper.find('[data-testid="composer-plus"]').trigger('click')
    await wrapper.find('[data-testid="ctx-mcp"]').trigger('click')
    await wrapper.find('[data-testid="server-option"]').trigger('click')

    const textarea = wrapper.find('textarea')
    await textarea.setValue('看看频道信息')
    await textarea.trigger('keydown', { key: 'Enter' })

    const payload = wrapper.emitted('send')?.[0]?.[0] as {
      context: { mcp_servers?: string[] }
    }
    expect(payload.context.mcp_servers).toEqual(['server-1'])
  })

  it('展开 MCP 服务器时按需请求工具目录', async () => {
    const wrapper = mountComposer({ mcpServers, limits, capabilities })
    await wrapper.find('[data-testid="composer-plus"]').trigger('click')
    await wrapper.find('[data-testid="ctx-mcp"]').trigger('click')
    await wrapper.find('[data-testid="server-tools"]').trigger('click')
    expect(wrapper.emitted('load-mcp-tools')?.[0]).toEqual(['server-1'])
  })

  it('技能达到上限后不再添加', async () => {
    const many = [
      ...skills,
      { ...skills[0]!, id: 'skill-2', slug: 's2', name: '技能二' },
      { ...skills[0]!, id: 'skill-3', slug: 's3', name: '技能三' },
      { ...skills[0]!, id: 'skill-4', slug: 's4', name: '技能四' },
    ]
    const wrapper = mountComposer({ skills: many, limits, capabilities })
    await wrapper.find('[data-testid="composer-plus"]').trigger('click')
    await wrapper.find('[data-testid="ctx-skill"]').trigger('click')
    const options = wrapper.findAll('[data-testid="skill-option"]')
    for (const option of options) await option.trigger('click')
    expect(wrapper.findAll('[data-testid="chip-skill"]')).toHaveLength(3)
  })
})
