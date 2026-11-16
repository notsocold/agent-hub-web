<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import dayjs from 'dayjs'
import { ElMessage, ElMessageBox } from 'element-plus'

import AppIcon from '@/components/common/AppIcon.vue'
import ErrorState from '@/components/common/ErrorState.vue'
import LoadingSkeleton from '@/components/common/LoadingSkeleton.vue'
import { adminApi } from '@/api/admin'
import { ApiRequestError } from '@/api/client'
import { useAuthStore } from '@/stores/auth'
import { formatDateTime } from '@/utils/format'
import { buildCsv, csvFilename, downloadCsv } from '@/views/admin/csv'
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
 * - M8 不提供创建用户/重置密码，仍走注册流程与运维脚本；
 * - M3：仅导出当前筛选条件下的当前页；会话数后端无字段，不导出假列。
 */

const PAGE_SIZE = 20
const SEARCH_DEBOUNCE_MS = 400

/** M3 导出列：与当前表格口径一致；会话数后端未提供，刻意不占列。 */
const USER_CSV_HEADER = ['邮箱', '展示名', '角色', '状态', '最近登录', '创建时间'] as const

const auth = useAuthStore()
const route = useRoute()

const page = ref<AdminUserPage | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)

const keyword = ref('')
const roleFilter = ref<'' | AdminUserRole>('')
const statusFilter = ref<'' | AdminUserStatus>('')

/** 往前翻页用的游标栈：栈顶是当前页的 cursor（第一页为空栈）。 */
const cursorStack = ref<string[]>([])

const editingUser = ref<AdminUser | null>(null)

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

/** 现有契约只有 user/admin 两种角色；无映射时用中性徽标。 */
function roleMeta(role: AdminUserRole): { label: string; className: string } {
  return role === 'admin'
    ? { label: '超级管理员', className: 'admin' }
    : { label: '普通用户', className: '' }
}

function formatLastLogin(iso: string | null): string {
  if (!iso) return '—'
  const date = dayjs(iso)
  if (!date.isValid()) return '—'
  const now = dayjs()
  if (date.isSame(now, 'day')) return `今天 ${date.format('HH:mm')}`
  if (date.isSame(now.subtract(1, 'day'), 'day')) return `昨天 ${date.format('HH:mm')}`
  return date.format('MM-DD HH:mm')
}

function initials(user: AdminUser): string {
  const name = user.display_name?.trim() || user.email
  return name.slice(0, 2).toUpperCase()
}

/**
 * 导出当前筛选条件下的当前页（游标分页，只导出眼前这一页）。
 * 时间用完整 `YYYY-MM-DD HH:mm`，比表格里的「今天 / 昨天」更适合二次处理。
 */
function exportCsv(): void {
  if (users.value.length === 0) {
    ElMessage.warning('当前没有可导出的用户')
    return
  }
  const rows = users.value.map((user) => [
    user.email,
    user.display_name?.trim() || '—',
    roleMeta(user.role).label,
    user.status === 'active' ? '启用' : '停用',
    formatDateTime(user.last_login_at),
    formatDateTime(user.created_at),
  ])
  downloadCsv(csvFilename('agent-hub-users'), buildCsv([...USER_CSV_HEADER], rows))
  ElMessage.success(`已导出当前页 ${users.value.length} 条用户`)
}

function openEdit(user: AdminUser): void {
  editingUser.value = user
}

function closeEdit(): void {
  editingUser.value = null
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && editingUser.value) closeEdit()
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

