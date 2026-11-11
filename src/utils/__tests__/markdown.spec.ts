import { beforeEach, describe, expect, it } from 'vitest'

import { getMarkdownCacheStats, renderMarkdown, resetMarkdownCache } from '@/utils/markdown'

describe('renderMarkdown LRU 缓存', () => {
  beforeEach(() => {
    resetMarkdownCache()
  })

  it('相同内容第二次调用命中缓存并返回相同 HTML', () => {
    const content = '# 标题\n\n**加粗**内容'

    const first = renderMarkdown(content)
    expect(getMarkdownCacheStats()).toEqual({ size: 1, hits: 0, misses: 1 })

    const second = renderMarkdown(content)
    expect(second).toBe(first)
    expect(getMarkdownCacheStats()).toEqual({ size: 1, hits: 1, misses: 1 })
  })

  it('缓存条目数不超过 200', () => {
    for (let i = 0; i < 201; i += 1) {
      renderMarkdown(`第 ${i} 条内容`)
    }

    const stats = getMarkdownCacheStats()
    expect(stats.misses).toBe(201)
    expect(stats.size).toBeLessThanOrEqual(200)
    expect(stats.size).toBe(200)
  })

  it('cache=false 时直接渲染且不写入缓存', () => {
    const content = '**不缓存**内容'

    const first = renderMarkdown(content, { cache: false })
    const second = renderMarkdown(content, { cache: false })

    expect(first).toContain('<strong>不缓存</strong>')
    expect(second).toBe(first)
    expect(getMarkdownCacheStats()).toEqual({ size: 0, hits: 0, misses: 0 })
  })

  it('危险 HTML 在缓存与非缓存路径下都会被清洗', () => {
    const content = '<script>alert(1)</script>\n\n正常内容'

    const cached = renderMarkdown(content)
    expect(cached).not.toContain('<script')
    expect(cached).not.toContain('alert(1)')
    expect(cached).toContain('正常内容')

    // 再次命中缓存时返回的仍是清洗后的 HTML。
    expect(renderMarkdown(content)).toBe(cached)

    const uncached = renderMarkdown(content, { cache: false })
    expect(uncached).not.toContain('<script')
    expect(uncached).not.toContain('alert(1)')
  })
})
