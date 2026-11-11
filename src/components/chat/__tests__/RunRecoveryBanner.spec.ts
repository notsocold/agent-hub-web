import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import RunRecoveryBanner from '@/components/chat/RunRecoveryBanner.vue'
import type { ChatRecovery } from '@/types'

function recovery(overrides: Partial<ChatRecovery> = {}): ChatRecovery {
  return {
    kind: 'stream_failed',
    code: 'stream_failed',
    message: '连接中断，改为轮询恢复。',
    runId: 'run-1',
    runStatus: 'running',
    retryable: true,
    ...overrides,
  }
}

describe('RunRecoveryBanner M7 降级文案', () => {
  it('run 仍在运行时只提供刷新状态，不提供重试发送', () => {
    const wrapper = mount(RunRecoveryBanner, { props: { recovery: recovery() } })

    const labels = wrapper.findAll('button').map((button) => button.text())
    expect(labels).not.toContain('重试发送')
    expect(labels).toContain('刷新状态')
    wrapper.unmount()
  })

  it('没有 runId 的发送失败仍提供重试发送', () => {
    const wrapper = mount(RunRecoveryBanner, {
      props: { recovery: recovery({ runId: null, runStatus: null }) },
    })

    expect(wrapper.findAll('button').some((button) => button.text() === '重试发送')).toBe(true)
    wrapper.unmount()
  })

  it('run 已终态时允许重试发送', () => {
    const wrapper = mount(RunRecoveryBanner, {
      props: { recovery: recovery({ runStatus: 'failed' }) },
    })

    expect(wrapper.findAll('button').some((button) => button.text() === '重试发送')).toBe(true)
    wrapper.unmount()
  })
})
