// @vitest-environment node

// fetch-event-source 在 dispose/visibility 逻辑里直接访问 window/document；
// 在 node 测试环境提供最小垫片（模块加载时不访问，仅调用时访问）。
const nodeGlobals = globalThis as unknown as Record<string, unknown>
if (typeof nodeGlobals.window === 'undefined') {
  nodeGlobals.window = {
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
    fetch: globalThis.fetch,
  }
  nodeGlobals.document = {
    hidden: false,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }
}

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { ApiRequestError } from '@/api/client'
import { authApi } from '@/api/auth'
import { runsApi } from '@/api/runs'
import type { ChatEventName, PageResult, Run, RunEvent } from '@/types'
import { storage } from '@/utils/storage'

/**
 * M7 真实后端联调：需要 agent-hub 已在 127.0.0.1:8000 启动。
 *
 * 运行：`pnpm test:real`（vitest.real.config.ts 中显式包含本文件）。
 *
 * 覆盖：
 * - `GET /runs/{id}/events` 的 `event` 字段与 payload 不含 `_event`；
 * - `runsApi.stream` 真实 GET + Bearer 续流：回放已落库事件、seq 严格递增、
 *   终态后 onClose；
 * - `after_seq` 断点续流不重复回放；
 * - 普通用户写 agents 返回 403 `forbidden`（若无法创建普通用户则跳过）。
 */
const BASE_URL = (
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://127.0.0.1:8000/api/v1'
).replace(/\/$/, '')
const EMAIL = process.env.REAL_TEST_EMAIL ?? 'dev@example.com'
const PASSWORD = process.env.REAL_TEST_PASSWORD ?? 'dev-password-123'
const USER_EMAIL = process.env.REAL_TEST_USER_EMAIL ?? 'smoke-m7@example.com'
const USER_PASSWORD = process.env.REAL_TEST_USER_PASSWORD ?? 'smoke-m7-password'

let runId = ''
let run: Run | null = null
let token = ''

async function signIn(): Promise<void> {
  storage.clearTokens()
  const tokens = await authApi.login({ email: EMAIL, password: PASSWORD })
  storage.setTokens(tokens)
  token = tokens.access_token
}

/** 用原始 fetch 建一次 run 并读到终态（LLM 占位时以 llm_error 结束，事件仍落库）。 */
async function createRun(): Promise<string> {
  const response = await fetch(`${BASE_URL}/chat/stream`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify({ message: 'M7 real 测试：请回复 OK', reasoning_effort: 'low' }),
  })
  expect(response.ok).toBe(true)
  const createdRunId = response.headers.get('x-run-id')
  expect(createdRunId).toBeTruthy()
  const text = await response.text()
  expect(text).toContain('event:')
  return createdRunId as string
}

function streamHandlers(): {
  events: Array<{ name: ChatEventName; seq: number }>
  closed: () => boolean
  open: () => boolean
  signal: AbortSignal
  onOpen: (id: string | null) => void
  onEvent: (name: ChatEventName, data: unknown) => void
  onError: (error: Error) => void
  onClose: () => void
} {
  const events: Array<{ name: ChatEventName; seq: number }> = []
  let closed = false
  let opened = false
  return {
    events,
    closed: () => closed,
    open: () => opened,
    signal: new AbortController().signal,
    onOpen: () => {
      opened = true
    },
    onEvent: (name, data) => {
      const seq = typeof (data as { seq?: unknown }).seq === 'number' ? (data as { seq: number }).seq : 0
      events.push({ name, seq })
    },
    onError: (error) => {
      throw error
    },
    onClose: () => {
      closed = true
    },
  }
}

async function ordinaryUserToken(): Promise<string | null> {
  const login = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: USER_EMAIL, password: USER_PASSWORD }),
  })
  if (login.ok) return ((await login.json()) as { access_token: string }).access_token

  const register = await fetch(`${BASE_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: USER_EMAIL,
      password: USER_PASSWORD,
      display_name: 'M7 Real User',
    }),
  })
  if (register.ok) return ((await register.json()) as { access_token: string }).access_token
  return null
}

beforeAll(async () => {
  await signIn()
  runId = await createRun()
  run = await runsApi.get(runId)
}, 60_000)

afterAll(() => {
  storage.clearTokens()
})

describe('M7 真实后端：事件回放与续流', () => {
  it('事件回放的 event 字段可直接驱动 reducer', async () => {
    const page: PageResult<RunEvent> = await runsApi.events(runId, { limit: 50 })

    expect(page.items.length).toBeGreaterThan(0)
    for (const item of page.items) {
      expect(typeof item.event).toBe('string')
      expect(item.payload).not.toHaveProperty('_event')
    }
    expect(page.items.some((item) => item.event.length > 0)).toBe(true)
  })

  it('runsApi.stream 回放已落库事件，seq 严格递增且终态关闭', async () => {
    expect(run?.status).toMatch(/succeeded|failed|canceled/)

    const handlers = streamHandlers()
    await runsApi.stream(runId, 0, handlers)

    expect(handlers.open()).toBe(true)
    expect(handlers.closed()).toBe(true)
    expect(handlers.events.length).toBeGreaterThan(0)
    const seqs = handlers.events.map((item) => item.seq)
    expect(seqs.every((seq, index) => index === 0 || seq > seqs[index - 1])).toBe(true)
  })

  it('after_seq 断点续流只回放之后的事件', async () => {
    const first = streamHandlers()
    await runsApi.stream(runId, 0, first)
    const firstSeq = first.events[0]?.seq ?? 0

    const resumed = streamHandlers()
    await runsApi.stream(runId, firstSeq, resumed)

    expect(resumed.events.every((item) => item.seq > firstSeq)).toBe(true)
  })

  it('不存在的 run 返回 404（不泄露存在性）', async () => {
    const handlers = streamHandlers()
    await expect(
      runsApi.stream('00000000-0000-4000-8000-000000000000', 0, handlers),
    ).rejects.toMatchObject({ status: 404 })

    const error = await runsApi
      .stream('00000000-0000-4000-8000-000000000000', 0, streamHandlers())
      .catch((reason: unknown) => reason)
    expect(error).toBeInstanceOf(ApiRequestError)
  })

  it('普通用户写 agents 返回 403 forbidden（限流时跳过）', async () => {
    const userToken = await ordinaryUserToken()
    if (!userToken) {
      console.warn('注册普通用户被限流，跳过 403 断言（可先运行 scripts/seed_dev_account.py 创建）')
      return
    }
    const response = await fetch(`${BASE_URL}/agents`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${userToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'M7 Real Agent',
        url: 'https://example.com/a2a',
        description: 'forbidden',
      }),
    })
    expect(response.status).toBe(403)
    const body = (await response.json()) as {
      error: { code: string; details?: { required_role?: string } }
    }
    expect(body.error.code).toBe('forbidden')
    expect(body.error.details?.required_role).toBe('admin')
  })
})
