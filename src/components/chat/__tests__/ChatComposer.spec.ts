import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import ChatComposer from '@/components/chat/ChatComposer.vue'

function mountComposer(props: Record<string, unknown> = {}) {
  return mount(ChatComposer, {
    props: {
      streaming: false,
      model: 'deepseek-chat',
      reasoningEffort: 'low',
      models: [],
      reasoningEfforts: [],
      ...props,
    },
  })
}

describe('ChatComposer', () => {
  it('Enter 发送并清空输入', async () => {
    const wrapper = mountComposer()
    const textarea = wrapper.find('textarea')
    await textarea.setValue('整理一份周报')
    await textarea.trigger('keydown', { key: 'Enter' })

    expect(wrapper.emitted('send')?.[0]).toEqual([{ text: '整理一份周报', context: {} }])
    expect((textarea.element as HTMLTextAreaElement).value).toBe('')
  })

  it('Shift+Enter 不发送', async () => {
    const wrapper = mountComposer()
    const textarea = wrapper.find('textarea')
    await textarea.setValue('换行内容')
    await textarea.trigger('keydown', { key: 'Enter', shiftKey: true })

    expect(wrapper.emitted('send')).toBeUndefined()
  })

  it('空内容不发送', async () => {
    const wrapper = mountComposer()
    const textarea = wrapper.find('textarea')
    await textarea.setValue('   ')
    await textarea.trigger('keydown', { key: 'Enter' })

    expect(wrapper.emitted('send')).toBeUndefined()
  })

  it('流式中按钮变为停止并触发 stop', async () => {
    const wrapper = mountComposer({ streaming: true })
    const button = wrapper.find('button.send')

    expect(button.attributes('aria-label')).toBe('停止生成')
    await button.trigger('click')
    expect(wrapper.emitted('stop')).toHaveLength(1)
  })

  it('发送按钮在无内容时禁用', () => {
    const wrapper = mountComposer()
    const button = wrapper.find('button.send')
    expect(button.attributes('disabled')).toBeDefined()
  })
})
