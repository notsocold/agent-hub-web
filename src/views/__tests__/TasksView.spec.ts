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
import { createMemoryHistory, createRouter } from 'vue-router'

import TaskDetailDrawer from '@/components/tasks/TaskDetailDrawer.vue'
import { useAuthStore } from '@/stores/auth'
import { useSystemStore } from '@/stores/system'
import type { A2aTaskDetail, A2aTaskListItem, PageResult, User, UserRole } from '@/types'
import TasksView from '@/views/TasksView.vue'

const tasksApiMock = vi.hoisted(() => ({
  list: vi.fn(),
  get: vi.fn(),
  cancel: vi.fn(),
  resume: vi.fn(),
  authorize: vi.fn(),
  reject: vi.fn(),
}))

const agentsApiMock = vi.hoisted(() => ({
  list: vi.fn(),
}))

vi.mock('@/api/tasks', () => ({ tasksApi: tasksApiMock }))
vi.mock('@/api/agents', () => ({ agentsApi: agentsApiMock }))

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

function taskListItem(overrides: Partial<A2aTaskListItem> = {}): A2aTaskListItem {
  return {
    id: 'task-1',
    a2a_task_id: 'a2a-task-1',
    agent: { id: 'agent-1', slug: 'data-agent', name: '数据 Agent' },
    run_id: 'run-1',
    conversation: null,
    state: 'completed',
    progress: null,
    duration_ms: 1200,
    request_summary: '统计最近 7 天订单',
    error_summary: null,
    available_actions: ['cancel', 'resume', 'authorize', 'reject'],
    created_at: '2026-11-10T08:00:00Z',
    updated_at: '2026-11-10T08:01:00Z',
    ...overrides,
  }
}

function taskDetail(overrides: Partial<A2aTaskDetail> = {}): A2aTaskDetail {
  return {
    ...taskListItem(),
    tool_call_id: 'tool-call-1',
    request: { tool: 'invoke', args: {}, summary: '统计最近 7 天订单' },
    result: null,
    error: null,
    input_request: { question: '请补充时间范围', input_schema: {}, expires_at: null },
    auth_request: { scopes: ['orders.read'], authorization_url: null, expires_at: null },
    timeline: [
      { state: 'completed', at: '2026-11-10T08:01:00Z', duration_ms: 1200, note: '' },
    ],
    started_at: '2026-11-10T08:00:00Z',
    finished_at: '2026-11-10T08:01:00Z',
    ...overrides,
  }
}

function page(items: A2aTaskListItem[]): PageResult<A2aTaskListItem> {
  return {
    items,
    next_cursor: null,
    has_more: false,
    stats: { total: items.length, input_required: 0, auth_required: 0, failed: 0 },
  }
}

const TABLE_ROWS: InjectionKey<ComputedRef<unknown[]>> = Symbol('tasks-table-rows')

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

const TaskDrawerStub = defineComponent({
  name: 'TaskDetailDrawer',
  props: {
    modelValue: Boolean,
    taskId: { type: String, default: null },
    canManage: Boolean,
  },
  setup(props) {
    return () =>
      h('div', {
        'data-testid': 'task-drawer',
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

async function newRouter() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/tasks', name: 'tasks', component: { template: '<div />' } },
      { path: '/:pathMatch(.*)*', name: 'fallback', component: { template: '<div />' } },
    ],
  })
  await router.push('/tasks')
  await router.isReady()
  return router
}

function actionLabels(wrapper: VueWrapper): string[] {
  return wrapper.findAll('.row-actions button').map((button) => button.text())
}

async function mountView(role: UserRole): Promise<VueWrapper> {
  setActivePinia(createPinia())
  const auth = useAuthStore()
  auth.user = currentUser(role)
  // TasksView 不会主动拉系统信息，但保持 store 可用的默认状态。
  const system = useSystemStore()
  system.loaded = true

  const router = await newRouter()
  const wrapper = mount(TasksView, {
    global: {
      plugins: [router],
      stubs: {
        'el-table': ElTableStub,
        'el-table-column': ElTableColumnStub,
        TaskDetailDrawer: TaskDrawerStub,
      },
    },
  })
  await flushPromises()
  return wrapper
}

async function mountDetailDrawer(
  canManage?: boolean,
  detail: A2aTaskDetail = taskDetail(),
): Promise<VueWrapper> {
  setActivePinia(createPinia())
  tasksApiMock.get.mockResolvedValue(detail)
  const props: Record<string, unknown> = {
    modelValue: false,
    taskId: 'task-1',
  }
  if (canManage !== undefined) props.canManage = canManage

  const router = await newRouter()
  const wrapper = mount(TaskDetailDrawer, {
    props,
    global: {
      plugins: [router],
      stubs: { 'el-drawer': ElDrawerStub },
    },
  })
  // 抽屉在真实页面里是「打开时」才触发详情加载，测试同样先关后开。
  await wrapper.setProps({ modelValue: true })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  vi.clearAllMocks()
  tasksApiMock.list.mockResolvedValue(page([taskListItem()]))
  tasksApiMock.get.mockResolvedValue(taskDetail())
  agentsApiMock.list.mockResolvedValue({
    items: [],
    next_cursor: null,
    has_more: false,
  })
})

