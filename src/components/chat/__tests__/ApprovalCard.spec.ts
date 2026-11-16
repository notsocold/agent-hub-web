import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import ApprovalCard from '@/components/chat/cards/ApprovalCard.vue'
import type { ApprovalProcess } from '@/types'

function approval(overrides: Partial<ApprovalProcess> = {}): ApprovalProcess {
  return {
    kind: 'approval',
    id: 'approval:ap-1',
    status: 'waiting',
    startedAt: '2026-11-11T10:00:00Z',
    approvalId: 'ap-1',
    tool: 'filesystem.write',
    toolDisplayName: '文件写入',
    source: 'native',
    executor: 'filesystem',
    target: 'artifacts/a.md',
    sideEffect: '覆盖同名文件',
    risk: 'write',
    reason: '写文件需要确认',
    expiresAt: null,
    decision: null,
    ...overrides,
  }
}

describe('ApprovalCard M7 审批字段', () => {
  it('只有 payload_preview 时展示脱敏预览，不请求完整参数', () => {
    const wrapper = mount(ApprovalCard, {
      props: {
        item: approval({ payloadPreview: '{"path":"artifacts/a.md","mode":"overwrite"}' }),
      },
    })

    const text = wrapper.text()
    expect(text).toContain('参数预览（已脱敏）')
    expect(text).toContain('artifacts/a.md')
    expect(text).not.toContain('查看参数')
    wrapper.unmount()
  })

  it('有完整 payload 时保留可折叠的“查看参数”', () => {
    const wrapper = mount(ApprovalCard, {
      props: { item: approval({ payload: { path: 'artifacts/a.md' } }) },
    })

    expect(wrapper.text()).toContain('查看参数')
    expect(wrapper.text()).not.toContain('参数预览不可用')
    wrapper.unmount()
  })

  it('既无 payload 也无 preview 时明确提示不可用', () => {
    const wrapper = mount(ApprovalCard, { props: { item: approval() } })

    expect(wrapper.text()).toContain('参数预览不可用')
    wrapper.unmount()
  })

  it('preview 中的敏感值再次遮罩', () => {
    const wrapper = mount(ApprovalCard, {
      props: {
        item: approval({ payloadPreview: '{"api_token":"sk-live-123456","channel":"C1"}' }),
      },
    })

    const text = wrapper.text()
    expect(text).not.toContain('sk-live-123456')
    expect(text).toContain('••••')
    expect(text).toContain('C1')
    wrapper.unmount()
  })
})

describe('ApprovalCard D3 审批备注', () => {
  it('待决卡提供可访问的备注输入与字数提示，空备注也允许批准', async () => {
    const wrapper = mount(ApprovalCard, { props: { item: approval() } })

    expect(wrapper.get('label').text()).toBe('审批备注（可选）')
    const textarea = wrapper.get('textarea')
    expect(textarea.attributes('maxlength')).toBe('500')
    expect(wrapper.get('.approval-note-meta').text()).toContain('0 / 500')
    // 空备注不阻塞批准。
    expect(wrapper.get('[data-approval-approve]').attributes('disabled')).toBeUndefined()

    await wrapper.get('[data-approval-approve]').trigger('click')
    expect(wrapper.emitted('approve')?.[0]).toEqual([''])
    wrapper.unmount()
  })

  it('带备注批准/拒绝时按 note 事件抛出，字数实时更新', async () => {
    const wrapper = mount(ApprovalCard, { props: { item: approval() } })
    const textarea = wrapper.get('textarea')

    await textarea.setValue('已确认风险，批准执行')
    expect(wrapper.get('.approval-note-meta').text()).toContain('10 / 500')
    await wrapper.get('[data-approval-approve]').trigger('click')
    expect(wrapper.emitted('approve')?.[0]).toEqual(['已确认风险，批准执行'])

    const rejectWrapper = mount(ApprovalCard, { props: { item: approval() } })
    await rejectWrapper.get('textarea').setValue('理由不充分')
    await rejectWrapper.get('.btn-outline').trigger('click')
    expect(rejectWrapper.emitted('reject')?.[0]).toEqual(['理由不充分'])
    wrapper.unmount()
    rejectWrapper.unmount()
  })

  it('备注超过 500 字符时截断后再提交', async () => {
    const wrapper = mount(ApprovalCard, { props: { item: approval() } })
    await wrapper.get('textarea').setValue('长'.repeat(600))

    await wrapper.get('[data-approval-approve]').trigger('click')
    const emitted = wrapper.emitted('approve')?.[0]?.[0]
    expect(emitted).toHaveLength(500)
    wrapper.unmount()
  })

  it('已决卡展示 decisionNote，且不再提供输入', () => {
    const wrapper = mount(ApprovalCard, {
      props: {
        item: approval({ decision: 'reject', status: 'canceled', decisionNote: '先走内部评审' }),
      },
    })

    expect(wrapper.find('textarea').exists()).toBe(false)
    expect(wrapper.text()).toContain('备注：先走内部评审')
    wrapper.unmount()
  })

  it('已决备注中的敏感值用 redactText 遮罩', () => {
    const wrapper = mount(ApprovalCard, {
      props: {
        item: approval({
          decision: 'approve',
          status: 'ok',
          decisionNote: '{"api_token":"sk-live-123456"}',
        }),
      },
    })

    const text = wrapper.text()
    expect(text).not.toContain('sk-live-123456')
    expect(text).toContain('••••')
    wrapper.unmount()
  })

  it('过期/取消的审批不显示备注输入', () => {
    const expired = mount(ApprovalCard, {
      props: { item: approval({ expiresAt: '2020-01-01T00:00:00Z' }) },
    })
    const canceled = mount(ApprovalCard, {
      props: { item: approval({ status: 'canceled' }) },
    })

    expect(expired.find('textarea').exists()).toBe(false)
    expect(canceled.find('textarea').exists()).toBe(false)
    expired.unmount()
    canceled.unmount()
  })
})

describe('ApprovalCard 历史回放与过期判定', () => {
  it('已处理的历史卡即使超过 expires_at 也不显示过期', () => {
    const wrapper = mount(ApprovalCard, {
      props: {
        item: approval({
          status: 'ok',
          expiresAt: '2020-01-01T00:00:00Z',
        }),
      },
    })

    const text = wrapper.text()
    expect(text).not.toContain('已过期')
    expect(text).not.toContain('审批已过期')
    expect(text).toContain('已处理')
    // 已决卡不应再出现操作按钮。
    expect(wrapper.find('[data-approval-approve]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('仍待审批的卡超过 expires_at 才显示过期且不可操作', () => {
    const wrapper = mount(ApprovalCard, {
      props: {
        item: approval({
          status: 'waiting',
          expiresAt: '2020-01-01T00:00:00Z',
        }),
      },
    })

    const text = wrapper.text()
    expect(text).toContain('已过期')
    expect(wrapper.find('[data-approval-approve]').exists()).toBe(false)
    wrapper.unmount()
  })
})
