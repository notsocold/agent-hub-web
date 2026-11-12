<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'

import ErrorState from '@/components/common/ErrorState.vue'
import LoadingSkeleton from '@/components/common/LoadingSkeleton.vue'
import RedactedJson from '@/components/common/RedactedJson.vue'
import { ApiRequestError } from '@/api/client'
import { auditApi } from '@/api/audit'
import { AUDIT_ACTIONS, AUDIT_RESOURCE_TYPES } from '@/types'
import type { AuditLog, AuditLogQuery, PageResult } from '@/types'
import { formatDateTime } from '@/utils/format'

const props = defineProps<{
  /** 仅管理员可查看全局审计。 */
  canViewAll: boolean
}>()

const PAGE_SIZE = 20
const CUSTOM_RESOURCE = '__custom__'

type AuditScope = 'own' | 'all'

interface FilterForm {
  action: string
  resourceType: string
  customResourceType: string
  start: string
  end: string
  actorType: string
  actorId: string
  resourceId: string
}

interface AppliedFilters {
  action: string
  resourceType: string
  start: string
  end: string
  actorType: string
  actorId: string
  resourceId: string
}

function emptyForm(): FilterForm {
  return {
    action: '',
    resourceType: '',
    customResourceType: '',
    start: '',
    end: '',
    actorType: '',
    actorId: '',
    resourceId: '',
  }
}

function emptyApplied(): AppliedFilters {
  return {
    action: '',
    resourceType: '',
    start: '',
    end: '',
    actorType: '',
    actorId: '',
    resourceId: '',
  }
}

const scope = ref<AuditScope>('own')
const filterForm = reactive<FilterForm>(emptyForm())
const applied = ref<AppliedFilters>(emptyApplied())

const items = ref<AuditLog[]>([])
const loading = ref(false)
const loadingMore = ref(false)
const error = ref<string | null>(null)
const nextCursor = ref<string | null>(null)
const hasMore = ref(false)

const detailOpen = ref(false)
const activeLog = ref<AuditLog | null>(null)

let loadSeq = 0

const endpointHint = computed(() =>
  scope.value === 'all' ? '/api/v1/admin/audit-logs' : '/api/v1/audit-logs',
)

const scopeHint = computed(() =>
  scope.value === 'own'
    ? '仅显示当前账号的审计记录'
    : '管理员视图：覆盖全部操作者，可按操作者与资源 ID 检索',
)

const emptyDescription = computed(() => {
  const filtered =
    Boolean(applied.value.action) ||
    Boolean(applied.value.resourceType) ||
    Boolean(applied.value.start) ||
    Boolean(applied.value.end) ||
    (scope.value === 'all' &&
      (Boolean(applied.value.actorType) ||
        Boolean(applied.value.actorId) ||
        Boolean(applied.value.resourceId)))
  if (scope.value === 'own') {
    return filtered
      ? '当前筛选条件下没有你的审计记录，试试调整筛选条件。'
      : '你的操作尚未产生审计记录。审批、密钥、智能体、技能、MCP 与记忆操作都会写入这里。'
  }
  return filtered ? '当前筛选条件下没有审计记录。' : '还没有任何操作者产生审计记录。'
})

watch(
  () => props.canViewAll,
  (canViewAll) => {
    if (!canViewAll && scope.value === 'all') {
      scope.value = 'own'
      detailOpen.value = false
      void load()
    }
  },
)

onMounted(() => {
  void load()
})

function toIso(value: string): string | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function resolvedResourceType(): string {
  if (filterForm.resourceType === CUSTOM_RESOURCE) {
    return filterForm.customResourceType.trim()
  }
  return filterForm.resourceType.trim()
}

function applyFilters(): void {
  const start = toIso(filterForm.start)
  const end = toIso(filterForm.end)
  if (filterForm.start && !start) {
    ElMessage.warning('开始时间格式无效，请重新选择')
    return
  }
  if (filterForm.end && !end) {
    ElMessage.warning('结束时间格式无效，请重新选择')
    return
  }
  if (start && end && new Date(start).getTime() >= new Date(end).getTime()) {
    ElMessage.warning('结束时间必须晚于开始时间')
    return
  }
  applied.value = {
    action: filterForm.action.trim(),
    resourceType: resolvedResourceType(),
    start: start ?? '',
    end: end ?? '',
    actorType: filterForm.actorType.trim(),
    actorId: filterForm.actorId.trim(),
    resourceId: filterForm.resourceId.trim(),
  }
  void load()
}

function resetFilters(): void {
  Object.assign(filterForm, emptyForm())
  applied.value = emptyApplied()
  void load()
}

