import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiRequestError } from '@/api/client'
import AdminInstructionCard from '@/components/admin/AdminInstructionCard.vue'
import type { AdminInstruction } from '@/types'

const adminApiMock = vi.hoisted(() => ({
  instruction: vi.fn(),
  saveInstruction: vi.fn(),
}))
vi.mock('@/api/admin', () => ({ adminApi: adminApiMock }))

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

function instruction(overrides: Partial<AdminInstruction> = {}): AdminInstruction {
  return {
    content: '你是 Agent Hub 的主智能体，回答保持简洁。',
    is_default: true,
    max_chars: 4000,
    user_override_count: 2,
    updated_by: null,
    updated_by_email: null,
    updated_at: null,
    ...overrides,
  }
}

async function mountCard(initial: AdminInstruction = instruction()): Promise<VueWrapper> {
  adminApiMock.instruction.mockResolvedValue(initial)
  const wrapper = mount(AdminInstructionCard)
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  vi.clearAllMocks()
  adminApiMock.saveInstruction.mockResolvedValue(instruction())
  messageBoxMock.confirm.mockResolvedValue(true)
})

describe('AdminInstructionCard', () => {
  it('渲染内置默认指令与元信息', async () => {
    const wrapper = await mountCard()

    expect(wrapper.text()).toContain('平台默认指令')
    expect(wrapper.text()).toContain('内置默认')
    expect(wrapper.find('textarea').element as HTMLTextAreaElement).toHaveProperty(
      'value',
      instruction().content,
    )
    expect(wrapper.text()).toContain('2 位用户写了个人指令')
    // 未修改时保存禁用。
    expect(
      wrapper
        .findAll('button')
        .find((b) => b.text() === '保存')!
        .attributes('disabled'),
    ).toBeDefined()
    wrapper.unmount()
  })

  it('自定义指令展示更新人与时间', async () => {
    const wrapper = await mountCard(
      instruction({
        is_default: false,
        updated_by: 'admin-1',
        updated_by_email: 'dev@example.com',
        updated_at: '2026-11-11T08:00:00Z',
      }),
    )

    expect(wrapper.text()).toContain('已自定义')
    expect(wrapper.text()).toContain('dev@example.com')
    expect(wrapper.text()).toContain('2026-11-11 16:00')
    wrapper.unmount()
  })

  it('确认后保存非空内容', async () => {
    adminApiMock.saveInstruction.mockResolvedValue(
      instruction({
        is_default: false,
        content: '新的平台默认指令',
        updated_by_email: 'dev@example.com',
        updated_at: '2026-11-12T08:00:00Z',
      }),
    )
    const wrapper = await mountCard()

    await wrapper.find('textarea').setValue('新的平台默认指令')
    const saveButton = wrapper.findAll('button').find((b) => b.text() === '保存')!
    expect(saveButton.attributes('disabled')).toBeUndefined()
    await saveButton.trigger('click')
    await flushPromises()

    expect(messageBoxMock.confirm).toHaveBeenCalled()
    expect(adminApiMock.saveInstruction).toHaveBeenCalledWith('新的平台默认指令')
    expect(messageMock.success).toHaveBeenCalledWith('平台指令已保存')
    expect(wrapper.text()).toContain('dev@example.com')
    wrapper.unmount()
  })

  it('恢复内置默认提交 null', async () => {
    adminApiMock.saveInstruction.mockResolvedValue(instruction())
    const wrapper = await mountCard(instruction({ is_default: false, content: '已自定义的指令' }))

    await wrapper
      .findAll('button')
      .find((b) => b.text() === '恢复内置默认')!
      .trigger('click')
    await flushPromises()

    expect(adminApiMock.saveInstruction).toHaveBeenCalledWith(null)
    expect(messageMock.success).toHaveBeenCalledWith('已恢复内置默认指令')
    expect(wrapper.text()).toContain('内置默认')
    wrapper.unmount()
  })

  it('已是默认时恢复按钮提示 no-op', async () => {
    const wrapper = await mountCard()

    await wrapper
      .findAll('button')
      .find((b) => b.text() === '恢复内置默认')!
      .trigger('click')

    expect(messageMock.info).toHaveBeenCalledWith('当前已是内置默认指令')
    expect(adminApiMock.saveInstruction).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('超长时计数标红并禁用保存', async () => {
    const wrapper = await mountCard(instruction({ max_chars: 10 }))

    await wrapper.find('textarea').setValue('这一段内容明显超过了十个字符的上限限制')
    await flushPromises()

    expect(wrapper.text()).toContain('剩余 -9')
    const saveButton = wrapper.findAll('button').find((b) => b.text() === '保存')!
    expect(saveButton.attributes('disabled')).toBeDefined()
    wrapper.unmount()
  })

  it('后端 instruction_too_long 提示上限', async () => {
    adminApiMock.saveInstruction.mockRejectedValue(
      new ApiRequestError('指令超过 4000 字符上限', {
        code: 'instruction_too_long',
        status: 422,
      }),
    )
    const wrapper = await mountCard()

    await wrapper.find('textarea').setValue('合法长度的内容')
    await wrapper
      .findAll('button')
      .find((b) => b.text() === '保存')!
      .trigger('click')
    await flushPromises()

    expect(messageMock.error).toHaveBeenCalledWith('指令超过 4000 字符上限')
    wrapper.unmount()
  })
})
