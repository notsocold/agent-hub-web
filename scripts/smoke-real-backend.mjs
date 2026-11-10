#!/usr/bin/env node
/**
 * 真实后端 M1 冒烟脚本。
 *
 * 默认通过 Vite 开发代理访问（能同时验证 /api 代理与 SSE 透传）：
 *   pnpm dev
 *   pnpm smoke:real
 *
 * 也可以直连后端：
 *   SMOKE_BASE_URL=http://127.0.0.1:8000/api/v1 pnpm smoke:real
 *
 * 脚本只依赖 Node 内置 fetch，不写数据库、不依赖浏览器。
 */

const BASE_URL = (process.env.SMOKE_BASE_URL ?? 'http://127.0.0.1:5173/api/v1').replace(/\/$/, '')
const HEALTH_URL = new URL('/healthz', BASE_URL).toString()
const PASSWORD = 'Passw0rd!234'

let passed = 0

function assert(condition, message) {
  if (!condition) throw new Error(message)
  passed += 1
  console.log(`  ✓ ${message}`)
}

function log(title) {
  console.log(`\n== ${title} ==`)
}

async function readJson(response) {
  const text = await response.text()
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

async function request(method, path, { token, body, headers } = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    ...(body === undefined || method === 'GET' ? {} : { body: JSON.stringify(body) }),
  })
  const data = await readJson(response)
  return { response, data }
}

/** 解析 text/event-stream，逐帧回调。 */
async function readSse(response, onEvent) {
  assert(response.ok, `SSE HTTP ${response.status}`)
  const contentType = response.headers.get('content-type') ?? ''
  assert(contentType.includes('text/event-stream'), `SSE content-type = ${contentType}`)
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  const events = []

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n')
    let boundary = buffer.indexOf('\n\n')
    while (boundary >= 0) {
      const frame = buffer.slice(0, boundary)
      buffer = buffer.slice(boundary + 2)
      boundary = buffer.indexOf('\n\n')
      const lines = frame.split('\n')
      let event = ''
      let data = ''
      for (const line of lines) {
        if (line.startsWith(':')) continue
        if (line.startsWith('event:')) event = line.slice(6).trim()
        if (line.startsWith('data:')) data += line.slice(5).trim()
      }
      if (!event) continue
      const payload = data ? JSON.parse(data) : {}
      const record = { event, data: payload }
      events.push(record)
      onEvent?.(record)
    }
  }
  return events
}

