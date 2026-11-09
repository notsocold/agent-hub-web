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
  }
}

export type SortDirection = 'asc' | 'desc'
