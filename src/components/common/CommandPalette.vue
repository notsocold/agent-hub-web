<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import EmptyState from '@/components/common/EmptyState.vue'
import ErrorState from '@/components/common/ErrorState.vue'
import LoadingSkeleton from '@/components/common/LoadingSkeleton.vue'
import { ApiRequestError } from '@/api/client'
import { adminApi } from '@/api/admin'
import { conversationsApi } from '@/api/conversations'
import { useChatStore } from '@/stores/chat'
import { filterPalettePages, matchMessages, type PalettePage } from '@/utils/commandPalette'
import { AUDIT_ACTIONS } from '@/types'
import type { AdminUser, Conversation, SystemCapabilities } from '@/types'

const props = withDefaults(
  defineProps<{
    open: boolean
    capabilities?: SystemCapabilities | null
    /**
     * app：对话工作台（页面 / 会话 / 当前会话消息）；
     * admin：管理台（页面 / 用户 / 审计动作），由 AdminLayout 使用。
     */
    mode?: 'app' | 'admin'
    /** 关闭后优先把焦点还给该元素（管理台搜索触发按钮）。 */
    returnFocusTo?: HTMLElement | null
  }>(),
  { capabilities: null, mode: 'app', returnFocusTo: null },
)

const emit = defineEmits<{ close: [] }>()

const route = useRoute()
const router = useRouter()
const chat = useChatStore()

const isAdminMode = computed(() => props.mode === 'admin')

/** 管理台七个页面（与 AdminLayout 侧栏一致）。 */
interface AdminPalettePage {
  id: string
  label: string
  description: string
  route: string
}

const ADMIN_PAGES: AdminPalettePage[] = [
  {
    id: 'overview',
    label: '管理概览',
    description: '系统状态、最近管理操作与待处理',
    route: 'admin-overview',
  },
  {
    id: 'users',
    label: '用户管理',
    description: '搜索用户、调整角色与账号状态',
    route: 'admin-users',
  },
  {
    id: 'roles',
    label: '角色与权限',
    description: '内置角色与权限映射（只读）',
    route: 'admin-roles',
  },
  {
    id: 'menus',
    label: '菜单管理',
    description: '管理台导航结构镜像（只读）',
    route: 'admin-menus',
  },
  {
    id: 'dictionaries',
    label: '字典管理',
    description: '系统字典与枚举项（只读）',
    route: 'admin-dictionaries',
  },
  {
    id: 'settings',
    label: '系统设置',
    description: '指令、技能、MCP、Agent 与平台密钥',
    route: 'admin-settings',
  },
  {
    id: 'audit',
    label: '审计日志',
    description: '按动作、资源与操作者筛选审计记录',
    route: 'admin-audit',
  },
]

/** 审计动作中文名；与 AdminAuditView 的 ACTION_LABELS 保持一致（动作全集来自 AUDIT_ACTIONS）。 */
const AUDIT_ACTION_LABELS: Record<string, string> = {
  'agent.created': '注册智能体',
  'agent.deleted': '删除智能体',
  'agent.health_check': '智能体健康检查',
  'agent.refresh_failed': '智能体刷新失败',
  'agent.refreshed': '刷新智能体',
  'agent.updated': '更新智能体',
  'approval.decide': '审批决定',
  'approval.timeout_canceled': '审批超时取消',
  'attachment.delete': '删除附件',
  'attachment.upload': '上传附件',
  'attachment.upload_deduplicated': '附件去重上传',
  'capability.override': '能力覆盖',
  'instruction.update': '更新平台指令',
  'mcp.server.check': '检查 MCP Server',
  'mcp.server.create': '新建 MCP Server',
  'mcp.server.delete': '删除 MCP Server',
  'mcp.server.enable': '启停 MCP Server',
  'mcp.server.update': '更新 MCP Server',
  'mcp.tool.update': '更新 MCP 工具',
  'memory.clear': '清空记忆',
  'memory.create': '创建记忆',
  'memory.delete': '删除记忆',
  'memory.update': '更新记忆',
  'secret.create': '新建平台密钥',
  'secret.delete': '删除平台密钥',
  'secret.update': '更新平台密钥',
  'security.injection_suspected': '疑似提示词注入',
  'security.output_redacted': '输出脱敏',
  'skill.create': '创建技能',
  'skill.delete': '删除技能',
  'skill.enable': '启停技能',
  'skill.import': '导入技能',
  'skill.update': '更新技能',
  'task.authorized': '任务授权',
  'task.canceled': '取消任务',
  'task.expired': '任务过期',
  'task.rejected': '拒绝任务',
  'task.resumed': '恢复任务',
}

