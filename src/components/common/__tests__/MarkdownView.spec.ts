import { flushPromises, mount } from '@vue/test-utils'
import { ElMessageBox } from 'element-plus'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import MarkdownView from '@/components/common/MarkdownView.vue'

vi.mock('element-plus', () => ({
  ElMessageBox: {
    confirm: vi.fn().mockResolvedValue('confirm'),
  },
}))

describe('MarkdownView 外链确认', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(ElMessageBox.confirm).mockResolvedValue('confirm' as never)
    vi.spyOn(window, 'open').mockImplementation(() => null)
  })

  it('外部链接确认后以 noopener,noreferrer 新标签打开', async () => {
    const wrapper = mount(MarkdownView, {
      props: { content: '[外部文档](https://example.com/docs)' },
    })

    await wrapper.find('a').trigger('click')
    await flushPromises()

    expect(ElMessageBox.confirm).toHaveBeenCalledTimes(1)
    expect(window.open).toHaveBeenCalledWith(
      'https://example.com/docs',
      '_blank',
      'noopener,noreferrer',
    )
  })

  it('同源链接不弹确认', async () => {
    const wrapper = mount(MarkdownView, {
      props: { content: '[对话页](/chat)' },
    })

    await wrapper.find('a').trigger('click')
    await flushPromises()

    expect(ElMessageBox.confirm).not.toHaveBeenCalled()
    expect(window.open).not.toHaveBeenCalled()
  })

  it('mailto 与纯锚点不拦截', async () => {
    const wrapper = mount(MarkdownView, {
      props: { content: '[邮件](mailto:a@example.com) [锚点](#section)' },
    })

    const links = wrapper.findAll('a')
    await links[0]?.trigger('click')
    await links[1]?.trigger('click')
    await flushPromises()

    expect(ElMessageBox.confirm).not.toHaveBeenCalled()
  })

  it('带修饰键的外部链接不拦截，保留浏览器默认行为', async () => {
    const wrapper = mount(MarkdownView, {
      props: { content: '[外部文档](https://example.com/docs)' },
    })

    await wrapper.find('a').trigger('click', { ctrlKey: true })
    await flushPromises()

    expect(ElMessageBox.confirm).not.toHaveBeenCalled()
    expect(window.open).not.toHaveBeenCalled()
  })
})
