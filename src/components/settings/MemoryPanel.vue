<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'

import EmptyState from '@/components/common/EmptyState.vue'
import ErrorState from '@/components/common/ErrorState.vue'
import LoadingBlock from '@/components/common/LoadingBlock.vue'
import StatCard from '@/components/common/StatCard.vue'
import { memoriesApi } from '@/api/memories'
import type { MemoryListParams } from '@/api/memories'
import { useSystemStore } from '@/stores/system'
import { MEMORY_KIND_LABELS } from '@/types'
import { formatDateTime } from '@/utils/format'
import type { Memory, MemoryKind, MemoryStatus } from '@/types'
import CapabilityGate from './CapabilityGate.vue'

const system = useSystemStore()
const enabled = computed(() => system.enabled('memories'))

const items = ref<Memory[]>([])
const stats = ref<Record<string, number>>({})
const loading = ref(false)
const loadingMore = ref(false)
const loaded = ref(false)
const error = ref<string | null>(null)

const q = ref('')
const kindFilter = ref<'all' | MemoryKind>('all')
const statusFilter = ref<'all' | MemoryStatus>('all')
const nextCursor = ref<string | null>(null)
const hasMore = ref(false)

const total = computed(() => stats.value.total ?? items.value.length)
const activeCount = computed(() => stats.value.active ?? 0)
const archivedCount = computed(() => stats.value.archived ?? 0)

const dialogOpen = ref(false)
const editingId = ref<string | null>(null)
const form = reactive<{ kind: MemoryKind; title: string; content: string; pinned: boolean }>({
  kind: 'fact',
  title: '',
  content: '',
  pinned: false,
})
const savingMemory = ref(false)
const deletingId = ref<string | null>(null)
const clearing = ref(false)
const exporting = ref(false)

watch(
  enabled,
  (on) => {
    if (on && !loaded.value && !loading.value) void load()
  },
  { immediate: true },
)

let searchTimer: ReturnType<typeof setTimeout> | undefined

watch([q, kindFilter, statusFilter], () => {
  if (!loaded.value) return
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    void load()
  }, 300)
})

function listParams(cursor?: string | null): MemoryListParams {
  return {
    q: q.value.trim() || undefined,
    kind: kindFilter.value === 'all' ? undefined : kindFilter.value,
    status: statusFilter.value === 'all' ? undefined : statusFilter.value,
    limit: 20,
    cursor: cursor ?? undefined,
  }
}

async function load(): Promise<void> {
  loading.value = true
  error.value = null
  try {
    const page = await memoriesApi.list(listParams())
    items.value = page.items
    nextCursor.value = page.next_cursor
    hasMore.value = page.has_more
    stats.value = page.stats ?? {}
    loaded.value = true
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '加载记忆失败'
  } finally {
    loading.value = false
  }
}

async function loadMore(): Promise<void> {
  if (loadingMore.value || !nextCursor.value) return
  loadingMore.value = true
  try {
    const page = await memoriesApi.list(listParams(nextCursor.value))
    items.value = [...items.value, ...page.items]
    nextCursor.value = page.next_cursor
    hasMore.value = page.has_more
    stats.value = page.stats ?? stats.value
  } catch (cause) {
    ElMessage.error(cause instanceof Error ? cause.message : '加载更多失败')
  } finally {
    loadingMore.value = false
  }
}

function sourceLabel(memory: Memory): string {
  return memory.source.label ?? memory.source.conversation_title ?? '—'
}

function openCreate(): void {
  editingId.value = null
  form.kind = 'fact'
  form.title = ''
  form.content = ''
  form.pinned = false
  dialogOpen.value = true
}

function openEdit(memory: Memory): void {
  editingId.value = memory.id
  form.kind = memory.kind
  form.title = memory.title
  form.content = memory.content
  form.pinned = memory.pinned
  dialogOpen.value = true
}

async function submitMemory(): Promise<void> {
  if (savingMemory.value) return
  const title = form.title.trim()
  const content = form.content.trim()
  if (!title || !content) {
    ElMessage.warning('标题与内容不能为空')
    return
  }
  const isEdit = editingId.value !== null
  savingMemory.value = true
  try {
    if (isEdit && editingId.value) {
      await memoriesApi.update(editingId.value, {
        kind: form.kind,
        title,
        content,
        pinned: form.pinned,
      })
    } else {
      await memoriesApi.create({ kind: form.kind, title, content, pinned: form.pinned })
    }
    dialogOpen.value = false
    await load()
    ElMessage.success(isEdit ? '已更新记忆' : '已新增记忆')
  } catch (cause) {
    ElMessage.error(cause instanceof Error ? cause.message : '保存失败')
  } finally {
    savingMemory.value = false
  }
}