function setStatusFilter(next: '' | AdminUserStatus): void {
  if (statusFilter.value === next) return
  statusFilter.value = next
  resetAndLoad()
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
  document.removeEventListener('keydown', onKeydown)
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
    if (cause instanceof ApiRequestError && cause.status === 403) {
      ElMessage.error('需要管理员权限，角色调整未执行')
    } else if (cause instanceof ApiRequestError && cause.code === 'cannot_change_own_role') {
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
    if (cause instanceof ApiRequestError && cause.status === 403) {
      ElMessage.error('需要管理员权限，状态变更未执行')
    } else if (cause instanceof ApiRequestError && cause.code === 'cannot_disable_self') {
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
  if (editingUser.value?.id === updated.id) editingUser.value = updated
}

async function editRole(user: AdminUser, role: AdminUserRole): Promise<void> {
  await changeRole(user, role)
  closeEdit()
}

async function editStatus(user: AdminUser): Promise<void> {
  await toggleStatus(user)
  closeEdit()
}

/**
 * M9 搜索深链：命令面板跳 `/admin/users?q=关键词` 时，首屏预填搜索框。
 * 只在 onMounted 读取一次，用户后续手动清空/修改搜索不反向写 URL；
 * 这里改 ref 不会触发 `@input` 防抖，随后只由下面的 load() 发一次首屏请求。
 */
function prefillKeywordFromQuery(): void {
  const value = route.query.q
  if (typeof value !== 'string') return
  const query = value.trim()
  if (query) keyword.value = query.slice(0, 100)
}

onMounted(() => {
  document.addEventListener('keydown', onKeydown)
  prefillKeywordFromQuery()
  void load()
})
</script>

<template>
  <div class="admin-page">
    <header class="admin-page-head">
      <div>
        <h1 class="page-title">用户管理</h1>
        <p class="page-sub">管理工作台账号、角色与启用状态。角色权限由「角色与权限」统一控制。</p>
      </div>
      <div class="head-actions">
        <button
          type="button"
          class="btn btn-outline"
          :disabled="users.length === 0"
          title="导出当前筛选条件下的当前页（邮箱 / 展示名 / 角色 / 状态 / 最近登录 / 创建时间）"
          @click="exportCsv"
        >
          <AppIcon name="download" />
          导出 CSV
        </button>
        <button type="button" class="btn btn-outline" :disabled="loading" @click="resetAndLoad">
          <AppIcon name="refresh" />
          {{ loading ? '刷新中…' : '刷新' }}
        </button>
      </div>
    </header>

    <p v-if="stats" class="summary-line" aria-live="polite">
      <span><b>{{ stats.total }}</b> 用户</span>
      <span class="sep">·</span>
      <span><b>{{ stats.active }}</b> 启用</span>
      <span class="sep">·</span>
      <span><b>{{ stats.disabled }}</b> 停用</span>
      <span class="sep">·</span>
      <span><b>{{ stats.admins }}</b> 管理员（含停用）</span>
    </p>

    <div class="toolbar">
      <label class="search-field">
        <AppIcon name="search" />
        <input
          v-model="keyword"
          type="search"
          maxlength="100"
          placeholder="搜索姓名或邮箱"
          aria-label="搜索用户"
          autocomplete="off"
          @input="onSearchInput"
        />
      </label>
      <select
        v-model="roleFilter"
        class="select role-filter"
        aria-label="按角色筛选"
        @change="resetAndLoad"
      >
        <option value="">全部角色</option>
        <option value="admin">超级管理员</option>
        <option value="user">普通用户</option>
      </select>
      <div class="seg" role="group" aria-label="按状态筛选">
        <button
          type="button"
          :class="{ 'is-active': statusFilter === '' }"
          :aria-pressed="statusFilter === ''"
          @click="setStatusFilter('')"
        >
          全部
        </button>
        <button
          type="button"
          :class="{ 'is-active': statusFilter === 'active' }"
          :aria-pressed="statusFilter === 'active'"
          @click="setStatusFilter('active')"
        >
          启用
        </button>
        <button
          type="button"
          :class="{ 'is-active': statusFilter === 'disabled' }"
          :aria-pressed="statusFilter === 'disabled'"
          @click="setStatusFilter('disabled')"
        >
          停用
        </button>
      </div>
      <span class="spacer"></span>
      <span class="mono count-label">{{ countLabel }}</span>
    </div>

    <LoadingSkeleton v-if="loading && !page" :rows="4" />
    <ErrorState v-else-if="error" :message="error" :retryable="true" @retry="resetAndLoad" />

    <div v-else-if="page" class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th scope="col">用户</th>
            <th scope="col">角色</th>
            <th scope="col">状态</th>
            <th scope="col">最近登录</th>
            <th scope="col">创建于</th>
            <th scope="col" class="actions">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="user in users" :key="user.id">
            <td>
              <div class="user-cell" :class="{ 'is-self': isSelf(user) }">
                <span
                  class="avatar"
                  :class="{ admin: user.role === 'admin' }"
                  aria-hidden="true"
                >
                  {{ initials(user) }}
                </span>
                <span class="user-cell-main">
                  <b>{{ user.display_name || '—' }}</b>
                  <span>{{ user.email }}</span>
                </span>
                <span v-if="isSelf(user)" class="self-tag">当前账号</span>
              </div>
            </td>
            <td>
              <div class="role-cell">
                <span class="role-badge" :class="roleMeta(user.role).className">
                  {{ roleMeta(user.role).label }}
                </span>
                <select
                  class="role-select"
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
              </div>
            </td>
            <td>
              <span class="st" :class="user.status === 'active' ? 'st-ok' : 'st-muted'">
                <span class="dot" aria-hidden="true"></span>
                {{ user.status === 'active' ? '启用' : '停用' }}
              </span>
            </td>
            <td class="mono muted">{{ formatLastLogin(user.last_login_at) }}</td>
            <td class="mono muted">{{ formatDateTime(user.created_at) }}</td>
            <td class="actions">
              <button
                type="button"
                class="text-link"
                :class="{ 'is-danger': user.status === 'active' }"
                :disabled="isSelf(user)"
                :title="isSelf(user) ? '不能停用自己的账号' : ''"
                @click="toggleStatus(user)"
              >
                {{ user.status === 'active' ? '停用' : '启用' }}
              </button>
              <a class="text-link" href="#" @click.prevent="openEdit(user)">编辑</a>
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
        <div class="pagination">
          <button
            type="button"
            aria-label="上一页"
            :disabled="!canGoPrev || loading"
            @click="goPrev"
          >
            ‹
          </button>
          <span class="page-indicator mono" aria-current="page">
            {{ cursorStack.length + 1 }}
          </span>
          <button
            type="button"
            aria-label="下一页"
            :disabled="!hasMore || loading"
            @click="goNext"
          >
            ›
          </button>
        </div>
      </div>
    </div>

    <template v-if="editingUser">
      <div class="drawer-scrim is-open" @click="closeEdit"></div>
      <aside
        class="drawer is-open"
        role="dialog"
        aria-modal="true"
        aria-labelledby="user-edit-title"
      >
        <header class="drawer-head">
          <div>
            <h2 id="user-edit-title">编辑用户</h2>
            <p class="drawer-sub">角色与启用状态变更都会写入审计日志。</p>
          </div>
          <button type="button" class="drawer-close" aria-label="关闭" @click="closeEdit">
            <AppIcon name="x" />
          </button>
        </header>
        <div class="drawer-body">
          <div class="user-summary">
            <span class="avatar admin" aria-hidden="true">{{ initials(editingUser) }}</span>
            <div>
              <b>{{ editingUser.display_name || '—' }}</b>
              <span>{{ editingUser.email }}</span>
            </div>
          </div>
          <dl class="user-meta">
            <dt>当前角色</dt>
            <dd>{{ roleMeta(editingUser.role).label }}</dd>
            <dt>状态</dt>
            <dd>{{ editingUser.status === 'active' ? '启用' : '停用' }}</dd>
            <dt>最近登录</dt>
            <dd class="mono">{{ formatDateTime(editingUser.last_login_at) }}</dd>
            <dt>创建于</dt>
            <dd class="mono">{{ formatDateTime(editingUser.created_at) }}</dd>
          </dl>
          <div class="user-edit-actions">
            <button
              type="button"
              class="btn btn-outline btn-sm"
              :disabled="isSelf(editingUser) || editingUser.role === 'admin'"
              @click="editRole(editingUser, 'admin')"
            >
              设为管理员
            </button>
            <button
              type="button"
              class="btn btn-outline btn-sm"
              :disabled="isSelf(editingUser) || editingUser.role === 'user'"
              @click="editRole(editingUser, 'user')"
            >
              设为普通用户
            </button>
          </div>
          <p class="drawer-note">
            当前账号不能修改自己的角色或停用自己。M8 不提供创建用户与重置密码入口，新增管理员仍走注册流程。
          </p>
        </div>
        <footer class="drawer-foot">
          <span class="spacer"></span>
          <button
            type="button"
            class="btn btn-danger btn-sm"
            :disabled="isSelf(editingUser)"
            @click="editStatus(editingUser)"
          >
            {{ editingUser.status === 'active' ? '停用账号' : '启用账号' }}
          </button>
          <button type="button" class="btn btn-ghost btn-sm" @click="closeEdit">关闭</button>
        </footer>
      </aside>
    </template>
  </div>
</template>
