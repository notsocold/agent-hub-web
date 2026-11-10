<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'

import DocumentDetailDrawer from '@/components/knowledge/DocumentDetailDrawer.vue'
import SearchDebugPanel from '@/components/knowledge/SearchDebugPanel.vue'
import UploadDialog from '@/components/knowledge/UploadDialog.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import ErrorState from '@/components/common/ErrorState.vue'
import LoadingBlock from '@/components/common/LoadingBlock.vue'
import PageHeader from '@/components/common/PageHeader.vue'
import PageShell from '@/components/common/PageShell.vue'
import StatCard from '@/components/common/StatCard.vue'
import StatusBadge from '@/components/common/StatusBadge.vue'
import { ApiRequestError } from '@/api/client'
import { knowledgeApi, type KnowledgeListParams } from '@/api/knowledge'
import { useAuthStore } from '@/stores/auth'
import { useCapabilitiesStore } from '@/stores/capabilities'
import { formatBytes, formatDateTime } from '@/utils/format'
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
const rebuilding = ref(false)
const retryingId = ref<string | null>(null)
const pollFailures = ref(0)
let pollInFlight = false

const debugPanel = ref<InstanceType<typeof SearchDebugPanel> | null>(null)
let pollTimer: ReturnType<typeof setInterval> | null = null
let keywordTimer: ReturnType<typeof setTimeout> | null = null

const isAdmin = computed(() => auth.user?.role === 'admin')
const interim = computed(() => items.value.some((document) => isInterimStatus(document.status)))

function mergeCategories(documents: KnowledgeDocument[]): void {
  const merged = new Set([...categoryOptions.value, ...aggregateCategories(documents)])
  categoryOptions.value = [...merged].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))
}

function canWrite(document: KnowledgeDocument): boolean {
  if (!auth.user) return false
  if (auth.user.role === 'admin') return true
  return document.owner !== null && document.owner.id === auth.user.id
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
  if (keywordTimer) clearTimeout(keywordTimer)
  keywordTimer = setTimeout(() => {
    void load({ reset: true })
  }, 300)
})

watch([statusFilter, categoryFilter, ownerScope], () => {
  void load({ reset: true })
})

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
    <PageHeader
      eyebrow="KNOWLEDGE"
      title="知识库"
      description="上传文档、查看索引状态、调试检索；对话中的引用与来源会回链到这里。"
    >
      <template #actions>
        <template v-if="isAdmin">
          <select v-model="rebuildScope" class="input" aria-label="重建范围">
            <option value="all">全部文档</option>
            <option value="system">系统文档</option>
            <option value="own">所有用户私有文档</option>
          </select>
          <button
            type="button"
            class="btn"
            data-testid="knowledge-rebuild"
            :disabled="rebuilding"
            @click="rebuildIndex"
          >
            {{ rebuilding ? '重建中…' : '重建索引' }}
          </button>
        </template>
        <button type="button" class="btn primary" @click="openUpload">上传文档</button>
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
      <div class="stat-row" data-testid="knowledge-stats">
        <StatCard label="文档" :value="stats?.documents ?? 0" />
        <StatCard label="分块" :value="stats?.chunks ?? 0" />
        <StatCard label="就绪" :value="stats?.ready ?? 0" tone="ok" />
        <StatCard label="索引中" :value="stats?.indexing ?? 0" tone="warn" />
        <StatCard label="待处理" :value="stats?.pending ?? 0" />
        <StatCard label="失败" :value="stats?.failed ?? 0" tone="error" />
      </div>

      <div class="knowledge-grid">
        <section class="panel docs" aria-label="文档列表">
          <header class="panel-head">
            <h2>文档</h2>
            <span class="count mono">{{ items.length }}{{ hasMore ? '+' : '' }}</span>
            <span class="spacer" />
            <label v-if="isAdmin" class="owner-toggle">
              <input v-model="ownerScope" type="checkbox" true-value="all" false-value="visible" />
              <span>全部用户</span>
            </label>
          </header>

          <div class="toolbar">
            <input
              v-model="keyword"
              class="input search"
              type="search"
              data-testid="doc-search"
              placeholder="搜索标题或来源路径"
              aria-label="搜索知识库文档"
            />
            <select v-model="categoryFilter" class="input" aria-label="筛选分类">
              <option value="all">全部分类</option>
              <option v-for="item in categoryOptions" :key="item" :value="item">{{ item }}</option>
            </select>
            <select
              v-model="statusFilter"
              class="input"
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

          <ErrorState v-if="error" :message="error" @retry="load({ reset: true })" />
          <LoadingBlock v-else-if="loading" label="正在加载知识库…" />
          <EmptyState
            v-else-if="items.length === 0"
            title="还没有匹配的文档"
            description="支持 Markdown、TXT、PDF、CSV 与 JSON；入库完成后可被对话检索与引用。"
          />
          <div v-else class="doc-table">
            <div class="doc-head" aria-hidden="true">
              <span>标题</span>
              <span>分类</span>
              <span>状态</span>
              <span class="num">分块</span>
              <span class="num">大小</span>
              <span>归属</span>
              <span>更新时间</span>
              <span class="num">操作</span>
            </div>
            <div
              v-for="row in items"
              :key="row.id"
              class="doc-row"
              :class="{ 'is-new': row.id === highlightId }"
              data-testid="doc-row"
            >
              <div class="doc-main">
                <button type="button" class="doc-title" @click="openDetail(row)">
                  {{ row.title }}
                </button>
                <span class="doc-source mono">{{ row.source_uri }}</span>
              </div>
              <span class="category">{{ row.category || '未分类' }}</span>
              <StatusBadge :tone="statusTone(row.status)" :label="statusLabel(row.status)" />
              <span class="num mono">{{ row.chunk_count }}</span>
              <span class="num mono">{{ formatBytes(row.size_bytes) }}</span>
              <span class="owner">{{ row.owner?.display_name ?? '系统' }}</span>
              <span class="time mono">{{ formatDateTime(row.updated_at) }}</span>
              <span class="ops">
                <button type="button" class="link" @click="openDetail(row)">详情</button>
                <button
                  v-if="row.status === 'failed' && canWrite(row)"
                  type="button"
                  class="link"
                  :disabled="retryingId === row.id"
                  @click="retryDocument(row)"
                >
                  重试
                </button>
              </span>
            </div>
          </div>

          <footer v-if="hasMore" class="panel-foot">
            <button
              type="button"
              class="btn"
              data-testid="load-more"
              :disabled="loadingMore"
              @click="load({ reset: false })"
            >
              {{ loadingMore ? '加载中…' : '加载更多' }}
            </button>
          </footer>
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

