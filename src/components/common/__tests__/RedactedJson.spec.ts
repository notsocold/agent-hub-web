import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import RedactedJson from '@/components/common/RedactedJson.vue'

describe('RedactedJson 敏感值遮罩', () => {
  it('默认不渲染明文，点击「显示原始值」后才出现', async () => {
    const wrapper = mount(RedactedJson, {
      props: { value: { password: 'x', nested: { token: 'y' } } },
    })

    const pre = wrapper.find('pre')
    expect(pre.exists()).toBe(true)
    expect(pre.text()).toContain('"password"')
    expect(pre.text()).toContain('••••')
    expect(pre.text()).not.toContain('"x"')
    expect(pre.text()).not.toContain('"y"')
    expect(wrapper.text()).toContain('敏感字段已遮罩')

    const reveal = wrapper.findAll('button').find((button) => button.text() === '显示原始值')
    if (!reveal) throw new Error('未找到「显示原始值」按钮')
    await reveal.trigger('click')

    const revealed = wrapper.find('pre').text()
    expect(revealed).toContain('"x"')
    expect(revealed).toContain('"y"')
    expect(wrapper.text()).toContain('已显示原始值')
    expect(wrapper.findAll('button').some((button) => button.text() === '遮罩')).toBe(true)
  })
})
