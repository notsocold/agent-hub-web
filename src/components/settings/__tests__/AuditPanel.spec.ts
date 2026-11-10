import { flushPromises, mount } from '@vue/test-utils'
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

import { ApiRequestError } from '@/api/client'
import AuditPanel from '@/components/settings/AuditPanel.vue'
import type { AuditLog, PageResult } from '@/types'

const auditApiMock = vi.hoisted(() => ({ own: vi.fn(), all: vi.fn() }))
vi.mock('@/api/audit', () => ({ auditApi: auditApiMock }))

const messageMock = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
}))
vi.mock('element-plus', () => ({
  ElMessage: messageMock,
  ElMessageBox: { confirm: vi.fn() },
}))

const TABLE_ROWS: InjectionKey<ComputedRef<AuditLog[]>> = Symbol('audit-table-rows')

const ElTableStub = defineComponent({
  name: 'ElTable',
  props: {
    data: { type: Array as () => AuditLog[], default: () => [] as AuditLog[] },
  },
  setup(props, { slots }) {
    const rows = computed(() => props.data)
    provide(TABLE_ROWS, rows)
    return () => h('div', { class: 'table-stub' }, slots.default?.())
  },
})

const ElTableColumnStub = defineComponent({
  name: 'ElTableColumn',
  props: { label: { type: String, default: '' } },
  setup(props, { slots }) {
    const source = inject(TABLE_ROWS, null)
    return () =>
      h(
        'div',
        { class: 'column-stub', 'data-label': props.label },
        (source?.value ?? []).map((row) =>
          h('div', { class: 'cell-stub' }, slots.default?.({ row })),
        ),
      )
  },
})

const DrawerStub = defineComponent({
  name: 'ElDrawer',
  props: {
    modelValue: Boolean,
    title: { type: String, default: '' },
  },
  setup(props, { slots }) {
    return () =>
      props.modelValue
        ? h('aside', { class: 'drawer-stub' }, [h('h2', props.title), slots.default?.()])
        : null
  },
})

function mountPanel(canViewAll = false) {
  return mount(AuditPanel, {
    props: { canViewAll },
    global: {
      stubs: {
        'el-table': ElTableStub,
        'el-table-column': ElTableColumnStub,
        'el-drawer': DrawerStub,
      },
    },
  })
}

function auditLog(overrides: Partial<AuditLog> = {}): AuditLog {
  return {
    id: 1,
    actor_type: 'user',
    actor_id: 'user-1',
    action: 'secret.create',
    resource_type: 'secret',
    resource_id: 'OPENAI_API_KEY',
    detail: { name: 'OPENAI_API_KEY', token: 'should-not-render' },
    request_id: 'req-123',
    created_at: '2026-11-10T12:00:00Z',
    ...overrides,
  }
}

function page(overrides: Partial<PageResult<AuditLog>> = {}): PageResult<AuditLog> {
  return {
    items: [auditLog()],
    next_cursor: null,
    has_more: false,
    ...overrides,
  }
}

function buttonByText(wrapper: ReturnType<typeof mountPanel>, text: string) {
  return wrapper.findAll('button').find((button) => button.text().includes(text))
}