const inputRef = ref<HTMLInputElement | null>(null)
const query = ref('')
const activeIndex = ref(0)
const conversations = ref<Conversation[]>([])
const conversationLoading = ref(false)
const conversationError = ref<string | null>(null)
const conversationErrorCode = ref<string | null>(null)
const conversationErrorRequestId = ref<string | null>(null)

const adminUsers = ref<AdminUser[]>([])
const adminUserLoading = ref(false)
const adminUserError = ref<string | null>(null)
const adminUserErrorCode = ref<string | null>(null)
const adminUserErrorRequestId = ref<string | null>(null)

let debounceTimer: ReturnType<typeof setTimeout> | null = null
let adminDebounceTimer: ReturnType<typeof setTimeout> | null = null
let searchSeq = 0
let adminSearchSeq = 0
let lastFocused: HTMLElement | null = null

interface PaletteItem {
  id: string
  group: 'page' | 'conversation' | 'message' | 'admin-page' | 'admin-user' | 'admin-audit'
  label: string
  hint?: string
  run: () => void
}

const hasQuery = computed(() => query.value.trim().length > 0)

const messages = computed(() => {
  if (isAdminMode.value || route.name !== 'chat' || !chat.state.conversationId) return []
  return matchMessages(chat.messages, query.value)
})

/** 搜索结果加载/错误状态：app 模式查会话，admin 模式查用户。 */
const searchLoading = computed(() =>
  isAdminMode.value ? adminUserLoading.value : conversationLoading.value,
)
const searchError = computed(() =>
  isAdminMode.value ? adminUserError.value : conversationError.value,
)
const searchErrorCode = computed(() =>
  isAdminMode.value ? adminUserErrorCode.value : conversationErrorCode.value,
)
const searchErrorRequestId = computed(() =>
  isAdminMode.value ? adminUserErrorRequestId.value : conversationErrorRequestId.value,
)

/** 结果项展示命中关键词附近的片段，而不是固定截取开头（关键词常常不在开头）。 */
function messageSnippet(content: string, keyword: string): string {
  const compact = (text: string): string => text.replace(/\s+/g, ' ').trim()
  const index = keyword ? content.toLowerCase().indexOf(keyword.toLowerCase()) : -1
  if (index < 0) return compact(content).slice(0, 60)
  const start = Math.max(0, index - 18)
  const end = Math.min(content.length, index + 42)
  return `${start > 0 ? '…' : ''}${compact(content.slice(start, end))}${end < content.length ? '…' : ''}`
}

const items = computed<PaletteItem[]>(() => {
  const list: PaletteItem[] = []
  if (isAdminMode.value) {
    const keyword = query.value.trim().toLowerCase()
    for (const page of ADMIN_PAGES) {
      if (keyword && !`${page.label} ${page.description}`.toLowerCase().includes(keyword)) {
        continue
      }
      list.push({
        id: `admin-page-${page.id}`,
        group: 'admin-page',
        label: page.label,
        hint: page.description,
        run: () => goAdminPage(page.route),
      })
    }
    // 空查询只展示管理台页面；用户与审计动作需要关键词触发，避免一屏塞满。
    if (!keyword) return list
    for (const user of adminUsers.value) {
      list.push({
        id: `admin-user-${user.id}`,
        group: 'admin-user',
        label: user.display_name || user.email,
        hint: `${user.email} · ${user.role === 'admin' ? '管理员' : '普通用户'}`,
        run: () => goAdminUser(keyword),
      })
    }
    for (const action of AUDIT_ACTIONS) {
      const label = AUDIT_ACTION_LABELS[action] ?? action
      if (!`${label} ${action}`.toLowerCase().includes(keyword)) continue
      list.push({
        id: `admin-audit-${action}`,
        group: 'admin-audit',
        label,
        hint: action,
        run: () => goAuditAction(action),
      })
    }
    return list
  }
  for (const page of filterPalettePages(query.value, props.capabilities)) {
    list.push({
      id: `page-${page.id}`,
      group: 'page',
      label: page.label,
      hint: page.description,
      run: () => goPage(page),
    })
  }
  for (const conversation of conversations.value) {
    list.push({
      id: `conversation-${conversation.id}`,
      group: 'conversation',
      label: conversation.title,
      hint: `${conversation.message_count} 条消息`,
      run: () => goConversation(conversation.id),
    })
  }
  for (const message of messages.value) {
    list.push({
      id: `message-${message.id}`,
      group: 'message',
      label: messageSnippet(message.content, query.value.trim()),
      hint: message.role === 'user' ? '我' : '助手',
      run: () => goMessage(message.id),
    })
  }
  return list
})