async function startChat(token, payload) {
  const response = await fetch(`${BASE_URL}/chat/stream`, {
    method: 'POST',
    headers: {
      Accept: 'text/event-stream',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  })
  return response
}

async function main() {
  console.log(`Smoke target: ${BASE_URL}`)

  log('健康检查')
  const health = await fetch(HEALTH_URL)
  const healthBody = await readJson(health)
  assert(health.status === 200, `healthz HTTP ${health.status}`)
  assert(healthBody.status === 'ok', `healthz.status = ${healthBody.status}`)

  log('注册与认证')
  const email = process.env.SMOKE_EMAIL ?? `frontend-smoke-${Date.now()}@example.com`
  const password = process.env.SMOKE_PASSWORD ?? PASSWORD
  const auth = process.env.SMOKE_EMAIL
    ? await request('POST', '/auth/login', { body: { email, password } })
    : await request('POST', '/auth/register', {
        body: { email, password, display_name: '前端冒烟' },
      })
  assert(
    auth.response.status === (process.env.SMOKE_EMAIL ? 200 : 201),
    `${process.env.SMOKE_EMAIL ? 'login' : 'register'} HTTP ${auth.response.status}`,
  )
  assert(auth.data.user?.email === email, '认证返回当前用户')
  const token = auth.data.access_token
  assert(typeof token === 'string' && token.length > 20, '拿到 access_token')
  const refreshToken = auth.data.refresh_token
  assert(typeof refreshToken === 'string', '拿到 refresh_token')

  const me = await request('GET', '/auth/me', { token })
  assert(me.response.status === 200 && me.data.email === email, 'GET /auth/me 返回当前用户')

  log('系统信息与能力开关')
  const system = await request('GET', '/system/info', { token })
  assert(system.response.status === 200, 'GET /system/info HTTP 200')
  assert(Array.isArray(system.data.models) && system.data.models.length > 0, 'models 非空')
  assert(Array.isArray(system.data.reasoning_efforts), 'reasoning_efforts 是数组（可为空）')
  assert(
    ['low', 'medium', 'high'].includes(system.data.default_reasoning_effort ?? 'low'),
    'default_reasoning_effort 有默认值',
  )
  const capabilities = system.data.capabilities
  assert(typeof capabilities === 'object' && capabilities !== null, 'capabilities 是对象')
  for (const key of ['agents', 'tasks', 'approvals']) {
    assert(typeof capabilities[key] === 'boolean', `capabilities.${key} 是布尔值`)
  }
  assert(capabilities.agents === true && capabilities.tasks === true, 'M2 agents/tasks 开启')
  assert(capabilities.approvals === true, 'M1 approvals 开启')
  assert(typeof system.data.limits?.message_max_chars === 'number', 'limits.message_max_chars 存在')

  log('会话创建与首次 SSE 对话')
  const clientMessageId = `smoke-${Date.now()}`
  const firstStream = await startChat(token, {
    message: '用两个要点介绍你能做什么',
    client_message_id: clientMessageId,
  })
  const firstRunId = firstStream.headers.get('x-run-id')
  assert(typeof firstRunId === 'string' && firstRunId.length > 20, `X-Run-ID 可读：${firstRunId}`)
  assert(
    firstStream.headers.get('access-control-expose-headers')?.includes('X-Run-ID') ||
      !firstStream.headers.get('access-control-allow-origin'),
    'X-Run-ID 在跨域时声明 exposable（同源代理下为空）',
  )

  const firstEvents = await readSse(firstStream)
  const firstNames = firstEvents.map((item) => item.event)
  const firstRunStarted = firstEvents.find((item) => item.event === 'run.started')?.data
  const firstDone = firstEvents.find((item) => item.event === 'message.done')?.data
  const conversationId = firstEvents.find((item) => item.event === 'conversation.created')?.data
    ?.conversation_id
  assert(Boolean(conversationId), '首条消息返回 conversation.created')
  assert(firstNames[0] === 'conversation.created', '首事件是 conversation.created')
  assert(firstNames[1] === 'run.started', '随后是 run.started')
  assert(firstRunStarted?.run_id === firstRunId, 'run.started.run_id 等于 X-Run-ID')
  assert(firstNames.at(-1) === 'message.done', '最后事件是 message.done')
  assert(firstDone?.finish_reason === 'stop', 'finish_reason=stop')
  assert(firstDone?.conversation_id === conversationId, 'message.done 带 conversation_id')
  assert(typeof firstDone?.usage?.total_tokens === 'number', 'message.done 带 usage')
  const seqs = firstEvents.map((item) => item.data.seq).filter((seq) => typeof seq === 'number')
  assert(
    seqs.every((seq, index) => index === 0 || seq > seqs[index - 1]),
    'SSE seq 严格递增',
  )
  assert(
    firstEvents.some((item) => item.event === 'message.delta'),
    '收到 message.delta',
  )

  log('消息历史（新 → 旧）')
  const messageCountBefore = (await request('GET', `/conversations/${conversationId}`, { token }))
    .data.message_count
  const messages = await request('GET', `/conversations/${conversationId}/messages?limit=10`, {
    token,
  })
  assert(messages.response.status === 200, 'GET messages HTTP 200')
  assert(messages.data.items.length >= 2, '历史至少包含 user/assistant 两条')
  assert(messages.data.items[0].role === 'assistant', '第一条是最新 assistant')
  assert(messages.data.items[1].role === 'user', '第二条是 user')
  assert(
    messages.data.items[0].created_at >= messages.data.items[1].created_at,
    'created_at 新 → 旧',
  )
  for (const message of messages.data.items) {
    assert(
      ['completed', 'failed', 'canceled'].includes(message.status),
      `历史状态不暴露 streaming：${message.status}`,
    )
  }

  const messageProbe = await request(
    'GET',
    `/conversations/${conversationId}/messages?limit=1`,
    { token },
  )
  assert(messageProbe.response.status === 200, '消息 limit=1 分页 HTTP 200（cursor 修复）')
  assert(messageProbe.data.has_more === true, '消息 limit=1 时 has_more=true')
  const messageProbe2 = await request(
    'GET',
    `/conversations/${conversationId}/messages?limit=1&cursor=${encodeURIComponent(messageProbe.data.next_cursor)}`,
    { token },
  )
  assert(messageProbe2.response.status === 200, '消息第二页 HTTP 200')
  assert(
    messageProbe2.data.items[0].created_at <= messageProbe.data.items[0].created_at,
    '消息第二页不新于第一页',
  )
  assert(
    messageProbe2.data.items[0].id !== messageProbe.data.items[0].id,
    '消息第二页换了一条记录',
  )

  log('运行详情与事件回放')
  const run = await request('GET', `/runs/${firstRunId}`, { token })
  assert(run.response.status === 200 && run.data.id === firstRunId, 'GET run 返回同一 run')
  assert(run.data.status === 'succeeded', `run.status=${run.data.status}`)
  const events = await request('GET', `/runs/${firstRunId}/events?limit=100`, { token })
  assert(events.response.status === 200, 'GET run events HTTP 200')
  assert(events.data.items.length >= 4, '运行事件至少 4 条')
  assert(
    events.data.items.every((item) => item.id === `${firstRunId}:${item.seq}`),
    '事件 id = <run_id>:<seq>',
  )
  assert(
    events.data.items.every(
      (item) =>
        item.tokens === null ||
        (typeof item.tokens === 'object' && !Array.isArray(item.tokens)),
    ),
    '事件 tokens 为对象或 null',
  )
  assert(
    events.data.items.every((item) => item.error === null || typeof item.error === 'string'),
    '事件 error 为字符串或 null',
  )
  assert(
    events.data.items.every((item) => !('_event' in item.payload)),
    'payload 不含内部字段 _event',
  )

  log('幂等重试：同一 client_message_id 回放同一 run')
  const replay = await startChat(token, {
    conversation_id: conversationId,
    message: '用两个要点介绍你能做什么',
    client_message_id: clientMessageId,
  })
  assert(replay.status === 200, `重放 HTTP ${replay.status}`)
  assert(replay.headers.get('x-run-id') === firstRunId, '重放 X-Run-ID 与首次一致')
  const replayEvents = await readSse(replay)
  const replayNames = replayEvents.map((item) => item.event)
  assert(
    ['conversation.created', 'run.started'].includes(replayNames[0]),
    `重放从会话/运行起点开始：${replayNames[0]}`,
  )
  assert(
    replayEvents.find((item) => item.event === 'run.started')?.data.run_id === firstRunId,
    '重放 run.started 指向同一 run',
  )
  assert(replayNames.at(-1) === 'message.done', '重放以 message.done 结束')
  const messageCountAfterReplay = (
    await request('GET', `/conversations/${conversationId}`, { token })
  ).data.message_count
  assert(messageCountAfterReplay === messageCountBefore, '重放不新增消息')

  log('同会话并发 409 与 details.run_id')
  const concurrentConversation = await request('POST', '/conversations', {
    token,
    body: { title: '并发冒烟' },
  })
  const concurrentId = concurrentConversation.data.id
  assert(concurrentConversation.response.status === 201, '创建并发测试会话')

  let resolveStarted
  const started = new Promise((resolve) => {
    resolveStarted = resolve
  })
  const slowStream = await startChat(token, {
    conversation_id: concurrentId,
    message: '请写一段较长的说明，覆盖并发场景',
    client_message_id: `slow-${Date.now()}`,
  })
  const slowRunId = slowStream.headers.get('x-run-id')
  const slowReader = readSse(slowStream, (event) => {
    if (event.event === 'run.started') resolveStarted(event.data.run_id)
  })
  await Promise.race([
    started,
    new Promise((_, reject) => setTimeout(() => reject(new Error('等待 run.started 超时')), 10_000)),
  ])

  const conflict = await request('POST', '/chat/stream', {
    token,
    body: {
      conversation_id: concurrentId,
      message: '第二条并发消息',
      client_message_id: `conflict-${Date.now()}`,
    },
  })
  assert(conflict.response.status === 409, `并发请求 HTTP ${conflict.response.status}`)
  assert(conflict.data.error?.code === 'run_in_progress', '并发错误码 run_in_progress')
  assert(conflict.data.error?.details?.run_id === slowRunId, '409 details.run_id 指向占锁 run')

  const cancel = await request('POST', `/runs/${slowRunId}/cancel`, { token })
  assert(cancel.response.status === 200, `cancel HTTP ${cancel.response.status}`)
  assert(cancel.data.status === 'canceled', 'cancel 返回 canceled')
  const slowEvents = await slowReader
  const slowDone = slowEvents.find((item) => item.event === 'message.done')?.data
  assert(slowDone?.finish_reason === 'canceled', '取消后 finish_reason=canceled')

  const notCancelable = await request('POST', `/runs/${firstRunId}/cancel`, { token })
  assert(notCancelable.response.status === 409, '已结束运行 cancel HTTP 409')
  assert(notCancelable.data.error?.code === 'run_not_cancelable', '错误码 run_not_cancelable')
  assert(notCancelable.data.error?.details?.status === 'succeeded', 'details.status=succeeded')

  log('能力关闭与模型白名单')
  // M1.5 起 skills 已启用：未知/他人技能按 404 隐藏，不再返回 capability_disabled。
  const unknownSkill = await request('POST', '/chat/stream', {
    token,
    body: {
      conversation_id: concurrentId,
      message: 'hi',
      client_message_id: `skills-${Date.now()}`,
      skills: ['11111111-1111-4111-8111-111111111111'],
    },
  })
  assert(unknownSkill.response.status === 404, '未知 skill 返回 404')
  assert(unknownSkill.data.error?.code === 'not_found', '未知 skill 错误码 not_found')

  // M4 起 knowledge_categories 已开放（不再 403），知识库链路由 pnpm smoke:m4 覆盖。

  const disabledWorkflow = await request('POST', '/chat/stream', {
    token,
    body: {
      conversation_id: concurrentId,
      message: 'hi',
      client_message_id: `workflow-${Date.now()}`,
      workflow_id: '11111111-1111-4111-8111-111111111111',
    },
  })
  assert(disabledWorkflow.response.status === 409, 'workflow_id 返回 409')
  assert(disabledWorkflow.data.error?.code === 'workflow_disabled', '错误码 workflow_disabled')

  const badModel = await request('POST', '/chat/stream', {
    token,
    body: {
      conversation_id: concurrentId,
      message: 'hi',
      client_message_id: `model-${Date.now()}`,
      model: 'not-a-real-model',
    },
  })
  assert(badModel.response.status === 422, '非法模型返回 422')
  assert(badModel.data.error?.code === 'model_not_allowed', '错误码 model_not_allowed')

  log('审批与运行恢复')
  const approvals = await request('GET', '/approvals?limit=10', { token })
  assert(approvals.response.status === 200, 'GET approvals HTTP 200')
  assert(Array.isArray(approvals.data.items), '审批列表 items 是数组')
  assert(typeof approvals.data.stats?.pending === 'number', '审批 stats.pending 存在')

  const resume = await request('POST', `/runs/${firstRunId}/resume`, {
    token,
    body: { input: '继续' },
  })
  assert(resume.response.status === 409, 'M1 resume 已结束运行返回 409')
  assert(
    ['run_not_interrupted', 'run_not_resumable', 'conflict'].includes(resume.data.error?.code),
    `resume 错误码可识别：${resume.data.error?.code}`,
  )

  log('会话列表统计与翻页字段')
  const pageProbe = await request('GET', '/conversations?limit=1&status=all', { token })
  assert(pageProbe.response.status === 200, 'limit=1 分页 HTTP 200（cursor 修复）')
  assert(pageProbe.data.has_more === true, 'limit=1 时 has_more=true')
  assert(typeof pageProbe.data.next_cursor === 'string', 'limit=1 时返回 next_cursor')
  const pageProbe2 = await request(
    'GET',
    `/conversations?limit=1&status=all&cursor=${encodeURIComponent(pageProbe.data.next_cursor)}`,
    { token },
  )
  assert(pageProbe2.response.status === 200, '带 cursor 的会话第二页 HTTP 200')
  const pageIds = new Set(pageProbe.data.items.map((item) => item.id))
  assert(
    pageProbe2.data.items.every((item) => !pageIds.has(item.id)),
    '会话第二页与第一页不重复',
  )

  const conversations = await request('GET', '/conversations?limit=100&status=all', { token })
  assert(conversations.response.status === 200, 'GET conversations HTTP 200')
  assert(Array.isArray(conversations.data.items), '会话 items 是数组')
  assert(typeof conversations.data.has_more === 'boolean', 'has_more 是布尔值')
  assert(
    conversations.data.next_cursor === null ||
      typeof conversations.data.next_cursor === 'string',
    'next_cursor 为字符串或 null',
  )
  assert(typeof conversations.data.stats?.total === 'number', 'stats.total 是全量计数')
  assert(typeof conversations.data.stats?.pending_approval === 'number', 'stats.pending_approval')

  log('登出')
  const logout = await request('POST', '/auth/logout', {
    token,
    body: { refresh_token: refreshToken },
  })
  assert([200, 204].includes(logout.response.status), `logout HTTP ${logout.response.status}`)

  console.log(`\n✅ 真实后端 M1 冒烟通过：${passed} 项断言`)
}

main().catch((error) => {
  console.error(`\n❌ 冒烟失败：${error instanceof Error ? error.message : error}`)
  process.exitCode = 1
})
