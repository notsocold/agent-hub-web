<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'

import ErrorState from '@/components/common/ErrorState.vue'
import LoadingSkeleton from '@/components/common/LoadingSkeleton.vue'
import PageHeader from '@/components/common/PageHeader.vue'
import { adminApi } from '@/api/admin'
import { ApiRequestError } from '@/api/client'
import { useAuthStore } from '@/stores/auth'
import { formatDateTime } from '@/utils/format'
import type { AdminUser, AdminUserPage, AdminUserRole, AdminUserStatus } from '@/types'

/**
 * M8-F3 用户管理页：查询 + 角色/状态调整。
 *
 * 契约要点（docs/feedback/2026-11-11-m8-frontend-handoff.md §3）：
 * - `stats` 是当前筛选条件下的全量计数（不含游标），`admins` 含停用管理员；
 * - 自己的行前端禁用「改角色 / 停用」，服务端仍是最终防线；
 * - 错误一律按 `error.code` 分支：cannot_change_own_role / cannot_disable_self /
 *   last_admin_protected / validation_error / not_found；
 * - cursor 不透明：非法游标 422 时回到第一页，不用本地值重试；
 * - M8 不提供创建用户/重置密码，仍走注册流程与运维脚本。
 */

const PAGE_SIZE = 20
const SEARCH_DEBOUNCE_MS = 400

const auth = useAuthStore()

const page = ref<AdminUserPage | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)

const keyword = ref('')
const roleFilter = ref<'' | AdminUserRole>('')
const statusFilter = ref<'' | AdminUserStatus>('')

/** 往前翻页用的游标栈：栈顶是当前页的 cursor（第一页为空栈）。 */
const cursorStack = ref<string[]>([])

const users = computed<AdminUser[]>(() => page.value?.items ?? [])
const stats = computed(() => page.value?.stats ?? null)
const hasMore = computed(() => page.value?.has_more ?? false)
const canGoPrev = computed(() => cursorStack.value.length > 0)

const countLabel = computed(() => {
  if (!page.value) return ''
  return `本页 ${page.value.items.length} 条`
})

function isSelf(user: AdminUser): boolean {
  return auth.user?.id === user.id
}

function roleOptions(): Array<{ value: AdminUserRole; label: string }> {
  // 同值提交是后端 no-op，选项始终提供两值；自己的行整个控件禁用。
  return [
    { value: 'user' as AdminUserRole, label: '普通用户' },
    { value: 'admin' as AdminUserRole, label: '管理员' },
  ]
}

/** 请求序号：响应乱序时丢弃旧结果，避免「筛选已变、列表仍是旧数据」。 */
let requestSeq = 0

async function load(options: { cursor?: string } = {}): Promise<void> {
  const seq = ++requestSeq
  loading.value = true
  error.value = null
  try {
    page.value = await adminApi.users({
      q: keyword.value.trim() || undefined,
      role: roleFilter.value || undefined,
      status: statusFilter.value || undefined,
      limit: PAGE_SIZE,
      cursor: options.cursor,
    })
  } catch (cause) {
    // 非法游标（422 validation_error）回第一页重试一次，其余交给错误态。
    const invalidCursor =
      options.cursor !== undefined &&
      cause instanceof ApiRequestError &&
      cause.code === 'validation_error'
    if (seq === requestSeq) {
      if (invalidCursor) {
        cursorStack.value = []
        ElMessage.warning('游标已失效，已回到第一页')
        await load()
        return
      }
      error.value = cause instanceof Error ? cause.message : '加载用户列表失败'
    }
  } finally {
    if (seq === requestSeq) loading.value = false
  }
}

function resetAndLoad(): void {
  cursorStack.value = []
  void load()
}

let searchTimer: ReturnType<typeof setTimeout> | null = null
function onSearchInput(): void {
  if (searchTimer !== null) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    searchTimer = null
    resetAndLoad()
  }, SEARCH_DEBOUNCE_MS)
}

onUnmounted(() => {
  if (searchTimer !== null) clearTimeout(searchTimer)
})

function goNext(): void {
  const next = page.value?.next_cursor
  if (!next || !hasMore.value) return
  cursorStack.value = [...cursorStack.value, next]
  void load({ cursor: next })
}

function goPrev(): void {
  if (cursorStack.value.length === 0) return
  cursorStack.value = cursorStack.value.slice(0, -1)
  const previous = cursorStack.value[cursorStack.value.length - 1]
  void load({ cursor: previous })
}

/** 规则类失败（422/409）与取消后以服务端值为准：整页刷新成本低且同时修正 stats。 */
async function reloadCurrent(): Promise<void> {
  await load({ cursor: cursorStack.value[cursorStack.value.length - 1] })
}