const groups = computed(() => {
  const order: Array<{ key: PaletteItem['group']; label: string }> = isAdminMode.value
    ? [
        { key: 'admin-page', label: '管理台页面' },
        { key: 'admin-user', label: '用户' },
        { key: 'admin-audit', label: '审计动作' },
      ]
    : [
        { key: 'page', label: '页面' },
        { key: 'conversation', label: '会话' },
        { key: 'message', label: '当前会话消息' },
      ]
  let cursor = 0
  return order
    .map(({ key, label }) => {
      const rows = items.value
        .filter((item) => item.group === key)
        .map((item) => ({ item, index: cursor++ }))
      return { key, label, rows }
    })
    .filter((group) => group.rows.length > 0)
})

const activeItemId = computed(() => items.value[activeIndex.value]?.id ?? null)
const showEmpty = computed(
  () => hasQuery.value && !searchLoading.value && !searchError.value && !items.value.length,
)

const paletteTitle = computed(() => (isAdminMode.value ? '管理台搜索' : '全局搜索'))
const paletteInputLabel = computed(() =>
  isAdminMode.value
    ? '搜索管理台页面、用户或审计动作'
    : '搜索页面、会话或当前会话消息',
)
const palettePlaceholder = computed(() =>
  isAdminMode.value
    ? '搜索管理台页面、用户或审计动作…'
    : '搜索页面、会话或当前会话消息…',
)
const listAriaLabel = computed(() => (isAdminMode.value ? '管理台搜索结果' : '搜索结果'))

watch(items, (list) => {
  if (activeIndex.value >= list.length) activeIndex.value = Math.max(0, list.length - 1)
})

watch(
  () => props.open,
  async (open) => {
    if (!open) {
      const target = props.returnFocusTo ?? lastFocused
      lastFocused = null
      if (target) void nextTick(() => target.focus())
      return
    }
    query.value = ''
    activeIndex.value = 0
    conversations.value = []
    conversationError.value = null
    conversationLoading.value = false
    conversationErrorCode.value = null
    conversationErrorRequestId.value = null
    adminUsers.value = []
    adminUserError.value = null
    adminUserLoading.value = false
    adminUserErrorCode.value = null
    adminUserErrorRequestId.value = null
    lastFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
    await nextTick()
    inputRef.value?.focus()
  },
)

watch(query, (value) => {
  activeIndex.value = 0
  conversationError.value = null
  adminUserError.value = null
  if (debounceTimer) {
    clearTimeout(debounceTimer)
    debounceTimer = null
  }
  if (adminDebounceTimer) {
    clearTimeout(adminDebounceTimer)
    adminDebounceTimer = null
  }
  const keyword = value.trim()
  if (isAdminMode.value) {
    if (!keyword) {
      adminSearchSeq += 1
      adminUsers.value = []
      adminUserLoading.value = false
      return
    }
    // 关键词变化立即丢弃旧结果：防抖窗口内按 Enter 不能进入不匹配的结果。
    adminUsers.value = []
    adminUserLoading.value = true
    const seq = ++adminSearchSeq
    adminDebounceTimer = setTimeout(() => {
      adminDebounceTimer = null
      void searchAdminUsers(keyword, seq)
    }, 400)
    return
  }
  if (!keyword) {
    searchSeq += 1
    conversations.value = []
    conversationLoading.value = false
    return
  }
  conversationLoading.value = true
  // 关键词变化立即丢弃旧结果：防抖窗口内按 Enter 不能打开不匹配的会话。
  conversations.value = []
  const seq = ++searchSeq
  debounceTimer = setTimeout(() => {
    debounceTimer = null
    void searchConversations(keyword, seq)
  }, 250)
})

async function searchConversations(keyword: string, seq: number): Promise<void> {
  try {
    const page = await conversationsApi.list({ q: keyword, status: 'active', limit: 8 })
    if (seq !== searchSeq) return
    conversations.value = page.items
  } catch (error) {
    if (seq !== searchSeq) return
    conversationError.value = error instanceof Error ? error.message : '会话搜索失败'
    conversationErrorCode.value = error instanceof ApiRequestError ? error.code : null
    conversationErrorRequestId.value = error instanceof ApiRequestError ? error.requestId : null
  } finally {
    if (seq === searchSeq) conversationLoading.value = false
  }
}

