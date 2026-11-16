import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  computed,
  defineComponent,
  h,
  inject,
  provide,
  type ComputedRef,
  type InjectionKey,
} from 'vue'

import AgentDetailDrawer from '@/components/agents/AgentDetailDrawer.vue'
import { useAuthStore } from '@/stores/auth'
import { useSystemStore } from '@/stores/system'
import type { Agent, AgentDetail, PageResult, SystemInfo, User, UserRole } from '@/types'
import AgentsView from '@/views/AgentsView.vue'

const agentsApiMock = vi.hoisted(() => ({
  list: vi.fn(),
  preview: vi.fn(),
  create: vi.fn(),
  get: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  refresh: vi.fn(),
  health: vi.fn(),
}))

vi.mock('@/api/agents', () => ({ agentsApi: agentsApiMock }))

const messageMock = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
}))

const messageBoxMock = vi.hoisted(() => ({ confirm: vi.fn() }))

vi.mock('element-plus', async (importOriginal) => {
  const actual = await importOriginal<typeof import('element-plus')>()
  return { ...actual, ElMessage: messageMock, ElMessageBox: messageBoxMock }
})

function currentUser(role: UserRole): User {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'you@example.com',
    display_name: '周丹',
    status: 'active',
    role,
    created_at: '2026-10-01T08:00:00Z',
    last_login_at: '2026-11-09T08:00:00Z',
  }
}

function systemInfo(): SystemInfo {
  return {
    version: '0.1.0',
    build: 'test',
    environment: 'test',
    models: [],
    default_model: 'deepseek-chat',
    reasoning_efforts: [],
    default_reasoning_effort: 'low',
    embedding: { model: 'test-embedding', dim: 3 },
    generation: { temperature: 0.7, timeout_seconds: 30, max_output_tokens: 1000 },
    capabilities: {
      instructions: true,
      memories: true,
      skills: true,
      mcp: true,
      knowledge: false,
      attachments: true,
      workflows: false,
      approvals: true,
      agents: true,
      tasks: true,
    },
    limits: {
      skills_per_message: 3,
      mcp_servers_per_message: 5,
      mcp_tools_per_message: 10,
      knowledge_categories_per_message: 5,
      attachments_per_message: 5,
      attachment_max_bytes: 20 * 1024 * 1024,
      message_max_chars: 8000,
    },
  }
}

function agent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: 'agent-1',
    slug: 'data-agent',
    name: '数据 Agent',
    description: '查询订单数据',
    url: 'https://agent.example.com/a2a',
    protocol_version: '0.3.0',
    skills: [{ id: 'orders', name: '订单查询' }],
    skill_count: 1,
    auth_type: 'none',
    auth_scheme: '',
    auth_hint: '',
    capabilities: { streaming: true, push_notifications: false },
    health_status: 'healthy',
    enabled: true,
    last_checked_at: '2026-11-10T08:00:00Z',
    last_latency_ms: 120,
    last_error: null,
    recent_task: null,
    created_at: '2026-11-01T08:00:00Z',
    updated_at: '2026-11-10T08:00:00Z',
    ...overrides,
  }
}

function agentDetail(overrides: Partial<AgentDetail> = {}): AgentDetail {
  return {
    ...agent(),
    card: { name: '数据 Agent' },
    recent_tasks: [],
    ...overrides,
  }
}

function page(items: Agent[]): PageResult<Agent> {
  return {
    items,
    next_cursor: null,
    has_more: false,
    stats: { total: items.length, healthy: 1, degraded: 0, disabled: 0 },
  }
}

const TABLE_ROWS: InjectionKey<ComputedRef<unknown[]>> = Symbol('agents-table-rows')

const ElTableStub = defineComponent({
  name: 'ElTable',
  props: { data: { type: Array as () => unknown[], default: () => [] } },
  setup(props, { slots }) {
    provide(TABLE_ROWS, computed(() => props.data))
    return () => h('div', { class: 'table-stub' }, slots.default?.())
  },
})

const ElTableColumnStub = defineComponent({
  name: 'ElTableColumn',
  props: { label: { type: String, default: '' } },
  setup(props, { slots }) {
    const rows = inject<ComputedRef<unknown[]> | null>(TABLE_ROWS, null)
    return () =>
      h(
        'div',
        { class: 'column-stub', 'data-label': props.label },
        (rows?.value ?? []).map((row, index) =>
          h('div', { class: 'cell-stub', key: index }, slots.default?.({ row })),
        ),
      )
  },
})