async function changeRole(user: AdminUser, role: AdminUserRole): Promise<void> {
  if (isSelf(user)) return
  if (role === user.role) return
  try {
    await ElMessageBox.confirm(
      `把「${user.display_name || user.email}」的角色改为${role === 'admin' ? '管理员' : '普通用户'}？变更会写入审计日志。`,
      '调整角色',
      { confirmButtonText: '确认调整', cancelButtonText: '取消', type: 'warning' },
    )
  } catch {
    // 用户取消：select 的 DOM 值已漂移，刷新当前页恢复与服务端一致。
    await reloadCurrent()
    return
  }
  try {
    const updated = await adminApi.updateUser(user.id, { role })
    replaceRow(updated)
    ElMessage.success('角色已更新')
  } catch (cause) {
    if (cause instanceof ApiRequestError && cause.code === 'cannot_change_own_role') {
      ElMessage.error('不能修改自己的角色')
    } else {
      ElMessage.error(cause instanceof Error ? cause.message : '角色更新失败')
    }
    await reloadCurrent()
  }
}

async function toggleStatus(user: AdminUser): Promise<void> {
  if (isSelf(user)) return
  const next: AdminUserStatus = user.status === 'active' ? 'disabled' : 'active'
  try {
    await ElMessageBox.confirm(
      next === 'disabled'
        ? `停用「${user.display_name || user.email}」后该账号将无法登录。`
        : `恢复「${user.display_name || user.email}」的登录权限。`,
      next === 'disabled' ? '停用账号' : '启用账号',
      {
        confirmButtonText: next === 'disabled' ? '确认停用' : '确认启用',
        cancelButtonText: '取消',
        type: 'warning',
      },
    )
  } catch {
    return
  }
  try {
    const updated = await adminApi.updateUser(user.id, { status: next })
    replaceRow(updated)
    ElMessage.success(next === 'disabled' ? '账号已停用' : '账号已启用')
  } catch (cause) {
    if (cause instanceof ApiRequestError && cause.code === 'cannot_disable_self') {
      ElMessage.error('不能停用自己的账号')
    } else if (cause instanceof ApiRequestError && cause.code === 'last_admin_protected') {
      ElMessage.error('系统至少需要保留一名活跃管理员')
    } else {
      ElMessage.error(cause instanceof Error ? cause.message : '状态更新失败')
    }
    // 409 时 stats 需要重新拉取，整页刷新一并处理。
    await reloadCurrent()
  }
}

function replaceRow(updated: AdminUser): void {
  if (!page.value) return
  page.value = {
    ...page.value,
    items: page.value.items.map((row) => (row.id === updated.id ? updated : row)),
  }
}

onMounted(() => {
  void load()
})
</script>

<template>
  <div class="admin-page">
    <PageHeader
      eyebrow="ADMIN · USERS"
      title="用户管理"
      description="查询账号并调整角色与启用状态。M8 不提供创建用户/重置密码，新增管理员仍走注册流程与运维脚本。"
    >
      <template #actions>
        <button type="button" class="btn" :disabled="loading" @click="resetAndLoad">
          {{ loading ? '刷新中…' : '刷新' }}
        </button>
      </template>
    </PageHeader>

    <p v-if="stats" class="summary" aria-live="polite">
      <b>{{ stats.total }}</b> 用户 <span class="sep">·</span> <b>{{ stats.active }}</b> 启用
      <span class="sep">·</span> <b>{{ stats.disabled }}</b> 停用 <span class="sep">·</span>
      <b>{{ stats.admins }}</b> 管理员（含停用）
      <span class="hint">计数为当前筛选下的全量值</span>
    </p>

    <div class="toolbar">
      <input
        v-model="keyword"
        class="input search"
        type="search"
        maxlength="100"
        placeholder="搜索邮箱或展示名"
        aria-label="搜索用户"
        @input="onSearchInput"
      />
      <select
        v-model="roleFilter"
        class="input select"
        aria-label="按角色筛选"
        @change="resetAndLoad"
      >
        <option value="">全部角色</option>
        <option value="user">普通用户</option>
        <option value="admin">管理员</option>
      </select>
      <select
        v-model="statusFilter"
        class="input select"
        aria-label="按状态筛选"
        @change="resetAndLoad"
      >
        <option value="">全部状态</option>
        <option value="active">启用</option>
        <option value="disabled">停用</option>
      </select>
      <span class="spacer"></span>
      <span class="mono count">{{ countLabel }}</span>
    </div>

    <LoadingSkeleton v-if="loading && !page" :rows="4" />
    <ErrorState v-else-if="error" :message="error" :retryable="true" @retry="resetAndLoad" />

    <div v-else-if="page" class="panel table-panel">
      <table class="data-table">
        <thead>
          <tr>
            <th scope="col">用户</th>
            <th scope="col">角色</th>
            <th scope="col">状态</th>
            <th scope="col">最近登录</th>
            <th scope="col">创建于</th>
            <th scope="col" class="actions-col">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="user in users" :key="user.id">
            <td>
              <div class="who">
                <span class="name">{{ user.display_name || '—' }}</span>
                <span class="email mono">{{ user.email }}</span>
              </div>
              <span v-if="isSelf(user)" class="self-tag">当前账号</span>
            </td>
            <td>
              <select
                class="input role-select"
                :value="user.role"
                :disabled="isSelf(user)"
                :title="isSelf(user) ? '不能修改自己的角色' : '调整角色'"
                :aria-label="`调整 ${user.email} 的角色`"
                @change="
                  changeRole(user, ($event.target as HTMLSelectElement).value as AdminUserRole)
                "
              >
                <option
                  v-for="option in roleOptions()"
                  :key="option.value"
                  :value="option.value"
                  :selected="option.value === user.role"
                >
                  {{ option.label }}
                </option>
              </select>
            </td>
            <td>
              <span class="st" :class="user.status === 'active' ? 'st-ok' : 'st-off'">
                {{ user.status === 'active' ? '启用' : '停用' }}
              </span>
            </td>
            <td class="mono muted">{{ formatDateTime(user.last_login_at) }}</td>
            <td class="mono muted">{{ formatDateTime(user.created_at) }}</td>
            <td class="actions-col">
              <button
                type="button"
                class="text-link"
                :class="{ danger: user.status === 'active' }"
                :disabled="isSelf(user)"
                :title="isSelf(user) ? '不能停用自己的账号' : ''"
                @click="toggleStatus(user)"
              >
                {{ user.status === 'active' ? '停用' : '启用' }}
              </button>
            </td>
          </tr>
          <tr v-if="users.length === 0">
            <td colspan="6" class="empty">没有匹配的用户</td>
          </tr>
        </tbody>
      </table>
      <div class="table-foot">
        <span class="mono">{{ countLabel }}</span>
        <span class="spacer"></span>
        <button type="button" class="btn btn-sm" :disabled="!canGoPrev || loading" @click="goPrev">
          ‹ 上一页
        </button>
        <button type="button" class="btn btn-sm" :disabled="!hasMore || loading" @click="goNext">
          下一页 ›
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.admin-page {
  display: flex;
  flex-direction: column;
  gap: 18px;
  max-width: 1120px;
}

