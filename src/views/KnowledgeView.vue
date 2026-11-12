<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'

import DocumentDetailDrawer from '@/components/knowledge/DocumentDetailDrawer.vue'
import SearchDebugPanel from '@/components/knowledge/SearchDebugPanel.vue'
import UploadDialog from '@/components/knowledge/UploadDialog.vue'
import AppIcon from '@/components/common/AppIcon.vue'
import ErrorState from '@/components/common/ErrorState.vue'
import LoadingSkeleton from '@/components/common/LoadingSkeleton.vue'
import PageHeader from '@/components/common/PageHeader.vue'
import PageShell from '@/components/common/PageShell.vue'
import StatCard from '@/components/common/StatCard.vue'
import { ApiRequestError } from '@/api/client'
import { knowledgeApi, type KnowledgeListParams } from '@/api/knowledge'
import { useAuthStore } from '@/stores/auth'
import { useCapabilitiesStore } from '@/stores/capabilities'
import { formatDateTime } from '@/utils/format'
import {
  aggregateCategories,
  applyPolledDocuments,
  isInterimStatus,
  statusLabel,
  statusTone,
} from '@/utils/knowledge'
import type { KnowledgeDocument, KnowledgeDocumentStatus, KnowledgeStats } from '@/types'

const route = useRoute()
const auth = useAuthStore()
const capabilityCatalog = useCapabilitiesStore()

const initialQuery = typeof route.query.q === 'string' ? route.query.q : ''
const initialDocumentId =
  typeof route.query.document_id === 'string' ? route.query.document_id : ''

const items = ref<KnowledgeDocument[]>([])
const stats = ref<KnowledgeStats | null>(null)
const categoryOptions = ref<string[]>([])
const loading = ref(false)
const loadingMore = ref(false)
const error = ref<string | null>(null)
const capabilityDisabled = ref(false)

const keyword = ref(initialQuery)
const statusFilter = ref<'all' | KnowledgeDocumentStatus>('all')
const categoryFilter = ref('all')
const ownerScope = ref<'visible' | 'all'>('visible')

const cursor = ref<string | null>(null)
const hasMore = ref(false)

const uploadOpen = ref(false)
const drawerOpen = ref(false)
const selected = ref<KnowledgeDocument | null>(null)
const highlightId = ref<string | null>(null)
const rebuildScope = ref<'all' | 'system' | 'own'>('all')
const rebuildOpen = ref(false)
const rebuilding = ref(false)
const retryingId = ref<string | null>(null)
const pollFailures = ref(0)
let pollInFlight = false
/** 「查看全部」一次性重置多个筛选时，抑制各个 watch 的重复请求。 */
let suppressAutoLoad = false

const debugPanel = ref<InstanceType<typeof SearchDebugPanel> | null>(null)
let pollTimer: ReturnType<typeof setInterval> | null = null
let keywordTimer: ReturnType<typeof setTimeout> | null = null

// M7：统一走 auth store 的角色判断，避免各页各自实现。
const isAdmin = computed(() => auth.isAdmin)
const interim = computed(() => items.value.some((document) => isInterimStatus(document.status)))
const isFiltered = computed(
  () =>
    keyword.value.trim().length > 0 ||
    categoryFilter.value !== 'all' ||
    statusFilter.value !== 'all',
)

/** 页头副标题只放真实元信息；统计未返回时不显示文档数。 */
const description = computed(() =>
  stats.value
    ? `pgvector HNSW · cosine · ${stats.value.documents} 篇文档，按 category 过滤。`
    : 'pgvector HNSW · cosine 向量检索，按 category 过滤。',
)

function mergeCategories(documents: KnowledgeDocument[]): void {
  const merged = new Set([...categoryOptions.value, ...aggregateCategories(documents)])
  categoryOptions.value = [...merged].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))
}

function canWrite(document: KnowledgeDocument): boolean {
  if (!auth.user) return false
  if (auth.user.role === 'admin') return true
  return document.owner !== null && document.owner.id === auth.user.id
}

/** 行内日期只保留 MM-DD，与原型「09-30 更新」口径一致。 */
function shortDate(iso: string): string {
  const formatted = formatDateTime(iso)
  return formatted === '—' ? '' : formatted.slice(5, 10)
}