.knowledge-grid {
  display: grid;
  gap: 14px;
  grid-template-columns: minmax(0, 1.6fr) minmax(320px, 1fr);
  align-items: start;
}

@media (max-width: 1100px) {
  .knowledge-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}

.panel {
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--surface);
}

.docs {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
  padding: 16px;
}

.panel-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.panel-head h2 {
  margin: 0;
  color: var(--ink);
  font-size: 13.5px;
  font-weight: 650;
}

.count {
  color: var(--ink-3);
  font-size: 10px;
}

.spacer {
  flex: 1;
}

.owner-toggle {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--ink-3);
  font-size: 11px;
}

.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.search {
  flex: 1;
  min-width: 180px;
}

.doc-table {
  display: flex;
  flex-direction: column;
  border-top: 1px solid var(--line-2);
}

.doc-head,
.doc-row {
  display: grid;
  grid-template-columns: minmax(0, 1.9fr) 76px 84px 52px 74px 76px 118px 82px;
  align-items: center;
  gap: 8px;
  padding: 8px 4px;
}

.doc-head {
  border-bottom: 1px solid var(--line-2);
  color: var(--ink-3);
  font-size: 9.5px;
  letter-spacing: 0.02em;
}

.doc-row {
  border-bottom: 1px solid var(--line-2);
  font-size: 11px;
}

.doc-row:last-child {
  border-bottom: none;
}

.doc-row:hover {
  background: var(--surface-2);
}

.doc-row.is-new {
  background: var(--green-soft);
}

.doc-main {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.doc-title {
  overflow: hidden;
  padding: 0;
  color: var(--ink);
  font-size: 12px;
  font-weight: 550;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.doc-title:hover {
  color: var(--prussian);
  text-decoration: underline;
}

.doc-source {
  overflow: hidden;
  color: var(--ink-3);
  font-size: 9.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.category {
  overflow: hidden;
  color: var(--ink-2);
  font-size: 10.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.num {
  text-align: right;
}

.owner,
.time {
  overflow: hidden;
  color: var(--ink-3);
  font-size: 10.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ops {
  display: flex;
  justify-content: flex-end;
  gap: 2px;
}

.link {
  padding: 0 3px;
  color: var(--prussian);
  font-size: 10.5px;
}

.link:hover {
  text-decoration: underline;
}

.panel-foot {
  display: flex;
  justify-content: center;
  padding-top: 2px;
}

@media (max-width: 900px) {
  .doc-head {
    display: none;
  }

  .doc-row {
    grid-template-columns: minmax(0, 1fr) auto;
    row-gap: 4px;
  }

  .doc-row > .category,
  .doc-row > .num,
  .doc-row > .owner,
  .doc-row > .time {
    display: none;
  }
}
</style>
