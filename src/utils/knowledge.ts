import type { KnowledgeDocument, KnowledgeDocumentStatus } from '@/types'

/** 后端 `KNOWLEDGE_MAX_UPLOAD_BYTES` 默认值；`/system/info.limits` 未暴露该上限。 */
export const KNOWLEDGE_MAX_UPLOAD_BYTES = 10 * 1024 * 1024

export type KnowledgeTone = 'ok' | 'warn' | 'error' | 'muted'

export const KNOWLEDGE_STATUS_LABELS: Record<KnowledgeDocumentStatus, string> = {
  pending: '待处理',
  indexing: '索引中',
  ready: '就绪',
  failed: '失败',
}

export const KNOWLEDGE_STATUS_TONES: Record<KnowledgeDocumentStatus, KnowledgeTone> = {
  pending: 'muted',
  indexing: 'warn',
  ready: 'ok',
  failed: 'error',
}

export function statusLabel(status: string): string {
  return KNOWLEDGE_STATUS_LABELS[status as KnowledgeDocumentStatus] ?? status
}

export function statusTone(status: string): KnowledgeTone {
  return KNOWLEDGE_STATUS_TONES[status as KnowledgeDocumentStatus] ?? 'muted'
}

/** 只有 pending/indexing 需要轮询；ready/failed 是终态。 */
export function isInterimStatus(status: string): boolean {
  return status === 'pending' || status === 'indexing'
}

/**
 * 从文档列表聚合分类候选。
 *
 * 后端没有分类目录端点（`category` 是 varchar(64) 的自由文本，缺省空串），
 * 因此候选只能从可见文档去重得到；空分类不进入候选。
 */
export function aggregateCategories(documents: KnowledgeDocument[]): string[] {
  const unique = new Set<string>()
  for (const document of documents) {
    const category = document.category.trim()
    if (category) unique.add(category)
  }
  return [...unique].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))
}

/** 检索分数只做展示；fake embedding 下分数不可解释，不设阈值。 */
export function formatScore(score: number): string {
  if (!Number.isFinite(score)) return '—'
  return score.toFixed(2)
}

/** 从文件名派生标题，与后端 `build_kb.py` / 上传派生规则一致（去掉扩展名）。 */
export function titleFromFilename(filename: string): string {
  const base = filename.split('/').filter(Boolean).pop() ?? filename
  return base.replace(/\.[^.]+$/, '') || base
}

/**
 * 把轮询拿到的「最新文档」合并回当前列表。
 *
 * - `fresh` 是已知的最新状态：列表首屏响应 + 针对过渡态文档按 id 拉取的结果；
 * - `removedIds` 是拉取时 404 的文档（被删除或不可见）；
 * - 状态筛选下，状态不再匹配的行要移出列表，否则页面会一直显示过期的「索引中」；
 * - 未出现在 `fresh` 里的分页行保持原样，避免轮询把「加载更多」的行丢掉。
 */
export function applyPolledDocuments(
  current: KnowledgeDocument[],
  fresh: KnowledgeDocument[],
  removedIds: string[],
  statusFilter: 'all' | KnowledgeDocumentStatus,
): KnowledgeDocument[] {
  const removed = new Set(removedIds)
  const byId = new Map(fresh.map((document) => [document.id, document]))
  const next: KnowledgeDocument[] = []
  for (const item of current) {
    if (removed.has(item.id)) continue
    const update = byId.get(item.id)
    if (!update) {
      next.push(item)
      continue
    }
    if (statusFilter !== 'all' && update.status !== statusFilter) continue
    next.push(update)
  }
  return next
}
