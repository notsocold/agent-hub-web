import { ref } from 'vue'
import { defineStore } from 'pinia'

import { workflowsApi } from '@/api/workflows'
import type { Workflow } from '@/types'

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '加载工作流失败'
}

/**
 * M9 工作流列表 store：系统模板 + 本人模板的游标分页列表，
 * 以及启停（原地更新）与删除（本地剔除）的本地状态同步。
 */
export const useWorkflowsStore = defineStore('workflows', () => {
  const items = ref<Workflow[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const cursor = ref<string | null>(null)
  const hasMore = ref(false)

  /**
   * 游标分页加载：`reset` 为 true（默认）时重置为第一页，
   * 为 false 时携带上一页 `cursor` 追加下一页。
   */
  async function load(reset = true): Promise<void> {
    if (loading.value) return
    loading.value = true
    error.value = null
    try {
      const page = await workflowsApi.list({
        limit: 50,
        cursor: reset ? undefined : (cursor.value ?? undefined),
      })
      items.value = reset ? page.items : [...items.value, ...page.items]
      cursor.value = page.next_cursor
      hasMore.value = page.has_more
    } catch (cause) {
      error.value = errorMessage(cause)
    } finally {
      loading.value = false
    }
  }

  /** 重置回第一页重新拉取（重试与操作后刷新共用）。 */
  async function refresh(): Promise<void> {
    await load(true)
  }

  /** 启停本人模板：成功后用返回值原地更新本地条目。 */
  async function setEnabled(id: string, enabled: boolean): Promise<void> {
    const updated = await workflowsApi.setEnabled(id, enabled)
    const index = items.value.findIndex((item) => item.id === id)
    if (index >= 0) items.value[index] = updated
  }

  /** 硬删本人模板：成功后从本地列表剔除。 */
  async function remove(id: string): Promise<void> {
    await workflowsApi.remove(id)
    items.value = items.value.filter((item) => item.id !== id)
  }

  return {
    items,
    loading,
    error,
    cursor,
    hasMore,
    load,
    refresh,
    setEnabled,
    remove,
  }
})
