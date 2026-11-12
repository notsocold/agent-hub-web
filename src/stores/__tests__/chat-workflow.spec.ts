import { describe, expect, it } from 'vitest'

import { createInitialChatState, eventNameOfRunEvent, reduceChat } from '@/stores/chat-reducer'
import type { RunEvent } from '@/types'

/** M9 T6 契约：workflow.step payload 恰为 T1 WorkflowStepData 五字段 + seq 公共字段。 */
function stepPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    seq: 1,
    step_id: 's1',
    step_type: 'knowledge_search',
    step_title: '检索政策',
    tool: 'search_knowledge',
    status: 'ok',
    ...overrides,
  }
}

describe('workflow.step 实时事件（SSE 入口）', () => {
  it('产出 kind:workflow 过程卡且主键为 workflow:{step_id}', () => {
    const state = reduceChat(createInitialChatState(), 'workflow.step', stepPayload())

    expect(state.process).toHaveLength(1)
    const item = state.process[0]
    expect(item?.kind).toBe('workflow')
    if (item?.kind !== 'workflow') return
    expect(item.id).toBe('workflow:s1')
    expect(item.stepId).toBe('s1')
    expect(item.stepType).toBe('knowledge_search')
    expect(item.stepTitle).toBe('检索政策')
    expect(item.tool).toBe('search_knowledge')
    expect(item.status).toBe('ok')
  })

  it("status 'rejected' 与未知值一律映射失败态", () => {
    const rejected = reduceChat(createInitialChatState(), 'workflow.step', stepPayload({ status: 'rejected' }))
    const unknown = reduceChat(createInitialChatState(), 'workflow.step', stepPayload({ status: 'whatever' }))

    expect(rejected.process[0]?.status).toBe('error')
    expect(unknown.process[0]?.status).toBe('error')
  })

  it('同 step_id 二次事件按主键 upsert，不重复产生卡片', () => {
    let state = reduceChat(createInitialChatState(), 'workflow.step', stepPayload({ status: 'ok' }))
    state = reduceChat(state, 'workflow.step', stepPayload({ seq: 2, status: 'rejected', step_title: '检索政策（重试）' }))

    expect(state.process).toHaveLength(1)
    const item = state.process[0]
    expect(item?.kind).toBe('workflow')
    if (item?.kind !== 'workflow') return
    expect(item.id).toBe('workflow:s1')
    expect(item.status).toBe('error')
    expect(item.stepTitle).toBe('检索政策（重试）')
  })

  it('缺 step_id 的事件不产生卡片', () => {
    const state = reduceChat(createInitialChatState(), 'workflow.step', stepPayload({ step_id: '' }))

    expect(state.process).toHaveLength(0)
  })
})

describe('workflow.step 回放路径（event 字段还原，与实时共用同一 reducer case）', () => {
  const runEvent: RunEvent = {
    id: 'run-1:5',
    seq: 5,
    ts: '2026-11-12T00:00:00Z',
    type: 'workflow',
    event: 'workflow.step',
    status: 'ok',
    title: '',
    subtitle: '',
    duration_ms: null,
    tokens: null,
    payload: stepPayload({ seq: 5 }) as Record<string, unknown>,
    error: null,
  }

  it('eventNameOfRunEvent 识别 workflow.step 事件名', () => {
    expect(eventNameOfRunEvent(runEvent)).toBe('workflow.step')
  })

  it('回放 payload 经同一 case 产出与实时一致的步骤卡', () => {
    const name = eventNameOfRunEvent(runEvent)
    if (!name) throw new Error('workflow.step 应在事件白名单内')

    const state = reduceChat(createInitialChatState(), name, { ...runEvent.payload, seq: runEvent.seq })

    expect(state.process).toHaveLength(1)
    const item = state.process[0]
    expect(item?.kind).toBe('workflow')
    if (item?.kind !== 'workflow') return
    expect(item.id).toBe('workflow:s1')
    expect(item.stepId).toBe('s1')
    expect(item.stepTitle).toBe('检索政策')
    expect(item.tool).toBe('search_knowledge')
    expect(item.status).toBe('ok')
  })
})
