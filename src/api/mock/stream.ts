import type {
  ChatEventName,
  ChatMessage,
  ChatStreamRequest,
  Citation,
  Workflow,
  WorkflowStep,
} from '@/types'

import { ApiRequestError } from '@/api/client'

import { mockDb } from './db'

export interface MockStreamHandlers {
  onOpen?: (runId: string | null) => void
  onEvent: (event: ChatEventName, data: unknown) => void
  onError: (error: Error) => void
  /** M7：服务端正常关闭（续流回放完、run 终态）时触发。 */
  onClose?: () => void
  signal: AbortSignal
}

interface MockStreamOptions {
  /** 帧间隔，测试可设为 0。 */
  frameDelay?: number
}

interface Frame {
  event: ChatEventName
  data: Record<string, unknown>
  delay?: number
}

const CITATIONS: Citation[] = [
  {
    index: 1,
    document_id: '99999999-9999-4999-8999-999999999999',
    chunk_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    title: 'Q3 客服复盘 v2',
    category: '客服',
    score: 0.94,
    updated_at: '2026-09-30T00:00:00Z',
  },
]

function abortError(): Error {
  const error = new Error('Aborted')
  error.name = 'AbortError'
  return error
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(abortError())
      return
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    function onAbort(): void {
      clearTimeout(timer)
      reject(abortError())
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

function resolveConversation(payload: ChatStreamRequest): {
  id: string
  title: string
  created: boolean
} {
  if (payload.conversation_id) {
    const existing = mockDb.getConversation(payload.conversation_id)
    if (existing) {
      return { id: existing.id, title: existing.title, created: false }
    }
  }
  const title = payload.message.trim().slice(0, 20) || '新会话'
  const conversation = mockDb.createConversation(title)
  return { id: conversation.id, title, created: true }
}

function baseCapabilities(payload: ChatStreamRequest): ChatMessage['capabilities'] {
  return {
    skills: payload.skills ?? [],
    mcp_servers: payload.mcp_servers ?? [],
    mcp_tools: payload.mcp_tools ?? [],
    knowledge_categories: payload.knowledge_categories ?? [],
    workflow_id: payload.workflow_id ?? null,
  }
}

/** M9：workflow.step 的 tool 字段——步骤对应的演示工具名。 */
function workflowStepTool(step: WorkflowStep): string {
  if (step.type === 'knowledge_search') return 'search_knowledge'
  if (step.type === 'tool' || step.type === 'approval') {
    return step.config?.tools?.[0] ?? ''
  }
  if (step.type === 'a2a') return 'a2a'
  return ''
}

/**
 * M9：按步骤生成 workflow.step 帧；payload 恰为 T1 WorkflowStepData 五字段
 * （status 默认 'ok'，run_id/ts/seq 由 emit 统一追加）。
 */
function workflowStepFrames(steps: WorkflowStep[], status: 'ok' | 'rejected' = 'ok'): Frame[] {
  return steps.map((step) => ({
    event: 'workflow.step',
    data: {
      step_id: step.id,
      step_type: step.type,
      step_title: step.title ?? '',
      tool: workflowStepTool(step),
      status,
    },
  }))
}

/** M9：校验选定工作流——无效 id 404、停用模板 409（与真实后端错误语义一致）。 */
function requireEnabledWorkflow(id: string): Workflow {
  const workflow = mockDb.getWorkflow(id)
  if (!workflow) {
    throw new ApiRequestError('工作流不存在', { code: 'not_found', status: 404 })
  }
  if (!workflow.enabled) {
    throw new ApiRequestError('工作流已停用，无法发起运行', {
      code: 'workflow_disabled',
      status: 409,
    })
  }
  return workflow
}

export async function mockChatStream(
  payload: ChatStreamRequest,
  handlers: MockStreamHandlers,
  options: MockStreamOptions = {},
): Promise<void> {
  const frameDelay = options.frameDelay ?? 90
  const signal = handlers.signal
  const conversation = resolveConversation(payload)
  const runId = crypto.randomUUID()
  const userMessageId = crypto.randomUUID()
  const assistantMessageId = crypto.randomUUID()
  const clientMessageId = payload.client_message_id ?? crypto.randomUUID()
  const isApproval = /审批|发布|slack|写操作/i.test(payload.message)
  const isError = /错误|失败|error/i.test(payload.message)
  // M9：选定的工作流模板（无效 id / 停用模板在校验处直接抛错，不登记 run）。
  const workflow = payload.workflow_id ? requireEnabledWorkflow(payload.workflow_id) : null

  // M7：登记 run 与事件，使 `GET /runs/{id}` 和续流端点对 mock 新产生的 run 可达。
  mockDb.upsertRun({
    id: runId,
    conversation_id: conversation.id,
    status: 'running',
    source: 'chat',
    model: payload.model ?? 'deepseek-chat',
    reasoning_effort: payload.reasoning_effort ?? 'low',
    workflow: workflow
      ? {
          id: workflow.id,
          name: workflow.name,
          version: payload.workflow_version ?? workflow.version,
        }
      : null,
    capabilities: baseCapabilities(payload),
    usage: null,
    started_at: new Date().toISOString(),
    finished_at: null,
    duration_ms: null,
    active_duration_ms: null,
    first_token_ms: null,
    pending: { kind: null, approval_id: null, task_id: null },
    message_ids: { user: userMessageId, assistant: assistantMessageId },
    agents: [],
    error: null,
  })

  let seq = 0
  function emit(event: ChatEventName, data: Record<string, unknown>): void {
    seq += 1
    const frame = {
      ...data,
      run_id: runId,
      ts: new Date().toISOString(),
      seq,
    }
    // 与后端一致：delta 不落库；其余事件写回放存储并广播给续流订阅者。
    if (event !== 'message.delta' && event !== 'reasoning.delta') {
      mockDb.appendRunEvent(runId, event, frame)
    }
    if (event === 'message.done') {
      const finish = typeof data.finish_reason === 'string' ? data.finish_reason : 'stop'
      mockDb.setRunStatus(
        runId,
        finish === 'error' ? 'failed' : finish === 'canceled' ? 'canceled' : 'succeeded',
      )
    } else if (event === 'run.interrupted') {
      mockDb.setRunStatus(runId, 'interrupted')
    } else if (event === 'run.resumed') {
      mockDb.setRunStatus(runId, 'running')
    }
    handlers.onEvent(event, frame)
  }

  async function play(frames: Frame[]): Promise<void> {
    for (const frame of frames) {
      if (signal.aborted) throw abortError()
      await sleep(frame.delay ?? frameDelay, signal)
      if (signal.aborted) throw abortError()
      emit(frame.event, frame.data)
    }
  }

  function waitForDecision(approvalId: string): Promise<'approved' | 'rejected'> {
    return new Promise((resolve, reject) => {
      if (signal.aborted) {
        reject(abortError())
        return
      }
      const unsubscribe = mockDb.onApprovalResolved((id, decision) => {
        if (id !== approvalId) return
        cleanup()
        resolve(decision)
      })
      function onAbort(): void {
        cleanup()
        reject(abortError())
      }
      function cleanup(): void {
        unsubscribe()
        signal.removeEventListener('abort', onAbort)
      }
      signal.addEventListener('abort', onAbort, { once: true })
    })
  }

  function saveUserMessage(): void {
    const message: ChatMessage = {
      id: userMessageId,
      role: 'user',
      content: payload.message,
      content_type: 'markdown',
      run_id: runId,
      client_message_id: clientMessageId,
      status: 'completed',
      citations: [],
      attachments: mockDb.attachToConversation(payload.attachments ?? [], conversation.id),
      capabilities: baseCapabilities(payload),
      artifacts: [],
      usage: null,
      error: null,
      created_at: new Date().toISOString(),
    }
    mockDb.appendMessage(conversation.id, message)
  }

  function saveAssistantMessage(content: string, finishReason: string): void {
    const message: ChatMessage = {
      id: assistantMessageId,
      role: 'assistant',
      content,
      content_type: 'markdown',
      run_id: runId,
      client_message_id: null,
      status:
        finishReason === 'stop' ? 'completed' : finishReason === 'error' ? 'failed' : 'canceled',
      citations: isError ? [] : CITATIONS,
      attachments: [],
      capabilities: baseCapabilities(payload),
      artifacts: [],
      usage: { input_tokens: 1280, output_tokens: 320, reasoning_tokens: 96, total_tokens: 1600 },
      error: isError
        ? { code: 'mock_stream_error', message: '演示用错误：模型返回异常。', retryable: true }
        : null,
      created_at: new Date().toISOString(),
    }
    mockDb.appendMessage(conversation.id, message)
  }

  try {
    handlers.onOpen?.(runId)

    const prefix: Frame[] = []
    if (conversation.created) {
      prefix.push({
        event: 'conversation.created',
        data: { conversation_id: conversation.id, title: conversation.title },
        delay: 0,
      })
    }
    prefix.push(
      {
        event: 'run.started',
        data: {
          run_id: runId,
          conversation_id: conversation.id,
          user_message_id: userMessageId,
          client_message_id: clientMessageId,
          model: payload.model ?? 'deepseek-chat',
          reasoning_effort: payload.reasoning_effort ?? 'low',
          workflow_id: payload.workflow_id ?? null,
          workflow_version: payload.workflow_version ?? null,
        },
        delay: 0,
      },
      {
        event: 'message.created',
        data: {
          message_id: userMessageId,
          role: 'user',
          client_message_id: clientMessageId,
          created_at: new Date().toISOString(),
        },
        delay: 40,
      },
      {
        event: 'message.started',
        data: {
          message_id: assistantMessageId,
          role: 'assistant',
          started_at: new Date().toISOString(),
        },
        delay: 40,
      },
      {
        event: 'reasoning.delta',
        data: {
          message_id: assistantMessageId,
          delta: '先确认问题范围，再检索知识库里的 Q3 复盘。',
        },
        delay: 100,
      },
      {
        event: 'reasoning.delta',
        data: {
          message_id: assistantMessageId,
          delta: '统计口径需要固定为按创建时间归入 Q3。',
        },
        delay: 80,
      },
      {
        event: 'reasoning.done',
        data: {
          message_id: assistantMessageId,
          duration_ms: 1200,
          tokens: 128,
          summary: '确认口径 → 检索复盘 → 组织回答；外部写操作前必须审批。',
        },
        delay: 60,
      },
    )

    // 本轮显式选择的技能：首个 delta 前激活，并写入消息快照。
    for (const skillId of payload.skills ?? []) {
      const skill = mockDb.getSkill(skillId)
      if (!skill) continue
      prefix.push({
        event: 'skill.activated',
        data: {
          skill_id: skill.id,
          slug: skill.slug,
          name: skill.name,
          scope: skill.scope,
          source: 'explicit',
          description: skill.description,
          estimated_tokens: skill.estimated_tokens,
          duration_ms: 0,
        },
        delay: 40,
      })
    }
    await play(prefix)
    saveUserMessage()

    if (isError) {
      await play([
        {
          event: 'tool.start',
          data: {
            tool_call_id: 'call_error',
            tool: 'search_knowledge',
            display_name: '知识检索',
            args: { query: payload.message },
            args_preview: `query=${payload.message.slice(0, 40)}`,
            source: 'knowledge',
          },
        },
        {
          event: 'error',
          data: {
            code: 'model_error',
            message: '演示用错误：模型返回异常，请稍后重试。',
            retryable: true,
          },
        },
      ])
      emit('message.done', {
        run_id: runId,
        conversation_id: conversation.id,
        message_id: assistantMessageId,
        usage: { input_tokens: 320, output_tokens: 0, reasoning_tokens: 0, total_tokens: 320 },
        finish_reason: 'error',
        model: payload.model ?? 'deepseek-chat',
        first_token_ms: null,
        duration_ms: 800,
        active_duration_ms: 800,
        citations: [],
      })
      saveAssistantMessage('', 'error')
      return
    }

    const answer =
      '## 结论\n\nQ3 共收到 **128 条**工单，退款与物流类合计占 61%。\n\n' +
      '### 建议\n\n1. 先更新售后 FAQ 的退款时限；\n2. 把「吊牌保留」写进快捷回复；\n3. 发布前由 data-analyst 复核数字。'

    await play([
      {
        event: 'tool.start',
        data: {
          tool_call_id: 'call_search_1',
          tool: 'search_knowledge',
          display_name: '知识检索',
          args: { query: 'Q3 客服复盘 · 工单分类口径', top_k: 5 },
          args_preview: 'query=Q3 客服复盘 · 工单分类口径, top_k=5',
          source: 'knowledge',
        },
        delay: 120,
      },
      {
        event: 'tool.result',
        data: {
          tool_call_id: 'call_search_1',
          status: 'ok',
          summary: '命中 3 个片段',
          result_preview: 'Q3 客服复盘 v2 (0.94)、工单分类规范 v3 (0.92)、售后话术库 (0.81)',
          duration_ms: 800,
          source: 'knowledge',
          citations: CITATIONS,
        },
        delay: 260,
      },
    ])

    if (workflow) {
      if (isApproval) {
        // 审批脚本：检索/工具步骤紧跟 search 的 tool.result 之后发（后端契约）。
        const toolSteps = workflow.steps.filter(
          (step) => step.type === 'knowledge_search' || step.type === 'tool',
        )
        if (toolSteps.length > 0) await play(workflowStepFrames(toolSteps))
      } else {
        // 普通脚本：无审批中断，非审批步骤在工具阶段一并逐条演示。
        await play(workflowStepFrames(workflow.steps.filter((step) => step.type !== 'approval')))
      }
    }

    if (!isApproval) {
      // 显式选择 MCP：模拟一次工具调用；写工具仍需要审批，这里只演示只读/显式工具。
      const selectedServer = (payload.mcp_servers ?? [])
        .map((id) => mockDb.getMcpServer(id))
        .find((item) => item !== null)
      const selectedTool = (payload.mcp_tools ?? [])
        .map((id) => mockDb.listMcpTools(selectedServer?.id ?? '')?.find((tool) => tool.id === id))
        .find((item) => item !== undefined)
      if (selectedServer || selectedTool) {
        const toolName = selectedTool?.exposed_name ?? `mcp__${selectedServer?.slug ?? 'mcp'}__conversations_info`
        const displayName = selectedTool?.name ?? 'conversations.info'
        await play([
          {
            event: 'tool.start',
            data: {
              tool_call_id: 'call_mcp_1',
              tool: toolName,
              display_name: displayName,
              args: { channel: '#support-weekly' },
              args_preview: 'channel=#support-weekly',
              source: 'mcp',
              source_id: selectedServer?.id ?? null,
              server: selectedServer?.name ?? 'MCP',
              risk: selectedTool?.risk ?? 'read',
              requires_approval: selectedTool?.requires_approval ?? false,
            },
            delay: 120,
          },
          {
            event: 'tool.result',
            data: {
              tool_call_id: 'call_mcp_1',
              status: 'ok',
              summary: `已通过 ${selectedServer?.name ?? 'MCP'} 读取频道信息`,
              result_preview: 'members=12, topic=支持周报',
              duration_ms: 320,
              source: 'mcp',
              metadata: { transport: selectedServer?.transport ?? 'streamable_http' },
            },
            delay: 220,
          },
        ])
      }

      // 远程 Agent 演示：提到核对/远程/智能体时插入一条已完成任务。
      if (/核对|远程|智能体|data-analyst|代码审查/i.test(payload.message)) {
        const agent = mockDb.agents[0]
        const taskId = crypto.randomUUID()
        await play([
          {
            event: 'a2a.task',
            data: {
              task_id: taskId,
              a2a_task_id: 'task_mock_1',
              agent: agent?.slug ?? 'data-analyst',
              agent_detail: agent
                ? { id: agent.id, slug: agent.slug, name: agent.name }
                : null,
              state: 'working',
              progress: 0.4,
              request_summary: payload.message.slice(0, 60),
            },
            delay: 160,
          },
          {
            event: 'a2a.task',
            data: {
              task_id: taskId,
              a2a_task_id: 'task_mock_1',
              agent: agent?.slug ?? 'data-analyst',
              agent_detail: agent
                ? { id: agent.id, slug: agent.slug, name: agent.name }
                : null,
              state: 'completed',
              progress: 1,
              result_summary: '数字与来源核对通过',
              duration_ms: 900,
            },
            delay: 220,
          },
        ])
      }

      if (/记住|记忆|以后都|偏好/i.test(payload.message)) {
        const memory = mockDb.createMemory({
          kind: 'preference',
          title: '来自会话的记忆',
          content: payload.message.slice(0, 200),
        })
        emit('memory.saved', {
          memory_id: memory.id,
          kind: memory.kind,
          action: 'created',
          preview: memory.content.slice(0, 60),
        })
      }

      await play([
        {
          event: 'message.delta',
          data: { message_id: assistantMessageId, delta: '## 结论\n\nQ3 共收到 ' },
          delay: 180,
        },
        {
          event: 'message.delta',
          data: {
            message_id: assistantMessageId,
            delta: '**128 条**工单，退款与物流类合计占 61%。\n\n',
          },
          delay: 140,
        },
        {
          event: 'message.delta',
          data: {
            message_id: assistantMessageId,
            delta: '建议先更新售后 FAQ 的退款时限，再补充「吊牌保留」说明。',
          },
          delay: 200,
        },
      ])
      emit('message.done', {
        run_id: runId,
        conversation_id: conversation.id,
        message_id: assistantMessageId,
        usage: {
          input_tokens: 6842,
          output_tokens: 436,
          reasoning_tokens: 128,
          total_tokens: 7278,
        },
        finish_reason: 'stop',
        model: payload.model ?? 'deepseek-chat',
        first_token_ms: 120,
        duration_ms: 4200,
        active_duration_ms: 4200,
        citations: CITATIONS,
        reasoning: { duration_ms: 1200, tokens: 128, summary: '确认口径 → 检索复盘 → 组织回答。' },
      })
      saveAssistantMessage(answer, 'stop')
      return
    }

    // 审批脚本：A2A → 审批卡 → 等待决定 → 同一流继续
    await play([
      {
        event: 'a2a.task',
        data: {
          task_id: '88888888-8888-4888-8888-888888888888',
          a2a_task_id: 'task_9b2a',
          agent: 'data-analyst',
          agent_detail: {
            id: '77777777-7777-4777-8777-777777777777',
            slug: 'data-analyst',
            name: 'Data Analyst',
          },
          state: 'working',
          progress: 0.3,
          request_summary: '核对工单数字与知识库来源',
        },
        delay: 200,
      },
      {
        event: 'a2a.artifact',
        data: {
          task_id: '88888888-8888-4888-8888-888888888888',
          a2a_task_id: 'task_9b2a',
          artifact: {
            type: 'text',
            summary: '12/12 项数字核对通过，2 处引用待补。',
            parts: [],
            data: { checks_passed: 12, checks_total: 12 },
          },
        },
        delay: 180,
      },
      {
        event: 'a2a.task',
        data: {
          task_id: '88888888-8888-4888-8888-888888888888',
          a2a_task_id: 'task_9b2a',
          agent: 'data-analyst',
          agent_detail: {
            id: '77777777-7777-4777-8777-777777777777',
            slug: 'data-analyst',
            name: 'Data Analyst',
          },
          state: 'completed',
          progress: 1,
          result_summary: '12/12 项数字核对通过',
          duration_ms: 1200,
        },
        delay: 160,
      },
    ])

    if (workflow) {
      // a2a 步骤在远程任务完成帧之后发。
      const a2aSteps = workflow.steps.filter((step) => step.type === 'a2a')
      if (a2aSteps.length > 0) await play(workflowStepFrames(a2aSteps))
    }

    const approval = mockDb.createApproval({
      run_id: runId,
      conversation_id: conversation.id,
      conversation_title: conversation.title,
      tool_name: 'mcp__slack_mcp__post_message',
      tool_display_name: 'Slack · 发送消息',
      source: 'mcp',
      executor: 'slack-mcp',
      target: '#support-weekly · 12 名成员',
      side_effect: '外部写操作；发布后可在 Slack 中删除',
      risk: 'write',
      reason: '外部写操作触发 HITL，等待人工确认',
      payload: { channel: 'C08F3K2', text: 'Q3 客服工单周报' },
    })

    emit('approval.required', {
      approval_id: approval.id,
      tool_call_id: 'call_slack_1',
      tool: approval.tool_name,
      tool_display_name: approval.tool_display_name,
      reason: approval.reason,
      payload: approval.payload,
      payload_preview: approval.payload_preview,
      source: approval.source,
      executor: approval.executor,
      target: approval.target,
      side_effect: approval.side_effect,
      risk: approval.risk,
      expires_at: approval.expires_at,
    })

    // M5：挂起是非终态，SSE 保持连接；决定后 run.resumed 再继续。
    emit('run.interrupted', {
      run_id: runId,
      conversation_id: conversation.id,
      message_id: assistantMessageId,
      status: 'interrupted',
      approvals: [approval.id],
    })

    const decision = await waitForDecision(approval.id)
    emit('run.resumed', {
      run_id: runId,
      conversation_id: conversation.id,
      status: 'running',
    })

    if (workflow) {
      // 审批中断恢复后补发审批步骤：批准 → 'ok'，拒绝 → 'rejected'（后端契约）。
      const approvalSteps = workflow.steps.filter((step) => step.type === 'approval')
      if (approvalSteps.length > 0) {
        await play(workflowStepFrames(approvalSteps, decision === 'approved' ? 'ok' : 'rejected'))
      }
    }

    if (decision === 'approved') {
      await play([
        {
          event: 'message.delta',
          data: { message_id: assistantMessageId, delta: '已批准，正在发布到 #support-weekly。' },
          delay: 120,
        },
        {
          event: 'tool.start',
          data: {
            tool_call_id: 'call_slack_1',
            tool: 'mcp__slack_mcp__post_message',
            display_name: 'Slack · 发送消息',
            args: { channel: 'C08F3K2' },
            args_preview: 'channel=C08F3K2',
            source: 'mcp',
            risk: 'write',
            requires_approval: true,
          },
          delay: 100,
        },
        {
          event: 'tool.result',
          data: {
            tool_call_id: 'call_slack_1',
            status: 'ok',
            summary: '已发布到 #support-weekly',
            result_preview: 'message_ts=1731067385.123',
            duration_ms: 400,
            source: 'mcp',
          },
          delay: 220,
        },
      ])
      emit('message.done', {
        run_id: runId,
        conversation_id: conversation.id,
        message_id: assistantMessageId,
        usage: {
          input_tokens: 6842,
          output_tokens: 1236,
          reasoning_tokens: 642,
          total_tokens: 8078,
        },
        finish_reason: 'stop',
        model: payload.model ?? 'deepseek-chat',
        first_token_ms: 120,
        duration_ms: 108000,
        active_duration_ms: 42000,
        citations: CITATIONS,
        reasoning: {
          duration_ms: 12000,
          tokens: 642,
          summary: '先固定口径；数字交 data-analyst 核对；Slack 发布前必须审批。',
        },
      })
      saveAssistantMessage(
        '已批准并发布到 #support-weekly。\n\n周报已归档，数字由 data-analyst 复核通过。',
        'stop',
      )
      return
    }

    await play([
      {
        event: 'message.delta',
        data: {
          message_id: assistantMessageId,
          delta: '已拒绝发布，周报草稿保留在会话中，未写入 Slack。',
        },
        delay: 100,
      },
      {
        event: 'tool.start',
        data: {
          tool_call_id: 'call_slack_1',
          tool: 'mcp__slack_mcp__post_message',
          display_name: 'Slack · 发送消息',
          source: 'mcp',
          risk: 'write',
          requires_approval: true,
        },
        delay: 80,
      },
      {
        event: 'tool.result',
        data: {
          tool_call_id: 'call_slack_1',
          status: 'rejected',
          summary: '审批被拒绝，未执行',
          source: 'mcp',
          duration_ms: 0,
        },
        delay: 80,
      },
    ])
    emit('message.done', {
      run_id: runId,
      conversation_id: conversation.id,
      message_id: assistantMessageId,
      usage: { input_tokens: 6842, output_tokens: 1210, reasoning_tokens: 620, total_tokens: 8052 },
      finish_reason: 'canceled',
      model: payload.model ?? 'deepseek-chat',
      first_token_ms: 120,
      duration_ms: 60000,
      active_duration_ms: 40000,
      citations: CITATIONS,
    })
    saveAssistantMessage('已拒绝发布，周报草稿保留。', 'canceled')
  } catch (error) {
    if (isAbort(error) || signal.aborted) return
    handlers.onError(error instanceof Error ? error : new Error(String(error)))
  }
}

const TERMINAL_RUN_STATUSES = new Set(['succeeded', 'failed', 'canceled'])

/**
 * M7：mock 的运行事件续流端点（`GET /runs/{id}/stream?after_seq=`）。
 *
 * 与真实后端语义对齐：run 不存在 → 404；先回放 `seq > afterSeq` 的已落库
 * 事件（`event` 为空的事件跳过，不猜测事件名）；run 已终态则回放完即关闭，
 * 未终态时订阅 mock 实时事件直到终态或 abort。
 */
export async function mockRunStream(
  runId: string,
  afterSeq: number,
  handlers: MockStreamHandlers,
  options: MockStreamOptions = {},
): Promise<void> {
  const frameDelay = options.frameDelay ?? 30
  if (handlers.signal.aborted) throw abortError()
  const run = mockDb.getRun(runId)
  if (!run) {
    throw new ApiRequestError('运行不存在', { code: 'not_found', status: 404 })
  }

  handlers.onOpen?.(runId)

  // 与真实后端一致：先订阅实时事件，再回放快照，避免回放窗口内的新事件丢失；
  // 用 seq 去重，回放与实时不会重复。
  const seen = new Set<number>()
  const unsubscribe = mockDb.subscribeRunEvents(runId, (event, data) => {
    if (handlers.signal.aborted) return
    const seq = typeof data.seq === 'number' ? data.seq : 0
    if (seq > 0) {
      if (seq <= afterSeq || seen.has(seq)) return
      seen.add(seq)
    }
    handlers.onEvent(event, data)
  })

  try {
    const page = mockDb.listRunEvents(runId, { after_seq: afterSeq, limit: 500 })
    for (const item of page?.items ?? []) {
      if (handlers.signal.aborted) throw abortError()
      if (!item.event || seen.has(item.seq)) continue
      seen.add(item.seq)
      await sleep(frameDelay, handlers.signal)
      // 外层 seq 是事件的权威序号；payload 内即使有 seq 也以它为准去重。
      handlers.onEvent(item.event as ChatEventName, { ...item.payload, seq: item.seq })
    }

    if (TERMINAL_RUN_STATUSES.has(run.status)) {
      handlers.onClose?.()
      return
    }

    await mockDb.waitRunTerminal(runId, handlers.signal)
  } finally {
    unsubscribe()
  }
  handlers.onClose?.()
}