async function removeMemory(memory: Memory): Promise<void> {
  try {
    await ElMessageBox.confirm(
      `将删除「${memory.title}」，该操作不可撤销。`,
      '删除记忆？',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  deletingId.value = memory.id
  try {
    await memoriesApi.remove(memory.id)
    ElMessage.success('已删除')
    await load()
  } catch (cause) {
    ElMessage.error(cause instanceof Error ? cause.message : '删除失败')
  } finally {
    deletingId.value = null
  }
}

async function exportMemories(): Promise<void> {
  if (exporting.value) return
  exporting.value = true
  try {
    const data = await memoriesApi.exportAll()
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `memories-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
    ElMessage.success('已导出记忆 JSON')
  } catch (cause) {
    ElMessage.error(cause instanceof Error ? cause.message : '导出失败')
  } finally {
    exporting.value = false
  }
}

async function clearAll(): Promise<void> {
  if (clearing.value) return
  try {
    await ElMessageBox.confirm(
      '将删除全部记忆，且不可恢复。确定要继续吗？',
      '清空全部记忆？',
      { type: 'warning', confirmButtonText: '继续', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  try {
    await ElMessageBox.confirm(
      '再次确认：此操作会清空所有个人记忆，无法撤销。',
      '再次确认',
      { type: 'error', confirmButtonText: '确认清空', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  clearing.value = true
  try {
    await memoriesApi.clear()
    ElMessage.success('已清空全部记忆')
    await load()
  } catch (cause) {
    ElMessage.error(cause instanceof Error ? cause.message : '清空失败')
  } finally {
    clearing.value = false
  }
}
</script>

<template>
  <section class="card">
    <header class="card-head">
      <div class="head-title">
        <h3>长期记忆</h3>
        <span class="tag mono">{{ total }} 条</span>
      </div>
      <span class="mono hint">/api/v1/memories</span>
    </header>

    <CapabilityGate :enabled="enabled" name="长期记忆" hint="后端尚未开启记忆能力，无法查看或管理记忆。">
      <div class="stat-row">
        <StatCard label="总计" :value="total" />
        <StatCard label="活跃" :value="activeCount" tone="ok" />
        <StatCard label="已归档" :value="archivedCount" />
      </div>

      <div class="toolbar">
        <input
          v-model="q"
          class="input search"
          type="search"
          placeholder="搜索记忆标题或内容"
          aria-label="搜索记忆"
        />
        <select v-model="kindFilter" class="input" aria-label="筛选记忆类型">
          <option value="all">全部类型</option>
          <option value="profile">{{ MEMORY_KIND_LABELS.profile }}</option>
          <option value="preference">{{ MEMORY_KIND_LABELS.preference }}</option>
          <option value="fact">{{ MEMORY_KIND_LABELS.fact }}</option>
        </select>
        <select v-model="statusFilter" class="input" aria-label="筛选记忆状态">
          <option value="all">全部状态</option>
          <option value="active">活跃</option>
          <option value="archived">已归档</option>
        </select>
        <span class="spacer" />
        <button type="button" class="btn primary" @click="openCreate">新增</button>
        <button type="button" class="btn" :disabled="exporting" @click="exportMemories">
          {{ exporting ? '导出中…' : '导出 JSON' }}
        </button>
        <button type="button" class="btn danger" :disabled="clearing" @click="clearAll">
          {{ clearing ? '清空中…' : '清空全部' }}
        </button>
      </div>

      <ErrorState v-if="error" :message="error" @retry="load" />
      <LoadingBlock v-else-if="loading" label="正在加载记忆…" />
      <EmptyState
        v-else-if="items.length === 0"
        title="暂无记忆"
        description="点击「新增」保存第一条跨会话事实或偏好；也可以通过搜索/筛选缩小范围。"
      />

      <ul v-else class="mem-list">
        <li v-for="memory in items" :key="memory.id" class="mem-item">
          <div class="mem-main">
            <p class="mem-title">
              {{ memory.title }}
              <span class="chip">{{ MEMORY_KIND_LABELS[memory.kind] ?? memory.kind }}</span>
              <span v-if="memory.pinned" class="chip chip-pin">置顶</span>
              <span v-if="memory.status === 'archived'" class="chip chip-archived">已归档</span>
            </p>
            <p class="mem-content">{{ memory.content }}</p>
            <p class="mem-meta">
              <span>来源：{{ sourceLabel(memory) }}</span>
              <span class="mono">更新于 {{ formatDateTime(memory.updated_at) }}</span>
            </p>
          </div>
          <div class="mem-actions">
            <button type="button" class="link" @click="openEdit(memory)">编辑</button>
            <button
              type="button"
              class="link danger"
              :disabled="deletingId === memory.id"
              @click="removeMemory(memory)"
            >
              {{ deletingId === memory.id ? '删除中…' : '删除' }}
            </button>
          </div>
        </li>
      </ul>

      <div v-if="hasMore && !loading && !error" class="load-more">
        <button type="button" class="btn" :disabled="loadingMore" @click="loadMore">
          {{ loadingMore ? '加载中…' : '加载更多' }}
        </button>
      </div>
    </CapabilityGate>

    <el-dialog
      v-model="dialogOpen"
      :title="editingId ? '编辑记忆' : '新增记忆'"
      width="520px"
      :append-to-body="true"
    >
      <form class="mem-form" @submit.prevent="submitMemory">
        <label class="form-row">
          <span class="form-label">类型</span>
          <select v-model="form.kind" class="input">
            <option value="profile">{{ MEMORY_KIND_LABELS.profile }}</option>
            <option value="preference">{{ MEMORY_KIND_LABELS.preference }}</option>
            <option value="fact">{{ MEMORY_KIND_LABELS.fact }}</option>
          </select>
        </label>
        <label class="form-row">
          <span class="form-label">标题</span>
          <input v-model="form.title" class="input" placeholder="例如：称呼偏好" />
        </label>
        <label class="form-row">
          <span class="form-label">内容</span>
          <textarea
            v-model="form.content"
            class="input textarea"
            rows="4"
            placeholder="跨会话需要记住的稳定事实或偏好"
          />
        </label>
        <label class="form-row form-row-inline">
          <el-switch v-model="form.pinned" aria-label="置顶" />
          <span class="form-label-inline">置顶显示</span>
        </label>
        <div class="dialog-actions">
          <button type="button" class="btn" @click="dialogOpen = false">取消</button>
          <button type="submit" class="btn primary" :disabled="savingMemory">
            {{ savingMemory ? '保存中…' : '保存' }}
          </button>
        </div>
      </form>
    </el-dialog>
  </section>
</template>

<style scoped>
.card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  border: 1px solid var(--line);
  border-radius: 9px;
  background: var(--surface);
  box-shadow: var(--shadow-sm);
}

.card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.head-title {
  display: flex;
  align-items: center;
  gap: 8px;
}

h3 {
  font-size: 14px;
  font-weight: 650;
}

.hint {
  color: var(--ink-3);
  font-size: 9.5px;
}

.tag {
  padding: 1px 7px;
  border: 1px solid var(--line-2);
  border-radius: 99px;
  color: var(--ink-3);
  font-size: 9.5px;
}

.toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.search {
  flex: 1;
  min-width: 180px;
}

.spacer {
  flex: 1;
}

.mem-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.mem-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--line-2);
  border-radius: 7px;
  background: var(--surface-2);
}

.mem-main {
  flex: 1;
  min-width: 0;
}

.mem-title {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  color: var(--ink);
  font-size: 12px;
  font-weight: 600;
}

.chip {
  padding: 0 6px;
  border: 1px solid var(--line-2);
  border-radius: 99px;
  background: var(--surface);
  color: var(--ink-3);
  font-size: 9px;
  font-weight: 500;
}

.chip-pin {
  color: var(--amber-text);
  border-color: var(--amber-soft);
  background: var(--amber-soft);
}

.chip-archived {
  color: var(--ink-3);
  background: var(--surface);
}

.mem-content {
  margin-top: 4px;
  color: var(--ink-2);
  font-size: 11.5px;
  line-height: 1.6;
  word-break: break-word;
}

.mem-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  margin-top: 5px;
  color: var(--ink-3);
  font-size: 10px;
}

.mem-actions {
  display: flex;
  flex: none;
  gap: 10px;
}

.link {
  color: var(--prussian);
  font-size: 11.5px;
}

.link:hover:not(:disabled) {
  text-decoration: underline;
}

.link.danger {
  color: var(--red);
}

.link:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.btn.danger {
  border-color: var(--red-soft);
  color: var(--red);
}

.btn.danger:hover:not(:disabled) {
  border-color: var(--red);
}

.load-more {
  display: flex;
  justify-content: center;
  padding-top: 2px;
}

.mem-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.form-row {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.form-row-inline {
  flex-direction: row;
  align-items: center;
}

.form-label {
  color: var(--ink-2);
  font-size: 11.5px;
  font-weight: 550;
}

.form-label-inline {
  color: var(--ink-2);
  font-size: 12px;
}

.textarea {
  display: block;
  width: 100%;
  height: auto;
  padding: 8px 10px;
  resize: vertical;
  line-height: 1.6;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 4px;
}
</style>
