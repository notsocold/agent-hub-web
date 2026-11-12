import { beforeEach, describe, expect, it } from 'vitest'

import { mockDb } from '@/api/mock/db'
import { handleMockRequest, type MockRequest } from '@/api/mock/routers'
import { mockChatStream } from '@/api/mock/stream'
import type { ChatEventName, Workflow, WorkflowRun } from '@/types'

const authHeaders = { authorization: 'Bearer mock-access-test' }

/** 旧 fixture 的客服周报 id：stream/memory 的 workflow_run label 引用它，必须保持不变。 */
const weeklyWorkflowId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

function request(
  method: string,
  path: string,
  options: {
    query?: Record<string, string>
    body?: unknown
    headers?: Record<string, string>
  } = {},
): MockRequest {
  return {
    method,
    path,
    query: new URLSearchParams(options.query ?? {}),
    body: options.body,
    headers: options.headers ?? authHeaders,
  }
}

interface WorkflowPage {
  items: Workflow[]
  next_cursor: string | null
  has_more: boolean
  /** M9 新契约无 stats；保留可选键用于断言「不得出现」。 */
  stats?: Record<string, number>
}

async function listWorkflows(query: Record<string, string> = {}): Promise<WorkflowPage> {
  const result = await handleMockRequest(request('GET', '/workflows', { query }))
  expect(result.status).toBe(200)
  return result.data as WorkflowPage
}

function errorCodeOf(data: unknown): string {
  return (data as { error: { code: string } }).error.code
}

