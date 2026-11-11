import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'

import DiagnosticsDrawer from '@/components/common/DiagnosticsDrawer.vue'
import {
  getBuildInfo,
  recordError,
  recordRequest,
  recordVital,
  resetDiagnostics,
  setRuntimeContext,
} from '@/utils/diagnostics'
import type { RequestRecord } from '@/utils/diagnostics'

const messageMock = vi.hoisted(() => ({
  success: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
}))

vi.mock('element-plus', () => ({ ElMessage: messageMock }))

const DrawerStub = defineComponent({
  name: 'ElDrawer',
  props: {
    modelValue: Boolean,
    title: { type: String, default: '' },
  },
  emits: ['update:modelValue'],
  setup(props, { slots }) {
    return () =>
      props.modelValue
        ? h('aside', { class: 'drawer-stub' }, [h('h2', props.title), slots.default?.()])
        : null
  },
})

function mountDrawer(open = true) {
  return mount(DiagnosticsDrawer, {
    props: { open },
    global: {
      stubs: { 'el-drawer': DrawerStub },
    },
  })
}

function request(overrides: Partial<RequestRecord> = {}): RequestRecord {
  return {
    method: 'POST',
    url: '/api/v1/chat?token=should-not-render',
    status: 201,
    durationMs: 18,
    requestId: 'req-abc',
    traceId: 'trace-abc',
    at: new Date('2026-11-11T08:00:00Z').getTime(),
    ...overrides,
  }
}

beforeEach(() => {
  resetDiagnostics()
  messageMock.success.mockReset()
  messageMock.warning.mockReset()
})

describe('DiagnosticsDrawer', () => {
  it('打开时展示构建信息、运行时上下文与最近请求', () => {
    const build = getBuildInfo()
    setRuntimeContext({ runId: 'run-9', conversationId: 'conv-9' })
    recordRequest(request())

    const wrapper = mountDrawer(true)

    expect(wrapper.text()).toContain('诊断信息')
    expect(wrapper.text()).toContain(build.version)
    expect(wrapper.text()).toContain(build.buildTime)
    expect(wrapper.text()).toContain(build.gitSha)
    expect(wrapper.text()).toContain(build.apiBase)
    expect(wrapper.text()).toContain('run-9')
    expect(wrapper.text()).toContain('conv-9')
    expect(wrapper.text()).toContain('req-abc')
    expect(wrapper.text()).toContain('18ms')
    expect(wrapper.text()).toContain('201')
  })

  it('不渲染请求 URL 与 token', () => {
    recordRequest(request())
    const wrapper = mountDrawer(true)

    expect(wrapper.text()).not.toContain('should-not-render')
    expect(wrapper.text()).not.toContain('token=')
  })

  it('无记录时展示空态文案', () => {
    const wrapper = mountDrawer(true)

    expect(wrapper.text()).toContain('暂无请求记录')
    expect(wrapper.text()).toContain('暂无错误记录')
    expect(wrapper.text()).toContain('暂无 Web Vitals 记录')
  })

  it('重新打开后能看到新产生的请求', async () => {
    const wrapper = mountDrawer(true)
    expect(wrapper.text()).not.toContain('req-late')

    recordRequest(request({ requestId: 'req-late' }))
    await wrapper.setProps({ open: false })
    expect(wrapper.find('.drawer-stub').exists()).toBe(false)

    await wrapper.setProps({ open: true })
    expect(wrapper.text()).toContain('req-late')
  })

  it('展示最近错误', () => {
    recordError({
      code: 'forbidden',
      message: '无权限访问该资源',
      requestId: 'req-err',
      at: Date.now(),
    })
    const wrapper = mountDrawer(true)

    expect(wrapper.text()).toContain('forbidden')
    expect(wrapper.text()).toContain('无权限访问该资源')
    expect(wrapper.text()).toContain('req-err')
  })

  it('展示 Web Vitals 摘要', () => {
    recordVital({ name: 'LCP', value: 1200, at: Date.now() })
    recordVital({ name: 'CLS', value: 0.125, at: Date.now() })
    const wrapper = mountDrawer(true)

    expect(wrapper.text()).toContain('LCP')
    expect(wrapper.text()).toContain('1200ms')
    expect(wrapper.text()).toContain('0.125')
  })

  it('分组复制写入剪贴板', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    })
    setRuntimeContext({ runId: 'run-9', conversationId: 'conv-9' })
    recordRequest(request())

    const wrapper = mountDrawer(true)
    await wrapper.get('[aria-label="复制运行时上下文"]').trigger('click')
    await flushPromises()
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('run-9'))

    await wrapper.get('[aria-label="复制最近请求"]').trigger('click')
    await flushPromises()
    expect(writeText).toHaveBeenLastCalledWith(expect.stringContaining('req-abc'))
    expect(messageMock.success).toHaveBeenCalled()
  })

  it('点击关闭按钮抛出 close 事件', async () => {
    const wrapper = mountDrawer(true)
    await wrapper.get('[aria-label="关闭诊断抽屉"]').trigger('click')

    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('抽屉自身请求关闭时抛出 close 事件', () => {
    const wrapper = mountDrawer(true)
    wrapper.findComponent(DrawerStub).vm.$emit('update:modelValue', false)

    expect(wrapper.emitted('close')).toHaveLength(1)
  })
})
