import { createPinia, setActivePinia } from 'pinia'
import { beforeAll, describe, expect, it } from 'vitest'

import { authApi } from '@/api/auth'
import { openChatStream } from '@/api/chat'
import { storage } from '@/utils/storage'

/**
 * 这个用例直接驱动前端的 SSE 客户端与 chat store，连接真实 agent-hub。
 * 运行前需启动后端，并通过 `pnpm test:real` 注入 API 地址。
 */
function requireRealEnv(): void {
  const base = import.meta.env.VITE_API_BASE_URL as string | undefined
  if (!base) {
    throw new Error('缺少 VITE_API_BASE_URL；请用 pnpm test:real 运行真实联调测试')
  }
}

async function signIn(): Promise<void> {
  const configuredEmail = process.env.REAL_TEST_EMAIL
  const password = process.env.REAL_TEST_PASSWORD ?? 'Passw0rd!234'
  const tokens = configuredEmail
    ? await authApi.login({ email: configuredEmail, password })
    : await authApi.register({
        email: `frontend-store-${Date.now()}-${Math.floor(Math.random() * 1000)}@example.com`,
        password,
        display_name: '前端 store 联调',
      })
  storage.setTokens(tokens)
}

describe('前端 store 与真实后端联调', () => {
  beforeAll(async () => {
    requireRealEnv()
    // fetch-event-source 读取 window.fetch；Node 环境需要把全局 fetch 挂到 window。
    window.fetch = globalThis.fetch.bind(globalThis)
    // jsdom 的 XHR 会执行 CORS；测试里显式走 Node http adapter 直连后端。
    const { apiClient } = await import('@/api/client')
    apiClient.defaults.adapter = 'http'
    storage.clearTokens()
    setActivePinia(createPinia())
  })

  it('登录态下发送消息，store 完成流式、历史与运行状态收敛', async () => {
    await signIn()
    const { useChatStore } = await import('@/stores/chat')
    const chat = useChatStore()

    await chat.send('用一句话说明你支持哪些能力')
    expect(chat.state.streaming).toBe(false)
    expect(chat.state.finishReason).toBe('stop')
    expect(chat.state.runId).toBeTruthy()
    expect(chat.state.runStatus).toBe('succeeded')
    expect(chat.state.messages.length).toBeGreaterThanOrEqual(2)

    const user = chat.state.messages.find((message) => message.role === 'user')
    const assistant = chat.state.messages.find((message) => message.role === 'assistant')
    expect(user?.content).toBe('用一句话说明你支持哪些能力')
    expect(assistant?.status).toBe('completed')
    expect((assistant?.content.length ?? 0) > 0).toBe(true)

    const conversationId = chat.state.conversationId
    expect(conversationId).toBeTruthy()

    await chat.loadConversation(conversationId!)
    const roles = chat.messages.map((message) => message.role)
    expect(roles[0]).toBe('user')
    expect(roles).toContain('assistant')
    expect(new Set(chat.messages.map((message) => message.id)).size).toBe(chat.messages.length)
    expect(chat.state.runStatus).toBe('succeeded')
    chat.reset()
  }, 30_000)

  it('真实 SSE 客户端把 409 run_in_progress 解析成带 details.run_id 的错误', async () => {
    await signIn()
    const { runsApi } = await import('@/api/runs')
    const controller = new AbortController()
    const firstEvents: Array<{ event: string; data: Record<string, unknown> }> = []
    let conversationId = ''
    let firstRunId = ''
    let resolveStarted: (runId: string) => void = () => undefined
    const started = new Promise<string>((resolve) => {
      resolveStarted = resolve
    })

    const firstStream = openChatStream(
      {
        message: '请给我一段较长的说明，用于验证同一会话并发限制',
        client_message_id: `real-${Date.now()}`,
      },
      {
        signal: controller.signal,
        onOpen: (runId) => {
          if (runId) firstRunId = runId
        },
        onEvent: (event, data) => {
          const record = data as Record<string, unknown>
          firstEvents.push({ event, data: record })
          if (event === 'conversation.created' && typeof record.conversation_id === 'string') {
            conversationId = record.conversation_id
          }
          if (event === 'run.started' && typeof record.run_id === 'string') {
            resolveStarted(record.run_id)
          }
        },
        onError: (error) => {
          throw error
        },
      },
    )

    const runId = await started
    await expect(
      openChatStream(
        {
          conversation_id: conversationId,
          message: '第二条并发消息',
          client_message_id: `conflict-${Date.now()}`,
        },
        {
          signal: new AbortController().signal,
          onEvent: () => undefined,
          onError: (error) => {
            throw error
          },
        },
      ),
    ).rejects.toMatchObject({
      code: 'run_in_progress',
      status: 409,
      details: { run_id: runId },
    })

    await runsApi.cancel(runId)
    await firstStream.catch(() => undefined)
    expect(firstRunId).toBe(runId)
    expect(firstEvents.at(-1)?.event).toBe('message.done')
    expect(firstEvents.at(-1)?.data.finish_reason).toBe('canceled')
  }, 30_000)
})
