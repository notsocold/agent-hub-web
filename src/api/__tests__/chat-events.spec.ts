import { describe, expect, it } from 'vitest'

import { CHAT_EVENT_NAMES, isChatEvent } from '@/api/chat'

describe('chat SSE 事件白名单', () => {
  it('包含 M5 审批挂起/恢复事件（真实模式不会丢弃）', () => {
    expect(CHAT_EVENT_NAMES).toContain('run.interrupted')
    expect(CHAT_EVENT_NAMES).toContain('run.resumed')
  })

  it('包含审批卡与工具拒绝相关事件', () => {
    expect(CHAT_EVENT_NAMES).toContain('approval.required')
    expect(CHAT_EVENT_NAMES).toContain('tool.result')
    expect(CHAT_EVENT_NAMES).toContain('message.done')
  })

  it('没有重复项', () => {
    expect(new Set(CHAT_EVENT_NAMES).size).toBe(CHAT_EVENT_NAMES.length)
  })

  it('分发判断接受 M5 事件、拒绝未知事件', () => {
    expect(isChatEvent('run.interrupted')).toBe(true)
    expect(isChatEvent('run.resumed')).toBe(true)
    expect(isChatEvent('approval.required')).toBe(true)
    expect(isChatEvent('approval.unknown')).toBe(false)
  })
})
