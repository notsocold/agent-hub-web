#!/usr/bin/env node
/**
 * 真实后端 M1.5 冒烟：个人能力层（附件 / 指令 / 记忆 / 技能 / MCP / 审批）。
 *
 * 默认通过 Vite 开发代理访问，同时验证 /api 代理与 SSE：
 *   pnpm dev
 *   SMOKE_EMAIL=dev@example.com SMOKE_PASSWORD=dev-password-123 pnpm smoke:m15
 *
 * 也可以直连后端：
 *   SMOKE_BASE_URL=http://127.0.0.1:8000/api/v1 pnpm smoke:m15
 *
 * 脚本只依赖 Node 内置 fetch/FormData/Blob；结束时清理自己创建的数据。
 */

const BASE_URL = (process.env.SMOKE_BASE_URL ?? 'http://127.0.0.1:5173/api/v1').replace(/\/$/, '')
const EMAIL = process.env.SMOKE_EMAIL ?? 'dev@example.com'
const PASSWORD = process.env.SMOKE_PASSWORD ?? 'dev-password-123'
const STAMP = Date.now()

let passed = 0
const failures = []

function assert(condition, message) {
  if (!condition) throw new Error(message)
  passed += 1
  console.log(`  ✓ ${message}`)
}

function log(title) {
  console.log(`\n== ${title} ==`)
}

async function readBody(response) {
  const text = await response.text()
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

async function request(method, path, { token, body, form } = {}) {
  const headers = { Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }
  let payload
  if (form) {
    payload = form
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
    payload = JSON.stringify(body)
  }
  const init =
    payload === undefined || method === 'GET' || method === 'HEAD'
      ? { method, headers }
      : { method, headers, body: payload }
  const response = await fetch(`${BASE_URL}${path}`, init)
  const data = await readBody(response)
  return { response, data }
}

async function readSse(response) {
  assert(response.ok, `SSE HTTP ${response.status}`)
  assert(
    (response.headers.get('content-type') ?? '').includes('text/event-stream'),
    'SSE content-type 正确',
  )
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  const events = []
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n')
    let boundary = buffer.indexOf('\n\n')
    while (boundary >= 0) {
      const frame = buffer.slice(0, boundary)
      buffer = buffer.slice(boundary + 2)
      boundary = buffer.indexOf('\n\n')
      let event = ''
      let data = ''
      for (const line of frame.split('\n')) {
        if (line.startsWith(':')) continue
        if (line.startsWith('event:')) event = line.slice(6).trim()
        if (line.startsWith('data:')) data += line.slice(5).trim()
      }
      if (event) events.push({ event, data: data ? JSON.parse(data) : {} })
    }
  }
  return events
}

function uuidLike(value) {
  return typeof value === 'string' && value.length >= 8
}

const created = {
  skillId: null,
  attachmentId: null,
  memoryId: null,
  mcpServerId: null,
  conversationId: null,
}

async function cleanup(token) {
  log('清理测试数据')
  const attempts = [
    ['skill', created.skillId && (() => request('DELETE', `/skills/${created.skillId}`, { token }))],
    [
      'attachment',
      created.attachmentId &&
        (() => request('DELETE', `/attachments/${created.attachmentId}`, { token })),
    ],
    ['memory', created.memoryId && (() => request('DELETE', `/memories/${created.memoryId}`, { token }))],
    [
      'mcp',
      created.mcpServerId &&
        (() => request('DELETE', `/mcp/servers/${created.mcpServerId}`, { token })),
    ],
    [
      'conversation',
      created.conversationId &&
        (() => request('DELETE', `/conversations/${created.conversationId}`, { token })),
    ],
  ]
  for (const [name, run] of attempts) {
    if (!run) continue
    try {
      const { response } = await run()
      console.log(`  - ${name}: HTTP ${response.status}`)
    } catch (error) {
      console.log(`  - ${name}: 清理失败（${error.message}）`)
    }
  }
}