describe('mock 工作流端点（M9 真实契约）', () => {
  beforeEach(() => {
    mockDb.reset()
  })

  it('列表返回 3 条本人模板 + 1 条系统模板，支持游标翻页且无 stats', async () => {
    const first = await listWorkflows({ limit: '2' })
    expect(first.items).toHaveLength(2)
    expect(first.has_more).toBe(true)
    expect(first.next_cursor).toBeTruthy()
    expect(first.stats).toBeUndefined()

    const second = await listWorkflows({ limit: '2', cursor: first.next_cursor! })
    const all = [...first.items, ...second.items]
    expect(all).toHaveLength(4)
    expect(all.filter((item) => item.scope === 'system')).toHaveLength(1)
    // 旧 id 保持不变（memory 的 workflow_run label 引用不破）。
    expect(all.some((item) => item.id === weeklyWorkflowId)).toBe(true)
    // 后端口径：系统模板 + 本人，按 created_at DESC。
    for (let index = 1; index < all.length; index += 1) {
      expect(all[index - 1]!.created_at >= all[index]!.created_at).toBe(true)
    }
    // 客服周报：3 步（检索 → a2a → 审批），即验收样例模板。
    const weekly = all.find((item) => item.id === weeklyWorkflowId)!
    expect(weekly.enabled).toBe(true)
    expect(weekly.steps.map((step) => step.type)).toEqual([
      'knowledge_search',
      'a2a',
      'approval',
    ])
  })

  it('create 返回 version=1 的本人模板并出现在列表', async () => {
    const result = await handleMockRequest(
      request('POST', '/workflows', {
        body: {
          name: '巡检流水线',
          description: '演示创建',
          steps: [{ id: 's1', type: 'knowledge_search', title: '检索' }],
        },
      }),
    )
    expect(result.status).toBe(201)
    const created = result.data as Workflow
    expect(created.scope).toBe('user')
    expect(created.version).toBe(1)
    expect(created.enabled).toBe(true)

    const page = await listWorkflows()
    expect(page.items.some((item) => item.id === created.id)).toBe(true)
  })

  it('steps 非法返回 422 workflow_steps_invalid', async () => {
    const result = await handleMockRequest(
      request('POST', '/workflows', { body: { name: '空步骤', steps: [] } }),
    )
    expect(result.status).toBe(422)
    expect(errorCodeOf(result.data)).toBe('workflow_steps_invalid')
  })

  it('PATCH 本人模板后 version+1', async () => {
    const result = await handleMockRequest(
      request('PATCH', `/workflows/${weeklyWorkflowId}`, { body: { name: '客服周报（改）' } }),
    )
    expect(result.status).toBe(200)
    expect((result.data as Workflow).version).toBe(3)
  })

  it('PUT enabled(false) 后 version 不变', async () => {
    const result = await handleMockRequest(
      request('PUT', `/workflows/${weeklyWorkflowId}/enabled`, { body: { enabled: false } }),
    )
    expect(result.status).toBe(200)
    const updated = result.data as Workflow
    expect(updated.enabled).toBe(false)
    expect(updated.version).toBe(2)
  })

  it('DELETE 后 GET 详情返回 404', async () => {
    const deleted = await handleMockRequest(request('DELETE', `/workflows/${weeklyWorkflowId}`))
    expect(deleted.status).toBe(204)
    const detail = await handleMockRequest(request('GET', `/workflows/${weeklyWorkflowId}`))
    expect(detail.status).toBe(404)
    expect(errorCodeOf(detail.data)).toBe('not_found')
  })

  it('运行历史返回 running/succeeded/failed 三种演示态且 run_status 有值', async () => {
    const result = await handleMockRequest(request('GET', `/workflows/${weeklyWorkflowId}/runs`))
    expect(result.status).toBe(200)
    const page = result.data as {
      items: WorkflowRun[]
      next_cursor: string | null
      has_more: boolean
    }
    expect(page.items).toHaveLength(3)
    expect(new Set(page.items.map((item) => item.status))).toEqual(
      new Set(['running', 'succeeded', 'failed']),
    )
    for (const row of page.items) {
      expect(row.run_id).toBeTruthy()
      expect(row.run_status).toBeTruthy()
    }
    const byStatus = (status: string) => page.items.find((item) => item.status === status)!
    // run_* 是关联 chat run 的终态快照：成功行有完成时间与耗时，失败行有错误码。
    expect(byStatus('succeeded').run_status).toBe('succeeded')
    expect(byStatus('succeeded').run_finished_at).toBeTruthy()
    expect(byStatus('succeeded').run_duration_ms).not.toBeNull()
    expect(byStatus('failed').run_status).toBe('failed')
    expect(byStatus('failed').run_error_code).toBeTruthy()
    expect(byStatus('running').run_status).toBe('running')
  })

  it('系统模板运行历史返回 403 forbidden', async () => {
    const page = await listWorkflows()
    const system = page.items.find((item) => item.scope === 'system')!
    const result = await handleMockRequest(request('GET', `/workflows/${system.id}/runs`))
    expect(result.status).toBe(403)
    expect(errorCodeOf(result.data)).toBe('forbidden')
  })

  it('未知工作流的详情与运行历史返回 404', async () => {
    const detail = await handleMockRequest(request('GET', '/workflows/no-such-id'))
    expect(detail.status).toBe(404)
    const runs = await handleMockRequest(request('GET', '/workflows/no-such-id/runs'))
    expect(runs.status).toBe(404)
  })
})

