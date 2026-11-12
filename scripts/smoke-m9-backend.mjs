#!/usr/bin/env node
/**
 * 真实后端 M9 工作流契约冒烟：workflows 七端点 + 运行链路（workflow.step 帧）。
 *
 * ⚠️ 需后端 M9 T6–T9 交付后运行；当前后端 `capabilities.workflows` 仍 false 时
 * CRUD 可验、运行断言会 409 `workflow_disabled`（脚本会自动降级为验证 409 语义）。
 *
 * 用法：
 *   node scripts/smoke-m9-backend.mjs
 *   SMOKE_BASE_URL=http://127.0.0.1:8000/api/v1 node scripts/smoke-m9-backend.mjs
 *
 * 前置：
 *   - 后端已启动（默认 127.0.0.1:8000）；
 *   - `dev@example.com` 为管理员（scripts/seed_dev_account.py 提权后的开发账号）；
 *   - 运行断言依赖 LLM 真实调用工具（检索步骤命中 `search_knowledge` 后发
 *     `workflow.step`），LLM key / embedding 不可用时该段会失败。
 *
 * 原则：
 *   - 模板一律带 `[smoke-m9]` 前缀，脚本开头与结尾各清理一次（幂等，不留痕迹）；
 *   - 运行产生的会话与 run 不做删除（与既有 smoke 脚本口径一致）；
 *   - 不为让脚本变绿而放宽断言语义。
 */

const BASE_URL = (process.env.SMOKE_BASE_URL ?? 'http://127.0.0.1:8000/api/v1').replace(/\/$/, '')
const ADMIN_EMAIL = process.env.SMOKE_EMAIL ?? 'dev@example.com'
const ADMIN_PASSWORD = process.env.SMOKE_PASSWORD ?? 'dev-password-123'
const TEMPLATE_PREFIX = '[smoke-m9]'
const STREAM_TIMEOUT_MS = Number(process.env.SMOKE_STREAM_TIMEOUT ?? 90_000)

let passed = 0
let failed = 0
const failures = []

function assert(condition, message) {
  if (!condition) throw new Error(message)
  passed += 1
}

async function api(path, { method = 'GET', token, body } = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    // GET 不允许携带 body；oxlint unicorn/no-invalid-fetch-options 会拦截。
    ...(method !== 'GET' && body ? { body: JSON.stringify(body) } : {}),
  })
  const text = await response.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = text
  }
  return { status: response.status, data }
}

async function login(email, password) {
  const result = await api('/auth/login', { method: 'POST', body: { email, password } })
  assert(
    result.status === 200,
    `登录 ${email} 失败：${result.status} ${JSON.stringify(result.data)}`,
  )
  return result.data.access_token
}

/** 三步演示模板：检索 → a2a → 审批（审批步骤强制审批集合）。 */
function threeStepPayload() {
  return {
    name: `${TEMPLATE_PREFIX} 三步模板 ${Date.now()}`,
    description: 'smoke:m9 临时模板，验证 CRUD 与运行链路后删除',
    steps: [
      {
        id: 's1',
        type: 'knowledge_search',
        title: '检索工单规范',
        instruction: '检索本周工单处理规范与复盘文档',
      },
      { id: 's2', type: 'a2a', title: '数据核对', instruction: '交给数据核对智能体核对数字' },
      {
        id: 's3',
        type: 'approval',
        title: '审批发布',
        config: { tools: ['send_message'] },
      },
    ],
  }
}

/** 按 name 前缀清理脚本自建模板（幂等：开头清残留、结尾清本次）。 */
async function cleanupSmokeTemplates(token) {
  const list = await api('/workflows?limit=100', { token })
  if (list.status !== 200) return
  for (const row of list.data.items ?? []) {
    if (row.scope === 'user' && row.name?.startsWith(TEMPLATE_PREFIX)) {
      await api(`/workflows/${row.id}`, { method: 'DELETE', token })
    }
  }
}

/**
 * 读一段 SSE 流，直到终态帧或审批挂起后恢复完成。
 * 返回 { events, workflowSteps, approvalIds }：events 为事件名序列，
 * workflowSteps 为 workflow.step 帧的 data 列表。
 */
