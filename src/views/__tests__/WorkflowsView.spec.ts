import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'

import { useSystemStore } from '@/stores/system'
import type { PageResult, SystemInfo, Workflow, WorkflowStep } from '@/types'
import WorkflowsView from '@/views/WorkflowsView.vue'

const workflowsApiMock = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
  get: vi.fn(),
  update: vi.fn(),
  setEnabled: vi.fn(),
  remove: vi.fn(),
  listRuns: vi.fn(),
}))

vi.mock('@/api/workflows', () => ({ workflowsApi: workflowsApiMock }))

const messageMock = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
}))

const messageBoxMock = vi.hoisted(() => ({
  confirm: vi.fn(),
}))

vi.mock('element-plus', async (importOriginal) => {
  const actual = await importOriginal<typeof import('element-plus')>()
  return {
    ...actual,
    ElMessage: messageMock,
    ElMessageBox: messageBoxMock,
  }
})

const routerMock = vi.hoisted(() => ({
  push: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRouter: () => routerMock,
}))

// el-switch 假件：点击即以「翻转后的值」触发 change，模拟真实开关交互。
const ElSwitchStub = defineComponent({
  name: 'ElSwitch',
  props: { modelValue: { type: Boolean, default: false } },
  emits: ['change'],
  setup(props, { emit }) {
    return () =>
      h('button', {
        type: 'button',
        'data-testid': 'workflow-switch',
        'data-enabled': String(props.modelValue),
        onClick: () => emit('change', !props.modelValue),
      })
  },
})

const ElAlertStub = defineComponent({
  name: 'ElAlert',
  props: { title: { type: String, default: '' } },
  setup(props) {
    return () => h('div', { 'data-testid': 'capability-alert' }, props.title)
  },
})

function step(id: string, type: WorkflowStep['type'], title: string): WorkflowStep {
  return { id, type, title }
}

function workflow(id: string, patch: Partial<Workflow> = {}): Workflow {
  return {
    id,
    scope: 'user',
    name: `模板 ${id}`,
    description: '示例描述',
    steps: [step('s1', 'knowledge_search', '检索')],
    enabled: true,
    version: 1,
    created_at: '2026-11-01T00:00:00Z',
    updated_at: '2026-11-10T00:00:00Z',
    ...patch,
  }
}

// 3 条样本：本人启用 / 本人停用 / 系统模板。
const userEnabled = workflow('wf-a', {
  name: '客服周报',
  description: '生成周报草稿并审批发布',
  steps: [
    step('s1', 'knowledge_search', '检索复盘'),
    step('s2', 'a2a', '生成草稿'),
    step('s3', 'approval', '审批发布'),
  ],
  version: 2,
})
const userDisabled = workflow('wf-b', {
  name: '发布简报',
  description: '生成中英双语发布简报',
  steps: [step('s1', 'approval', '确认归档'), step('s2', 'answer', '输出简报')],
  enabled: false,
})
const systemWorkflow = workflow('wf-c', {
  scope: 'system',
  name: '客户访谈纪要',
  description: '生成结构化访谈纪要',
})

function page(items: Workflow[]): PageResult<Workflow> {
  return { items, next_cursor: null, has_more: false }
}

