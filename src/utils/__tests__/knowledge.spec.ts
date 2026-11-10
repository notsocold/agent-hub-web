import { describe, expect, it } from 'vitest'

import {
  aggregateCategories,
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