async function readChatStream(token, payload) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), STREAM_TIMEOUT_MS)
  const events = []
  const workflowSteps = []
  const approvalIds = []
  try {
    const response = await fetch(`${BASE_URL}/chat/stream`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Accept: 'text/event-stream',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    })
    assert(response.status === 200, `chat/stream 期望 200，实际 ${response.status}`)

    let buffer = ''
    let eventName = ''
    let dataLines = []
    const flush = async () => {
      if (!eventName) return
      const data = dataLines.length > 0 ? JSON.parse(dataLines.join('\n')) : {}
      events.push(eventName)
      if (eventName === 'workflow.step') workflowSteps.push(data)
      if (eventName === 'approval.required' && data.approval_id) {
        approvalIds.push(data.approval_id)
        // 审批挂起是非终态：批准后 run.resumed 继续流。
        const decision = await api(`/approvals/${data.approval_id}/decision`, {
          method: 'POST',
          token,
          body: { decision: 'approve', note: 'smoke-m9 自动批准' },
        })
        assert(
          decision.status === 200,
          `审批决策失败：${decision.status} ${JSON.stringify(decision.data)}`,
        )
      }
      eventName = ''
      dataLines = []
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let done = false
    while (!done) {
      const { value, done: streamDone } = await reader.read()
      done = streamDone
      if (value) buffer += decoder.decode(value, { stream: true })
      let index
      while ((index = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, index).replace(/\r$/, '')
        buffer = buffer.slice(index + 1)
        if (line === '') {
          await flush()
        } else if (line.startsWith('event:')) {
          eventName = line.slice(6).trim()
        } else if (line.startsWith('data:')) {
          dataLines.push(line.slice(5).trim())
        }
      }
      if (events.includes('message.done') || events.includes('run.interrupted')) break
    }
  } finally {
    clearTimeout(timer)
  }
  return { events, workflowSteps, approvalIds }
}

