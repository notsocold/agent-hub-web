import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'

import AgentEditDialog from '@/components/agents/AgentEditDialog.vue'
import { ApiRequestError } from '@/api/client'
import type { AgentAuthInput, AgentDetail } from '@/types'

const agentsApiMock = vi.hoisted(() => ({
  list: vi.fn(),
  preview: vi.fn(),
  create: vi.fn(),
  get: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  refresh: vi.fn(),
  health: vi.fn(),
}))

vi.mock('@/api/agents', () => ({ agentsApi: agentsApiMock }))

/** Element Plus dialog 在 jsdom 下 teleport 到 body；用 stub 渲染默认/页脚插槽即可。 */
const ElDialogStub = defineComponent({
  name: 'ElDialog',
  props: {
    modelValue: { type: Boolean, default: false },
    title: { type: String, default: '' },
  },
  setup(props, { slots }) {
    return () =>
      h('div', { class: 'dialog-stub' }, [
        h('h2', { class: 'dialog-title' }, props.title),
        slots.default?.(),
        slots.footer?.(),
      ])
  },
})

function agentDetail(overrides: Partial<AgentDetail> = {}): AgentDetail {
  return {
    id: 'agent-1',
    slug: 'data-agent',
    name: '数据 Agent',
    description: '查询订单数据',
    url: 'https://agent.example.com/a2a',
    protocol_version: '0.3.0',
    skills: [{ id: 'orders', name: '订单查询' }],
    skill_count: 1,
    auth_type: 'api_key',
    auth_scheme: 'bearer',
    auth_hint: 'env:OLD_AGENT_KEY',
    capabilities: { streaming: true, push_notifications: false },
    health_status: 'healthy',
    enabled: true,
    last_checked_at: '2026-11-10T08:00:00Z',
    last_latency_ms: 120,
    last_error: null,
    recent_task: null,
    created_at: '2026-11-01T08:00:00Z',
    updated_at: '2026-11-10T08:00:00Z',
    card: { name: '数据 Agent' },
    recent_tasks: [],
    ...overrides,
  }
}

async function mountDialog(agent: AgentDetail = agentDetail()): Promise<VueWrapper> {
  const wrapper = mount(AgentEditDialog, {
    props: { modelValue: true, agent },
    global: { stubs: { 'el-dialog': ElDialogStub } },
  })
  await flushPromises()
  return wrapper
}

function inputOf(wrapper: VueWrapper, testId: string) {
  return wrapper.find(`[data-testid="${testId}"]`)
}

function element<T extends HTMLElement>(wrapper: VueWrapper, testId: string): T {
  return inputOf(wrapper, testId).element as T
}

async function clickSave(wrapper: VueWrapper): Promise<void> {
  await inputOf(wrapper, 'agent-edit-save').trigger('click')
  await flushPromises()
}

beforeEach(() => {
  vi.clearAllMocks()
  agentsApiMock.update.mockResolvedValue(agentDetail({ name: '新名称' }))
})