async function searchAdminUsers(keyword: string, seq: number): Promise<void> {
  try {
    const page = await adminApi.users({ q: keyword, limit: 8 })
    if (seq !== adminSearchSeq) return
    adminUsers.value = page.items
  } catch (error) {
    if (seq !== adminSearchSeq) return
    adminUserError.value = error instanceof Error ? error.message : '用户搜索失败'
    adminUserErrorCode.value = error instanceof ApiRequestError ? error.code : null
    adminUserErrorRequestId.value = error instanceof ApiRequestError ? error.requestId : null
  } finally {
    if (seq === adminSearchSeq) adminUserLoading.value = false
  }
}

function close(): void {
  // 焦点恢复统一交给 open=false 的 watcher，覆盖 Esc / 点击 / Ctrl+K 再次触发。
  emit('close')
}

function move(step: number): void {
  const total = items.value.length
  if (total === 0) return
  activeIndex.value = (activeIndex.value + step + total) % total
  const id = activeItemId.value
  if (id) {
    void nextTick(() => {
      document.getElementById(`palette-item-${id}`)?.scrollIntoView({ block: 'nearest' })
    })
  }
}

function execute(): void {
  items.value[activeIndex.value]?.run()
}

function select(index: number): void {
  activeIndex.value = index
  execute()
}

function onInputKeydown(event: KeyboardEvent): void {
  // 中文输入法组合中（拼音候选）的回车/方向键/Escape 交给输入法。
  if (event.isComposing || event.keyCode === 229) return
  if (event.key === 'Escape') {
    event.preventDefault()
    close()
  } else if (event.key === 'ArrowDown') {
    event.preventDefault()
    move(1)
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    move(-1)
  } else if (event.key === 'Enter') {
    event.preventDefault()
    execute()
  }
}

function retrySearch(): void {
  const keyword = query.value.trim()
  if (!keyword) return
  if (isAdminMode.value) {
    adminUserError.value = null
    adminUserLoading.value = true
    void searchAdminUsers(keyword, ++adminSearchSeq)
    return
  }
  conversationError.value = null
  conversationLoading.value = true
  void searchConversations(keyword, ++searchSeq)
}

function goPage(page: PalettePage): void {
  close()
  void router.push({ name: page.route })
}

function goAdminPage(routeName: string): void {
  close()
  void router.push({ name: routeName })
}

function goAdminUser(keyword: string): void {
  close()
  // AdminUsersView 读取 q 需要 T4 配合；这里先保留 query，页面不消费也不会报错。
  void router.push({ name: 'admin-users', query: { q: keyword } })
}

function goAuditAction(action: string): void {
  close()
  // 同理：AdminAuditView 读取 action query 由 T4 负责，跳转链接先保持契约。
  void router.push({ name: 'admin-audit', query: { action } })
}

function goConversation(id: string): void {
  close()
  if (chat.state.streaming) chat.stop()
  void router.push({ name: 'chat', query: { c: id } })
}

function goMessage(id: string): void {
  const conversationId = chat.state.conversationId
  close()
  if (!conversationId) return
  chat.requestScrollToMessage(id)
  void router.push({ name: 'chat', query: { c: conversationId } })
}

onBeforeUnmount(() => {
  if (debounceTimer) clearTimeout(debounceTimer)
  if (adminDebounceTimer) clearTimeout(adminDebounceTimer)
  searchSeq += 1
  adminSearchSeq += 1
})
</script>

