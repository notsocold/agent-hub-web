import { describe, expect, it } from 'vitest'

import { containsSensitiveKey, isSensitiveKey, redactText, redactValue } from '@/utils/redact'

describe('redactValue 递归遮罩', () => {
  it('遮罩对象与数组任意层级的敏感键，并保留非敏感键', () => {
    const input = {
      password: 'x',
      keep: 'visible',
      nested: { token: 'y', name: 'agent' },
      list: [{ api_key: 'z', label: 'first' }, { label: 'second' }],
    }

    expect(redactValue(input)).toEqual({
      password: '••••',
      keep: 'visible',
      nested: { token: '••••', name: 'agent' },
      list: [{ api_key: '••••', label: 'first' }, { label: 'second' }],
    })

    // 不修改入参。
    expect(input.password).toBe('x')
    expect(input.nested.token).toBe('y')
    expect(input.list[0]?.api_key).toBe('z')
  })

  it('标量与不含敏感键的结构原样返回', () => {
    expect(redactValue('plain')).toBe('plain')
    expect(redactValue(3)).toBe(3)
    expect(redactValue(null)).toBeNull()
    expect(redactValue(['plain', { token: 'y' }])).toEqual(['plain', { token: '••••' }])
  })
})

describe('containsSensitiveKey 递归识别', () => {
  it('在嵌套对象与数组中命中敏感键', () => {
    expect(containsSensitiveKey({ nested: [{ token: 'y' }] })).toBe(true)
    expect(containsSensitiveKey([{ password: 'x' }, { ok: true }])).toBe(true)
  })

  it('非敏感结构与标量返回 false', () => {
    expect(containsSensitiveKey({ nested: [{ name: 'y' }] })).toBe(false)
    expect(containsSensitiveKey('token')).toBe(false)
    expect(containsSensitiveKey(null)).toBe(false)
  })
})

describe('isSensitiveKey 规范化', () => {
  it('忽略大小写与首尾空白', () => {
    expect(isSensitiveKey(' Access_Token ')).toBe(true)
    expect(isSensitiveKey('api_key')).toBe(true)
    expect(isSensitiveKey('username')).toBe(false)
  })
})

describe('camelCase / header 敏感键', () => {
  it('覆盖 accessToken、clientSecret、privateKey 与 X-Api-Key', () => {
    const input = {
      accessToken: 'a',
      clientSecret: 'b',
      privateKey: 'c',
      'X-Api-Key': 'd',
      set_cookie: 'e',
      keep: 'visible',
    }

    expect(redactValue(input)).toEqual({
      accessToken: '••••',
      clientSecret: '••••',
      privateKey: '••••',
      'X-Api-Key': '••••',
      set_cookie: '••••',
      keep: 'visible',
    })
    expect(isSensitiveKey('X-Api-Key')).toBe(true)
    expect(isSensitiveKey('accessToken')).toBe(true)
    expect(isSensitiveKey('monkey')).toBe(false)
  })
})

describe('redactText 字符串级遮罩', () => {
  it('JSON 预览解析后递归遮罩', () => {
    expect(redactText('{"accessToken":"abc","name":"x"}')).toBe(
      '{"accessToken":"••••","name":"x"}',
    )
  })

  it('非 JSON 预览按 key=value / key: value 遮罩', () => {
    expect(redactText('password=hunter2, user=dan')).toContain('"••••"')
    expect(redactText('password=hunter2, user=dan')).not.toContain('hunter2')
    expect(redactText('Authorization: Bearer abcdef')).not.toContain('abcdef')
  })
})
