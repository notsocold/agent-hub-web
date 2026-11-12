import { beforeEach, describe, expect, it, vi } from 'vitest'

import { workflowsApi } from '@/api/workflows'
import type { Workflow, WorkflowRun } from '@/types'

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
}))

// 在 axios 层 mock apiClient：本任务只验证请求契约（method/url/body），
// mock 端点实现属于 Task 2。
vi.mock('@/api/client', () => ({
  apiClient: {
    get: mocks.get,
    post: mocks.post,
    put: mocks.put,
    patch: mocks.patch,
    delete: mocks.delete,
  },
}))

const { get, post, put, patch } = mocks
const del = mocks.delete

const workflowId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

function makeWorkflow(overrides: Partial<Workflow> = {}): Workflow {
  return {
    id: workflowId,
    scope: 'user',
    name: '客服周报',
    description: '检索复盘并生成周报草稿，审批后发布。',
    steps: [
      { id: 's1', type: 'knowledge_search', title: '检索复盘' },
      { id: 's2', type: 'approval', title: '审批发布', config: { tools: ['send_message'] } },
    ],
    enabled: true,
    version: 1,
    created_at: '2026-11-10T09:00:00Z',
    updated_at: '2026-11-11T09:00:00Z',
    ...overrides,
  }
}

function makeRun(overrides: Partial<WorkflowRun> = {}): WorkflowRun {
  return {
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    run_id: '33333333-3333-4333-8333-333333333333',
    status: 'running',
    created_at: '2026-11-11T10:00:00Z',
    run_status: null,
    run_finished_at: null,
    run_duration_ms: null,
    run_error_code: null,
    ...overrides,
  }
}

describe('workflowsApi 契约（后端 /workflows 七端点）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('list/listRuns 透传游标分页参数', async () => {
    const page = { items: [makeWorkflow()], next_cursor: 'cursor-2', has_more: true }
    get.mockResolvedValue({ data: page })
    await expect(workflowsApi.list({ limit: 20, cursor: 'cursor-1' })).resolves.toEqual(page)
    expect(get).toHaveBeenCalledWith('/workflows', { params: { limit: 20, cursor: 'cursor-1' } })

    await expect(workflowsApi.list()).resolves.toEqual(page)
    expect(get).toHaveBeenLastCalledWith('/workflows', { params: {} })

    const runsPage = { items: [makeRun()], next_cursor: null, has_more: false }
    get.mockResolvedValue({ data: runsPage })
    await expect(
      workflowsApi.listRuns(workflowId, { limit: 10, cursor: 'cursor-2' }),
    ).resolves.toEqual(runsPage)
    expect(get).toHaveBeenLastCalledWith(`/workflows/${workflowId}/runs`, {
      params: { limit: 10, cursor: 'cursor-2' },
    })
  })

  it('create/get/update 走 /workflows 契约路径与请求体', async () => {
    const workflow = makeWorkflow()
    const createPayload = {
      name: '客服周报',
      description: '检索复盘并生成周报草稿，审批后发布。',
      steps: workflow.steps,
    }
    post.mockResolvedValue({ data: makeWorkflow({ version: 1 }) })
    await expect(workflowsApi.create(createPayload)).resolves.toEqual(
      makeWorkflow({ version: 1 }),
    )
    expect(post).toHaveBeenCalledWith('/workflows', createPayload)

    get.mockResolvedValue({ data: workflow })
    await expect(workflowsApi.get(workflowId)).resolves.toEqual(workflow)
    expect(get).toHaveBeenLastCalledWith(`/workflows/${workflowId}`)

    const updatePayload = { description: '更新后的描述', steps: workflow.steps }
    patch.mockResolvedValue({ data: makeWorkflow({ version: 2 }) })
    await expect(workflowsApi.update(workflowId, updatePayload)).resolves.toEqual(
      makeWorkflow({ version: 2 }),
    )
    expect(patch).toHaveBeenCalledWith(`/workflows/${workflowId}`, updatePayload)
  })

  it('setEnabled 走 PUT enabled，remove 走 DELETE 且期望 204', async () => {
    put.mockResolvedValue({ data: makeWorkflow({ enabled: false }) })
    await expect(workflowsApi.setEnabled(workflowId, false)).resolves.toEqual(
      makeWorkflow({ enabled: false }),
    )
    expect(put).toHaveBeenCalledWith(`/workflows/${workflowId}/enabled`, { enabled: false })

    // 后端 DELETE /workflows/{id} 返回 204 无内容，前端 resolve 为 void。
    del.mockResolvedValue({ data: null, status: 204 })
    await expect(workflowsApi.remove(workflowId)).resolves.toBeUndefined()
    expect(del).toHaveBeenCalledWith(`/workflows/${workflowId}`)
  })
})