describe('TasksView 管理员动作按钮显隐', () => {
  it('普通用户不渲染补充/授权/拒绝/取消，保留查看、筛选与权限提示', async () => {
    const wrapper = await mountView('user')

    expect(actionLabels(wrapper)).toEqual(['查看'])
    expect(wrapper.text()).toContain('写操作需要管理员权限')
    expect(wrapper.find('select[aria-label="按状态筛选"]').exists()).toBe(true)
    expect(wrapper.findAll('button').some((button) => button.text() === '刷新')).toBe(true)
    expect(wrapper.find('[data-testid="task-drawer"]').attributes('data-can-manage')).toBe('false')
    expect(tasksApiMock.list).toHaveBeenCalledWith(expect.objectContaining({ limit: 20 }))
  })

  it('管理员渲染补充/授权/拒绝/取消四个动作按钮', async () => {
    const wrapper = await mountView('admin')

    expect(actionLabels(wrapper)).toEqual(['补充', '授权', '拒绝', '取消'])
    expect(wrapper.find('[data-testid="task-drawer"]').attributes('data-can-manage')).toBe('true')
  })
})

describe('TaskDetailDrawer 授权链接容错（M7）', () => {
  it('authorization_url 为空时提示不可用，且不渲染前往授权', async () => {
    const wrapper = await mountDetailDrawer(
      true,
      taskDetail({ state: 'auth_required', auth_request: { scopes: ['orders.read'], authorization_url: null, expires_at: null } }),
    )

    expect(wrapper.text()).toContain('授权链接不可用，请联系管理员')
    expect(wrapper.findAll('button').some((button) => button.text() === '前往授权')).toBe(false)
    wrapper.unmount()
  })

  it('非法协议链接不渲染前往授权并给出提示', async () => {
    const wrapper = await mountDetailDrawer(
      true,
      taskDetail({
        state: 'auth_required',
        auth_request: {
          scopes: ['orders.read'],
          authorization_url: 'javascript:alert(1)',
          expires_at: null,
        },
      }),
    )

    expect(wrapper.text()).toContain('授权链接不可用，请联系管理员')
    expect(wrapper.findAll('button').some((button) => button.text() === '前往授权')).toBe(false)
    wrapper.unmount()
  })

  it('安全 https 链接渲染可点击的前往授权', async () => {
    const wrapper = await mountDetailDrawer(
      true,
      taskDetail({
        auth_request: {
          scopes: ['orders.read'],
          authorization_url: 'https://github.com/login/oauth/authorize?client_id=mock',
          expires_at: null,
        },
      }),
    )

    expect(wrapper.text()).not.toContain('授权链接不可用')
    expect(wrapper.findAll('button').some((button) => button.text() === '前往授权')).toBe(true)
    wrapper.unmount()
  })
})

describe('TaskDetailDrawer 动作按钮显隐', () => {
  it('默认 canManage=false 时不渲染任何动作按钮', async () => {
    const wrapper = await mountDetailDrawer()

    expect(wrapper.findAll('button')).toHaveLength(0)
    wrapper.unmount()
  })

  it('canManage=true 时渲染补充/授权/拒绝/取消', async () => {
    const wrapper = await mountDetailDrawer(true)

    const labels = wrapper.findAll('button').map((button) => button.text())
    expect(labels).toEqual(['提交补充信息', '已授权', '拒绝', '取消任务'])
    wrapper.unmount()
  })
})
