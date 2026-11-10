import type { ChatContextSelection, ReasoningEffortId } from '@/types'

export interface ChatModelSelection {
  model?: string
  reasoningEffort?: ReasoningEffortId
  /** 后端 `/system/info.reasoning_efforts` 非空时才下发推理等级。 */
  reasoningSupported?: boolean
}

/**
 * 把输入栏的模型/推理等级并入本轮请求上下文。
 *
 * 模型目录或推理等级为空时不下发对应字段，避免覆盖服务端默认值；
 * 不修改传入的 context，便于调用方复用本轮显式选择。
 */
export function withModelSelection(
  context: ChatContextSelection,
  selection: ChatModelSelection,
): ChatContextSelection {
  const next: ChatContextSelection = { ...context }
  if (selection.model) next.model = selection.model
  if (selection.reasoningSupported && selection.reasoningEffort) {
    next.reasoning_effort = selection.reasoningEffort
  }
  return next
}
