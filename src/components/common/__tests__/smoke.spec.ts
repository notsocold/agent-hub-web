import { describe, expect, it } from 'vitest'

describe('test harness', () => {
  it('runs in jsdom', () => {
    expect(typeof document).toBe('object')
    expect(true).toBe(true)
  })
})