/** 行元信息口径与原型一致：分类 · N chunks · 更新时间（未完成入库用「上传」）。 */
function documentMeta(document: KnowledgeDocument): string {
  const category = document.category || '未分类'
  const chunks = `${document.chunk_count} ${document.chunk_count === 1 ? 'chunk' : 'chunks'}`
  const time = shortDate(document.updated_at)
  const suffix = document.status === 'ready' ? '更新' : '上传'
  return `${category} · ${chunks} · ${time ? `${time} ${suffix}` : '时间未知'}`
}

function listParams(reset: boolean): KnowledgeListParams {
  const params: KnowledgeListParams = { limit: 20 }
  const q = keyword.value.trim()
  if (q) params.q = q
  if (categoryFilter.value !== 'all') params.category = categoryFilter.value
  if (statusFilter.value !== 'all') params.status = statusFilter.value
  if (isAdmin.value && ownerScope.value === 'all') params.owner_scope = 'all'
  if (!reset && cursor.value) params.cursor = cursor.value
  return params
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : '加载知识库失败'
}

function handleFailure(cause: unknown): void {
  if (cause instanceof ApiRequestError && cause.code === 'capability_disabled') {
    capabilityDisabled.value = true
    error.value = null
    return
  }
  error.value = messageOf(cause)
}

async function load(options: { reset?: boolean; silent?: boolean } = {}): Promise<void> {
  const reset = options.reset ?? true
  const silent = options.silent ?? false
  if (reset) {
    loading.value = !silent
  } else {
    loadingMore.value = true
  }
  error.value = null
  capabilityDisabled.value = false

  try {
    const page = await knowledgeApi.documents(listParams(reset))
    if (reset) {
      items.value = page.items
    } else {
      const known = new Set(items.value.map((item) => item.id))
      items.value = [...items.value, ...page.items.filter((item) => !known.has(item.id))]
    }
    stats.value = page.stats
    cursor.value = page.next_cursor
    hasMore.value = page.has_more
    mergeCategories(page.items)
    pollFailures.value = 0
    syncPolling()
  } catch (cause) {
    if (!silent) handleFailure(cause)
  } finally {
    loading.value = false
    loadingMore.value = false
  }
}

/**
 * 轮询刷新已加载行的状态与统计，避免把「加载更多」的页重置掉。
 *
 * - 首屏响应覆盖第一页；不在第一页的过渡态文档按 id 单独拉取，分页行不会漏刷新；
 * - 404（已删除/不可见）与状态筛选不再匹配的行会被移出列表，否则筛选下永远无法收敛；
 * - 连续 3 次失败停止轮询；`capability_disabled` 立即停止并显示能力门控。
 */
async function refreshStatuses(): Promise<void> {
  if (pollInFlight) return
  pollInFlight = true
  try {
    const page = await knowledgeApi.documents({ ...listParams(true), limit: 20 })
    const fresh = [...page.items]
    const onFirstPage = new Set(page.items.map((document) => document.id))
    const pending = items.value.filter(
      (document) => isInterimStatus(document.status) && !onFirstPage.has(document.id),
    )
    const removed: string[] = []
    await Promise.all(
      pending.slice(0, 20).map(async (document) => {
        try {
          fresh.push(await knowledgeApi.get(document.id))
        } catch (cause) {
          if (cause instanceof ApiRequestError && cause.status === 404) {
            removed.push(document.id)
            return
          }
          throw cause
        }
      }),
    )
    items.value = applyPolledDocuments(items.value, fresh, removed, statusFilter.value)
    stats.value = page.stats
    const selectedId = selected.value?.id
    if (selectedId) {
      const freshSelected = fresh.find((document) => document.id === selectedId)
      if (freshSelected) selected.value = freshSelected
    }
    pollFailures.value = 0
  } catch (cause) {
    if (cause instanceof ApiRequestError && cause.code === 'capability_disabled') {
      capabilityDisabled.value = true
      stopPolling()
      return
    }
    pollFailures.value += 1
    if (pollFailures.value >= 3) {
      stopPolling()
      ElMessage.warning('知识库状态刷新连续失败，已暂停自动轮询')
    }
  } finally {
    pollInFlight = false
  }
}

