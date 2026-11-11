import { describe, expect, it } from 'vitest'

import { isSafeAuthorizationUrl } from '@/components/tasks/authorizationUrl'

describe('A2A 授权链接校验', () => {
  it('允许 https 与本地回环 http', () => {
    expect(isSafeAuthorizationUrl('https://github.com/login/oauth/authorize?x=1')).toBe(true)
    expect(isSafeAuthorizationUrl('http://localhost:8080/callback')).toBe(true)
    expect(isSafeAuthorizationUrl('http://127.0.0.1/callback')).toBe(true)
  })

  it('拒绝 null、非 http(s) 协议、内网 http 与超长链接', () => {
    expect(isSafeAuthorizationUrl(null)).toBe(false)
    expect(isSafeAuthorizationUrl('')).toBe(false)
    expect(isSafeAuthorizationUrl('javascript:alert(1)')).toBe(false)
    expect(isSafeAuthorizationUrl('data:text/html,hi')).toBe(false)
    expect(isSafeAuthorizationUrl('http://10.0.0.8/callback')).toBe(false)
    expect(isSafeAuthorizationUrl(`https://example.com/${'a'.repeat(2000)}`)).toBe(false)
  })

  it('拒绝无法解析的字符串', () => {
    expect(isSafeAuthorizationUrl('not a url')).toBe(false)
  })
})
