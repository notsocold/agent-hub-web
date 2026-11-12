/**
 * M9 工作流契约类型：字段与后端 ``app/modules/workflows/schemas.py`` 的
 * WorkflowOut / WorkflowRunOut 逐字对齐——无 slug/status/step_count/run_count
 * （步骤数按 ``steps.length`` 派生，状态机由 ``enabled`` 布尔取代）。
 */

/** 步骤类型全集，顺序与后端 ``assembler.STEP_TYPES`` 一致（schema 文档顺序）。 */
export const WORKFLOW_STEP_TYPES = [
  'knowledge_search',
  'tool',
  'a2a',
  'approval',
  'answer',
] as const

export type WorkflowStepType = (typeof WORKFLOW_STEP_TYPES)[number]

export type WorkflowScope = 'system' | 'user'

/** 步骤模板元素：``tool`` 步骤必须显式提供非空 ``config.tools``。 */
export interface WorkflowStep {
  id: string
  type: WorkflowStepType
  title?: string
  instruction?: string
  /** ``tool`` 步骤为工具授权清单；``approval`` 步骤为强制审批集合。 */
  config?: { tools: string[] }
}

/** 工作流视图：列表与详情共用。 */
export interface Workflow {
  id: string
  scope: WorkflowScope
  name: string
  description: string
  steps: WorkflowStep[]
  enabled: boolean
  version: number
  created_at: string
  updated_at: string
}

/** 运行历史行：``run_*`` 为关联 chat run 的终态快照，无对应行时为 null。 */
export interface WorkflowRun {
  id: string
  run_id: string
  status: string
  created_at: string
  run_status: string | null
  run_finished_at: string | null
  run_duration_ms: number | null
  run_error_code: string | null
}

// steps schema 约束上限（镜像后端 assembler.py 的 Global Constraints）
const MAX_STEPS = 12
const MAX_INSTRUCTION_LENGTH = 500
const MAX_TOOL_NAME_LENGTH = 200
const MAX_TOTAL_TEXT_LENGTH = 8000

/**
 * ``validate_steps`` 的前端镜像：校验 steps 形状与全部约束，返回中文错误列表
 * （空列表 = 合法）。约束：非空数组、≤12 步、type ∈ 全集、id 唯一非空、
 * ``instruction`` ≤500 字符、单工具名 ≤200 字符、``tool`` 步骤必须显式非空
 * ``config.tools``、全部文本总长 ≤8000 字符；收集全部错误不短路。
 */
export function validateWorkflowSteps(steps: WorkflowStep[]): string[] {
  if (!Array.isArray(steps)) return ['steps 必须是数组']
  if (steps.length === 0) return ['steps 不能为空数组']

  const errors: string[] = []
  if (steps.length > MAX_STEPS) {
    errors.push(`steps 数量 ${steps.length} 超过上限 ${MAX_STEPS}`)
  }

  const seenIds = new Set<string>()
  let totalText = 0
  steps.forEach((rawStep, offset) => {
    const label = `第 ${offset + 1} 步`
    if (rawStep === null || typeof rawStep !== 'object') {
      errors.push(`${label}必须是对象`)
      return
    }
    const step = rawStep as unknown as Record<string, unknown>

    const stepId = step.id
    if (typeof stepId !== 'string' || !stepId) {
      errors.push(`${label}缺少非空字符串 id`)
    } else if (seenIds.has(stepId)) {
      errors.push(`${label} id 重复: ${stepId}`)
    } else {
      seenIds.add(stepId)
    }

    const stepType = step.type
    if (
      typeof stepType !== 'string' ||
      !WORKFLOW_STEP_TYPES.includes(stepType as WorkflowStepType)
    ) {
      errors.push(`${label} type 未知: ${JSON.stringify(stepType)}`)
    }

    const title = step.title
    if (title !== undefined && title !== null && typeof title !== 'string') {
      errors.push(`${label} title 必须是字符串`)
    }

    const instruction = step.instruction
    if (instruction !== undefined && instruction !== null) {
      if (typeof instruction !== 'string') {
        errors.push(`${label} instruction 必须是字符串`)
      } else if (instruction.length > MAX_INSTRUCTION_LENGTH) {
        errors.push(
          `${label} instruction 长度 ${instruction.length} 超过上限 ${MAX_INSTRUCTION_LENGTH}`,
        )
      }
    }

    const config = step.config
    if (config !== undefined && config !== null && typeof config !== 'object') {
      errors.push(`${label} config 必须是对象`)
    }
    const configTools =
      config !== undefined && config !== null && typeof config === 'object'
        ? (config as Record<string, unknown>).tools
        : undefined

    if (stepType === 'tool') {
      if (!Array.isArray(configTools) || configTools.length === 0) {
        errors.push(`${label}（tool 步骤）必须显式提供非空 config.tools`)
      } else {
        for (const name of configTools) {
          if (typeof name !== 'string' || !name) {
            errors.push(`${label} config.tools 必须是非空字符串列表`)
          } else if (name.length > MAX_TOOL_NAME_LENGTH) {
            errors.push(`${label} 工具名长度 ${name.length} 超过上限 ${MAX_TOOL_NAME_LENGTH}`)
          }
        }
      }
    }

    // 总文本预算：拼接所有 id/title/instruction/config 工具名（仅计字符串值）
    if (typeof stepId === 'string') totalText += stepId.length
    if (typeof title === 'string') totalText += title.length
    if (typeof instruction === 'string') totalText += instruction.length
    if (Array.isArray(configTools)) {
      totalText += configTools.reduce(
        (total, name) => (typeof name === 'string' ? total + name.length : total),
        0,
      )
    }
  })

  if (totalText > MAX_TOTAL_TEXT_LENGTH) {
    errors.push(`steps 全部文本总长度 ${totalText} 超过上限 ${MAX_TOTAL_TEXT_LENGTH}`)
  }
  return errors
}