.summary {
  margin: 0;
  color: var(--ink-2);
  font-size: 12px;
}

.summary b {
  color: var(--ink);
  font-weight: 650;
}

.summary .sep {
  margin: 0 6px;
  color: var(--ink-3);
}

.summary .hint {
  margin-left: 10px;
  color: var(--ink-3);
  font-size: 10.5px;
}

.toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.toolbar .input {
  height: 34px;
  padding: 0 10px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
  color: var(--ink);
  font-size: 12px;
}

.toolbar .search {
  width: 240px;
}

.toolbar .select {
  width: 130px;
}

.toolbar .spacer {
  flex: 1;
}

.toolbar .count {
  color: var(--ink-3);
  font-size: 10px;
}

.panel {
  padding: 0;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--surface);
  overflow: hidden;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.data-table th {
  padding: 10px 14px;
  border-bottom: 1px solid var(--line);
  color: var(--ink-3);
  font-size: 11px;
  font-weight: 600;
  text-align: left;
  white-space: nowrap;
}

.data-table td {
  padding: 10px 14px;
  border-bottom: 1px solid var(--line);
  vertical-align: middle;
}

.data-table tbody tr:last-child td {
  border-bottom: 0;
}

.who {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.who .name {
  color: var(--ink);
  font-weight: 550;
}

.who .email {
  color: var(--ink-3);
  font-size: 11px;
}

.self-tag {
  display: inline-block;
  margin-top: 4px;
  padding: 1px 6px;
  border: 1px solid var(--line);
  border-radius: 999px;
  color: var(--ink-3);
  font-size: 9.5px;
}

.role-select {
  height: 28px;
  padding: 0 6px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--surface);
  color: var(--ink);
  font-size: 11.5px;
}

.role-select:disabled {
  color: var(--ink-3);
  cursor: not-allowed;
  opacity: 0.6;
}

.st {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 10.5px;
}

.st-ok {
  border: 1px solid color-mix(in srgb, var(--green) 35%, transparent);
  color: var(--green);
}

.st-off {
  border: 1px solid var(--line);
  color: var(--ink-3);
}

.muted {
  color: var(--ink-3);
  font-size: 11px;
  white-space: nowrap;
}

.actions-col {
  text-align: right;
  white-space: nowrap;
}

.text-link {
  padding: 0;
  border: 0;
  background: none;
  color: var(--amber-text);
  font-size: 11.5px;
  cursor: pointer;
}

.text-link.danger {
  color: var(--red);
}

.text-link:disabled {
  color: var(--ink-3);
  cursor: not-allowed;
}

.text-link:hover:not(:disabled) {
  text-decoration: underline;
}

.empty {
  padding: 28px 14px;
  color: var(--ink-3);
  text-align: center;
}

.table-foot {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-top: 1px solid var(--line);
  color: var(--ink-3);
  font-size: 11px;
}

.table-foot .spacer {
  flex: 1;
}

.btn-sm {
  height: 28px;
  padding: 0 10px;
  font-size: 11px;
}
</style>