async function main() {
  console.log(`M1.5 smoke target: ${BASE_URL}`)
  console.log(`account: ${EMAIL}`)

  log('登录')
  const auth = await request('POST', '/auth/login', { body: { email: EMAIL, password: PASSWORD } })
  assert(auth.response.status === 200, `登录 HTTP ${auth.response.status}`)
  const token = auth.data.access_token
  assert(typeof token === 'string' && token.length > 20, '拿到 access_token')

  try {
    log('系统能力开关')
    const system = await request('GET', '/system/info', { token })
    assert(system.response.status === 200, 'GET /system/info HTTP 200')
    const caps = system.data.capabilities
    for (const key of ['instructions', 'memories', 'skills', 'mcp', 'attachments', 'approvals']) {
      assert(caps[key] === true, `capabilities.${key} = true`)
    }
    assert(typeof system.data.limits?.attachments_per_message === 'number', '附件限额存在')

    log('指令')
    const before = await request('GET', '/instructions', { token })
    assert(before.response.status === 200, 'GET /instructions HTTP 200')
    assert(typeof before.data.max_chars === 'number', 'max_chars 存在')
    const saved = await request('PUT', '/instructions', {
      token,
      body: { content: `M1.5 smoke ${STAMP}：先给结论，再给依据。` },
    })
    assert(saved.response.status === 200, 'PUT /instructions HTTP 200')
    assert(saved.data.source === 'user', '指令来源变为 user')
    assert(String(saved.data.effective).includes(String(STAMP)), '生效指令包含新内容')
    const reset = await request('PUT', '/instructions', { token, body: { content: null } })
    assert(reset.response.status === 200, '恢复默认 HTTP 200')
    assert(reset.data.source === 'system_default', '恢复后来源为 system_default')

    log('长期记忆')
    const memory = await request('POST', '/memories', {
      token,
      body: {
        kind: 'preference',
        title: `smoke-${STAMP}`,
        content: '冒烟测试记忆：回答先给结论。',
        pinned: false,
      },
    })
    assert(memory.response.status === 201, `POST /memories HTTP ${memory.response.status}`)
    created.memoryId = memory.data.id
    const memoryList = await request('GET', '/memories?q=冒烟测试记忆', { token })
    assert(memoryList.response.status === 200, 'GET /memories HTTP 200')
    assert(memoryList.data.items.some((item) => item.id === created.memoryId), '搜索结果包含新记忆')
    assert(typeof memoryList.data.stats?.active === 'number', 'memories.stats 存在')
    const memoryPatch = await request('PATCH', `/memories/${created.memoryId}`, {
      token,
      body: { status: 'archived' },
    })
    assert(memoryPatch.data.status === 'archived', 'PATCH 记忆状态生效')
    const exported = await request('GET', '/memories/export', { token })
    assert(exported.response.status === 200, 'GET /memories/export HTTP 200')
    assert(Array.isArray(exported.data.items ?? exported.data.memories), '导出包含记忆数组')

    log('技能')
    const skill = await request('POST', '/skills', {
      token,
      body: {
        name: `SMOKE Skill ${STAMP}`,
        description: 'M1.5 冒烟技能',
        content: '# Smoke\n\n1. 先给结论\n2. 再给依据',
      },
    })
    assert(skill.response.status === 201, `POST /skills HTTP ${skill.response.status}`)
    created.skillId = skill.data.id
    assert(skill.data.scope === 'user', '技能 scope=user')
    assert(uuidLike(skill.data.slug), '技能自动生成 slug')
    const detail = await request('GET', `/skills/${created.skillId}`, { token })
    assert(String(detail.data.content).includes('先给结论'), '详情返回 SKILL.md 正文')
    const skillList = await request('GET', '/skills', { token })
    assert(skillList.response.status === 200, 'GET /skills HTTP 200')
    assert(skillList.data.items.some((item) => item.id === created.skillId), '技能列表包含新技能')
    const catalog = await request('GET', '/skills/catalog', { token })
    assert(catalog.response.status === 200, 'GET /skills/catalog HTTP 200')
    assert(catalog.data.items.some((item) => item.id === created.skillId), '技能目录包含新技能')
    const files = await request('GET', `/skills/${created.skillId}/files`, { token })
    assert(files.response.status === 200, 'GET /skills/{id}/files HTTP 200')
    assert(Array.isArray(files.data), '技能文件列表是数组')
    const disabled = await request('PUT', `/skills/${created.skillId}/enabled`, {
      token,
      body: { enabled: false },
    })
    assert(disabled.data.effective_enabled === false, '技能可被禁用')
    await request('PUT', `/skills/${created.skillId}/enabled`, { token, body: { enabled: true } })

    log('附件')
    const form = new FormData()
    form.append('file', new Blob(['ticket_id,amount\nT-1,10\n'], { type: 'text/csv' }), 'smoke.csv')
    form.append('purpose', 'chat')
    const uploaded = await request('POST', '/attachments', { token, form })
    assert(uploaded.response.status === 201, `上传附件 HTTP ${uploaded.response.status}`)
    created.attachmentId = uploaded.data.id
    assert(uploaded.data.status === 'ready', '小文件同步 ready')
    const duplicateForm = new FormData()
    duplicateForm.append('file', new Blob(['ticket_id,amount\nT-1,10\n'], { type: 'text/csv' }), 'smoke.csv')
    const duplicate = await request('POST', '/attachments', { token, form: duplicateForm })
    assert(duplicate.response.status === 201, '重复上传复用附件')
    assert(duplicate.data.duplicate === true, 'duplicate=true')
    const attached = await request('GET', `/attachments/${created.attachmentId}`, { token })
    assert(attached.data.filename === 'smoke.csv', '附件详情正确')
    const download = await fetch(`${BASE_URL}/attachments/${created.attachmentId}/download`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    assert(download.status === 200, '受控下载 HTTP 200')
    const downloadText = await download.text()
    assert(downloadText.includes('T-1'), '下载内容正确')

    log('MCP 服务器')
    const mcpCreated = await request('POST', '/mcp/servers', {
      token,
      body: {
        name: `Smoke MCP ${STAMP}`,
        slug: `smoke-mcp-${STAMP}`.slice(0, 60),
        url: 'https://example.com/mcp',
        transport: 'streamable_http',
      },
    })
    assert(mcpCreated.response.status === 201, `POST /mcp/servers HTTP ${mcpCreated.response.status}`)
    created.mcpServerId = mcpCreated.data.id
    assert(mcpCreated.data.scope === 'user', 'MCP scope=user')
    const mcpList = await request('GET', '/mcp/servers', { token })
    assert(mcpList.response.status === 200, 'GET /mcp/servers HTTP 200')
    assert(typeof mcpList.data.stats?.total === 'number', 'MCP stats 存在')
    const checked = await request('POST', `/mcp/servers/${created.mcpServerId}/check`, { token })
    assert(checked.response.status === 200, 'POST /mcp/servers/{id}/check HTTP 200')
    assert(
      ['unknown', 'healthy', 'unhealthy', 'disabled'].includes(checked.data.health_status),
      `检查返回健康枚举：${checked.data.health_status}`,
    )
    const available = await request('GET', '/mcp/available', { token })
    assert(available.response.status === 200, 'GET /mcp/available HTTP 200')
    assert(Array.isArray(available.data.items), 'available 返回 items')

    log('审批空列表')
    const approvals = await request('GET', '/approvals?status=pending', { token })
    assert(approvals.response.status === 200, 'GET /approvals HTTP 200')
    assert(Array.isArray(approvals.data.items), '审批 items 是数组')
    assert(typeof approvals.data.stats?.pending === 'number', '审批 stats.pending 存在')

    log('对话 SSE：显式技能 + 附件 + 记忆工具')
    const clientMessageId = `m15-smoke-${STAMP}`
    const streamResponse = await fetch(`${BASE_URL}/chat/stream`, {
      method: 'POST',
      headers: {
        Accept: 'text/event-stream',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        message: '用本轮技能回答：冒烟测试通过了吗？并记住：以后回答先给结论。',
        client_message_id: clientMessageId,
        skills: [created.skillId],
        attachments: [created.attachmentId],
      }),
    })
    const runId = streamResponse.headers.get('x-run-id')
    const events = await readSse(streamResponse)
    const names = events.map((item) => item.event)
    const done = events.find((item) => item.event === 'message.done')?.data
    created.conversationId =
      events.find((item) => item.event === 'conversation.created')?.data?.conversation_id ??
      events.find((item) => item.event === 'run.started')?.data?.conversation_id ??
      null
    assert(uuidLike(runId), 'X-Run-ID 可读')
    assert(names.includes('skill.activated'), '收到 skill.activated')
    assert(names.includes('tool.start'), '收到 tool.start（save_memory）')
    assert(names.includes('tool.result'), '收到 tool.result')
    assert(names.at(-1) === 'message.done', '最后事件是 message.done')
    assert(done?.finish_reason === 'stop', `finish_reason=stop（实际 ${done?.finish_reason}）`)
    const skillIndex = names.indexOf('skill.activated')
    const deltaIndex = names.indexOf('message.delta')
    assert(skillIndex >= 0 && deltaIndex > skillIndex, 'skill.activated 出现在首个 delta 之前')

    const runEvents = await request('GET', `/runs/${runId}/events?limit=200`, { token })
    assert(runEvents.response.status === 200, 'GET /runs/{id}/events HTTP 200')
    assert(
      runEvents.data.items.some(
        (item) => item.payload?.skill_id === created.skillId,
      ),
      '运行事件回放包含本轮技能',
    )

    log('历史消息快照')
    const messages = await request('GET', `/conversations/${created.conversationId}/messages?limit=10`, {
      token,
    })
    const userMessage = messages.data.items.find(
      (item) => item.role === 'user' && item.client_message_id === clientMessageId,
    )
    assert(Boolean(userMessage), '按 client_message_id 找到用户消息')
    assert(userMessage.attachments?.[0]?.filename === 'smoke.csv', '用户消息保存附件快照')
    assert(
      Array.isArray(userMessage.capabilities?.skills) &&
        userMessage.capabilities.skills.includes(created.skillId),
      '用户消息 capabilities.skills 保留本轮技能',
    )

    const toolInvocations = await request('GET', `/runs/${runId}/events?types=tool&limit=50`, {
      token,
    })
    assert(toolInvocations.response.status === 200, '运行事件可按类型过滤')

    log('结果')
    console.log(`\n通过 ${passed} 项断言；创建数据将在清理阶段删除。`)
  } catch (error) {
    failures.push(error.message)
    console.error(`\n✗ ${error.message}`)
  } finally {
    await cleanup(token)
  }

  if (failures.length > 0) {
    console.error(`\n失败 ${failures.length} 项`)
    process.exitCode = 1
  }
}

await main()
