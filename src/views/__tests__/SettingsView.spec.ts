import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { describe, expect, it } from 'vitest'

import { useSystemStore } from '@/stores/system'
import type { SystemInfo } from '@/types'
import SettingsView from '@/views/SettingsView.vue'

function systemInfo(): SystemInfo {
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

function mountSettings() {
  setActivePinia(createPinia())
  const system = useSystemStore()
  system.info = systemInfo()
  system.loaded = true

  return mount(SettingsView, {
    global: {
      stubs: {
        InstructionPanel: true,
        MemoryPanel: true,
        SkillPanel: true,
        McpPanel: true,
      },
    },
  })
}

describe('SettingsView 能力边界', () => {
  it('不再提供入站 A2A 分区与端点复制入口', () => {
    const wrapper = mountSettings()
    const navLabels = wrapper.findAll('.settings-nav-item').map((item) => item.text())

    expect(navLabels).toEqual(['账号', '个人能力', '模型', '关于'])
    expect(wrapper.text()).not.toContain('A2A')
    expect(wrapper.find('[data-testid="copy-card-url"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="copy-jsonrpc-url"]').exists()).toBe(false)
  })

  it('移除 A2A 后其余分区仍可切换', async () => {
    const wrapper = mountSettings()
    const modelNav = wrapper.findAll('button').find((button) => button.text() === '模型')

    expect(modelNav).toBeDefined()
    await modelNav!.trigger('click')
    expect(wrapper.text()).toContain('温度')
    expect(wrapper.text()).toContain('0.7')
  })
})