describe('AgentEditDialog', () => {
  it('AgentAuthInput.type 与后端枚举一致（none/api_key/oauth2）', () => {
    expectTypeOf<AgentAuthInput['type']>().toEqualTypeOf<'none' | 'api_key' | 'oauth2'>()
  })

  it('打开时回填名称与鉴权类型，凭据引用留空表示不修改', async () => {
    const wrapper = await mountDialog()

    expect(element<HTMLInputElement>(wrapper, 'agent-edit-name').value).toBe('数据 Agent')
    expect(element<HTMLSelectElement>(wrapper, 'agent-edit-auth-type').value).toBe('api_key')
    expect(element<HTMLInputElement>(wrapper, 'agent-edit-secret').value).toBe('')
    expect(inputOf(wrapper, 'agent-edit-headers-note').text()).toContain('当前不支持编辑')
    expect(inputOf(wrapper, 'agent-edit-headers-note').text()).toContain('A2')
    wrapper.unmount()
  })

  it('名称必填且不超过 128 字符，校验失败不发起请求', async () => {
    const wrapper = await mountDialog()

    await inputOf(wrapper, 'agent-edit-name').setValue('   ')
    await clickSave(wrapper)
    expect(inputOf(wrapper, 'agent-edit-error').text()).toContain('名称不能为空')
    expect(agentsApiMock.update).not.toHaveBeenCalled()

    await inputOf(wrapper, 'agent-edit-name').setValue('x'.repeat(129))
    await clickSave(wrapper)
    expect(inputOf(wrapper, 'agent-edit-error').text()).toContain('超过上限 128')
    expect(agentsApiMock.update).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('凭据引用只接受 env: / secret: 前缀，格式错误行内提示', async () => {
    const wrapper = await mountDialog()

    await inputOf(wrapper, 'agent-edit-secret').setValue('plain-text-key')
    await clickSave(wrapper)
    expect(inputOf(wrapper, 'agent-edit-error').text()).toContain('凭据引用格式无效')
    expect(agentsApiMock.update).not.toHaveBeenCalled()

    await inputOf(wrapper, 'agent-edit-secret').setValue('env:DATA_AGENT_KEY')
    await clickSave(wrapper)
    expect(agentsApiMock.update).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('切换到 API Key 时必须填写凭据引用', async () => {
    const wrapper = await mountDialog(agentDetail({ auth_type: 'none', auth_scheme: 'none' }))

    await inputOf(wrapper, 'agent-edit-name').setValue('数据 Agent')
    await inputOf(wrapper, 'agent-edit-auth-type').setValue('api_key')
    // 名称未变、只切换类型且引用为空：拦住，避免后端清空已有引用。
    await clickSave(wrapper)
    expect(inputOf(wrapper, 'agent-edit-error').text()).toContain('需要填写凭据引用')
    expect(agentsApiMock.update).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('提交 payload 只包含变更字段，不含 headers/enabled/slug', async () => {
    const wrapper = await mountDialog()

    await inputOf(wrapper, 'agent-edit-name').setValue('数据 Agent v2')
    await inputOf(wrapper, 'agent-edit-auth-type').setValue('oauth2')
    // oauth2 无需凭据引用：隐藏输入框并给出说明，行为与类型放宽前一致。
    expect(inputOf(wrapper, 'agent-edit-secret').exists()).toBe(false)
    expect(wrapper.text()).toContain('OAuth2 由远程 Agent 自行完成授权流程，无需在此填写凭据引用。')
    await clickSave(wrapper)

    expect(agentsApiMock.update).toHaveBeenCalledTimes(1)
    expect(agentsApiMock.update).toHaveBeenCalledWith('agent-1', {
      name: '数据 Agent v2',
      auth: { type: 'oauth2' },
    })
    const payload = agentsApiMock.update.mock.calls[0]?.[1] as Record<string, unknown>
    expect(payload).not.toHaveProperty('headers')
    expect(payload).not.toHaveProperty('enabled')
    expect(payload).not.toHaveProperty('slug')
    wrapper.unmount()
  })

  it('只填写凭据引用时提交 auth.secret_ref，类型沿用当前值', async () => {
    const wrapper = await mountDialog()

    await inputOf(wrapper, 'agent-edit-secret').setValue('secret:AGENT_KEY')
    await clickSave(wrapper)

    expect(agentsApiMock.update).toHaveBeenCalledWith('agent-1', {
      auth: { type: 'api_key', secret_ref: 'secret:AGENT_KEY' },
    })
    wrapper.unmount()
  })

  it('成功后 emit saved（携带后端详情）并请求关闭', async () => {
    const updated = agentDetail({ name: '改名后的 Agent', auth_type: 'none' })
    agentsApiMock.update.mockResolvedValueOnce(updated)
    const wrapper = await mountDialog()

    await inputOf(wrapper, 'agent-edit-name').setValue('改名后的 Agent')
    await inputOf(wrapper, 'agent-edit-auth-type').setValue('none')
    await clickSave(wrapper)

    expect(wrapper.emitted('saved')?.[0]).toEqual([updated])
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([false])
    wrapper.unmount()
  })

  it('没有变更时不发起请求，提示无需保存', async () => {
    const wrapper = await mountDialog()

    await clickSave(wrapper)
    expect(inputOf(wrapper, 'agent-edit-error').text()).toContain('没有需要保存的变更')
    expect(agentsApiMock.update).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it.each([
    [
      '403',
      new ApiRequestError('当前账号无管理员权限', { code: 'forbidden', status: 403 }),
      '无权限',
    ],
    [
      '422',
      new ApiRequestError('请求参数不合法：name String should have at most 128 characters', {
        code: 'validation_error',
        status: 422,
      }),
      '参数校验失败',
    ],
    ['404', new ApiRequestError('智能体不存在', { code: 'not_found', status: 404 }), '已被删除'],
    ['409', new ApiRequestError('资源冲突', { code: 'conflict', status: 409 }), '保存冲突'],
  ])('保存失败按 %s 分支展示文案', async (_label, error, expected) => {
    agentsApiMock.update.mockRejectedValueOnce(error)
    const wrapper = await mountDialog()

    await inputOf(wrapper, 'agent-edit-name').setValue('新名称')
    await clickSave(wrapper)

    expect(inputOf(wrapper, 'agent-edit-error').text()).toContain(expected)
    // 失败不关闭，表单内容保留。
    expect(wrapper.emitted('saved')).toBeUndefined()
    expect(element<HTMLInputElement>(wrapper, 'agent-edit-name').value).toBe('新名称')
    wrapper.unmount()
  })
})