async function main() {
  // 1. 管理员登录 + /auth/me 校验角色。
  const token = await login(ADMIN_EMAIL, ADMIN_PASSWORD)
  const me = await api('/auth/me', { token })
  assert(me.status === 200, `GET /auth/me 期望 200，实际 ${me.status}`)
  assert(me.data?.role === 'admin', `${ADMIN_EMAIL} 不是管理员（role=${me.data?.role}）`)
  console.log(`✓ ${ADMIN_EMAIL} 登录且 role=admin`)

  // 2. 能力开关：false 时 CRUD 照验，运行断言降级为 409 语义。
  const info = await api('/system/info', { token })
  assert(info.status === 200, `GET /system/info 期望 200，实际 ${info.status}`)
  const workflowsEnabled = info.data?.capabilities?.workflows === true
  console.log(
    `✓ capabilities.workflows=${info.data?.capabilities?.workflows}（${workflowsEnabled ? '全链路断言' : 'CRUD + 409 降级断言'}）`,
  )

  // 3. 清理残留（上一次运行的 [smoke-m9] 模板）。
  await cleanupSmokeTemplates(token)

  // 4. CRUD：创建 3 步模板（201 + scope/user/version/enabled 契约字段）。
  const payload = threeStepPayload()
  const created = await api('/workflows', { method: 'POST', token, body: payload })
  assert(created.status === 201, `POST /workflows 期望 201，实际 ${created.status}`)
  const wf = created.data
  assert(wf.scope === 'user', `创建返回 scope 不是 user：${wf.scope}`)
  assert(wf.version === 1, `创建返回 version 不是 1：${wf.version}`)
  assert(wf.enabled === true, `创建返回 enabled 不是 true：${wf.enabled}`)
  assert(Array.isArray(wf.steps) && wf.steps.length === 3, '创建返回 steps 不是 3 步')
  assert(
    typeof wf.created_at === 'string' && typeof wf.updated_at === 'string',
    '缺少 created_at/updated_at',
  )
  console.log(`✓ POST /workflows：201，scope=user、version=1、enabled=true、3 步（id=${wf.id}）`)

  // 5. 详情 + 列表：详情同形；列表游标分页结构齐全并包含新建模板。
  const detail = await api(`/workflows/${wf.id}`, { token })
  assert(detail.status === 200 && detail.data?.id === wf.id, `GET /workflows/{id} 失败：${detail.status}`)
  assert(detail.data.version === 1, '详情 version 与创建不符')
  const list = await api('/workflows?limit=100', { token })
  assert(list.status === 200, `GET /workflows 期望 200，实际 ${list.status}`)
  assert(Array.isArray(list.data.items), '列表缺少 items 数组')
  assert(typeof list.data.has_more === 'boolean', '列表缺少 has_more')
  assert(
    list.data.items.some((row) => row.id === wf.id),
    '列表未包含新建模板',
  )
  console.log(`✓ GET 详情同形 + GET 列表包含新建（${list.data.items.length} 行，has_more=${list.data.has_more}）`)

  // 6. PATCH：描述更新 → version +1；其余字段保持。
  const patched = await api(`/workflows/${wf.id}`, {
    method: 'PATCH',
    token,
    body: { description: `${TEMPLATE_PREFIX} 更新后的描述` },
  })
  assert(patched.status === 200, `PATCH 期望 200，实际 ${patched.status}`)
  assert(patched.data.version === 2, `PATCH 后 version 不是 2：${patched.data.version}`)
  assert(patched.data.description === `${TEMPLATE_PREFIX} 更新后的描述`, 'PATCH 描述未生效')
  console.log('✓ PATCH /workflows/{id}：version 1→2，描述已更新')

  // 7. 启停：false → true 往返（enabled 位变化、version 不变）。
  const disabled = await api(`/workflows/${wf.id}/enabled`, {
    method: 'PUT',
    token,
    body: { enabled: false },
  })
  assert(disabled.status === 200 && disabled.data.enabled === false, `启停失败：${disabled.status}`)
  assert(disabled.data.version === 2, '启停不应改变 version')
  const reEnabled = await api(`/workflows/${wf.id}/enabled`, {
    method: 'PUT',
    token,
    body: { enabled: true },
  })
  assert(reEnabled.status === 200 && reEnabled.data.enabled === true, '恢复启用失败')
  console.log('✓ PUT /workflows/{id}/enabled：false→true 往返，version 保持 2')

  // 8. 运行前历史：空 items。
  const runsBefore = await api(`/workflows/${wf.id}/runs`, { token })
  assert(runsBefore.status === 200, `GET runs 期望 200，实际 ${runsBefore.status}`)
  assert(Array.isArray(runsBefore.data.items) && runsBefore.data.items.length === 0, '运行前历史应为一页空 items')
  console.log('✓ GET /workflows/{id}/runs：运行前为空')

  // 9. 校验语义：tool 步骤缺 config.tools → 422 workflow_steps_invalid。
  const invalid = await api('/workflows', {
    method: 'POST',
    token,
    body: {
      name: `${TEMPLATE_PREFIX} 非法步骤`,
      steps: [{ id: 's1', type: 'tool', title: '缺工具清单' }],
    },
  })
  assert(invalid.status === 422, `非法 steps 期望 422，实际 ${invalid.status}`)
  assert(
    invalid.data?.error?.code === 'workflow_steps_invalid',
    `422 code 不是 workflow_steps_invalid：${JSON.stringify(invalid.data)}`,
  )
  console.log('✓ POST 非法 steps（tool 缺 config.tools）→ 422 workflow_steps_invalid')

  // 10. 404 语义：不存在（格式合法）uuid 详情/更新/删除均 404，不泄露存在性。
  const missingId = '00000000-0000-4000-8000-000000000000'
  for (const [method, path, body] of [
    ['GET', `/workflows/${missingId}`, undefined],
    ['PATCH', `/workflows/${missingId}`, { name: 'x' }],
    ['DELETE', `/workflows/${missingId}`, undefined],
  ]) {
    const missing = await api(path, { method, token, body })
    assert(missing.status === 404, `${method} ${path} 期望 404，实际 ${missing.status}`)
  }
  console.log('✓ 不存在 id 的 GET/PATCH/DELETE 均 404（他人模板同口径，不泄露存在性）')

  // 11. 运行链路（运行前重取详情：PATCH 已把 version 升到 2，带过期版本会 409）。
  if (workflowsEnabled) {
    const latest = await api(`/workflows/${wf.id}`, { token })
    assert(latest.status === 200, `运行前重取详情期望 200，实际 ${latest.status}`)
    const currentVersion = latest.data.version
    const stream = await readChatStream(token, {
      message: '检索本周工单处理规范，并总结要点',
      workflow_id: wf.id,
      workflow_version: currentVersion,
    })
    assert(stream.events.includes('run.started'), '缺少 run.started 帧')
    assert(stream.workflowSteps.length > 0, '未收到 workflow.step 帧（检查 LLM 是否真实调用工具）')
    for (const step of stream.workflowSteps) {
      for (const key of ['step_id', 'step_type', 'step_title', 'tool', 'status']) {
        assert(key in step, `workflow.step 缺少字段 ${key}：${JSON.stringify(step)}`)
      }
    }
    assert(
      stream.workflowSteps.some((step) => step.step_type === 'knowledge_search'),
      '未收到检索步骤的 workflow.step',
    )
    console.log(
      `✓ chat/stream 带 workflow_id：run.started → ${stream.workflowSteps.length} 帧 workflow.step（五键齐全，含检索步骤）→ ${stream.events.includes('message.done') ? 'message.done' : '流已结束'}`,
    )

    // 运行后历史：发起即登记映射行（status=running，终态由 T4 同步追平）。
    const runsAfter = await api(`/workflows/${wf.id}/runs`, { token })
    assert(runsAfter.status === 200, `运行后 GET runs 期望 200，实际 ${runsAfter.status}`)
    assert(runsAfter.data.items.length >= 1, '运行后历史仍为空（workflow_runs 未登记）')
    const runRow = runsAfter.data.items[0]
    assert(typeof runRow.run_id === 'string' && runRow.run_id, '历史行缺少 run_id')
    assert(typeof runRow.status === 'string', '历史行缺少 status')
    for (const key of ['run_status', 'run_finished_at', 'run_duration_ms', 'run_error_code']) {
      assert(key in runRow, `历史行缺少终态快照字段 ${key}：${JSON.stringify(runRow)}`)
    }
    console.log(
      `✓ 运行后 GET /workflows/{id}/runs：${runsAfter.data.items.length} 行（run_id=${runRow.run_id.slice(0, 8)}…，status=${runRow.status}）`,
    )

    // 版本冲突：携带过期 version → 409 workflow_version_conflict。
    const conflict = await api('/chat/stream', {
      method: 'POST',
      token,
      body: { message: '版本冲突探测', workflow_id: wf.id, workflow_version: 99 },
    })
    assert(conflict.status === 409, `过期 version 期望 409，实际 ${conflict.status}`)
    assert(
      conflict.data?.error?.code === 'workflow_version_conflict',
      `409 code 不是 workflow_version_conflict：${JSON.stringify(conflict.data)}`,
    )
    console.log('✓ 过期 workflow_version → 409 workflow_version_conflict')

    // 停用模板：再发消息 → 409 workflow_disabled。
    await api(`/workflows/${wf.id}/enabled`, { method: 'PUT', token, body: { enabled: false } })
    const forbidden = await api('/chat/stream', {
      method: 'POST',
      token,
      body: { message: '停用模板探测', workflow_id: wf.id, workflow_version: currentVersion },
    })
    assert(forbidden.status === 409, `停用模板发消息期望 409，实际 ${forbidden.status}`)
    assert(
      forbidden.data?.error?.code === 'workflow_disabled',
      `409 code 不是 workflow_disabled：${JSON.stringify(forbidden.data)}`,
    )
    console.log('✓ 停用模板 chat/stream → 409 workflow_disabled')

    // 无效 workflow_id → 404 not_found（不泄露存在性）。
    const notFound = await api('/chat/stream', {
      method: 'POST',
      token,
      body: { message: '无效模板探测', workflow_id: missingId },
    })
    assert(notFound.status === 404, `无效 workflow_id 期望 404，实际 ${notFound.status}`)
    assert(
      notFound.data?.error?.code === 'not_found',
      `404 code 不是 not_found：${JSON.stringify(notFound.data)}`,
    )
    console.log('✓ 无效 workflow_id → 404 not_found')
  } else {
    // 能力开关关闭：CRUD 已验，运行断言降级为 409 workflow_disabled。
    const gated = await api('/chat/stream', {
      method: 'POST',
      token,
      body: { message: '能力关闭探测', workflow_id: wf.id, workflow_version: wf.version },
    })
    assert(gated.status === 409, `workflows=false 发消息期望 409，实际 ${gated.status}`)
    assert(
      gated.data?.error?.code === 'workflow_disabled',
      `409 code 不是 workflow_disabled：${JSON.stringify(gated.data)}`,
    )
    console.log('✓ capabilities.workflows=false → chat/stream 409 workflow_disabled（等待后端 M9 T6–T9）')
  }

  // 12. DELETE：204 后详情 404；workflow_runs 随 FK CASCADE 一并清理。
  const removed = await api(`/workflows/${wf.id}`, { method: 'DELETE', token })
  assert(removed.status === 204, `DELETE 期望 204，实际 ${removed.status}`)
  const gone = await api(`/workflows/${wf.id}`, { token })
  assert(gone.status === 404, `删除后 GET 期望 404，实际 ${gone.status}`)
  const runsGone = await api(`/workflows/${wf.id}/runs`, { token })
  assert(runsGone.status === 404, `删除后 GET runs 期望 404，实际 ${runsGone.status}`)
  console.log('✓ DELETE /workflows/{id}：204，详情与运行历史随后 404（runs 行随 CASCADE 删除）')

  // 13. 收尾清理（幂等兜底）。
  await cleanupSmokeTemplates(token)
  console.log('✓ 清理 [smoke-m9] 模板完成，不留脚本痕迹')
}

main()
  .catch((error) => {
    failed += 1
    failures.push(error instanceof Error ? error.message : String(error))
    console.error(`\n✗ ${error instanceof Error ? error.message : error}`)
  })
  .finally(() => {
    console.log(`\n结果：${passed} 项通过，${failed} 项失败`)
    if (failures.length > 0) {
      for (const message of failures) console.error(`- ${message}`)
      process.exitCode = 1
    }
  })