function stopPolling(): void {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

function syncPolling(): void {
  stopPolling()
  if (!interim.value) return
  if (typeof document === 'undefined' || document.visibilityState === 'hidden') return
  pollTimer = setInterval(() => {
    void refreshStatuses()
  }, 5000)
}

function onVisibilityChange(): void {
  if (document.visibilityState === 'visible') pollFailures.value = 0
  syncPolling()
}

watch(interim, syncPolling)

watch(keyword, () => {
  if (suppressAutoLoad) return
  if (keywordTimer) clearTimeout(keywordTimer)
  keywordTimer = setTimeout(() => {
    void load({ reset: true })
  }, 300)
})

watch([statusFilter, categoryFilter, ownerScope], () => {
  if (suppressAutoLoad) return
  void load({ reset: true })
})

/** 头部「查看全部」：清空搜索与两个筛选，一次性按无筛选口径重载。 */
async function showAll(): Promise<void> {
  if (keywordTimer) {
    clearTimeout(keywordTimer)
    keywordTimer = null
  }
  if (!isFiltered.value) {
    await load({ reset: true })
    return
  }
  suppressAutoLoad = true
  keyword.value = ''
  categoryFilter.value = 'all'
  statusFilter.value = 'all'
  await nextTick()
  suppressAutoLoad = false
  await load({ reset: true })
}

async function openDocument(id: string, searchFallback = ''): Promise<void> {
  try {
    const document = await knowledgeApi.get(id)
    selected.value = document
    drawerOpen.value = true
    highlightId.value = document.id
  } catch (cause) {
    if (cause instanceof ApiRequestError && cause.code === 'capability_disabled') {
      capabilityDisabled.value = true
      return
    }
    if (cause instanceof ApiRequestError && cause.status === 404) {
      ElMessage.warning('引用文档已删除或不可见，已回退为按标题搜索')
      if (searchFallback) keyword.value = searchFallback
      return
    }
    ElMessage.error(messageOf(cause))
  }
}

function openUpload(): void {
  uploadOpen.value = true
}

async function onUploaded(document: KnowledgeDocument): Promise<void> {
  uploadOpen.value = false
  highlightId.value = document.id
  // 新分类可能来自这次上传；让「+」菜单下次进入对话时重新聚合。
  capabilityCatalog.invalidateKnowledgeCategories()
  await load({ reset: true })
}

function openDetail(document: KnowledgeDocument): void {
  selected.value = document
  drawerOpen.value = true
}

async function retryDocument(document: KnowledgeDocument): Promise<void> {
  if (retryingId.value) return
  retryingId.value = document.id
  try {
    const updated = await knowledgeApi.retry(document.id)
    ElMessage.success(updated.status === 'ready' ? '已重新入库' : '已提交重试')
    // 按当前筛选重载：失败筛选下变成 ready 的行应移出列表，而不是停在原地。
    await load({ reset: true })
    selected.value = items.value.find((item) => item.id === updated.id) ?? updated
  } catch (cause) {
    ElMessage.error(messageOf(cause))
  } finally {
    retryingId.value = null
  }
}

async function removeDocument(document: KnowledgeDocument): Promise<void> {
  try {
    await ElMessageBox.confirm(`删除「${document.title}」及其全部分块？`, '删除文档', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }
  try {
    await knowledgeApi.remove(document.id)
    drawerOpen.value = false
    selected.value = null
    ElMessage.success('文档已删除')
    await load({ reset: true })
  } catch (cause) {
    ElMessage.error(messageOf(cause))
  }
}

function searchFromDocument(document: KnowledgeDocument): void {
  drawerOpen.value = false
  void debugPanel.value?.run(document.title)
}

async function rebuildIndex(): Promise<void> {
  const scopeText = { all: '全部文档', system: '系统文档', own: '所有用户的私有文档' }[rebuildScope.value]
  try {
    await ElMessageBox.confirm(`从原始文件重建「${scopeText}」的索引？期间检索结果可能短暂变化。`, '重建索引', {
      type: 'warning',
      confirmButtonText: '开始重建',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }
  rebuilding.value = true
  try {
    const result = await knowledgeApi.rebuild({ scope: rebuildScope.value })
    rebuildOpen.value = false
    ElMessage.success(
      `重建完成：${result.documents} 篇文档、${result.chunks} 个分块，失败 ${result.failed} 篇`,
    )
    await load({ reset: true })
  } catch (cause) {
    ElMessage.error(messageOf(cause))
  } finally {
    rebuilding.value = false
  }
}

onMounted(() => {
  document.addEventListener('visibilitychange', onVisibilityChange)
  void (async () => {
    await load({ reset: true })
    if (!capabilityDisabled.value && initialDocumentId) {
      await openDocument(initialDocumentId, initialQuery)
    }
  })()
})

onUnmounted(() => {
  document.removeEventListener('visibilitychange', onVisibilityChange)
  stopPolling()
  if (keywordTimer) clearTimeout(keywordTimer)
})
</script>

<template>
  <PageShell>
    <PageHeader title="知识库" :description="description">
      <template #actions>
        <button type="button" class="btn btn-primary" @click="openUpload">
          <AppIcon name="upload" />上传文档
        </button>
      </template>
    </PageHeader>

    <div v-if="capabilityDisabled" class="gate" data-testid="knowledge-gate" role="status">
      <p class="gate-title">「知识库」能力未启用</p>
      <p class="gate-desc">
        后端 <span class="mono">KNOWLEDGE_ENABLED=false</span>，知识库端点统一返回 403
        <span class="mono">capability_disabled</span>。开启后刷新页面即可使用。
      </p>
    </div>

    <template v-else>
      <div class="stats" data-testid="knowledge-stats">
        <StatCard label="文档" :value="stats?.documents ?? 0" />
        <StatCard label="片段" :value="stats?.chunks ?? 0" />
        <StatCard label="就绪" :value="stats?.ready ?? 0" tone="ok" />
        <StatCard label="失败" :value="stats?.failed ?? 0" tone="error" />
      </div>

      <div class="knowledge-grid">
        <section class="panel doc-panel" aria-label="文档列表">
          <div class="panel-head">
            <h2>文档</h2>
            <span class="count mono">{{ items.length }} / {{ stats?.documents ?? '—' }}</span>
            <span class="spacer" />
            <button
              v-if="isAdmin"
              type="button"
              class="text-link owner-link"
              :class="{ 'is-active': ownerScope === 'all' }"
              :aria-pressed="ownerScope === 'all'"
              title="是否包含所有用户的私有文档"
              @click="ownerScope = ownerScope === 'all' ? 'visible' : 'all'"
            >
              <AppIcon v-if="ownerScope === 'all'" name="check" />全部用户
            </button>
            <button
              v-if="isAdmin"
              type="button"
              class="text-link"
              data-testid="knowledge-rebuild"
              :disabled="rebuilding"
              @click="rebuildOpen = !rebuildOpen"
            >
              {{ rebuilding ? '重建中…' : '重建索引' }}
            </button>
            <button type="button" class="text-link" title="清除筛选，重新加载" @click="showAll">
              查看全部
            </button>
          </div>

          <div v-if="isAdmin && rebuildOpen" class="rebuild-bar">
            <label class="field rebuild-field">
              <span>重建范围</span>
              <select v-model="rebuildScope" class="select" aria-label="重建范围">
                <option value="all">全部文档</option>
                <option value="system">系统文档</option>
                <option value="own">所有用户私有文档</option>
              </select>
            </label>
            <button
              type="button"
              class="btn btn-primary btn-sm"
              :disabled="rebuilding"
              @click="rebuildIndex"
            >
              开始重建
            </button>
            <button
              type="button"
              class="text-link"
              :disabled="rebuilding"
              @click="rebuildOpen = false"
            >
              取消
            </button>
          </div>

          <div class="doc-toolbar">
            <label class="tool-search">
              <AppIcon name="search" />
              <input
                v-model="keyword"
                type="search"
                data-testid="doc-search"
                placeholder="搜索文档"
                aria-label="搜索知识库文档"
                title="搜索标题或来源路径"
                autocomplete="off"
              />
            </label>
            <select v-model="categoryFilter" class="select" aria-label="筛选分类">
              <option value="all">全部分类</option>
              <option v-for="item in categoryOptions" :key="item" :value="item">{{ item }}</option>
            </select>
            <select
              v-model="statusFilter"
              class="select"
              data-testid="status-filter"
              aria-label="筛选状态"
            >
              <option value="all">全部状态</option>
              <option value="ready">就绪</option>
              <option value="indexing">索引中</option>
              <option value="pending">待处理</option>
              <option value="failed">失败</option>
            </select>
          </div>

          <div v-if="error" class="doc-state">
            <ErrorState :message="error" @retry="load({ reset: true })" />
          </div>
          <div v-else-if="loading" class="doc-state">
            <LoadingSkeleton />
          </div>
          <div v-else-if="items.length === 0" class="empty-state">
            <p>{{ isFiltered ? '没有匹配的文档。' : '还没有文档，上传后即可被对话检索与引用。' }}</p>
            <button v-if="isFiltered" type="button" class="text-link" @click="showAll">
              清除筛选
            </button>
            <button v-else type="button" class="text-link" @click="openUpload">
              上传第一篇文档
            </button>
          </div>
          <div v-else class="doc-list">
            <div
              v-for="row in items"
              :key="row.id"
              class="doc-row"
              :class="{ 'is-new': row.id === highlightId }"
              :data-category="row.category"
              data-testid="doc-row"
            >
              <div class="doc-main">
                <button type="button" class="doc-title" @click="openDetail(row)">
                  {{ row.title }}
                </button>
                <div class="doc-meta">{{ documentMeta(row) }}</div>
              </div>
              <span class="st" :class="`st-${statusTone(row.status)}`">
                {{ statusLabel(row.status) }}
              </span>
              <button
                v-if="row.status === 'failed' && canWrite(row)"
                type="button"
                class="text-link"
                :disabled="retryingId === row.id"
                :aria-label="`重试入库 ${row.title}`"
                @click="retryDocument(row)"
              >
                {{ retryingId === row.id ? '重试中…' : '重试' }}
              </button>
            </div>
          </div>

          <div class="panel-foot doc-foot">
            <span>支持 Markdown / TXT / PDF · 异步入库，失败可重试。</span>
            <button
              v-if="hasMore"
              type="button"
              class="text-link"
              data-testid="load-more"
              :disabled="loadingMore"
              @click="load({ reset: false })"
            >
              {{ loadingMore ? '加载中…' : '加载更多' }}
            </button>
          </div>
        </section>

        <SearchDebugPanel ref="debugPanel" :categories="categoryOptions" :initial-query="keyword" />
      </div>
    </template>

    <UploadDialog
      v-model="uploadOpen"
      :categories="categoryOptions"
      :is-admin="isAdmin"
      @uploaded="onUploaded"
    />

    <DocumentDetailDrawer
      v-model="drawerOpen"
      :document="selected"
      :writable="selected ? canWrite(selected) : false"
      :busy="retryingId === selected?.id"
      @retry="retryDocument"
      @remove="removeDocument"
      @search="searchFromDocument"
    />
  </PageShell>
</template>

<style scoped>
.gate {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 16px 18px;
  border: 1px dashed var(--line);
  border-radius: 8px;
  background: var(--surface-2);
}

.gate-title {
  color: var(--ink-2);
  font-size: 13px;
  font-weight: 600;
}

.gate-desc {
  color: var(--ink-3);
  font-size: 11.5px;
  line-height: 1.7;
}

.owner-link {
  padding: 0;
  color: var(--ink-3);
}

.owner-link.is-active {
  color: var(--prussian);
}

.owner-link .ic {
  width: 12px;
  height: 12px;
}

.rebuild-bar {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  padding: 9px 12px;
  border-bottom: 1px solid var(--line-2);
  background: var(--surface-2);
}

.rebuild-field {
  flex: 1;
  min-width: 0;
}

.rebuild-field .select {
  width: 100%;
}

.doc-state {
  padding: 12px;
}

.doc-row.is-new {
  background: var(--green-soft);
}

.doc-title {
  display: block;
  width: 100%;
  padding: 0;
  text-align: left;
}

.doc-title:hover {
  color: var(--prussian);
  text-decoration: underline;
}

.doc-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.doc-foot .text-link {
  flex: none;
  padding: 0;
}

.empty-state p {
  margin: 0;
}

.empty-state .text-link {
  margin-top: 8px;
}

.text-link:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
