import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import EmptyState from '@/components/common/EmptyState.vue'
import LoadingSkeleton from '@/components/common/LoadingSkeleton.vue'

describe('EmptyState', () => {
  it('默认渲染 md 尺寸并保留默认标题', () => {
    const wrapper = mount(EmptyState)

    expect(wrapper.get('.empty').classes()).toContain('size-md')
    expect(wrapper.text()).toContain('暂无数据')
  })

  it('传 size="sm" 时渲染对应尺寸 class', () => {
    const wrapper = mount(EmptyState, { props: { size: 'sm' } })

    expect(wrapper.get('.empty').classes()).toContain('size-sm')
    expect(wrapper.get('.empty').classes()).not.toContain('size-md')
  })

  it('渲染可选的 icon 插槽', () => {
    const wrapper = mount(EmptyState, {
      slots: { icon: '<span class="test-icon">!</span>' },
    })

    expect(wrapper.find('.empty-icon .test-icon').exists()).toBe(true)
  })
})

describe('LoadingSkeleton', () => {
  it('默认使用 list 变体并渲染 4 个占位行', () => {
    const wrapper = mount(LoadingSkeleton)

    expect(wrapper.get('[role="status"]').attributes('aria-label')).toBe('正在加载')
    expect(wrapper.get('.sr-only').text()).toBe('正在加载')
    expect(wrapper.find('.skeleton-list').attributes('aria-hidden')).toBe('true')
    expect(wrapper.findAll('.skeleton-item')).toHaveLength(4)
  })

  it('按 count 渲染占位行数', () => {
    const wrapper = mount(LoadingSkeleton, {
      props: { variant: 'text', count: 3 },
    })

    expect(wrapper.find('.skeleton-text').exists()).toBe(true)
    expect(wrapper.findAll('.skeleton-item')).toHaveLength(3)
  })
})