describe('AuditPanel 审计日志', () => {
  beforeEach(() => {
    auditApiMock.own.mockReset()
    auditApiMock.all.mockReset()
    messageMock.success.mockReset()
    messageMock.error.mockReset()
    messageMock.warning.mockReset()
    messageMock.info.mockReset()
  })

  it('默认加载我的审计，渲染列表且不显示全局切换', async () => {
    auditApiMock.own.mockResolvedValue(page())
    const wrapper = mountPanel(false)
    await flushPromises()

    expect(auditApiMock.own).toHaveBeenCalledTimes(1)
    expect(auditApiMock.own.mock.calls[0]?.[0]).toEqual({ limit: 20 })
    expect(auditApiMock.all).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('secret.create')
    expect(wrapper.text()).toContain('OPENAI_API_KEY')
    expect(wrapper.text()).toContain('req-123')
    expect(wrapper.text()).not.toContain('全局审计')
  })

  it('空结果显示暂无审计记录', async () => {
    auditApiMock.own.mockResolvedValue(page({ items: [] }))
    const wrapper = mountPanel(false)
    await flushPromises()

    expect(wrapper.text()).toContain('暂无审计记录')
  })

  it('全局模式提交筛选时把时间转换为 ISO，并附带操作者/资源 ID', async () => {
    auditApiMock.own.mockResolvedValue(page({ items: [] }))
    auditApiMock.all.mockResolvedValueOnce(page({ items: [] }))
    const wrapper = mountPanel(true)
    await flushPromises()

    await buttonByText(wrapper, '全局审计')!.trigger('click')
    await flushPromises()
    expect(auditApiMock.all).toHaveBeenCalledTimes(1)

    await wrapper.find('input[list="audit-action-options"]').setValue('secret.update')
    await wrapper.find('select').setValue('secret')
    const localInputs = wrapper.findAll('input[type="datetime-local"]')
    await localInputs[0]!.setValue('2026-11-01T08:00')
    await localInputs[1]!.setValue('2026-11-02T08:00')
    await wrapper.find('input[list="audit-actor-types"]').setValue('user')
    await wrapper.find('input[placeholder="按操作者 ID 精确筛选"]').setValue('user-1')
    await wrapper.find('input[placeholder="按资源 ID 精确筛选"]').setValue('secret-1')

    auditApiMock.all.mockResolvedValueOnce(page({ items: [] }))
    await wrapper.find('form.filters').trigger('submit')
    await flushPromises()

    expect(auditApiMock.all).toHaveBeenLastCalledWith({
      limit: 20,
      action: 'secret.update',
      resource_type: 'secret',
      start: new Date('2026-11-01T08:00').toISOString(),
      end: new Date('2026-11-02T08:00').toISOString(),
      actor_type: 'user',
      actor_id: 'user-1',
      resource_id: 'secret-1',
    })
  })

  it('游标分页使用 next_cursor 加载更多并追加记录', async () => {
    auditApiMock.own.mockResolvedValueOnce(page({ has_more: true, next_cursor: 'cursor-1' }))
    const wrapper = mountPanel(false)
    await flushPromises()

    auditApiMock.own.mockResolvedValueOnce(
      page({ items: [auditLog({ id: 2, action: 'agent.created', request_id: 'req-2' })] }),
    )
    await buttonByText(wrapper, '加载更多')!.trigger('click')
    await flushPromises()

    expect(auditApiMock.own).toHaveBeenLastCalledWith({ limit: 20, cursor: 'cursor-1' })
    expect(wrapper.text()).toContain('secret.create')
    expect(wrapper.text()).toContain('agent.created')
  })

  it('全局审计 403 时提示并自动切回我的审计', async () => {
    auditApiMock.own.mockResolvedValue(page({ items: [] }))
    auditApiMock.all.mockRejectedValue(
      new ApiRequestError('仅管理员可查看全局审计', { code: 'forbidden', status: 403 }),
    )
    const wrapper = mountPanel(true)
    await flushPromises()

    await buttonByText(wrapper, '全局审计')!.trigger('click')
    await flushPromises()

    expect(auditApiMock.all).toHaveBeenCalledTimes(1)
    expect(auditApiMock.own).toHaveBeenCalledTimes(2)
    expect(wrapper.find('.scope-btn.is-active').text()).toBe('我的审计')
    expect(messageMock.warning).toHaveBeenCalled()
  })

  it('详情抽屉展示字段与 request_id，detail 敏感键被遮罩', async () => {
    auditApiMock.own.mockResolvedValue(page())
    const wrapper = mountPanel(false)
    await flushPromises()

    await buttonByText(wrapper, '详情')!.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('审计详情')
    expect(wrapper.text()).toContain('req-123')
    expect(wrapper.text()).toContain('••••')
    expect(wrapper.text()).not.toContain('should-not-render')
    expect(buttonByText(wrapper, '复制 request_id')).toBeTruthy()
  })
})
