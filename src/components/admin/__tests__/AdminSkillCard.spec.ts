import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiRequestError } from '@/api/client'
import AdminSkillCard from '@/components/admin/AdminSkillCard.vue'
import type { AdminSkillList, Skill } from '@/types'

const adminApiMock = vi.hoisted(() => ({
  skills: vi.fn(),
  setSkillEnabled: vi.fn(),
  setSkillForceDisabled: vi.fn(),
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

function skill(overrides: Partial<Skill> = {}): Skill {
  return {
    id: 'skill-1',
    slug: 'weekly-report',
    name: '周报生成',
    description: '汇总一周工作项并生成周报',
    scope: 'system',
    enabled: true,
    estimated_tokens: 1200,
    file_count: 2,
    size_bytes: 4096,
    version: '1.2.0',
    source: 'builtin',
    force_disabled: false,
    ...overrides,
  }
}

function skillList(overrides: Partial<AdminSkillList> = {}): AdminSkillList {
  return {
    items: [skill()],
    stats: { total: 1, enabled: 1, force_disabled: 0 },
    ...overrides,
  }
}

async function mountCard(): Promise<VueWrapper> {
  adminApiMock.skills.mockResolvedValue(skillList())
  const wrapper = mount(AdminSkillCard)
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  vi.clearAllMocks()
  adminApiMock.setSkillEnabled.mockResolvedValue(skill())
  adminApiMock.setSkillForceDisabled.mockResolvedValue(skill())
  messageBoxMock.confirm.mockResolvedValue(true)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('AdminSkillCard', () => {
  it('渲染列表、stats 与生效标签', async () => {
    const wrapper = await mountCard()

    expect(wrapper.text()).toContain('系统技能')
    expect(wrapper.text()).toContain('1 个 · 1 启用 · 0 强制停用')
    expect(wrapper.text()).toContain('周报生成')
    expect(wrapper.text()).toContain('weekly-report')
    expect(wrapper.text()).toContain('1.2.0 / builtin')
    expect(wrapper.text()).toContain('启用')
    wrapper.unmount()
  })

  it('确认后全局停用并更新行', async () => {
    adminApiMock.setSkillEnabled.mockResolvedValue(skill({ enabled: false }))
    const wrapper = await mountCard()

    await wrapper.findAll('tbody button').find((b) => b.text() === '停用')!.trigger('click')
    await flushPromises()

    expect(messageBoxMock.confirm).toHaveBeenCalled()
    expect(adminApiMock.setSkillEnabled).toHaveBeenCalledWith('skill-1', false)
    expect(messageMock.success).toHaveBeenCalledWith('技能已停用')
    wrapper.unmount()
  })

  it('强制停用后生效标签变化', async () => {
    adminApiMock.setSkillForceDisabled.mockResolvedValue(
      skill({ force_disabled: true, effective_enabled: false }),
    )
    const wrapper = await mountCard()

    await wrapper
      .findAll('tbody button')
      .find((b) => b.text() === '强制停用')!
      .trigger('click')
    await flushPromises()

    expect(adminApiMock.setSkillForceDisabled).toHaveBeenCalledWith('skill-1', true)
    expect(messageMock.success).toHaveBeenCalledWith('已强制停用（优先级最高）')
    expect(wrapper.text()).toContain('已强制停用')
    wrapper.unmount()
  })

  it('取消确认不提交', async () => {
    messageBoxMock.confirm.mockRejectedValue('cancel')
    const wrapper = await mountCard()

    await wrapper.findAll('tbody button').find((b) => b.text() === '停用')!.trigger('click')
    await flushPromises()

    expect(adminApiMock.setSkillEnabled).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('操作失败提示并刷新列表', async () => {
    const wrapper = await mountCard()
    const callsBefore = adminApiMock.skills.mock.calls.length

    adminApiMock.setSkillEnabled.mockRejectedValue(
      new ApiRequestError('系统技能不存在', { code: 'not_found', status: 404 }),
    )
    await wrapper.findAll('tbody button').find((b) => b.text() === '停用')!.trigger('click')
    await flushPromises()

    expect(messageMock.error).toHaveBeenCalledWith('系统技能不存在')
    expect(adminApiMock.skills.mock.calls.length).toBeGreaterThan(callsBefore)
    wrapper.unmount()
  })

  it('搜索防抖后带 q 请求', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      const wrapper = await mountCard()
      const initialCalls = adminApiMock.skills.mock.calls.length

      await wrapper.find('input[type="search"]').setValue('周报')
      expect(adminApiMock.skills.mock.calls.length).toBe(initialCalls)

      await vi.advanceTimersByTimeAsync(400)
      await flushPromises()

      expect(adminApiMock.skills.mock.calls.length).toBe(initialCalls + 1)
      expect(adminApiMock.skills.mock.calls.at(-1)![0]).toBe('周报')
      wrapper.unmount()
    } finally {
      vi.useRealTimers()
    }
  })
})
