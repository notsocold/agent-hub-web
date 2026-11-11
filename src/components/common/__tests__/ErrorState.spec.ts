import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'

import ErrorState from '@/components/common/ErrorState.vue'

describe('ErrorState', () => {
  it('有 requestId 时渲染并支持复制', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    })

    const wrapper = mount(ErrorState, {
      props: { message: '无权限', requestId: 'req-9' },
    })

    expect(wrapper.text()).toContain('req-9')
    await wrapper.get('[aria-label="复制 request_id"]').trigger('click')
    expect(writeText).toHaveBeenCalledWith('req-9')
  })

  it('无 requestId 时不渲染复制按钮', () => {
    const wrapper = mount(ErrorState, { props: { message: '请求失败' } })
    expect(wrapper.find('[aria-label="复制 request_id"]').exists()).toBe(false)
  })

  it('点击重试抛出事件', async () => {
    const wrapper = mount(ErrorState, { props: { message: '请求失败' } })
    await wrapper.get('.retry').trigger('click')
    expect(wrapper.emitted('retry')).toHaveLength(1)
  })
})
