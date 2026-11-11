import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { usePreferences } from '@/composables/usePreferences'
import { useTheme } from '@/composables/useTheme'
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

    expect(navLabels).toEqual(['账号', '个人能力', '安全与审计', '界面', '模型', '关于'])
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

describe('SettingsView 界面偏好', () => {
  beforeEach(() => {
    useTheme().setTheme('light')
    usePreferences().setDensity('cozy')
  })

  afterEach(() => {
    useTheme().setTheme('light')
    usePreferences().setDensity('cozy')
    window.localStorage.clear()
  })

  it('界面分区可切换主题与消息密度，并展示语言与本地保存说明', async () => {
    const wrapper = mountSettings()
    const interfaceNav = wrapper
      .findAll('.settings-nav-item')
      .find((item) => item.text() === '界面')

    expect(interfaceNav).toBeDefined()
    await interfaceNav!.trigger('click')

    expect(wrapper.text()).toContain('简体中文（zh-CN）')
    expect(wrapper.text()).toContain('多语言将在后续版本评估')
    expect(wrapper.text()).toContain('界面偏好仅保存在本浏览器，不随账号同步。')

    const compact = wrapper.findAll('.segmented button').find((button) => button.text() === '紧凑')
    expect(compact).toBeDefined()
    await compact!.trigger('click')
    expect(compact!.attributes('aria-pressed')).toBe('true')
    expect(document.documentElement.dataset.density).toBe('compact')
    expect(JSON.parse(window.localStorage.getItem('agent-hub.preferences') ?? '{}')).toEqual({
      density: 'compact',
    })

    const dark = wrapper.findAll('.segmented button').find((button) => button.text() === '深色')
    expect(dark).toBeDefined()
    await dark!.trigger('click')
    expect(dark!.attributes('aria-pressed')).toBe('true')
    expect(document.documentElement.dataset.theme).toBe('dark')
  })
})
