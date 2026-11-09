/** 通用分页与错误信封，对应 contract-delta 第 1 节。 */
export interface PageResult<T> {
  items: T[]
  next_cursor: string | null
  has_more: boolean
  stats?: Record<string, number>
}

export interface CursorParams {
  limit?: number
  cursor?: string
}

export interface ApiErrorBody {
  error: {
    code: string
    message: string
    request_id: string
    /**
     * 后端 M1 起的向后兼容扩展（2026-11-09 反馈 3.1）。
     * 目前用于 `409 run_in_progress` 的 `details.run_id`、
     * `409 run_not_cancelable` 的 `details.status`。
     */
    details?: Record<string, unknown> | null
  }
}

export type SortDirection = 'asc' | 'desc'