function systemInfo(workflowsCapability: boolean): SystemInfo {
  return {
    version: '0.1.0',
    build: 'test',
    environment: 'test',
    models: [],
    default_model: 'deepseek-chat',
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
      workflows: workflowsCapability,
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

async function mountView(workflowsCapability = true): Promise<VueWrapper> {
  setActivePinia(createPinia())
  const system = useSystemStore()
  system.info = systemInfo(workflowsCapability)
  system.loaded = true

  const wrapper = mount(WorkflowsView, {
    global: { stubs: { 'el-switch': ElSwitchStub, 'el-alert': ElAlertStub } },
  })
  await flushPromises()
  return wrapper
}

function cards(wrapper: VueWrapper) {
  return wrapper.findAll('[data-testid="workflow-card"]')
}

function cardByName(wrapper: VueWrapper, name: string) {
  return cards(wrapper).find((card) => card.text().includes(name))
}

function buttonIn(root: VueWrapper, testId: string) {
  return root.find(`[data-testid="${testId}"]`)
}

beforeEach(() => {
  vi.clearAllMocks()
  workflowsApiMock.list.mockResolvedValue(page([userEnabled, userDisabled, systemWorkflow]))
  workflowsApiMock.setEnabled.mockImplementation(async (id: string, enabled: boolean) => {
    const found = [userEnabled, userDisabled, systemWorkflow].find((item) => item.id === id)
    return found ? { ...found, enabled } : workflow(id, { enabled })
  })
  workflowsApiMock.remove.mockResolvedValue(undefined)
  messageBoxMock.confirm.mockResolvedValue('confirm')
})

describe('WorkflowsView 卡片列表', () => {
  it('渲染 3 张卡片，系统模板无启停/编辑/运行历史/删除入口，停用模板的使用按钮禁用', async () => {
    const wrapper = await mountView()

    expect(cards(wrapper)).toHaveLength(3)
    expect(wrapper.text()).toContain('客服周报')

    // 卡片携带执行轨迹芯片（含序号）：本人启用模板 3 步。
    const enabledCard = cardByName(wrapper, '客服周报')!
    expect(enabledCard.findAll('.chip')).toHaveLength(3)
    expect(enabledCard.text()).toContain('v2')

    // 系统模板：有「在对话中使用」，但无开关与本人专属操作。
    const systemCard = cardByName(wrapper, '客户访谈纪要')!
    expect(systemCard.text()).toContain('系统')
    expect(buttonIn(systemCard, 'workflow-switch').exists()).toBe(false)
    expect(buttonIn(systemCard, 'workflow-edit').exists()).toBe(false)
    expect(buttonIn(systemCard, 'workflow-runs').exists()).toBe(false)
    expect(buttonIn(systemCard, 'workflow-remove').exists()).toBe(false)
    expect(buttonIn(systemCard, 'workflow-use').attributes('disabled')).toBeUndefined()

    // 停用本人模板：开关与本人操作在，但「在对话中使用」禁用。
    const disabledCard = cardByName(wrapper, '发布简报')!
    expect(buttonIn(disabledCard, 'workflow-switch').exists()).toBe(true)
    expect(buttonIn(disabledCard, 'workflow-use').attributes('disabled')).toBeDefined()
  })

  it('本人模板开关点击触发确认框，确认后调用 setEnabled 并更新开关状态', async () => {
    const wrapper = await mountView()

    const switchButton = buttonIn(cardByName(wrapper, '发布简报')!, 'workflow-switch')
    expect(switchButton.attributes('data-enabled')).toBe('false')
    await switchButton.trigger('click')
    await flushPromises()

    expect(messageBoxMock.confirm).toHaveBeenCalledTimes(1)
    expect(messageBoxMock.confirm.mock.calls[0]?.[0]).toContain('发布简报')
    expect(workflowsApiMock.setEnabled).toHaveBeenCalledWith('wf-b', true)
    expect(buttonIn(cardByName(wrapper, '发布简报')!, 'workflow-switch').attributes('data-enabled')).toBe(
      'true',
    )
    expect(messageMock.success).toHaveBeenCalled()
  })

  it('开关取消确认时不调用 setEnabled，状态保持不变', async () => {
    messageBoxMock.confirm.mockRejectedValue('cancel')
    const wrapper = await mountView()

    await buttonIn(cardByName(wrapper, '发布简报')!, 'workflow-switch').trigger('click')
    await flushPromises()

    expect(workflowsApiMock.setEnabled).not.toHaveBeenCalled()
    expect(buttonIn(cardByName(wrapper, '发布简报')!, 'workflow-switch').attributes('data-enabled')).toBe(
      'false',
    )
  })

  it('删除确认后条目从列表消失', async () => {
    const wrapper = await mountView()

    await buttonIn(cardByName(wrapper, '发布简报')!, 'workflow-remove').trigger('click')
    await flushPromises()

    expect(messageBoxMock.confirm).toHaveBeenCalledTimes(1)
    expect(workflowsApiMock.remove).toHaveBeenCalledWith('wf-b')
    expect(cards(wrapper)).toHaveLength(2)
    expect(cardByName(wrapper, '发布简报')).toBeUndefined()
    expect(messageMock.success).toHaveBeenCalled()
  })

  it('关键词本地过滤命中名称与描述', async () => {
    const wrapper = await mountView()

    await wrapper.find('[data-testid="workflow-search"]').setValue('周报')
    expect(cards(wrapper)).toHaveLength(1)
    expect(cardByName(wrapper, '客服周报')).toBeDefined()

    // 「双语」只出现在发布简报的描述里——描述也参与过滤。
    await wrapper.find('[data-testid="workflow-search"]').setValue('双语')
    expect(cards(wrapper)).toHaveLength(1)
    expect(cardByName(wrapper, '发布简报')).toBeDefined()
  })

  it('搜索无结果时显示空态', async () => {
    const wrapper = await mountView()

    await wrapper.find('[data-testid="workflow-search"]').setValue('不存在的关键词')
    expect(cards(wrapper)).toHaveLength(0)
    expect(wrapper.text()).toContain('还没有匹配的工作流')
  })

  it('列表加载失败时显示错误态', async () => {
    workflowsApiMock.list.mockRejectedValue(new Error('后端不可用'))
    const wrapper = await mountView()

    expect(wrapper.text()).toContain('后端不可用')
    expect(cards(wrapper)).toHaveLength(0)
  })

  it('capabilities.workflows=false 时顶部告警且操作按钮禁用', async () => {
    const wrapper = await mountView(false)

    expect(wrapper.find('[data-testid="capability-alert"]').text()).toContain('工作流能力未启用')
    const enabledCard = cardByName(wrapper, '客服周报')!
    expect(buttonIn(enabledCard, 'workflow-use').attributes('disabled')).toBeDefined()
    expect(buttonIn(enabledCard, 'workflow-edit').attributes('disabled')).toBeDefined()
    expect(buttonIn(enabledCard, 'workflow-remove').attributes('disabled')).toBeDefined()
    const newButton = wrapper.findAll('button').find((button) => button.text() === '新建工作流')
    expect(newButton?.attributes('disabled')).toBeDefined()
  })

  it('点击「在对话中使用」携带 id/版本/名称跳转对话页', async () => {
    const wrapper = await mountView()

    await buttonIn(cardByName(wrapper, '客服周报')!, 'workflow-use').trigger('click')

    expect(routerMock.push).toHaveBeenCalledWith({
      path: '/chat',
      query: { workflow_id: 'wf-a', workflow_version: 2, workflow_name: '客服周报' },
    })
  })
})
