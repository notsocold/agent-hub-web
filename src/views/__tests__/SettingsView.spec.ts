import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { describe, expect, it } from 'vitest'

import { useSystemStore } from '@/stores/system'
import type { SystemInfo } from '@/types'
import SettingsView from '@/views/SettingsView.vue'

function systemInfo(a2aEnabled: boolean): SystemInfo {
  return {
    version: '0.1.0',
    build: 'test',
    environment: 'test',
    models: [],
    default_model: '',
    reasoning_efforts: [],
    default_reasoning_effort: 'low',
    embedding: { model: 'test-embedding', dim: 3 },
    generation: { temperature: 0.7, timeout_seconds: 30, max_output_tokens: 1000 },
    a2a: {
      enabled: a2aEnabled,
      card_url: 'https://hub.example.com/a2a/.well-known/agent-card.json',
      jsonrpc_url: 'https://hub.example.com/a2a',
      auth_type: 'none',
      card_security: 'none',
    },
    capabilities: {
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
    },
    limits: {
      skills_per_message: 3,
      mcp_servers_per_message: 5,
      mcp_tools_per_message: 10,
      knowledge_categories_per_message: 5,
      attachments_per_message: 5,
      attachment_max_bytes: 20 * 1024 * 1024,
      message_max_chars: 8000,
    },
  }
}

async function mountA2aSection(a2aEnabled: boolean) {
  setActivePinia(createPinia())
  const system = useSystemStore()
  system.info = systemInfo(a2aEnabled)
  system.loaded = true

  const wrapper = mount(SettingsView, {
    global: {
      stubs: {
        InstructionPanel: true,
        MemoryPanel: true,
        SkillPanel: true,
        McpPanel: true,
      },
    },
  })

  const nav = wrapper.findAll('button').find((button) => button.text() === 'A2A')
  expect(nav).toBeDefined()
  await nav!.trigger('click')
  return wrapper
}

describe('SettingsView A2A 入站门控', () => {
  it('未启用时显示提示、隐藏地址并禁用复制', async () => {
    const wrapper = await mountA2aSection(false)

    expect(wrapper.text()).toContain('入站未启用')
    expect(wrapper.text()).not.toContain('https://hub.example.com/a2a')
    expect(wrapper.find('[data-testid="copy-card-url"]').attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-testid="copy-jsonrpc-url"]').attributes('disabled')).toBeDefined()
  })

  it('启用后展示地址并允许复制', async () => {
    const wrapper = await mountA2aSection(true)

    expect(wrapper.text()).toContain('https://hub.example.com/a2a')
    expect(wrapper.find('[data-testid="a2a-status"]').text()).toBe('none')
    expect(wrapper.find('[data-testid="copy-card-url"]').attributes('disabled')).toBeUndefined()
    expect(wrapper.find('[data-testid="copy-jsonrpc-url"]').attributes('disabled')).toBeUndefined()
  })
})
