import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { workflowsApi } from '@/api/workflows'
import { useWorkflowsStore } from '@/stores/workflows'
import type { Workflow } from '@/types'

vi.mock('@/api/workflows', () => ({
  workflowsApi: {
    list: vi.fn(),
    create: vi.fn(),
    get: vi.fn(),
    update: vi.fn(),
    setEnabled: vi.fn(),
    remove: vi.fn(),
    listRuns: vi.fn(),
  },
}))

function workflow(id: string, patch: Partial<Workflow> = {}): Workflow {
  return {
    id,
    scope: 'user',
    name: `模板 ${id}`,
    description: '示例描述',
    steps: [{ id: 's1', type: 'knowledge_search', title: '检索' }],
    enabled: true,
    version: 1,
    created_at: '2026-11-01T00:00:00Z',
    updated_at: '2026-11-10T00:00:00Z',
    ...patch,
  }
}

function page(items: Workflow[], cursor: string | null, hasMore: boolean) {
  return { items, next_cursor: cursor, has_more: hasMore }
}

describe('workflows store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('load 重置拉取第一页，并记录游标与翻页标记', async () => {
    vi.mocked(workflowsApi.list).mockResolvedValue(
      page([workflow('a'), workflow('b')], 'cursor-1', true),
    )

    const store = useWorkflowsStore()
    await store.load()

    expect(workflowsApi.list).toHaveBeenCalledWith({ limit: 50, cursor: undefined })
    expect(store.items.map((item) => item.id)).toEqual(['a', 'b'])
    expect(store.cursor).toBe('cursor-1')
    expect(store.hasMore).toBe(true)
    expect(store.error).toBeNull()
    expect(store.loading).toBe(false)
  })

  it('load(false) 携带上页 cursor 追加下一页', async () => {
    vi.mocked(workflowsApi.list)
      .mockResolvedValueOnce(page([workflow('a')], 'cursor-1', true))
      .mockResolvedValueOnce(page([workflow('b')], null, false))

    const store = useWorkflowsStore()
    await store.load()
    await store.load(false)

    expect(workflowsApi.list).toHaveBeenLastCalledWith({ limit: 50, cursor: 'cursor-1' })
    expect(store.items.map((item) => item.id)).toEqual(['a', 'b'])
    expect(store.cursor).toBeNull()
    expect(store.hasMore).toBe(false)
  })

  it('refresh 重置列表回到第一页', async () => {
    vi.mocked(workflowsApi.list)
      .mockResolvedValueOnce(page([workflow('a')], 'cursor-1', true))
      .mockResolvedValueOnce(page([workflow('b')], null, false))
      .mockResolvedValueOnce(page([workflow('a'), workflow('c')], null, false))

    const store = useWorkflowsStore()
    await store.load()
    await store.load(false)
    expect(store.items).toHaveLength(2)

    await store.refresh()
    expect(workflowsApi.list).toHaveBeenLastCalledWith({ limit: 50, cursor: undefined })
    expect(store.items.map((item) => item.id)).toEqual(['a', 'c'])
  })

  it('setEnabled 用返回值原地更新本地状态', async () => {
    vi.mocked(workflowsApi.list).mockResolvedValue(page([workflow('a')], null, false))
    vi.mocked(workflowsApi.setEnabled).mockResolvedValue(workflow('a', { enabled: false }))

    const store = useWorkflowsStore()
    await store.load()
    await store.setEnabled('a', false)

    expect(workflowsApi.setEnabled).toHaveBeenCalledWith('a', false)
    expect(store.items[0]?.enabled).toBe(false)
  })

  it('remove 成功后本地剔除', async () => {
    vi.mocked(workflowsApi.list).mockResolvedValue(page([workflow('a'), workflow('b')], null, false))
    vi.mocked(workflowsApi.remove).mockResolvedValue(undefined)

    const store = useWorkflowsStore()
    await store.load()
    await store.remove('a')

    expect(workflowsApi.remove).toHaveBeenCalledWith('a')
    expect(store.items.map((item) => item.id)).toEqual(['b'])
  })

  it('load 失败写入 error 且保留旧列表', async () => {
    vi.mocked(workflowsApi.list)
      .mockResolvedValueOnce(page([workflow('a')], null, false))
      .mockRejectedValueOnce(new Error('网络中断'))

    const store = useWorkflowsStore()
    await store.load()
    await store.refresh()

    expect(store.error).toBe('网络中断')
    expect(store.items.map((item) => item.id)).toEqual(['a'])
    expect(store.loading).toBe(false)
  })
})
