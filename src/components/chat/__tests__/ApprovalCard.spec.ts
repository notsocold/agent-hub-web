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
