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

  it('degraded 由恢复横幅接管，连接条不渲染', () => {
    const wrapper = mount(ConnectionBanner, {
      props: { connection: 'degraded', attempt: 5, maxAttempts: 5 },
    })
    expect(wrapper.find('.connection-banner').exists()).toBe(false)
  })

  it('idle/open 不渲染', () => {
    const wrapper = mount(ConnectionBanner, {
      props: { connection: 'open', attempt: 0 },
    })
    expect(wrapper.find('.connection-banner').exists()).toBe(false)
  })
})