function setScope(next: AuditScope): void {
  if (next === 'all' && !props.canViewAll) return
  if (scope.value === next) return
  scope.value = next
  detailOpen.value = false
  void load()
}

function buildQuery(cursor: string | null): AuditLogQuery {
  const filters = applied.value
  const params: AuditLogQuery = { limit: PAGE_SIZE }
  if (filters.action) params.action = filters.action
  if (filters.resourceType) params.resource_type = filters.resourceType
  if (filters.start) params.start = filters.start
  if (filters.end) params.end = filters.end
  if (scope.value === 'all') {
    if (filters.actorType) params.actor_type = filters.actorType
    if (filters.actorId) params.actor_id = filters.actorId
    if (filters.resourceId) params.resource_id = filters.resourceId
  }
  if (cursor) params.cursor = cursor
  return params
}

function requestPage(cursor: string | null): Promise<PageResult<AuditLog>> {
  const params = buildQuery(cursor)
  return scope.value === 'all' ? auditApi.all(params) : auditApi.own(params)
}

function applyPage(page: PageResult<AuditLog>, reset: boolean): void {
  items.value = reset ? page.items : [...items.value, ...page.items]
  nextCursor.value = page.next_cursor
  hasMore.value = page.has_more && page.next_cursor !== null
}

function isForbidden(cause: unknown): boolean {
  return cause instanceof ApiRequestError && cause.status === 403
}

function errorMessage(cause: unknown): string {
  if (isForbidden(cause)) return '没有权限查看审计日志'
  return cause instanceof Error ? cause.message : '加载审计日志失败'
}

async function load(): Promise<void> {
  const seq = ++loadSeq
  const activeScope = scope.value
  loading.value = true
  loadingMore.value = false
  error.value = null
  try {
    const page = await requestPage(null)
    if (seq !== loadSeq) return
    applyPage(page, true)
  } catch (cause) {
    if (seq !== loadSeq) return
    if (isForbidden(cause) && activeScope === 'all') {
      scope.value = 'own'
      ElMessage.warning('没有查看全局审计的权限，已切换回「我的审计」')
      try {
        const page = await auditApi.own(buildQuery(null))
        if (seq !== loadSeq) return
        applyPage(page, true)
      } catch (fallbackCause) {
        if (seq !== loadSeq) return
        error.value = errorMessage(fallbackCause)
      }
      return
    }
    error.value = errorMessage(cause)
  } finally {
    if (seq === loadSeq) loading.value = false
  }
}

async function loadMore(): Promise<void> {
  if (loading.value || loadingMore.value || !hasMore.value) return
  const cursor = nextCursor.value
  if (!cursor) return
  const seq = loadSeq
  loadingMore.value = true
  try {
    const page = await requestPage(cursor)
    if (seq !== loadSeq) return
    applyPage(page, false)
  } catch (cause) {
    if (seq !== loadSeq) return
    if (isForbidden(cause) && scope.value === 'all') {
      scope.value = 'own'
      ElMessage.warning('没有查看全局审计的权限，已切换回「我的审计」')
      void load()
      return
    }
    ElMessage.error(errorMessage(cause))
  } finally {
    if (seq === loadSeq) loadingMore.value = false
  }
}

function openDetail(row: unknown): void {
  activeLog.value = row as AuditLog
  detailOpen.value = true
}

async function copyRequestId(): Promise<void> {
  const requestId = activeLog.value?.request_id
  if (!requestId) return
  try {
    if (!navigator.clipboard?.writeText) {
      throw new Error('clipboard unavailable')
    }
    await navigator.clipboard.writeText(requestId)
    ElMessage.success('已复制 request_id')
  } catch {
    ElMessage.warning('复制失败，请手动选中 request_id 后复制')
  }
}
</script>

