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
import SecretPanel from '@/components/settings/SecretPanel.vue'
import type { PlatformSecret } from '@/types'

const secretsApiMock = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
}))
vi.mock('@/api/secrets', () => ({ secretsApi: secretsApiMock }))

const messageMock = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
}))
const messageBoxMock = vi.hoisted(() => ({ confirm: vi.fn() }))
vi.mock('element-plus', () => ({
  ElMessage: messageMock,
  ElMessageBox: messageBoxMock,
}))

const TABLE_ROWS: InjectionKey<ComputedRef<PlatformSecret[]>> = Symbol('secret-table-rows')

const ElTableStub = defineComponent({
  name: 'ElTable',
  props: {
    data: { type: Array as () => PlatformSecret[], default: () => [] as PlatformSecret[] },
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

const DialogStub = defineComponent({
  name: 'ElDialog',
  props: {
    modelValue: Boolean,
    title: { type: String, default: '' },
  },
  setup(props, { slots }) {
    return () =>
      props.modelValue
        ? h('section', { class: 'dialog-stub' }, [h('h2', props.title), slots.default?.()])
        : null
  },
})

function mountPanel(isAdmin = true) {
  return mount(SecretPanel, {
    props: { isAdmin },
    global: {
      stubs: {
        'el-table': ElTableStub,
        'el-table-column': ElTableColumnStub,
        'el-dialog': DialogStub,
      },
    },
  })
}

function secret(overrides: Partial<PlatformSecret> = {}): PlatformSecret {
  return {
    name: 'OPENAI_API_KEY',
    description: '调用 OpenAI API',
    enabled: true,
    created_at: '2026-11-01T00:00:00Z',
    updated_at: '2026-11-02T00:00:00Z',
    ...overrides,
  }
}

function buttonByText(wrapper: ReturnType<typeof mountPanel>, text: string) {
  return wrapper.findAll('button').find((button) => button.text().includes(text))
}

describe('SecretPanel 平台密钥', () => {
  beforeEach(() => {
    secretsApiMock.list.mockReset()
    secretsApiMock.create.mockReset()
    secretsApiMock.update.mockReset()
    secretsApiMock.remove.mockReset()
    messageMock.success.mockReset()
    messageMock.error.mockReset()
    messageMock.warning.mockReset()
    messageMock.info.mockReset()
    messageBoxMock.confirm.mockReset()
  })

  it('非管理员显示 EmptyState 且不请求密钥列表', async () => {
    const wrapper = mountPanel(false)
    await flushPromises()

    expect(secretsApiMock.list).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('仅管理员可管理平台密钥')
    expect(wrapper.text()).not.toContain('新建密钥')
  })

  it('管理员加载列表并渲染名称、引用、状态与时间', async () => {
    secretsApiMock.list.mockResolvedValue([secret()])
    const wrapper = mountPanel(true)
    await flushPromises()

    expect(secretsApiMock.list).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain('OPENAI_API_KEY')
    expect(wrapper.text()).toContain('secret:OPENAI_API_KEY')
    expect(wrapper.text()).toContain('调用 OpenAI API')
    expect(wrapper.text()).toContain('启用')
    expect(wrapper.text()).toContain('2026-11-01')
  })

  it('创建密钥时提交 name/description/value，保存后刷新并提示明文不再显示', async () => {
    secretsApiMock.list.mockResolvedValue([])
    secretsApiMock.create.mockResolvedValue(secret())
    const wrapper = mountPanel(true)
    await flushPromises()

    await buttonByText(wrapper, '新建密钥')!.trigger('click')
    await wrapper.find('input[placeholder="例如：OPENAI_API_KEY"]').setValue('OPENAI_API_KEY')
    await wrapper.find('textarea').setValue('测试用途')
    await wrapper.find('input[autocomplete="new-password"]').setValue('sk-test-value')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(secretsApiMock.create).toHaveBeenCalledWith({
      name: 'OPENAI_API_KEY',
      description: '测试用途',
      value: 'sk-test-value',
    })
    expect(messageMock.success).toHaveBeenCalledWith('密钥已保存，明文不会再次显示')
    expect(secretsApiMock.list).toHaveBeenCalledTimes(2)
  })

  it('503 secret_store_unavailable 时给出 CAPABILITY_SECRET_KEY 提示', async () => {
    secretsApiMock.list.mockResolvedValue([])
    secretsApiMock.create.mockRejectedValue(
      new ApiRequestError('密钥存储未配置', {
        code: 'secret_store_unavailable',
        status: 503,
      }),
    )
    const wrapper = mountPanel(true)
    await flushPromises()

    await buttonByText(wrapper, '新建密钥')!.trigger('click')
    await wrapper.find('input[placeholder="例如：OPENAI_API_KEY"]').setValue('OPENAI_API_KEY')
    await wrapper.find('input[autocomplete="new-password"]').setValue('sk-test-value')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(messageMock.error).toHaveBeenCalledWith(
      '后端未配置 CAPABILITY_SECRET_KEY，暂时无法保存密钥',
    )
    expect(wrapper.find('input[placeholder="例如：OPENAI_API_KEY"]').exists()).toBe(true)
  })

  it('启停按钮调用 update({ enabled: !enabled })', async () => {
    secretsApiMock.list.mockResolvedValue([secret()])
    secretsApiMock.update.mockResolvedValue(secret({ enabled: false }))
    const wrapper = mountPanel(true)
    await flushPromises()

    await buttonByText(wrapper, '停用')!.trigger('click')
    await flushPromises()

    expect(secretsApiMock.update).toHaveBeenCalledWith('OPENAI_API_KEY', { enabled: false })
    expect(messageMock.success).toHaveBeenCalledWith('密钥已停用')
    expect(wrapper.text()).toContain('启用')
  })

  it('轮换仅提交 value 并提示轮换成功', async () => {
    secretsApiMock.list.mockResolvedValue([secret()])
    secretsApiMock.update.mockResolvedValue(secret())
    const wrapper = mountPanel(true)
    await flushPromises()

    await buttonByText(wrapper, '轮换')!.trigger('click')
    await wrapper.find('input[placeholder="粘贴新的密钥明文"]').setValue('sk-rotated')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(secretsApiMock.update).toHaveBeenCalledWith('OPENAI_API_KEY', { value: 'sk-rotated' })
    expect(messageMock.success).toHaveBeenCalledWith('密钥已轮换，明文不会再次显示')
  })

  it('删除前二次确认，确认后调用 remove', async () => {
    secretsApiMock.list.mockResolvedValue([secret()])
    secretsApiMock.remove.mockResolvedValue(undefined)
    messageBoxMock.confirm.mockResolvedValue(undefined)
    const wrapper = mountPanel(true)
    await flushPromises()

    await buttonByText(wrapper, '删除')!.trigger('click')
    await flushPromises()

    expect(messageBoxMock.confirm).toHaveBeenCalledTimes(1)
    expect(secretsApiMock.remove).toHaveBeenCalledWith('OPENAI_API_KEY')
    expect(messageMock.success).toHaveBeenCalledWith('密钥已删除')
  })
})
