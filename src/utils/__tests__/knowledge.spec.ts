import { describe, expect, it } from 'vitest'

import {
  aggregateCategories,
  applyPolledDocuments,
  formatScore,
  isInterimStatus,
  statusLabel,
  statusTone,
} from '@/utils/knowledge'
import type { KnowledgeDocument } from '@/types'

function doc(id: string, category: string): KnowledgeDocument {
  return {
    id,
    title: `文档 ${id}`,
    source_uri: `data/${id}.md`,
    category,
    status: 'ready',
    chunk_count: 1,
    size_bytes: 10,
    owner: null,
    error: null,
    created_at: '2026-11-01T00:00:00Z',
    updated_at: '2026-11-01T00:00:00Z',
  }
}

describe('knowledge 工具函数', () => {
  it('聚合分类时过滤空值与空白并去重', () => {
    const categories = aggregateCategories([
      doc('a', '售后'),
      doc('b', ''),
      doc('c', '   '),
      doc('d', '客服'),
      doc('e', '售后'),
    ])
    expect(categories).toEqual(['客服', '售后'])
  })

  it('只有 pending/indexing 需要轮询', () => {
    expect(isInterimStatus('pending')).toBe(true)
    expect(isInterimStatus('indexing')).toBe(true)
    expect(isInterimStatus('ready')).toBe(false)
    expect(isInterimStatus('failed')).toBe(false)
    expect(isInterimStatus('unknown')).toBe(false)
  })

  it('状态标签与色调对未知值降级', () => {
    expect(statusLabel('ready')).toBe('就绪')
    expect(statusLabel('weird')).toBe('weird')
    expect(statusTone('failed')).toBe('error')
    expect(statusTone('weird')).toBe('muted')
  })

  it('分数保留两位小数，非法分数显示占位符', () => {
    expect(formatScore(0.2552)).toBe('0.26')
    expect(formatScore(0)).toBe('0.00')
    expect(formatScore(Number.NaN)).toBe('—')
  })
})

describe('轮询合并 applyPolledDocuments', () => {
  const indexing = { ...doc('b', '售后'), status: 'indexing' as const }
  const pageTwo = doc('c', '客服')

  it('用最新状态替换已拉到的行', () => {
    const merged = applyPolledDocuments([indexing, pageTwo], [{ ...indexing, status: 'ready' }], [], 'all')
    expect(merged.map((item) => `${item.id}:${item.status}`)).toEqual(['b:ready', 'c:ready'])
  })

  it('404 的行被移除', () => {
    const merged = applyPolledDocuments([indexing, pageTwo], [], ['b'], 'all')
    expect(merged.map((item) => item.id)).toEqual(['c'])
  })

  it('状态筛选下，状态不再匹配的行被移除', () => {
    const merged = applyPolledDocuments(
      [indexing, pageTwo],
      [{ ...indexing, status: 'ready' }],
      [],
      'indexing',
    )
    expect(merged.map((item) => item.id)).toEqual(['c'])
  })

  it('未在首屏响应里的分页行保持原样', () => {
    const merged = applyPolledDocuments([pageTwo], [], [], 'all')
    expect(merged).toHaveLength(1)
    expect(merged[0]?.id).toBe('c')
  })
})