<template>
  <section class="panel cap-card">
    <div class="cap-inner">
      <header class="cap-head">
        <div class="cap-title">
          <h3>审计日志</h3>
          <span class="tag mono">{{ items.length }} 条</span>
        </div>
        <span class="cap-hint">{{ endpointHint }}</span>
      </header>

      <p class="cap-desc">
        审计记录覆盖审批、密钥、智能体、技能、MCP、记忆与安全事件（<span class="mono"
          >security.*</span
        >）。记录只读，不提供修改或删除入口。
      </p>

      <div class="cap-toolbar scope-bar">
        <div class="seg" role="group" aria-label="审计范围">
          <button
            type="button"
            class="scope-btn"
            :class="{ 'is-active': scope === 'own' }"
            :aria-pressed="scope === 'own'"
            @click="setScope('own')"
          >
            我的审计
          </button>
          <button
            v-if="props.canViewAll"
            type="button"
            class="scope-btn"
            :class="{ 'is-active': scope === 'all' }"
            :aria-pressed="scope === 'all'"
            @click="setScope('all')"
          >
            全局审计
          </button>
        </div>
        <span class="cap-note">{{ scopeHint }}</span>
      </div>

      <form class="filters" @submit.prevent="applyFilters">
        <div class="filter-grid">
          <label class="field">
            <span class="field-label">动作</span>
            <input
              v-model="filterForm.action"
              class="input mono"
              list="audit-action-options"
              placeholder="全部动作，可输入"
              autocomplete="off"
              spellcheck="false"
            />
          </label>

          <label class="field">
            <span class="field-label">资源类型</span>
            <select v-model="filterForm.resourceType" class="input" aria-label="筛选资源类型">
              <option value="">全部资源类型</option>
              <option v-for="type in AUDIT_RESOURCE_TYPES" :key="type" :value="type">
                {{ type }}
              </option>
              <option :value="CUSTOM_RESOURCE">自定义…</option>
            </select>
          </label>

          <label v-if="filterForm.resourceType === CUSTOM_RESOURCE" class="field">
            <span class="field-label">自定义资源类型</span>
            <input
              v-model="filterForm.customResourceType"
              class="input mono"
              placeholder="例如：knowledge"
              autocomplete="off"
              spellcheck="false"
            />
          </label>

          <label class="field">
            <span class="field-label">开始时间</span>
            <input v-model="filterForm.start" class="input mono" type="datetime-local" />
          </label>

          <label class="field">
            <span class="field-label">结束时间（不含）</span>
            <input v-model="filterForm.end" class="input mono" type="datetime-local" />
          </label>

          <template v-if="scope === 'all'">
            <label class="field">
              <span class="field-label">操作者类型</span>
              <input
                v-model="filterForm.actorType"
                class="input mono"
                list="audit-actor-types"
                placeholder="全部，如 user"
                autocomplete="off"
                spellcheck="false"
              />
            </label>

            <label class="field">
              <span class="field-label">操作者 ID</span>
              <input
                v-model="filterForm.actorId"
                class="input mono"
                placeholder="按操作者 ID 精确筛选"
                autocomplete="off"
                spellcheck="false"
              />
            </label>

            <label class="field">
              <span class="field-label">资源 ID</span>
              <input
                v-model="filterForm.resourceId"
                class="input mono"
                placeholder="按资源 ID 精确筛选"
                autocomplete="off"
                spellcheck="false"
              />
            </label>
          </template>
        </div>

        <div class="filter-actions">
          <button type="submit" class="btn btn-primary btn-sm" :disabled="loading">查询</button>
          <button
            type="button"
            class="btn btn-outline btn-sm"
            :disabled="loading"
            @click="resetFilters"
          >
            重置
          </button>
          <span class="cap-note">时间为本地时区，提交时转换为 ISO 8601；结束时间为开区间。</span>
        </div>

        <datalist id="audit-action-options">
          <option v-for="action in AUDIT_ACTIONS" :key="action" :value="action" />
        </datalist>
        <datalist id="audit-actor-types">
          <option value="user" />
          <option value="admin" />
          <option value="system" />
        </datalist>
      </form>

      <ErrorState v-if="error" :message="error" @retry="load" />
      <LoadingSkeleton v-else-if="loading" />
      <div v-else-if="items.length === 0" class="empty-state">
        <p class="empty-title">暂无审计记录</p>
        <p class="empty-desc">{{ emptyDescription }}</p>
      </div>

      <template v-else>
        <div class="table-card">
          <el-table :data="items" style="width: 100%" row-key="id">
            <el-table-column label="时间" width="136">
              <template #default="{ row }">
                <span class="mono time-cell">{{ formatDateTime(row.created_at) }}</span>
              </template>
            </el-table-column>

            <el-table-column label="动作" min-width="150">
              <template #default="{ row }">
                <span class="mono action-cell">{{ row.action }}</span>
              </template>
            </el-table-column>

            <el-table-column label="资源" min-width="150">
              <template #default="{ row }">
                <span class="resource-cell">
                  <span class="mono resource-type">{{ row.resource_type || '—' }}</span>
                  <span v-if="row.resource_id" class="mono resource-id">{{ row.resource_id }}</span>
                </span>
              </template>
            </el-table-column>

            <el-table-column label="操作者" min-width="120">
              <template #default="{ row }">
                <span class="resource-cell">
                  <span class="mono resource-type">{{ row.actor_type || '—' }}</span>
                  <span v-if="row.actor_id" class="mono resource-id">{{ row.actor_id }}</span>
                </span>
              </template>
            </el-table-column>

            <el-table-column label="request_id" min-width="130">
              <template #default="{ row }">
                <span class="mono request-cell" :title="row.request_id">
                  {{ row.request_id || '—' }}
                </span>
              </template>
            </el-table-column>

            <el-table-column label="操作" width="64" fixed="right">
              <template #default="{ row }">
                <button type="button" class="text-link" @click="openDetail(row)">详情</button>
              </template>
            </el-table-column>
          </el-table>
        </div>

        <div v-if="hasMore" class="load-more">
          <button
            type="button"
            class="btn btn-outline btn-sm"
            :disabled="loadingMore"
            @click="loadMore"
          >
            {{ loadingMore ? '加载中…' : '加载更多' }}
          </button>
        </div>
      </template>
    </div>

    <el-drawer v-model="detailOpen" title="审计详情" size="480px" :append-to-body="true">
      <template v-if="activeLog">
        <dl class="detail-grid">
          <div>
            <dt>记录 ID</dt>
            <dd class="mono">{{ activeLog.id }}</dd>
          </div>
          <div>
            <dt>时间</dt>
            <dd class="mono">{{ formatDateTime(activeLog.created_at) }}</dd>
          </div>
          <div>
            <dt>动作</dt>
            <dd class="mono">{{ activeLog.action }}</dd>
          </div>
          <div>
            <dt>资源类型</dt>
            <dd class="mono">{{ activeLog.resource_type || '—' }}</dd>
          </div>
          <div>
            <dt>操作者类型</dt>
            <dd class="mono">{{ activeLog.actor_type || '—' }}</dd>
          </div>
          <div>
            <dt>操作者 ID</dt>
            <dd class="mono">{{ activeLog.actor_id || '—' }}</dd>
          </div>
          <div class="detail-full">
            <dt>资源 ID</dt>
            <dd class="mono">{{ activeLog.resource_id || '—' }}</dd>
          </div>
        </dl>

        <section class="detail-section">
          <div class="detail-head">
            <h4>request_id</h4>
            <button
              type="button"
              class="text-link"
              :disabled="!activeLog.request_id"
              @click="copyRequestId"
            >
              复制 request_id
            </button>
          </div>
          <p class="mono request-id-line">{{ activeLog.request_id || '—' }}</p>
        </section>

        <section class="detail-section">
          <div class="detail-head">
            <h4>detail</h4>
            <span class="cap-note">敏感字段自动遮罩</span>
          </div>
          <RedactedJson :value="activeLog.detail" />
        </section>
      </template>
    </el-drawer>
  </section>
