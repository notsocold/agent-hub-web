import { ApiRequestError } from '@/api/client'

export interface DescribedError {
  message: string
  code: string
  status: number
  requestId: string
}

/**
 * 把任意错误归一成可展示形状：错误态组件与诊断抽屉共用，
 * 保证 request_id 不会在各页面各拼各的。
 */
export function describeError(error: unknown): DescribedError {
  if (error instanceof ApiRequestError) {
    return {
      message: error.message,
      code: error.code,
      status: error.status,
      requestId: error.requestId,
    }
  }
  if (error instanceof Error) {
    return { message: error.message, code: 'unknown_error', status: 0, requestId: '' }
  }
  if (typeof error === 'string' && error.trim()) {
    return { message: error, code: 'unknown_error', status: 0, requestId: '' }
  }
  return { message: '请求失败，请稍后重试', code: 'unknown_error', status: 0, requestId: '' }
}
