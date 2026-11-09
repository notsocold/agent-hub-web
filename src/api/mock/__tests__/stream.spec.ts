import { beforeEach, describe, expect, it } from 'vitest'

import { mockDb } from '@/api/mock/db'
import { mockChatStream } from '@/api/mock/stream'
import type { ChatEventName } from '@/types'

interface Captured {
  event: ChatEventName
  data: unknown
}

function runStream(
  message: string,
  onEvent: (event: ChatEventName, data: unknown) => void,
  signal: AbortSignal,
  frameDelay = 0,
  extra: Record<string, unknown> = {},
): Promise<void> {
  return mockChatStream(
    { message, ...extra },
    {
      signal,
      onEvent,
      onError: (error) => {
        throw error
      },
    },
    { frameDelay },
  )
}

describe('mock SSE 回放', () => {
  beforeEach(() => {
    mockDb.reset()
  })

  it('普通脚本满足事件顺序，且以 message.done(stop) 结束', async () => {
    const events: Captured[] = []
    const controller = new AbortController()

    await runStream('你好', (event, data) => events.push({ event, data }), controller.signal)

    const names = events.map((item) => item.event)
    expect(names[0]).toBe('conversation.created')
    expect(names.indexOf('run.started')).toBeLessThan(names.indexOf('message.started'))
    expect(names.indexOf('message.started')).toBeLessThan(names.indexOf('message.delta'))
    expect(names.at(-1)).toBe('message.done')

    const done = events.at(-1)?.data as { finish_reason: string; usage: { total_tokens: number } }
    expect(done.finish_reason).toBe('stop')
    expect(done.usage.total_tokens).toBeGreaterThan(0)
  })

  it('abort 后停止发帧且不再出现 message.done', async () => {
    const events: Captured[] = []
    const controller = new AbortController()
    const promise = runStream(
      '你好',
      (event, data) => events.push({ event, data }),
      controller.signal,
      15,
    )
    setTimeout(() => controller.abort(), 25)

    await expect(promise).resolves.toBeUndefined()
    expect(events.some((item) => item.event === 'message.done')).toBe(false)
  })

  it('批准后同一流继续输出并正常结束', async () => {
    const events: Captured[] = []
    const controller = new AbortController()

    await runStream(
      '整理周报并审批发布到 Slack',
      (event, data) => {
        events.push({ event, data })
        if (event === 'approval.required') {
          const approvalId = (data as { approval_id: string }).approval_id
          setTimeout(() => {
            mockDb.resolveApproval(approvalId, 'approve')
          }, 5)
        }
      },
      controller.signal,
    )

    const names = events.map((item) => item.event)
    expect(names).toContain('approval.required')
    expect(names.filter((name) => name === 'message.delta').length).toBeGreaterThan(0)
    expect(names.at(-1)).toBe('message.done')
    const done = events.at(-1)?.data as { finish_reason?: string } | undefined
    expect(done?.finish_reason).toBe('stop')
  })

  it('拒绝审批后以 canceled 结束且不写 Slack 工具结果', async () => {
    const events: Captured[] = []
    const controller = new AbortController()

    await runStream(
      '请审批发布',
      (event, data) => {
        events.push({ event, data })
        if (event === 'approval.required') {
          const approvalId = (data as { approval_id: string }).approval_id
          setTimeout(() => {
            mockDb.resolveApproval(approvalId, 'reject')
          }, 5)
        }
      },
      controller.signal,
    )

    const names = events.map((item) => item.event)
    const done = events.at(-1)?.data as { finish_reason: string }
    expect(done.finish_reason).toBe('canceled')
    const slackCalls = events.filter(
      (item) =>
        item.event === 'tool.result' &&
        (item.data as { tool_call_id?: string }).tool_call_id === 'call_slack_1',
    )
    expect(slackCalls).toHaveLength(0)
    expect(names).toContain('message.done')
  })

  it('显式技能在首个 delta 前激活并写入消息能力快照', async () => {
    const events: Captured[] = []
    const controller = new AbortController()
    const skillId = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc2'

    await runStream(
      '用知识问答技能回答',
      (event, data) => events.push({ event, data }),
      controller.signal,
      0,
      { skills: [skillId] },
    )

    const names = events.map((item) => item.event)
    const skillIndex = names.indexOf('skill.activated')
    const deltaIndex = names.indexOf('message.delta')
    expect(skillIndex).toBeGreaterThan(-1)
    expect(skillIndex).toBeLessThan(deltaIndex)
    const activated = events[skillIndex]?.data as { skill_id: string; name: string }
    expect(activated.skill_id).toBe(skillId)
    expect(activated.name).toBe('知识问答')

    const conversation = mockDb.conversations[0]!
    const userMessage = mockDb.messages[conversation.id]?.find((item) => item.role === 'user')
    expect(userMessage?.capabilities.skills).toEqual([skillId])
  })

  it('显式 MCP 选择会产生 source=mcp 的工具事件', async () => {
    const events: Captured[] = []
    const controller = new AbortController()

    await runStream(
      '看看频道信息',
      (event, data) => events.push({ event, data }),
      controller.signal,
      0,
      { mcp_servers: ['dddddddd-dddd-4ddd-8ddd-ddddddddddd1'] },
    )

    const tool = events.find(
      (item) => item.event === 'tool.start' && (item.data as { source?: string }).source === 'mcp',
    )
    expect(tool).toBeTruthy()
    const toolData = tool?.data as { server?: string } | undefined
    expect(toolData?.server).toBe('Slack')
    const result = events.find(
      (item) => item.event === 'tool.result' && (item.data as { source?: string }).source === 'mcp',
    )
    expect(result).toBeTruthy()
  })

  it('提到记住时保存记忆并发送 memory.saved', async () => {
    const events: Captured[] = []
    const controller = new AbortController()
    const before = mockDb.memories.length

    await runStream(
      '记住：以后回答先给结论',
      (event, data) => events.push({ event, data }),
      controller.signal,
    )

    expect(events.some((item) => item.event === 'memory.saved')).toBe(true)
    expect(mockDb.memories.length).toBe(before + 1)
  })

  it('错误脚本发送 error 并以 finish_reason=error 结束', async () => {
    const events: Captured[] = []
    const controller = new AbortController()

    await runStream(
      '触发一个错误',
      (event, data) => events.push({ event, data }),
      controller.signal,
    )

    const names = events.map((item) => item.event)
    expect(names).toContain('error')
    const done = events.at(-1)?.data as { finish_reason?: string } | undefined
    expect(done?.finish_reason).toBe('error')
  })
})
