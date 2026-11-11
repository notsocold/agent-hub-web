import { describe, expect, it } from 'vitest'

import { ApiRequestError } from '@/api/client'
import { describeError } from '@/utils/errors'

describe('describeError', () => {
  it('ApiRequestError 透出 code/status/requestId', () => {
    const result = describeError(
      new ApiRequestError('无权限', { code: 'forbidden', status: 403, requestId: 'req-9' }),
    )
    expect(result).toEqual({ message: '无权限', code: 'forbidden', status: 403, requestId: 'req-9' })
  })

  it('普通 Error 归一到 unknown_error', () => {
    const result = describeError(new Error('boom'))
    expect(result).toEqual({ message: 'boom', code: 'unknown_error', status: 0, requestId: '' })
  })

  it('字符串与非错误对象给兜底文案', () => {
    expect(describeError('网络异常').message).toBe('网络异常')
    expect(describeError(null).message).toBe('请求失败，请稍后重试')
  })
})
