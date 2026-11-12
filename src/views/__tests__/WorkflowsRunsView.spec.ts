import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiRequestError } from '@/api/client'
import type { PageResult, WorkflowRun } from '@/types'
import WorkflowsRunsView from '@/views/workflows/WorkflowsRunsView.vue'

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

vi.mock('element-plus', async (importOriginal) => {
  const actual = await importOriginal<typeof import('element-plus')>()
  return {
    ...actual,
    ElMessage: messageMock,
  }
})

const routerMock = vi.hoisted(() => ({
  push: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { id: 'wf-1' } }),
  useRouter: () => routerMock,
}))

/** jsdom 没有 clipboard：统一注入可控假件，测试复制成功路径。 */
const clipboardMock = vi.hoisted(() => ({
  writeText: vi.fn(),
}))

function run(id: string, patch: Partial<WorkflowRun> = {}): WorkflowRun {
  return {
    id,
    run_id: `run-${id}`,
    status: 'succeeded',
    created_at: '2026-11-10T08:00:00Z',
    run_status: 'succeeded',
    run_finished_at: '2026-11-10T08:00:12Z',
    run_duration_ms: 12500,
    run_error_code: null,
    ...patch,
  }
}

function page(
  items: WorkflowRun[],
  patch: Partial<PageResult<WorkflowRun>> = {},
): PageResult<WorkflowRun> {
  return { items, next_cursor: null, has_more: false, ...patch }
}

async function mountView(): Promise<VueWrapper> {
  const wrapper = mount(WorkflowsRunsView)
  await flushPromises()
  return wrapper
}

function rows(wrapper: VueWrapper) {
  return wrapper.findAll('[data-testid="run-row"]')
}

function rowOf(wrapper: VueWrapper, runId: string) {
  return rows(wrapper).find((row) => row.text().includes(runId))
}

beforeEach(() => {
  vi.clearAllMocks()
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: clipboardMock,
  })
  // 默认样本：succeeded（含完整 run_* 快照）+ failed（含错误码与耗时）。
  workflowsApiMock.listRuns.mockResolvedValue(
    page([
      run('r1'),
      run('r2', {
        status: 'failed',
        run_status: 'failed',
        run_duration_ms: 8200,
        run_error_code: 'model_timeout',
      }),
    ]),
  )
})

describe('WorkflowsRunsView 运行历史', () => {
  it('渲染 2 条记录且状态徽标语义正确（succeeded→ok，failed→warn）', async () => {
    const wrapper = await mountView()

    expect(rows(wrapper)).toHaveLength(2)

    const okRow = rowOf(wrapper, 'run-r1')!
    expect(okRow.find('.badge').classes()).toContain('tone-ok')
    expect(okRow.text()).toContain('成功')
    // 耗时走 formatDuration；时间已本地格式化（不出现原始 ISO 串）。
    expect(okRow.text()).toContain('12.5s')
    expect(okRow.text()).not.toContain('2026-11-10T08:00:00Z')

    const failedRow = rowOf(wrapper, 'run-r2')!
    expect(failedRow.find('.badge').classes()).toContain('tone-warn')
    expect(failedRow.text()).toContain('失败')
    // run_error_code 原文并排展示；耗时 8.2s。
    expect(failedRow.text()).toContain('model_timeout')
    expect(failedRow.text()).toContain('8.2s')
  })

  it('canceled 状态徽标归 muted 档并显示中文标签', async () => {
    workflowsApiMock.listRuns.mockResolvedValue(
      page([run('r3', { status: 'canceled', run_status: 'canceled' })]),
    )
    const wrapper = await mountView()

    const row = rowOf(wrapper, 'run-r3')!
    expect(row.find('.badge').classes()).toContain('tone-muted')
    expect(row.text()).toContain('已取消')
  })

  it('无运行记录时显示空态', async () => {
    workflowsApiMock.listRuns.mockResolvedValue(page([]))
    const wrapper = await mountView()

    expect(wrapper.text()).toContain('该模板还没有运行记录')
    expect(rows(wrapper)).toHaveLength(0)
  })

  it('has_more=true 时点击加载更多追加记录且 cursor 前进', async () => {
    workflowsApiMock.listRuns
      .mockResolvedValueOnce(page([run('r1'), run('r2')], { has_more: true, next_cursor: 'cursor-1' }))
      .mockResolvedValueOnce(page([run('r3')]))

    const wrapper = await mountView()
    expect(rows(wrapper)).toHaveLength(2)
    expect(workflowsApiMock.listRuns).toHaveBeenNthCalledWith(1, 'wf-1')

    await wrapper.find('[data-testid="runs-load-more"]').trigger('click')
    await flushPromises()

    expect(workflowsApiMock.listRuns).toHaveBeenNthCalledWith(2, 'wf-1', { cursor: 'cursor-1' })
    expect(rows(wrapper)).toHaveLength(3)
    // 第二页 has_more=false：「加载更多」按钮消失。
    expect(wrapper.find('[data-testid="runs-load-more"]').exists()).toBe(false)
  })

  it('404 渲染「工作流不存在」且不提供重试', async () => {
    workflowsApiMock.listRuns.mockRejectedValue(
      new ApiRequestError('工作流不存在', { code: 'not_found', status: 404 }),
    )
    const wrapper = await mountView()

    expect(wrapper.text()).toContain('工作流不存在')
    expect(wrapper.find('.retry').exists()).toBe(false)
    expect(rows(wrapper)).toHaveLength(0)
  })

  it('403（系统模板）渲染「运行历史仅模板创建者可查看」，展示固定文案而非错误 message', async () => {
    // 生产环境 client 会把 403 forbidden 的 message 统一改写成 M7 文案，
    // 视图必须按 code 分支渲染 plan 固定文案，这里用改写后的 message 模拟。
    workflowsApiMock.listRuns.mockRejectedValue(
      new ApiRequestError('当前账号无管理员权限', { code: 'forbidden', status: 403 }),
    )
    const wrapper = await mountView()

    expect(wrapper.text()).toContain('运行历史仅模板创建者可查看')
    expect(wrapper.text()).not.toContain('当前账号无管理员权限')
    expect(wrapper.find('.retry').exists()).toBe(false)
  })

  it('其他错误展示原始 message 且可点击重试重新加载', async () => {
    workflowsApiMock.listRuns
      .mockRejectedValueOnce(
        new ApiRequestError('网络异常，请稍后重试', { code: 'network_error', status: 0 }),
      )
      .mockResolvedValueOnce(page([run('r1')]))

    const wrapper = await mountView()
    expect(wrapper.text()).toContain('网络异常，请稍后重试')
    expect(wrapper.find('.retry').exists()).toBe(true)

    await wrapper.find('.retry').trigger('click')
    await flushPromises()

    expect(workflowsApiMock.listRuns).toHaveBeenCalledTimes(2)
    expect(rows(wrapper)).toHaveLength(1)
  })

  it('点击 run_id 复制到剪贴板并提示成功', async () => {
    clipboardMock.writeText.mockResolvedValue(undefined)
    const wrapper = await mountView()

    await rowOf(wrapper, 'run-r1')!.find('[data-testid="run-copy"]').trigger('click')
    await flushPromises()

    expect(clipboardMock.writeText).toHaveBeenCalledWith('run-r1')
    expect(messageMock.success).toHaveBeenCalledWith('已复制 run_id')
  })
})
