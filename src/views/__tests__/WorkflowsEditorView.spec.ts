import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiRequestError } from '@/api/client'
import { validateWorkflowSteps } from '@/types'
import type { Workflow, WorkflowStep } from '@/types'
import WorkflowsEditorView from '@/views/workflows/WorkflowsEditorView.vue'

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
  replace: vi.fn(),
}))

// 路由参数与 onBeforeRouteLeave 守卫回调的容器：mock 捕获回调后由测试手动驱动。
const routerState = vi.hoisted(() => ({
  params: {} as Record<string, string>,
  leaveGuard: null as null | (() => unknown),
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: routerState.params }),
  useRouter: () => routerMock,
  onBeforeRouteLeave: (guard: () => unknown) => {
    routerState.leaveGuard = guard
  },
}))

function step(id: string, type: WorkflowStep['type'], patch: Partial<WorkflowStep> = {}): WorkflowStep {
  return { id, type, ...patch }
}

function workflow(id: string, patch: Partial<Workflow> = {}): Workflow {
  return {
    id,
    scope: 'user',
    name: `模板 ${id}`,
    description: '示例描述',
    steps: [step('s1', 'knowledge_search', { title: '检索复盘', instruction: '检索本周工单' })],
    enabled: true,
    version: 1,
    created_at: '2026-11-01T00:00:00Z',
    updated_at: '2026-11-10T00:00:00Z',
    ...patch,
  }
}

async function mountEditor(): Promise<VueWrapper> {
  const wrapper = mount(WorkflowsEditorView)
  await flushPromises()
  return wrapper
}

function inputOf(wrapper: VueWrapper, testId: string) {
  return wrapper.find(`[data-testid="${testId}"]`)
}

/** 通过类型下拉 + 添加按钮追加一个步骤。 */
async function addStepByType(wrapper: VueWrapper, type: string): Promise<void> {
  await inputOf(wrapper, 'step-add-type').setValue(type)
  await inputOf(wrapper, 'step-add').trigger('click')
}

function cards(wrapper: VueWrapper) {
  return wrapper.findAll('[data-testid="step-card"]')
}

beforeEach(() => {
  vi.clearAllMocks()
  routerState.params = {}
  routerState.leaveGuard = null
  messageBoxMock.confirm.mockResolvedValue('confirm')
})

