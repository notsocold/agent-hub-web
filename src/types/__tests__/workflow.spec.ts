import { describe, expect, it } from 'vitest'

import { validateWorkflowSteps, WORKFLOW_STEP_TYPES, type Workflow, type WorkflowStep } from '@/types'

/** 合法 3 步样例：检索 → a2a → 审批（approval 的 config.tools 是强制审批集合）。 */
function validSteps(): WorkflowStep[] {
  return [
    { id: 's1', type: 'knowledge_search', title: '检索复盘', instruction: '检索本周工单与复盘文档' },
    { id: 's2', type: 'a2a', title: '生成周报草稿' },
    { id: 's3', type: 'approval', title: '审批发布', config: { tools: ['send_message'] } },
  ]
}

describe('validateWorkflowSteps（后端 validate_steps 的前端镜像）', () => {
  it('步骤类型全集与后端 assembler.STEP_TYPES 顺序一致', () => {
    expect(WORKFLOW_STEP_TYPES).toEqual([
      'knowledge_search',
      'tool',
      'a2a',
      'approval',
      'answer',
    ])
  })

  it('合法 3 步样例返回空错误列表', () => {
    expect(validateWorkflowSteps(validSteps())).toEqual([])
  })

  it('空数组报错', () => {
    expect(validateWorkflowSteps([])).toEqual(['steps 不能为空数组'])
  })

  it('未知 type 报错', () => {
    const steps = [{ id: 's1', type: 'summarize' }] as unknown as WorkflowStep[]
    expect(validateWorkflowSteps(steps)).toEqual(['第 1 步 type 未知: "summarize"'])
  })

  it('id 重复报错', () => {
    const errors = validateWorkflowSteps([
      { id: 's1', type: 'knowledge_search' },
      { id: 's1', type: 'a2a' },
    ])
    expect(errors).toEqual(['第 2 步 id 重复: s1'])
  })

  it('tool 步骤缺 config.tools 报错', () => {
    expect(validateWorkflowSteps([{ id: 's1', type: 'tool' }])).toEqual([
      '第 1 步（tool 步骤）必须显式提供非空 config.tools',
    ])
  })

  it('instruction 超过 500 字符报错', () => {
    const errors = validateWorkflowSteps([
      { id: 's1', type: 'answer', instruction: '长'.repeat(501) },
    ])
    expect(errors).toEqual(['第 1 步 instruction 长度 501 超过上限 500'])
  })

  it('全部文本总长超过 8000 字符报错', () => {
    // id(2) + title(7499) + instruction(500) = 8001，各单项约束均不越界。
    const errors = validateWorkflowSteps([
      {
        id: 's1',
        type: 'knowledge_search',
        title: '标'.repeat(7499),
        instruction: '长'.repeat(500),
      },
    ])
    expect(errors).toEqual(['steps 全部文本总长度 8001 超过上限 8000'])
  })
})

describe('Workflow 契约形状', () => {
  it('样例含 enabled/version/steps，不含 slug/status', () => {
    const workflow = {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      scope: 'user',
      name: '客服周报',
      description: '检索复盘并生成周报草稿，审批后发布。',
      steps: validSteps(),
      enabled: true,
      version: 2,
      created_at: '2026-10-20T00:00:00Z',
      updated_at: '2026-10-30T00:00:00Z',
    } satisfies Workflow

    expect(workflow.enabled).toBe(true)
    expect(workflow.version).toBe(2)
    expect(workflow.steps).toHaveLength(3)
    // @ts-expect-error 契约不含 slug（后端 WorkflowOut 已移除该字段）
    expect(workflow.slug).toBeUndefined()
    // @ts-expect-error 契约不含 status（后端以 enabled 布尔取代状态机）
    expect(workflow.status).toBeUndefined()
  })
})
