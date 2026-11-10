import { flushPromises, mount } from '@vue/test-utils'
import { ElDialog, ElTable, ElTableColumn } from 'element-plus'
import { nextTick } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import ApprovalsView from '@/views/ApprovalsView.vue'
import type { Approval, ApprovalDecisionResult, PageResult } from '@/types'

const api = vi.hoisted(() => ({
  list: vi.fn(),
  detail: vi.fn(),
  decide: vi.fn(),
}))

vi.mock('@/api/approvals', () => ({ approvalsApi: api }))

const routerMock = vi.hoisted(() => ({
  query: {} as Record<string, string>,
  replace: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({ query: routerMock.query }),
  useRouter: () => ({ replace: routerMock.replace }),
}))

function approval(id: string, overrides: Partial<Approval> = {}): Approval {
  return {
    id,
    run_id: 'run-1',
    conversation_id: 'conv-1',
    conversation_title: '会话一',
    status: 'pending',
    tool_name: 'filesystem.write',
    tool_display_name: '文件写入',
    source: 'native',
    executor: 'filesystem',
    target: 'artifacts/a.md',
    side_effect: '覆盖同名文件',
    risk: 'write',
    reason: '写文件需要确认',
    payload: { path: 'artifacts/a.md' },
    payload_preview: '{"path":"artifacts/a.md"}',
    expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    created_at: '2026-11-01T00:00:00Z',
    decided_at: null,
    decided_by: null,
    decision_note: '',
    ...overrides,
  }
}

function approvalPage(items: Approval[], stats: Record<string, number> = {}): PageResult<Approval> {
  return {
    items,
    next_cursor: null,
    has_more: false,
    stats: {
      pending: 0,
      approved: 0,
      rejected: 0,
      expired: 0,
      canceled: 0,
      ...stats,
    },
  }
}

function decisionResult(overrides: Partial<ApprovalDecisionResult> = {}): ApprovalDecisionResult {
  return {
    id: 'ap-1',
    status: 'approved',
    run_id: 'run-1',
    resumed: true,
    resume_error: null,
    ...overrides,
  }
}

async function mountView() {
  const wrapper = mount(ApprovalsView, {
    global: {
      components: { ElDialog, ElTable, ElTableColumn },
      stubs: { ApprovalDetailDrawer: true },
    },
  })
  await flushPromises()
  await nextTick()
  return wrapper
}

describe('ApprovalsView 审批中心', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    routerMock.query = {}
    api.list.mockResolvedValue(approvalPage([]))
    api.detail.mockResolvedValue(approval('ap-1'))
    api.decide.mockResolvedValue(decisionResult())
  })

  it('首屏按 pending 拉取并渲染 5 个统计卡与列表行', async () => {
    api.list.mockResolvedValue(
      approvalPage(
        [
          approval('ap-1'),
          approval('ap-2', {
            tool_display_name: '',
            tool_name: 'shell.exec',
            status: 'expired',
            expires_at: '2026-10-01T00:00:00Z',
          }),
        ],
        { pending: 2, approved: 1, rejected: 1, expired: 0, canceled: 0 },
      ),
    )

    const wrapper = await mountView()

    expect(api.list).toHaveBeenCalledWith({ status: 'pending', limit: 20 })
    const values = wrapper
      .findAll('[data-testid="approval-stats"] .value')
      .map((item) => item.text())
    expect(values).toEqual(['2', '1', '1', '0', '0'])
    expect(wrapper.findAll('[data-testid="approval-tool"]')).toHaveLength(2)
    expect(wrapper.text()).toContain('文件写入')
    expect(wrapper.text()).toContain('shell.exec')
  })

  it('切换历史并选择状态后按 status 重新请求', async () => {
    const wrapper = await mountView()

    await wrapper.find('[data-testid="approval-tab-history"]').trigger('click')
    await flushPromises()
    expect(api.list).toHaveBeenLastCalledWith({ status: 'all', limit: 20 })

    const filter = wrapper.find('[data-testid="history-status-filter"]')
    expect(filter.exists()).toBe(true)
    await filter.setValue('rejected')
    await flushPromises()

    expect(api.list).toHaveBeenLastCalledWith({ status: 'rejected', limit: 20 })
  })

  it('从 route.query 读取 conversation_id 过滤，并可清除', async () => {
    routerMock.query = { conversation_id: 'conv-42' }
    api.list.mockResolvedValue(
      approvalPage([
        approval('ap-1', { conversation_id: 'conv-42', conversation_title: '退款工单' }),
      ]),
    )

    const wrapper = await mountView()

    expect(api.list).toHaveBeenCalledWith({
      status: 'pending',
      conversation_id: 'conv-42',
      limit: 20,
    })
    expect(wrapper.find('[data-testid="scope-filter"]').text()).toContain('退款工单')

    await wrapper.find('[data-testid="clear-scope-filter"]').trigger('click')
    await flushPromises()

    expect(routerMock.replace).toHaveBeenCalled()
    expect(api.list).toHaveBeenLastCalledWith({ status: 'pending', limit: 20 })
    expect(wrapper.find('[data-testid="scope-filter"]').exists()).toBe(false)
  })

  it('批准弹窗提交后调用 decide 并刷新列表', async () => {
    api.list.mockResolvedValue(approvalPage([approval('ap-1')]))
    const wrapper = await mountView()

    await wrapper.find('[data-testid="approve-ap-1"]').trigger('click')
    await nextTick()

    const note = wrapper.find('[data-testid="decision-note"]')
    expect(note.exists()).toBe(true)
    await note.setValue('确认执行')
    await wrapper.find('[data-testid="confirm-decision"]').trigger('click')
    await flushPromises()

    expect(api.decide).toHaveBeenCalledWith('ap-1', {
      decision: 'approve',
      note: '确认执行',
    })
    expect(api.list).toHaveBeenCalledTimes(2)
  })
})