<template>
  <div v-if="open" class="palette-backdrop" @click.self="close">
    <div
      class="palette"
      role="dialog"
      aria-modal="true"
      :aria-label="paletteTitle"
      @keydown.esc="close"
      @keydown.tab.prevent
    >
      <div class="palette-head">
        <svg class="search-icon" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="11" cy="11" r="6.5" />
          <path d="m16 16 4.5 4.5" />
        </svg>
        <input
          ref="inputRef"
          v-model="query"
          class="palette-input"
          type="text"
          role="combobox"
          :aria-label="paletteInputLabel"
          aria-autocomplete="list"
          aria-controls="palette-listbox"
          aria-expanded="true"
          :aria-activedescendant="activeItemId ? `palette-item-${activeItemId}` : undefined"
          :placeholder="palettePlaceholder"
          @keydown="onInputKeydown"
        />
        <kbd class="esc-hint">Esc</kbd>
      </div>

      <LoadingSkeleton v-if="searchLoading" variant="text" :count="3" />

      <ErrorState
        v-else-if="searchError"
        :message="searchError"
        :code="searchErrorCode ?? undefined"
        :request-id="searchErrorRequestId ?? undefined"
        class="palette-error"
        @retry="retrySearch"
      />

      <div
        id="palette-listbox"
        class="palette-list"
        role="listbox"
        :aria-label="listAriaLabel"
        :aria-busy="searchLoading"
      >
        <div v-for="group in groups" :key="group.key" role="group" :aria-label="group.label">
          <p class="group-label" aria-hidden="true">{{ group.label }}</p>
          <button
            v-for="row in group.rows"
            :id="`palette-item-${row.item.id}`"
            :key="row.item.id"
            type="button"
            role="option"
            tabindex="-1"
            class="palette-item"
            :class="{ 'is-active': row.index === activeIndex }"
            :aria-selected="row.index === activeIndex"
            @mouseenter="activeIndex = row.index"
            @click="select(row.index)"
          >
            <span class="item-label">{{ row.item.label }}</span>
            <span v-if="row.item.hint" class="item-hint">{{ row.item.hint }}</span>
          </button>
        </div>
      </div>

      <EmptyState
        v-if="showEmpty"
        size="sm"
        title="没有匹配结果"
        :description="
          isAdminMode
            ? '换个关键词，或确认对应页面/用户/审计动作存在。'
            : '换个关键词，或确认对应页面是否已开放。'
        "
      />

      <p class="palette-foot">
        <span><kbd>↑</kbd><kbd>↓</kbd> 选择</span>
        <span><kbd>Enter</kbd> 打开</span>
        <span><kbd>Esc</kbd> 关闭</span>
      </p>
    </div>
  </div>
</template>

<style scoped>
.palette-backdrop {
  position: fixed;
  inset: 0;
  z-index: 3000;
  display: flex;
  justify-content: center;
  padding: 12vh 16px 16px;
  background: rgba(20, 27, 32, 0.42);
}

.palette {
  display: flex;
  flex-direction: column;
  width: min(560px, 100%);
  max-height: 72vh;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--surface);
  box-shadow: var(--shadow-lg);
}

.palette-head {
  display: flex;
  flex: none;
  align-items: center;
  gap: 9px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--line-2);
}

.search-icon {
  flex: none;
  width: 15px;
  height: 15px;
  fill: none;
  stroke: var(--ink-3);
  stroke-width: 1.6;
  stroke-linecap: round;
}

.palette-input {
  flex: 1;
  min-width: 0;
  border: 0;
  background: transparent;
  color: var(--ink);
  font-size: 14px;
  outline: none;
}

/* 键盘聚焦时由全局 :focus-visible 提供焦点环；输入框本身不额外画内环。 */
.palette-input:focus-visible {
  outline: 2px solid var(--prussian);
  outline-offset: 2px;
  border-radius: 4px;
}

.palette-input::placeholder {
  color: var(--ink-3);
}

.esc-hint {
  flex: none;
  padding: 1px 6px;
  border: 1px solid var(--line);
  border-radius: 4px;
  color: var(--ink-3);
  font-family: var(--font-mono);
  font-size: 10px;
}

.palette-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 6px;
}

.group-label {
  padding: 8px 10px 4px;
  color: var(--ink-3);
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.04em;
}

.palette-item {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
  width: 100%;
  padding: 8px 10px;
  border-radius: 6px;
  color: var(--ink-2);
  font-size: 12.5px;
  text-align: left;
}

.palette-item.is-active {
  background: var(--prussian-soft);
  color: var(--ink);
}

.item-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.item-hint {
  flex: none;
  max-width: 45%;
  overflow: hidden;
  color: var(--ink-3);
  font-size: 10.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.palette-error {
  margin: 10px;
}

.palette-foot {
  display: flex;
  flex: none;
  gap: 14px;
  padding: 8px 14px;
  border-top: 1px solid var(--line-2);
  color: var(--ink-3);
  font-size: 10.5px;
}

.palette-foot kbd {
  padding: 0 4px;
  border: 1px solid var(--line);
  border-radius: 3px;
  font-family: var(--font-mono);
  font-size: 10px;
}
</style>
