import { createPinia, setActivePinia } from 'pinia'
import { beforeAll, describe, expect, it } from 'vitest'

import { agentsApi } from '@/api/agents'
import { authApi } from '@/api/auth'
import { tasksApi } from '@/api/tasks'
import { storage } from '@/utils/storage'

/**
 * M2 真实后端联调：需要一个可访问的假 A2A Agent（Agent Card + JSON-RPC message/send）。
 * 用 `REAL_FAKE_AGENT_URL=http://127.0.0.1:9101 pnpm test:real` 运行；
 * 未设置时整组跳过，避免默认测试依赖外部进程。
 */
const FAKE_AGENT_URL = process.env.REAL_FAKE_AGENT_URL

function requireRealEnv(): void {
  const base = import.meta.env.VITE_API_BASE_URL as string | undefined
  if (!base) {
    throw new Error('缺少 VITE_API_BASE_URL；请用 pnpm test:real 运行真实联调测试')
  }
}

async function signIn(): Promise<void> {
  const email = process.env.REAL_TEST_EMAIL
  const password = process.env.REAL_TEST_PASSWORD ?? 'Passw0rd!234'
  const tokens = email
    ? await authApi.login({ email, password })
    : await authApi.register({
        email: `frontend-m2-${Date.now()}@example.com`,
        password,
        display_name: '前端 M2 联调',
      })
  storage.setTokens(tokens)
}

describe.skipIf(!FAKE_AGENT_URL)('前端 M2 智能体/任务 API 与真实后端', () => {
  beforeAll(async () => {
    requireRealEnv()
    const { apiClient } = await import('@/api/client')
    apiClient.defaults.adapter = 'http'
    storage.clearTokens()
    setActivePinia(createPinia())
    await signIn()
  })

  it('预览 → 注册 → 列表 → 详情 → 健康检查 → 启停 → 删除', async () => {
    const slug = `local-echo-${Date.now()}`
    const preview = await agentsApi.preview({ url: FAKE_AGENT_URL!, slug })
    expect(preview.valid).toBe(true)
    expect(preview.normalized.skills.length).toBeGreaterThan(0)
    expect(preview.normalized.url).toBe(FAKE_AGENT_URL)

    const created = await agentsApi.create({ url: FAKE_AGENT_URL!, slug })
    expect(created.slug).toBe(slug)
    expect(created.enabled).toBe(true)
    expect(created.skill_count).toBeGreaterThan(0)

    const list = await agentsApi.list({ q: slug })
    expect(list.items.some((item) => item.id === created.id)).toBe(true)
    expect(list.stats?.total).toBeGreaterThan(0)

    const detail = await agentsApi.get(created.id)
    expect(detail.card).toBeTruthy()
    expect(detail.recent_tasks).toBeDefined()

    const health = await agentsApi.health(created.id)
    expect(['healthy', 'degraded', 'unhealthy']).toContain(health.health_status)
    expect(typeof health.checked_at).toBe('string')

    const disabled = await agentsApi.update(created.id, { enabled: false })
    expect(disabled.enabled).toBe(false)
    await agentsApi.update(created.id, { enabled: true })

    await agentsApi.remove(created.id)
    const after = await agentsApi.list({ q: slug })
    expect(after.items.some((item) => item.id === created.id)).toBe(false)
  }, 60_000)

  it('对话调用远程 Agent 后任务列表/详情字段可消费', async () => {
    const slug = `local-echo-chat-${Date.now()}`
    const agent = await agentsApi.create({ url: FAKE_AGENT_URL!, slug })
    const { useChatStore } = await import('@/stores/chat')
    const chat = useChatStore()
    await chat.send(
      `请调用远程智能体 ${slug}，把这句话复述一下：「M2 前端联调」。必须使用 send_message 工具。`,
    )
    expect(chat.state.finishReason).toBe('stop')
    expect(chat.processItems.some((item) => item.kind === 'tool')).toBe(true)
    expect(chat.processItems.some((item) => item.kind === 'a2a')).toBe(true)

    const page = await tasksApi.list({ agent_id: agent.id, limit: 20 })
    expect(page.items.length).toBeGreaterThan(0)
    const task = page.items[0]!
    expect(task.agent.id).toBe(agent.id)
    expect([
      'submitted',
      'working',
      'input_required',
      'auth_required',
      'completed',
      'failed',
      'canceled',
      'rejected',
    ]).toContain(task.state)

    const detail = await tasksApi.get(task.id)
    expect(detail.tool_call_id).toBeTruthy()
    expect(Array.isArray(detail.timeline)).toBe(true)
    expect(detail.timeline.length).toBeGreaterThan(0)

    chat.reset()
    await agentsApi.remove(agent.id)
  }, 90_000)
})
