import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import ConnectionBanner from '@/components/chat/ConnectionBanner.vue'

describe('ConnectionBanner', () => {
  it('重连中展示次数并可停止', async () => {
    const wrapper = mount(ConnectionBanner, {
      props: { connection: 'reconnecting', attempt: 2, maxAttempts: 5 },
    })
    expect(wrapper.text()).toContain('第 2/5 次')
    await wrapper.get('.action').trigger('click')
    expect(wrapper.emitted('stop')).toHaveLength(1)
  })

  it('degraded 时提示轮询恢复并可重新连接', async () => {
    const wrapper = mount(ConnectionBanner, {
      props: { connection: 'degraded', attempt: 5, maxAttempts: 5 },
    })
    expect(wrapper.text()).toContain('通过轮询恢复')
    await wrapper.get('.action').trigger('click')
    expect(wrapper.emitted('retry')).toHaveLength(1)
  })

  it('idle/open 不渲染', () => {
    const wrapper = mount(ConnectionBanner, {
      props: { connection: 'open', attempt: 0 },
    })
    expect(wrapper.find('.connection-banner').exists()).toBe(false)
  })
})
