import { createPinia, setActivePinia } from 'pinia'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { authApi } from '@/api/auth'
import { apiClient } from '@/api/client'
import { conversationsApi } from '@/api/conversations'
import { installMockAdapter, mockDb } from '@/api/mock'
import { useChatStore } from '@/stores/chat'
import { storage } from '@/utils/storage'

beforeAll(() => {
  vi.stubEnv('VITE_USE_MOCK', 'true')
  installMockAdapter(apiClient)
})

beforeEach(() => {
  mockDb.reset()
  storage.setTokens({
    access_token: 'mock-access-test',
    refresh_token: 'mock-refresh-test',
    token_type: 'bearer',
    expires_in: 3600,
  })
  setActivePinia(createPinia())
})

describe('mock 端到端主链路', () => {
  it('登录 → 会话列表 → 发送 → 流式完成', async () => {
    const tokens = await authApi.login({
      email: 'you@example.com',
      password: 'password123',
    })
    storage.setTokens(tokens)

    const page = await conversationsApi.list()
    expect(page.items).toHaveLength(7)
    expect(page.stats?.total).toBe(7)

    const chat = useChatStore()
    await chat.send('你好')

    expect(chat.state.streaming).toBe(false)
    expect(chat.state.finishReason).toBe('stop')
    expect(chat.state.messages.length).toBeGreaterThanOrEqual(2)

    const assistant = chat.state.messages.find((message) => message.role === 'assistant')
    expect(assistant?.content).toContain('128')
    expect(assistant?.status).toBe('completed')
    expect(chat.state.process.some((item) => item.kind === 'tool')).toBe(true)
  }, 15_000)

  it('审批流：等待决定 → 批准 → 同一流完成', async () => {
    const chat = useChatStore()
    const stream = chat.send('整理周报并审批发布到 Slack')

    await vi.waitFor(
      () => {
        expect(chat.state.pendingApprovalId).toBeTruthy()
      },
      { timeout: 8_000, interval: 50 },
    )

    await chat.resolveApproval(true)
    await stream

    expect(chat.state.streaming).toBe(false)
    expect(chat.state.finishReason).toBe('stop')
    const approval = chat.state.process.find((item) => item.kind === 'approval')
    expect(approval?.kind === 'approval' ? approval.decision : null).toBe('approve')
  }, 20_000)

  it('拒绝审批后以 canceled 结束', async () => {
    const chat = useChatStore()
    const stream = chat.send('请审批发布')

    await vi.waitFor(
      () => {
        expect(chat.state.pendingApprovalId).toBeTruthy()
      },
      { timeout: 8_000, interval: 50 },
    )

    await chat.resolveApproval(false)
    await stream

    expect(chat.state.finishReason).toBe('canceled')
    const approval = chat.state.process.find((item) => item.kind === 'approval')
    expect(approval?.kind === 'approval' ? approval.decision : null).toBe('reject')
  }, 20_000)
})
