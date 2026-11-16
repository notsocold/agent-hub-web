import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import AdminSettingsView from '@/views/admin/AdminSettingsView.vue'
import type { SystemInfo } from '@/types'

const systemApiMock = vi.hoisted(() => ({ info: vi.fn() }))
vi.mock('@/api/system', () => ({ systemApi: systemApiMock }))

function systemInfo(overrides: Partial<SystemInfo> = {}): SystemInfo {
  return {
    version: '0.1.0',
    build: 'test-build',
    environment: 'test',
    models: [
      {
        id: 'deepseek-chat',
        name: 'DeepSeek Chat',
        description: '通用对话模型',
        capabilities: { streaming: true, reasoning: true, tools: true },
      },
    ],
    default_model: 'deepseek-chat',
    reasoning_efforts: [],
    default_reasoning_effort: 'low',
    embedding: { model: 'test-embedding', dim: 1536 },
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
    ...overrides,
  }
}

function mountView(): VueWrapper {
  setActivePinia(createPinia())
  return mount(AdminSettingsView, {
    global: {
      stubs: {
        RouterLink: { props: ['to'], template: '<a class="router-link-stub"><slot /></a>' },
        AdminInstructionCard: true,
        AdminSkillCard: true,
        AdminMcpCard: true,
        AdminAgentCard: true,
        SecretPanel: true,
      },
    },
  })
}

async function mountReady(): Promise<VueWrapper> {
  const wrapper = mountView()
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  vi.clearAllMocks()
  systemApiMock.info.mockResolvedValue(systemInfo())
})

describe('AdminSettingsView M8 B 路径只读面板', () => {
  it('渲染七个分区并包含平台信息与能力开关只读面板', async () => {
    const wrapper = await mountReady()

    const labels = wrapper.findAll('.settings-nav button').map((button) => button.text())
    expect(labels).toEqual([
      '平台指令',
      '系统技能',
      '系统 MCP',
      '全局 Agent',
      '平台密钥',
      '平台信息',
      '能力开关',
    ])

    const ids = wrapper.findAll('.settings-section').map((section) => section.attributes('id'))
    expect(ids).toEqual([
      'admin-settings-instruction',
      'admin-settings-skills',
      'admin-settings-mcp',
      'admin-settings-agents',
      'admin-settings-secrets',
      'admin-settings-platform',
      'admin-settings-capabilities',
    ])

    // 页头明确目标形态与未排期，避免把只读面板解释成完整运维配置。
    expect(wrapper.text()).toContain(
      '平台运维类配置（认证策略/配额/数据保留/功能开关/危险操作）为目标形态，未排期',
    )

    const platform = wrapper.get('#admin-settings-platform')
    expect(platform.get('h2').text()).toBe('平台信息')
    const platformText = platform.text()
    expect(platformText).toContain('0.1.0')
    expect(platformText).toContain('test-build')
    expect(platformText).toContain('DeepSeek Chat')
    expect(platformText).toContain('test-embedding · 1536 维')
    expect(platformText).toContain('已开启 8 / 10 项')

    const capabilities = wrapper.get('#admin-settings-capabilities')
    expect(capabilities.get('h2').text()).toBe('能力开关')
    const capabilityText = capabilities.text()
    expect(capabilityText).toContain('已开启')
    expect(capabilityText).toContain('已关闭')
    // 全量键值：capabilities 与 limits 的 key 都要出现。
    expect(capabilityText).toContain('instructions')
    expect(capabilityText).toContain('message_max_chars')
    expect(capabilityText).toContain('单条消息字符上限')
    expect(capabilityText).toContain('8000')
    expect(capabilityText).toContain('20971520')

    // 只读：新增面板不出现任何输入类控件。
    expect(platform.findAll('input, textarea, select')).toHaveLength(0)
    expect(capabilities.findAll('input, textarea, select')).toHaveLength(0)
    wrapper.unmount()
  })

  it('加载失败显示错误态，点击重试后恢复真实数据', async () => {
    systemApiMock.info
      .mockRejectedValueOnce(new Error('系统信息不可用'))
      .mockResolvedValueOnce(systemInfo())
    const wrapper = await mountReady()

    expect(wrapper.text()).toContain('系统信息不可用')
    const platform = wrapper.get('#admin-settings-platform')
    const retry = platform.findAll('button').find((button) => button.text() === '重试')
    expect(retry).toBeDefined()

    await retry!.trigger('click')
    await flushPromises()

    expect(systemApiMock.info).toHaveBeenCalledTimes(2)
    expect(wrapper.text()).not.toContain('系统信息不可用')
    expect(platform.text()).toContain('0.1.0')
    wrapper.unmount()
  })

  it('空数据显示 —，不补造版本/模型/Embedding', async () => {
    systemApiMock.info.mockResolvedValue(
      systemInfo({
        version: '',
        build: '',
        environment: '',
        default_model: '',
        models: [],
        embedding: { model: '', dim: 0 },
      }),
    )
    const wrapper = await mountReady()

    const platform = wrapper.get('#admin-settings-platform')
    expect(platform.text()).toContain('—')
    expect(platform.findAll('dd.is-empty').length).toBeGreaterThanOrEqual(5)
    wrapper.unmount()
  })
})
