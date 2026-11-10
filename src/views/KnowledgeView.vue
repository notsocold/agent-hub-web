<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'

import EmptyState from '@/components/common/EmptyState.vue'
import ErrorState from '@/components/common/ErrorState.vue'
import LoadingBlock from '@/components/common/LoadingBlock.vue'
import PageHeader from '@/components/common/PageHeader.vue'
import PageShell from '@/components/common/PageShell.vue'
import StatCard from '@/components/common/StatCard.vue'
import StatusBadge from '@/components/common/StatusBadge.vue'
import { knowledgeApi } from '@/api/knowledge'
import { formatBytes, formatDateTime } from '@/utils/format'
import type { KnowledgeDocument, KnowledgeDocumentStatus, KnowledgeStats } from '@/types'

const items = ref<KnowledgeDocument[]>([])
const stats = ref<Partial<KnowledgeStats>>({})
const loading = ref(false)
const error = ref<string | null>(null)
const keyword = ref('')
const statusFilter = ref<'all' | KnowledgeDocumentStatus>('all')
const categoryFilter = ref('all')

const STATUS_LABELS: Record<KnowledgeDocumentStatus, string> = {
  pending: '待处理',
  indexing: '索引中',
  ready: '就绪',
  failed: '失败',
}

const STATUS_TONES: Record<KnowledgeDocumentStatus, 'ok' | 'warn' | 'error' | 'muted'> = {
  pending: 'muted',
  indexing: 'warn',
  ready: 'ok',
  failed: 'error',
}

const categories = computed(() => [...new Set(items.value.map((item) => item.category))])

const filtered = computed(() =>
  items.value.filter((item) => {
    if (statusFilter.value !== 'all' && item.status !== statusFilter.value) return false
    if (categoryFilter.value !== 'all' && item.category !== categoryFilter.value) return false
    const query = keyword.value.trim().toLowerCase()
    if (!query) return true
    return `${item.title} ${item.source_uri}`.toLowerCase().includes(query)
  }),
)

function statusLabel(status: string): string {
  return STATUS_LABELS[status as KnowledgeDocumentStatus] ?? status
}

function statusTone(status: string): 'ok' | 'warn' | 'error' | 'muted' {
  return STATUS_TONES[status as KnowledgeDocumentStatus] ?? 'muted'
}

async function load(): Promise<void> {
  loading.value = true
  error.value = null
  try {
    const page = await knowledgeApi.documents({ limit: 50 })
    items.value = page.items
    stats.value = page.stats ?? {}
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '加载知识库失败'
  } finally {
    loading.value = false
  }
}

function notReady(label: string): void {
  ElMessage.info(`${label}将在 M4 接入，当前仅展示文档列表与索引状态。`)
}

onMounted(load)
</script>

<template>
  <PageShell>
    <PageHeader
      eyebrow="KNOWLEDGE"
      title="知识库"
      description="上传文档、查看索引状态、调试检索；对话中的引用与来源会回链到这里。"
    >
      <template #actions>
        <button type="button" class="btn" @click="notReady('检索调试')">检索调试</button>
        <button type="button" class="btn primary" @click="notReady('上传文档')">上传文档</button>
      </template>
    </PageHeader>

    <div class="stat-row">
      <StatCard label="文档" :value="stats.documents ?? items.length" />
      <StatCard label="分块" :value="stats.chunks ?? 0" />
      <StatCard label="就绪" :value="stats.ready ?? 0" tone="ok" />
      <StatCard label="失败" :value="stats.failed ?? 0" tone="error" />
    </div>

    <div class="toolbar">
      <input
        v-model="keyword"
        class="input"
        type="search"
        placeholder="搜索标题或文件名"
        aria-label="搜索知识库文档"
      />
      <select v-model="categoryFilter" class="input" aria-label="筛选分类">
        <option value="all">全部分类</option>
        <option v-for="category in categories" :key="category" :value="category">
          {{ category }}
        </option>
      </select>
      <select v-model="statusFilter" class="input" aria-label="筛选状态">
        <option value="all">全部状态</option>
        <option value="ready">就绪</option>
        <option value="indexing">索引中</option>
        <option value="pending">待处理</option>
        <option value="failed">失败</option>
      </select>
    </div>

    <ErrorState v-if="error" :message="error" @retry="load" />
    <LoadingBlock v-else-if="loading" label="正在加载知识库…" />

    <div v-else class="table-card">
      <el-table :data="filtered" style="width: 100%">
        <el-table-column label="标题" min-width="230">
          <template #default="{ row }">
            <div class="name-cell">
              <span class="name">{{ row.title }}</span>
              <span class="source mono">{{ row.source_uri }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="分类" width="96">
          <template #default="{ row }">
            <span class="category">{{ row.category }}</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="104">
          <template #default="{ row }">
            <StatusBadge :tone="statusTone(row.status)" :label="statusLabel(row.status)" />
          </template>
        </el-table-column>
        <el-table-column prop="chunk_count" label="分块" width="76" />
        <el-table-column label="大小" width="92">
          <template #default="{ row }">
            <span class="muted mono">{{ formatBytes(row.size_bytes) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="所有者" width="112">
          <template #default="{ row }">
            <span class="muted">{{ row.owner?.display_name ?? '系统' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="更新时间" width="160">
          <template #default="{ row }">
            <span class="muted mono">{{ formatDateTime(row.updated_at) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{ row }">
            <button
              v-if="row.status === 'failed'"
              type="button"
              class="link"
              @click="notReady('重建索引入口')"
            >
              重试
            </button>
            <button type="button" class="link" @click="notReady('文档详情')">详情</button>
          </template>
        </el-table-column>
        <template #empty>
          <EmptyState
            title="还没有匹配的文档"
            description="支持 Markdown、TXT、PDF、CSV 与 JSON；入库完成后可被对话检索与引用。"
          />
        </template>
      </el-table>
    </div>
  </PageShell>
</template>

<style scoped>
.name-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.name {
  color: var(--ink);
  font-weight: 550;
}

.source {
  color: var(--ink-3);
  font-size: 10px;
}

.category {
  display: inline-block;
  padding: 1px 7px;
  border-radius: 99px;
  background: var(--surface-2);
  color: var(--ink-2);
  font-size: 10.5px;
}

.muted {
  color: var(--ink-3);
  font-size: 11px;
}

.link {
  padding: 0 6px;
  color: var(--prussian);
  font-size: 11.5px;
}

.link:hover {
  text-decoration: underline;
}
</style>