const AgentDrawerStub = defineComponent({
  name: 'AgentDetailDrawer',
  props: {
    modelValue: Boolean,
    agentId: { type: String, default: null },
    canManage: Boolean,
  },
  setup(props) {
    return () =>
      h('div', {
        'data-testid': 'agent-drawer',
        'data-can-manage': String(props.canManage),
      })
  },
})

const ElDrawerStub = defineComponent({
  name: 'ElDrawer',
  props: {
    modelValue: Boolean,
    title: { type: String, default: '' },
    size: { type: String, default: '' },
  },
  setup(_, { slots }) {
    return () => h('aside', { class: 'drawer-stub' }, slots.default?.())
  },
})

function buttonByText(wrapper: VueWrapper, text: string) {
  return wrapper.findAll('button').find((button) => button.text() === text)
}

async function mountView(role: UserRole): Promise<VueWrapper> {
  setActivePinia(createPinia())
  const auth = useAuthStore()
  auth.user = currentUser(role)
  const system = useSystemStore()
  system.info = systemInfo()
  system.loaded = true

  const wrapper = mount(AgentsView, {
    global: {
      stubs: {
        'el-table': ElTableStub,
        'el-table-column': ElTableColumnStub,
        'el-switch': true,
        AgentRegisterDialog: true,
        AgentDetailDrawer: AgentDrawerStub,
      },
    },
  })
  await flushPromises()
  return wrapper
}

async function mountDetailDrawer(canManage?: boolean): Promise<VueWrapper> {
  setActivePinia(createPinia())
  agentsApiMock.get.mockResolvedValue(agentDetail())
  const props: { modelValue: boolean; agentId: string; canManage?: boolean } = {
    modelValue: true,
    agentId: 'agent-1',
  }
  if (canManage !== undefined) props.canManage = canManage

  const wrapper = mount(AgentDetailDrawer, {
    props,
    global: { stubs: { 'el-drawer': ElDrawerStub, 'el-dialog': true } },
  })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  vi.clearAllMocks()
  agentsApiMock.list.mockResolvedValue(page([agent()]))
  agentsApiMock.get.mockResolvedValue(agentDetail())
})

describe('AgentsView 管理员写操作显隐', () => {
  it('普通用户不渲染注册智能体与健康检查，但保留刷新、详情与权限提示', async () => {
    const wrapper = await mountView('user')

    expect(buttonByText(wrapper, '注册智能体')).toBeUndefined()
    expect(buttonByText(wrapper, '健康检查')).toBeUndefined()
    expect(buttonByText(wrapper, '刷新列表')).toBeDefined()
    expect(buttonByText(wrapper, '详情')).toBeDefined()
    expect(wrapper.text()).toContain('写操作需要管理员权限')
    expect(wrapper.find('[data-testid="agent-drawer"]').attributes('data-can-manage')).toBe(
      'false',
    )
    expect(agentsApiMock.list).toHaveBeenCalledWith({ limit: 100 })
  })

  it('管理员渲染注册智能体、健康检查，并把 canManage 传给详情抽屉', async () => {
    const wrapper = await mountView('admin')

    expect(buttonByText(wrapper, '注册智能体')).toBeDefined()
    expect(buttonByText(wrapper, '健康检查')).toBeDefined()
    expect(buttonByText(wrapper, '刷新列表')).toBeDefined()
    expect(buttonByText(wrapper, '详情')).toBeDefined()
    expect(wrapper.find('[data-testid="agent-drawer"]').attributes('data-can-manage')).toBe('true')
  })
})

describe('AgentDetailDrawer 写操作显隐', () => {
  it('默认不渲染删除、启停、刷新 Card 与健康检查', async () => {
    const wrapper = await mountDetailDrawer()

    expect(wrapper.findAll('.actions button')).toHaveLength(0)
    wrapper.unmount()
  })

  it('canManage 为 true 时渲染全部写操作', async () => {
    const wrapper = await mountDetailDrawer(true)

    const labels = wrapper.findAll('.actions button').map((button) => button.text())
    expect(labels).toEqual(['编辑', '健康检查', '刷新 Card', '禁用', '删除'])
    wrapper.unmount()
  })

  it('编辑保存后刷新列表并提示成功', async () => {
    const wrapper = await mountView('admin')
    const drawer = wrapper.findComponent({ name: 'AgentDetailDrawer' })

    // 真实抽屉在编辑成功后同发 changed（刷新列表）与 edited（成功提示）。
    drawer.vm.$emit('changed')
    drawer.vm.$emit('edited', agentDetail({ name: '改名后的数据 Agent' }))
    await flushPromises()

    expect(agentsApiMock.list).toHaveBeenCalledTimes(2)
    expect(messageMock.success).toHaveBeenCalledWith('已保存「改名后的数据 Agent」')
    wrapper.unmount()
  })
})