describe('mock 聊天流的工作流步骤演示事件', () => {
  beforeEach(() => {
    mockDb.reset()
  })

  interface Captured {
    event: ChatEventName
    data: unknown
  }

  it('带 workflow_id 的审批运行按步骤发 workflow.step（恢复后补发审批步骤）', async () => {
    const events: Captured[] = []
    const controller = new AbortController()

    await mockChatStream(
      { message: '按客服周报工作流整理周报并审批发布到 Slack', workflow_id: weeklyWorkflowId },
      {
        signal: controller.signal,
        onEvent: (event, data) => {
          events.push({ event, data })
          if (event === 'approval.required') {
            const approvalId = (data as { approval_id: string }).approval_id
            setTimeout(() => {
              mockDb.resolveApproval(approvalId, 'approve')
            }, 5)
          }
        },
        onError: (error) => {
          throw error
        },
      },
      { frameDelay: 0 },
    )

    const names = events.map((item) => item.event)
    const stepEvents = events.filter((item) => item.event === 'workflow.step')
    // 3 步模板：条数 ≥ 步骤数-1。
    expect(stepEvents.length).toBeGreaterThanOrEqual(2)
    // payload 恰为 T1 WorkflowStepData 五字段（emit 统一追加 run_id/ts/seq 公共字段）。
    for (const step of stepEvents) {
      const data = step.data as Record<string, unknown>
      const payloadKeys = Object.keys(data)
        .filter((key) => !['run_id', 'ts', 'seq'].includes(key))
        .sort()
      expect(payloadKeys).toEqual(['status', 'step_id', 'step_title', 'step_type', 'tool'])
      expect(data.status).toBe('ok')
      expect(typeof data.step_id).toBe('string')
    }
    // 检索步骤紧跟对应 tool.result 之后（后端契约）。
    expect(names.indexOf('workflow.step')).toBe(names.indexOf('tool.result') + 1)
    // 审批步骤在 run.resumed 之后补发。
    const resumedIndex = names.indexOf('run.resumed')
    expect(resumedIndex).toBeGreaterThan(-1)
    const resumedStepIndex = names.indexOf('workflow.step', resumedIndex)
    expect(resumedStepIndex).toBeGreaterThan(-1)
    expect((events[resumedStepIndex]!.data as { step_id: string }).step_id).toBe('s3')

    // 落库事件类型为 workflow（M7 回放路径可见）。
    const started = events.find((item) => item.event === 'run.started')?.data as
      | { run_id: string }
      | undefined
    const runId = started?.run_id ?? ''
    const persisted = (mockDb.runEvents[runId] ?? []).filter(
      (item) => item.event === 'workflow.step',
    )
    expect(persisted.length).toBe(stepEvents.length)
    expect(persisted.every((item) => item.type === 'workflow')).toBe(true)
  })

  it('拒绝审批后补发的审批步骤 status 为 rejected', async () => {
    const events: Captured[] = []
    const controller = new AbortController()

    await mockChatStream(
      { message: '按客服周报工作流整理周报并审批发布到 Slack', workflow_id: weeklyWorkflowId },
      {
        signal: controller.signal,
        onEvent: (event, data) => {
          events.push({ event, data })
          if (event === 'approval.required') {
            const approvalId = (data as { approval_id: string }).approval_id
            setTimeout(() => {
              mockDb.resolveApproval(approvalId, 'reject')
            }, 5)
          }
        },
        onError: (error) => {
          throw error
        },
      },
      { frameDelay: 0 },
    )

    const names = events.map((item) => item.event)
    const resumedIndex = names.indexOf('run.resumed')
    expect(resumedIndex).toBeGreaterThan(-1)
    // 后端契约：拒绝路径的审批步骤补发 status='rejected'，工具阶段步骤仍为 'ok'。
    const resumedSteps = events.filter(
      (item, index) => item.event === 'workflow.step' && index > resumedIndex,
    )
    expect(resumedSteps).toHaveLength(1)
    expect((resumedSteps[0]!.data as { status: string; step_id: string }).status).toBe('rejected')
    expect((resumedSteps[0]!.data as { step_id: string }).step_id).toBe('s3')
    const toolPhaseSteps = events.filter(
      (item, index) => item.event === 'workflow.step' && index < resumedIndex,
    )
    expect(toolPhaseSteps.every((item) => (item.data as { status: string }).status === 'ok')).toBe(
      true,
    )
  })

  it('不带 workflow_id 时不发 workflow.step', async () => {
    const events: Captured[] = []
    const controller = new AbortController()

    await mockChatStream(
      { message: '你好' },
      {
        signal: controller.signal,
        onEvent: (event, data) => events.push({ event, data }),
        onError: (error) => {
          throw error
        },
      },
      { frameDelay: 0 },
    )

    expect(events.some((item) => item.event === 'workflow.step')).toBe(false)
  })
})
