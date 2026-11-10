import { describe, expect, it } from 'vitest'

import { withModelSelection } from '@/utils/chatSelection'

describe('withModelSelection', () => {
  it('把模型与推理等级并入本轮上下文，且不修改入参', () => {
    const context = { skills: ['skill-1'] }

    const result = withModelSelection(context, {
      model: 'deepseek-chat',
      reasoningEffort: 'high',
      reasoningSupported: true,
    })

    expect(result).toEqual({
      skills: ['skill-1'],
      model: 'deepseek-chat',
      reasoning_effort: 'high',
    })
    expect(context).toEqual({ skills: ['skill-1'] })
  })

  it('模型为空或推理能力关闭时不下发对应字段', () => {
    expect(
      withModelSelection(
        {},
        { model: '', reasoningEffort: 'low', reasoningSupported: false },
      ),
    ).toEqual({})

    expect(
      withModelSelection(
        {},
        { model: 'deepseek-chat', reasoningEffort: 'low', reasoningSupported: false },
      ),
    ).toEqual({ model: 'deepseek-chat' })
  })
})