</template>

<style scoped>
.cap-inner {
  padding: 14px;
}

.filters {
  display: flex;
  flex-direction: column;
  gap: 9px;
  margin-top: 10px;
  padding: 10px 12px;
  border: 1px solid var(--line-2);
  border-radius: 7px;
  background: var(--surface-2);
}

.filter-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 8px;
}

.field {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 4px;
}

.field-label {
  color: var(--ink-3);
  font-size: 10px;
}

.filter-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.empty-state {
  margin-top: 8px;
  padding: 18px 12px;
  border-bottom: 0;
}

.empty-title {
  color: var(--ink-2);
  font-size: 12.5px;
  font-weight: 600;
}

.empty-desc {
  margin-top: 4px;
  color: var(--ink-3);
  font-size: 11px;
  line-height: 1.65;
}

.table-card {
  margin-top: 10px;
}

.time-cell {
  color: var(--ink-3);
  font-size: 10.5px;
  white-space: nowrap;
}

.action-cell {
  color: var(--ink);
  font-size: 11px;
  font-weight: 550;
  word-break: break-all;
}

.resource-cell {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 1px;
}

.resource-type {
  color: var(--ink-2);
  font-size: 11px;
}

.resource-id {
  overflow: hidden;
  color: var(--ink-3);
  font-size: 9.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.request-cell {
  display: inline-block;
  max-width: 100%;
  overflow: hidden;
  color: var(--ink-3);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: bottom;
}

.text-link:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.load-more {
  display: flex;
  justify-content: center;
  padding-top: 8px;
}

.detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px 14px;
  margin: 0;
}

.detail-grid dt {
  color: var(--ink-3);
  font-size: 10px;
}

.detail-grid dd {
  margin: 2px 0 0;
  color: var(--ink-2);
  font-size: 11.5px;
  word-break: break-all;
}

.detail-full {
  grid-column: 1 / -1;
}

.detail-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 16px;
}

.detail-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.detail-head h4 {
  color: var(--ink-2);
  font-size: 11.5px;
  font-weight: 600;
}

.request-id-line {
  margin: 0;
  padding: 8px 10px;
  border: 1px solid var(--line-2);
  border-radius: 6px;
  background: var(--surface-2);
  color: var(--ink-2);
  font-size: 10.5px;
  word-break: break-all;
}
</style>