describe('WorkflowsEditorView 步骤编辑器', () => {
  it('新建模式保存调用 create，payload 为 3 步合法结构并跳回列表', async () => {
    const wrapper = await mountEditor()

    await inputOf(wrapper, 'editor-name').setValue('客服周报')
    await inputOf(wrapper, 'editor-description').setValue('生成周报草稿并审批')
    await addStepByType(wrapper, 'knowledge_search')
    await addStepByType(wrapper, 'tool')
    await addStepByType(wrapper, 'answer')

    // tool 步骤必须至少授权 1 个工具：回车添加标签。
    const toolInput = inputOf(wrapper, 'step-tool-input')
    await toolInput.setValue('mcp.demo')
    await toolInput.trigger('keydown.enter')

    expect(workflowsApiMock.get).not.toHaveBeenCalled()
    await inputOf(wrapper, 'editor-save').trigger('click')
    await flushPromises()

    expect(workflowsApiMock.create).toHaveBeenCalledTimes(1)
    expect(workflowsApiMock.update).not.toHaveBeenCalled()
    const payload = workflowsApiMock.create.mock.calls[0]?.[0] as {
      name: string
      description: string
      steps: WorkflowStep[]
    }
    expect(payload.name).toBe('客服周报')
    expect(payload.description).toBe('生成周报草稿并审批')
    expect(payload.steps.map((item) => item.id)).toEqual(['s1', 's2', 's3'])
    expect(payload.steps.map((item) => item.type)).toEqual(['knowledge_search', 'tool', 'answer'])
    expect(payload.steps[1]?.config?.tools).toEqual(['mcp.demo'])
    // 契约镜像：payload 的 steps 必须通过前端校验器。
    expect(validateWorkflowSteps(payload.steps)).toEqual([])

    expect(messageMock.success).toHaveBeenCalled()
    expect(routerMock.replace).toHaveBeenCalledWith('/workflows')
  })

  it('编辑模式回填 get 数据，保存调用 update', async () => {
    routerState.params = { id: 'wf-a' }
    workflowsApiMock.get.mockResolvedValue(
      workflow('wf-a', {
        name: '客服周报',
        description: '检索复盘与审批',
        steps: [
          step('s1', 'knowledge_search', { title: '检索复盘', instruction: '检索本周工单' }),
          step('s2', 'answer', { title: '输出结果', instruction: '汇总回答' }),
        ],
      }),
    )
    const wrapper = await mountEditor()

    expect(workflowsApiMock.get).toHaveBeenCalledWith('wf-a')
    expect((inputOf(wrapper, 'editor-name').element as HTMLInputElement).value).toBe('客服周报')
    expect((inputOf(wrapper, 'editor-description').element as HTMLInputElement).value).toBe('检索复盘与审批')
    expect(cards(wrapper)).toHaveLength(2)
    expect(cards(wrapper)[0]?.attributes('data-step-type')).toBe('knowledge_search')
    expect(cards(wrapper)[1]?.attributes('data-step-type')).toBe('answer')

    await inputOf(wrapper, 'editor-description').setValue('更新后的描述')
    await inputOf(wrapper, 'editor-save').trigger('click')
    await flushPromises()

    expect(workflowsApiMock.update).toHaveBeenCalledTimes(1)
    expect(workflowsApiMock.update).toHaveBeenCalledWith('wf-a', {
      name: '客服周报',
      description: '更新后的描述',
      steps: [
        expect.objectContaining({ id: 's1', type: 'knowledge_search' }),
        expect.objectContaining({ id: 's2', type: 'answer' }),
      ],
    })
    expect(workflowsApiMock.create).not.toHaveBeenCalled()
    expect(messageMock.success).toHaveBeenCalled()
    expect(routerMock.replace).toHaveBeenCalledWith('/workflows')
    // 保存路径不经过离开确认框。
    expect(messageBoxMock.confirm).not.toHaveBeenCalled()
  })

  it('tool 步骤删空 config.tools 后保存被行内错误拦住且不发起请求', async () => {
    routerState.params = { id: 'wf-b' }
    workflowsApiMock.get.mockResolvedValue(
      workflow('wf-b', {
        name: '知识库巡检',
        steps: [step('s1', 'tool', { title: '列出文档', config: { tools: ['search_knowledge'] } })],
      }),
    )
    const wrapper = await mountEditor()

    expect(inputOf(wrapper, 'step-tool-tag').text()).toContain('search_knowledge')
    await inputOf(wrapper, 'step-tool-remove').trigger('click')
    await inputOf(wrapper, 'editor-save').trigger('click')
    await flushPromises()

    expect(inputOf(wrapper, 'editor-errors').text()).toContain('必须显式提供非空 config.tools')
    expect(workflowsApiMock.update).not.toHaveBeenCalled()
    expect(routerMock.replace).not.toHaveBeenCalled()
  })

  it('步骤上移后顺序交换，首位不可上移、末位不可下移', async () => {
    const wrapper = await mountEditor()

    await addStepByType(wrapper, 'answer')
    await addStepByType(wrapper, 'knowledge_search')

    expect(cards(wrapper).map((card) => card.attributes('data-step-type'))).toEqual([
      'answer',
      'knowledge_search',
    ])
    expect(inputOf(cards(wrapper)[0]!, 'step-up').attributes('disabled')).toBeDefined()
    expect(inputOf(cards(wrapper)[1]!, 'step-down').attributes('disabled')).toBeDefined()

    await inputOf(cards(wrapper)[1]!, 'step-up').trigger('click')

    expect(cards(wrapper).map((card) => card.attributes('data-step-type'))).toEqual([
      'knowledge_search',
      'answer',
    ])
    // 交换整体步骤对象：id 与标题随步骤一起移动，序号按位置重排。
    expect(cards(wrapper)[0]?.text()).toContain('01')
  })

  it('未保存离开弹确认：取消停留返回 false，确认放行返回 true', async () => {
    routerState.params = { id: 'wf-a' }
    workflowsApiMock.get.mockResolvedValue(workflow('wf-a'))
    const wrapper = await mountEditor()

    await inputOf(wrapper, 'editor-name').setValue('改名后的模板')
    const guard = routerState.leaveGuard
    expect(guard).toBeTruthy()

    messageBoxMock.confirm.mockRejectedValueOnce('cancel')
    await expect(guard!()).resolves.toBe(false)
    expect(messageBoxMock.confirm).toHaveBeenCalledTimes(1)

    messageBoxMock.confirm.mockResolvedValueOnce('confirm')
    await expect(guard!()).resolves.toBe(true)
    // 守卫本身不负责跳转：停留与放行都不直接调用 router。
    expect(routerMock.replace).not.toHaveBeenCalled()
    expect(routerMock.push).not.toHaveBeenCalled()
  })

  it('新建模式无改动离开直接放行且不弹确认', async () => {
    await mountEditor()

    const guard = routerState.leaveGuard
    expect(guard).toBeTruthy()
    await expect(guard!()).resolves.toBe(true)
    expect(messageBoxMock.confirm).not.toHaveBeenCalled()
  })

  it('保存返回 422 workflow_steps_invalid 时行内展示错误且表单内容不丢', async () => {
    const wrapper = await mountEditor()

    await inputOf(wrapper, 'editor-name').setValue('客服周报')
    await addStepByType(wrapper, 'answer')
    workflowsApiMock.create.mockRejectedValueOnce(
      new ApiRequestError('第 1 步（tool 步骤）必须显式提供非空 config.tools', {
        code: 'workflow_steps_invalid',
        status: 422,
      }),
    )

    await inputOf(wrapper, 'editor-save').trigger('click')
    await flushPromises()

    const errors = inputOf(wrapper, 'editor-errors')
    expect(errors.text()).toContain('workflow_steps_invalid')
    expect(errors.text()).toContain('第 1 步（tool 步骤）必须显式提供非空 config.tools')
    // 保存失败不丢表单。
    expect((inputOf(wrapper, 'editor-name').element as HTMLInputElement).value).toBe('客服周报')
    expect(cards(wrapper)).toHaveLength(1)
    expect(routerMock.replace).not.toHaveBeenCalled()
  })

  it('直达系统模板时只读：徽标、保存禁用、字段与步骤均不可编辑', async () => {
    routerState.params = { id: 'wf-system' }
    workflowsApiMock.get.mockResolvedValue(
      workflow('wf-system', {
        scope: 'system',
        name: '客服系统模板',
        description: '内置模板',
        steps: [
          step('s1', 'knowledge_search', { title: '检索复盘', instruction: '检索本周工单' }),
          step('s2', 'tool', { title: '查询订单', config: { tools: ['mcp.orders'] } }),
        ],
      }),
    )
    const wrapper = await mountEditor()

    const banner = wrapper.find('[data-testid="system-readonly-banner"]')
    expect(banner.exists()).toBe(true)
    expect(banner.text()).toContain('系统模板只读')
    expect(banner.text()).toContain('复制为我的模板')
    expect(wrapper.text()).toContain('系统模板（只读）')

    expect(inputOf(wrapper, 'editor-save').attributes('disabled')).toBeDefined()
    expect(inputOf(wrapper, 'editor-name').attributes('readonly')).toBeDefined()
    expect(inputOf(wrapper, 'editor-description').attributes('readonly')).toBeDefined()

    // 只读步骤视图：不渲染可编辑输入、删除/上移下移，也不渲染添加步骤。
    expect(wrapper.findAll('[data-testid="readonly-step"]')).toHaveLength(2)
    expect(wrapper.findAll('[data-testid="step-title"]')).toHaveLength(0)
    expect(wrapper.findAll('[data-testid="step-remove"]')).toHaveLength(0)
    expect(wrapper.find('[data-testid="step-add"]').exists()).toBe(false)

    // 保存守卫兜底：即使按键被程序化触发，也不发请求。
    await inputOf(wrapper, 'editor-save').trigger('click')
    await flushPromises()
    expect(workflowsApiMock.update).not.toHaveBeenCalled()
    expect(workflowsApiMock.create).not.toHaveBeenCalled()
    expect(messageMock.success).not.toHaveBeenCalled()
  })

  it('系统模板无改动直接离开，不弹未保存确认', async () => {
    routerState.params = { id: 'wf-system' }
    workflowsApiMock.get.mockResolvedValue(workflow('wf-system', { scope: 'system' }))
    await mountEditor()

    const guard = routerState.leaveGuard
    expect(guard).toBeTruthy()
    await expect(guard!()).resolves.toBe(true)
    expect(messageBoxMock.confirm).not.toHaveBeenCalled()
  })
})
