import { flushPromises, mount } from '@vue/test-utils'
import { ElMessage } from 'element-plus'
import { defineComponent } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import ChatView from '@/views/chat/ChatView.vue'
import type { Workflow } from '@/types'

const mocks = vi.hoisted(() => {
  const chatState = {
    conversationId: null as string | null,
    conversationTitle: '',
    messages: [],
    streaming: false,
    runId: null as string | null,
    runStatus: null,
    recovery: null,
    error: null,
    usage: null,
    finishReason: null,
  }
  return {
    api: { list: vi.fn(), get: vi.fn() },
    chat: {
      state: chatState,
      messages: [],
      processItems: [],
      pendingApprovals: [],
      pendingApprovalId: null,
      connection: 'idle',
      reconnectAttempt: 0,
      rateLimitActive: false,
      rateLimitRemaining: 0,
      loadingHistory: false,
      loadingOlder: false,
      resolvingApproval: false,
      resolvingApprovalId: null,
      historyHasMore: false,
      recovery: null,
      recoveryBusy: false,
      loadConversation: vi.fn(),
      reset: vi.fn(),
      send: vi.fn(),
      stop: vi.fn(),
      retry: vi.fn(),
      refresh: vi.fn(),
      loadOlder: vi.fn(),
      resolveApprovalById: vi.fn(),
      stopReconnect: vi.fn(),
      clearPendingScroll: vi.fn(),
    },
    conversations: { items: [], refresh: vi.fn() },
    system: {
      enabled: vi.fn(() => true),
      load: vi.fn(() => Promise.resolve()),
      defaultModel: '',
      defaultReasoningEffort: 'low',
      models: [],
      reasoningEfforts: [],
      limits: {},
      capabilities: {},
    },
    capabilities: {
      enabledSkills: [],
      mcpServers: [],
      mcpTools: [],
      knowledgeCategories: [],
      loadingTools: [],
      load: vi.fn(() => Promise.resolve()),
      loadKnowledgeCategories: vi.fn(() => Promise.resolve()),
    },
  }
})

vi.mock('@/api/workflows', () => ({ workflowsApi: mocks.api }))
vi.mock('@/stores/chat', () => ({ useChatStore: () => mocks.chat }))
vi.mock('@/stores/conversations', () => ({ useConversationsStore: () => mocks.conversations }))
vi.mock('@/stores/system', () => ({ useSystemStore: () => mocks.system }))
vi.mock('@/stores/capabilities', () => ({ useCapabilitiesStore: () => mocks.capabilities }))

const ComposerStub = defineComponent({
  name: 'ChatComposer',
  props: {
    workflows: { type: Array, default: () => [] },
    seedWorkflow: { type: Object, default: null },
  },
  template: '<div data-testid="composer-stub" />',
})

const stubs = {
  ChatComposer: ComposerStub,
  MessageList: true,
  RunRecoveryBanner: true,
  ConnectionBanner: true,
  ErrorState: true,
  RunTraceDrawer: true,
  RunTracePanel: true,
  AgentOutputDrawer: true,
  RouterLink: true,
}

function workflow(overrides: Partial<Workflow> = {}): Workflow {
  return {
    id: 'wf-1',
    scope: 'user',
    name: '客服周报',
    description: '每周汇总客服工单',
    steps: [{ id: 's1', type: 'answer', title: '汇总' }],
    enabled: true,
    version: 1,
    created_at: '2026-11-12T00:00:00Z',
    updated_at: '2026-11-12T00:00:00Z',
    ...overrides,
  }
}

async function mountView(path = '/chat') {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/chat', name: 'chat', component: { template: '<div />' } },
      { path: '/workflows/:id/edit', name: 'workflow-edit', component: { template: '<div />' } },
      { path: '/:pathMatch(.*)*', component: { template: '<div />' } },
    ],
  })
  await router.push(path)
  await router.isReady()

  const wrapper = mount(ChatView, {
    global: { plugins: [router], stubs },
  })
  await flushPromises()
  return wrapper
}

describe('ChatView D4 工作流候选加载', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.api.list.mockResolvedValue({ items: [], next_cursor: null, has_more: false })
    mocks.api.get.mockRejectedValue(new Error('not found'))
    vi.spyOn(ElMessage, 'warning').mockImplementation(() => ({}) as never)
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('按契约上限 limit=100 拉取候选并全部交给输入栏', async () => {
    const many = Array.from({ length: 100 }, (_, index) =>
      workflow({ id: `wf-${index}`, name: `模板 ${index}` }),
    )
    mocks.api.list.mockResolvedValue({ items: many, next_cursor: null, has_more: false })

    const wrapper = await mountView()

    expect(mocks.api.list).toHaveBeenCalledWith({ limit: 100 })
    await vi.waitFor(() => {
      const composer = wrapper.findComponent(ComposerStub)
      expect(composer.props('workflows')).toHaveLength(100)
    })
  })
})

describe('ChatView D5 query 预选工作流', () => {
  let warningSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.api.list.mockResolvedValue({ items: [], next_cursor: null, has_more: false })
    warningSpy = vi.spyOn(ElMessage, 'warning').mockImplementation(() => ({}) as never)
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('停用模板给出 warning 且不预选', async () => {
    mocks.api.get.mockResolvedValue(workflow({ id: 'wf-off', enabled: false }))

    const wrapper = await mountView('/chat?workflow_id=wf-off&workflow_version=3')

    await vi.waitFor(() => {
      expect(warningSpy).toHaveBeenCalledWith('该模板已停用，未预选')
    })
    expect(wrapper.findComponent(ComposerStub).props('seedWorkflow')).toBeNull()
  })

  it('无效 id 仍静默（只 console.warn，不弹提示）且不预选', async () => {
    mocks.api.get.mockRejectedValue(new Error('404'))

    const wrapper = await mountView('/chat?workflow_id=missing')

    await vi.waitFor(() => {
      expect(mocks.api.get).toHaveBeenCalledWith('missing')
    })
    await flushPromises()
    expect(warningSpy).not.toHaveBeenCalled()
    expect(console.warn).toHaveBeenCalled()
    expect(wrapper.findComponent(ComposerStub).props('seedWorkflow')).toBeNull()
  })

  it('启用模板按 query 版本预选并交给输入栏', async () => {
    mocks.api.get.mockResolvedValue(workflow({ id: 'wf-1', version: 5 }))

    const wrapper = await mountView('/chat?workflow_id=wf-1&workflow_version=7')

    await vi.waitFor(() => {
      const seed = wrapper.findComponent(ComposerStub).props('seedWorkflow') as Workflow | null
      expect(seed?.id).toBe('wf-1')
      expect(seed?.version).toBe(7)
    })
    expect(warningSpy).not.toHaveBeenCalled()
  })
})
