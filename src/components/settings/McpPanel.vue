<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'

import EmptyState from '@/components/common/EmptyState.vue'
import ErrorState from '@/components/common/ErrorState.vue'
import LoadingBlock from '@/components/common/LoadingBlock.vue'
import StatusBadge from '@/components/common/StatusBadge.vue'
import { mcpApi } from '@/api/mcp'
import { useCapabilitiesStore } from '@/stores/capabilities'
import { useSystemStore } from '@/stores/system'
import { MCP_HEALTH_LABELS, MCP_RISK_LABELS, MCP_TRANSPORT_LABELS } from '@/types'
import { formatDateTime, formatDuration } from '@/utils/format'
import type { McpHealthStatus, McpServer, McpTool } from '@/types'
import CapabilityGate from './CapabilityGate.vue'

const system = useSystemStore()
const capabilities = useCapabilitiesStore()
const enabled = computed(() => system.enabled('mcp'))

const items = ref<McpServer[]>([])
const loading = ref(false)
const loaded = ref(false)
const error = ref<string | null>(null)
const togglingId = ref<string | null>(null)
const checkingId = ref<string | null>(null)
const refreshingId = ref<string | null>(null)

const addOpen = ref(false)
const addForm = reactive({
  name: '',
  slug: '',
  url: '',
  transport: 'streamable_http' as 'streamable_http' | 'sse',
  secretRef: '',
})
const adding = ref(false)

const editOpen = ref(false)
const editTarget = ref<McpServer | null>(null)
const editForm = reactive({ name: '', url: '', secretRef: '', autoInject: false })
const editing = ref(false)

const toolsOpen = ref(false)
const toolsServer = ref<McpServer | null>(null)
const tools = ref<McpTool[]>([])
const toolsLoading = ref(false)
const toolsError = ref<string | null>(null)
const toolTogglingId = ref<string | null>(null)

const HEALTH_TONES: Record<McpHealthStatus, 'ok' | 'warn' | 'error' | 'muted'> = {
  unknown: 'muted',
  healthy: 'ok',
  degraded: 'warn',
  unhealthy: 'error',
  disabled: 'muted',
}

function healthLabel(status: McpHealthStatus): string {
  return MCP_HEALTH_LABELS[status] ?? status
}

function healthTone(status: McpHealthStatus): 'ok' | 'warn' | 'error' | 'muted' {
  return HEALTH_TONES[status]
}

watch(
  enabled,
  (on) => {
    if (on && !loaded.value && !loading.value) void load()
  },
  { immediate: true },
)

async function load(): Promise<void> {
  loading.value = true
  error.value = null
  try {
    const page = await mcpApi.listServers()
    items.value = page.items
    loaded.value = true
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '加载 MCP 服务器失败'
  } finally {
    loading.value = false
  }
}

function onToggle(row: unknown, value: string | number | boolean): void {
  void toggleEnabled(row as McpServer, value === true)
}

async function toggleEnabled(server: McpServer, next: boolean): Promise<void> {
  togglingId.value = server.id
  try {
    const updated = await mcpApi.setEnabled(server.id, next)
    Object.assign(server, updated)
    capabilities.invalidate()
    ElMessage.success(next ? '已启用' : '已禁用')
  } catch (cause) {
    ElMessage.error(cause instanceof Error ? cause.message : '启停失败')
  } finally {
    togglingId.value = null
  }
}

async function check(server: McpServer): Promise<void> {
  if (checkingId.value) return
  checkingId.value = server.id
  try {
    const result = await mcpApi.check(server.id)
    Object.assign(server, {
      health_status: result.health_status,
      latency_ms: result.latency_ms,
      tool_count: result.tool_count,
      last_checked_at: result.checked_at,
      last_error: result.error,
    })
    capabilities.invalidate()
    ElMessage.success(
      result.error
        ? '检查完成，连接异常'
        : `连接正常，延迟 ${formatDuration(result.latency_ms)}`,
    )
  } catch (cause) {
    ElMessage.error(cause instanceof Error ? cause.message : '检查连接失败')
  } finally {
    checkingId.value = null
  }
}

async function refreshTools(server: McpServer): Promise<void> {
  if (refreshingId.value) return
  refreshingId.value = server.id
  try {
    const result = await mcpApi.refreshTools(server.id)
    Object.assign(server, {
      health_status: result.health_status,
      latency_ms: result.latency_ms,
      tool_count: result.tool_count,
      last_checked_at: result.checked_at,
      last_error: result.error,
    })
    capabilities.invalidate()
    ElMessage.success('工具已刷新')
  } catch (cause) {
    ElMessage.error(cause instanceof Error ? cause.message : '刷新工具失败')
  } finally {
    refreshingId.value = null
  }
}

function authHeaders(secretRef: string): Record<string, string> | undefined {
  const value = secretRef.trim()
  if (!value) return undefined
  // 后端支持 env:NAME（环境变量值原样作为 Authorization 头）或明文（加密存储）。
  return { Authorization: value }
}

function openAdd(): void {
  addForm.name = ''
  addForm.slug = ''
  addForm.url = ''
  addForm.transport = 'streamable_http'
  addForm.secretRef = ''
  addOpen.value = true
}

async function submitAdd(): Promise<void> {
  if (adding.value) return
  const name = addForm.name.trim()
  const url = addForm.url.trim()
  const slug =
    addForm.slug.trim() ||
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
  if (!name || !url) {
    ElMessage.warning('名称与 URL 均为必填')
    return
  }
  if (!/^[a-z0-9][a-z0-9-]{1,63}$/.test(slug)) {
    ElMessage.warning('slug 需为 2–64 位小写字母/数字/连字符，并以字母或数字开头')
    return
  }
  adding.value = true
  try {
    await mcpApi.createServer({
      name,
      slug,
      url,
      transport: addForm.transport,
      headers: authHeaders(addForm.secretRef),
    })
    addOpen.value = false
    capabilities.invalidate()
    await load()
    ElMessage.success('已添加服务器')
  } catch (cause) {
    ElMessage.error(cause instanceof Error ? cause.message : '添加失败')
  } finally {
    adding.value = false
  }
}

function openEdit(server: McpServer): void {
  editTarget.value = server
  editForm.name = server.name
  editForm.url = server.url ?? ''
  editForm.secretRef = ''
  editForm.autoInject = server.auto_inject
  editOpen.value = true
}

async function submitEdit(): Promise<void> {
  if (editing.value || !editTarget.value) return
  const name = editForm.name.trim()
  const url = editForm.url.trim()
  if (!name || !url) {
    ElMessage.warning('名称与 URL 均为必填')
    return
  }
  editing.value = true
  try {
    const updated = await mcpApi.updateServer(editTarget.value.id, {
      name,
      url,
      auto_inject: editForm.autoInject,
      headers: authHeaders(editForm.secretRef),
    })
    const existing = items.value.find((item) => item.id === updated.id)
    if (existing) Object.assign(existing, updated)
    capabilities.invalidate()
    editOpen.value = false
    ElMessage.success('已保存服务器')
  } catch (cause) {
    ElMessage.error(cause instanceof Error ? cause.message : '保存失败')
  } finally {
    editing.value = false
  }
}

async function removeServer(server: McpServer): Promise<void> {
  try {
    await ElMessageBox.confirm(
      `将删除服务器「${server.name}」，其工具不再可用，该操作不可撤销。`,
      '删除服务器？',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  try {
    await mcpApi.removeServer(server.id)
    capabilities.invalidate()
    await load()
    ElMessage.success('已删除服务器')
  } catch (cause) {
    ElMessage.error(cause instanceof Error ? cause.message : '删除失败')
  }
}

async function openTools(server: McpServer): Promise<void> {
  toolsServer.value = server
  toolsOpen.value = true
  tools.value = []
  toolsError.value = null
  toolsLoading.value = true
  try {
    tools.value = await mcpApi.tools(server.id)
  } catch (cause) {
    toolsError.value = cause instanceof Error ? cause.message : '加载工具失败'
  } finally {
    toolsLoading.value = false
  }
}

function onToolToggle(
  tool: McpTool,
  field: 'enabled' | 'requires_approval',
  value: string | number | boolean,
): void {
  if (!tool.user_allowed) return
  const patch: { enabled?: boolean; requires_approval?: boolean } =
    field === 'enabled' ? { enabled: value === true } : { requires_approval: value === true }
  void updateTool(tool, patch)
}

async function updateTool(tool: McpTool, patch: { enabled?: boolean; requires_approval?: boolean }): Promise<void> {
  toolTogglingId.value = tool.id
  try {
    const updated = await mcpApi.updateTool(tool.id, patch)
    Object.assign(tool, updated)
    capabilities.invalidate()
    ElMessage.success('已更新工具')
  } catch (cause) {
    ElMessage.error(cause instanceof Error ? cause.message : '更新工具失败')
  } finally {
    toolTogglingId.value = null
  }
}
</script>

<template>
  <section class="card">
    <header class="card-head">
      <div class="head-title">
        <h3>MCP 服务器</h3>
        <span class="tag mono">{{ items.length }} 个</span>
      </div>
      <span class="mono hint">/api/v1/mcp/servers</span>
    </header>

    <CapabilityGate :enabled="enabled" name="MCP" hint="后端尚未开启 MCP 能力，无法查看或管理外部工具服务器。">
      <div class="toolbar">
        <button type="button" class="btn primary" @click="openAdd">添加服务器</button>
        <span class="muted">凭据只保存引用，接口只回显脱敏提示。</span>
      </div>

      <ErrorState v-if="error" :message="error" @retry="load" />
      <LoadingBlock v-else-if="loading" label="正在加载 MCP 服务器…" />
      <EmptyState
        v-else-if="items.length === 0"
        title="暂无 MCP 服务器"
        description="点击「添加服务器」接入外部工具；系统项只读，普通用户不能使用系统写工具。"
      />

      <ul v-else class="mcp-list">
        <li v-for="server in items" :key="server.id" class="mcp-item">
          <div class="mcp-main">
            <p class="mcp-title">
              {{ server.name }}
              <span class="mono slug">{{ server.slug }}</span>
              <span class="chip">{{ server.scope === 'system' ? '系统' : '用户' }}</span>
              <StatusBadge :tone="healthTone(server.health_status)" :label="healthLabel(server.health_status)" />
              <span v-if="server.auto_inject" class="chip chip-inject">自动注入</span>
            </p>
            <p class="mcp-line">
              {{ MCP_TRANSPORT_LABELS[server.transport] ?? server.transport }}
              <span class="dot-sep">·</span>
              {{ server.tool_count }} 个工具
              <span class="dot-sep">·</span>
              <span class="mono">最近检查 {{ formatDateTime(server.last_checked_at) }}</span>
              <span v-if="server.latency_ms !== null" class="dot-sep">·</span>
              <span v-if="server.latency_ms !== null" class="mono">延迟 {{ formatDuration(server.latency_ms) }}</span>
            </p>
            <p class="mcp-meta">
              <span v-if="server.auth_hint">凭据：<span class="mono">{{ server.auth_hint }}</span></span>
              <span v-if="server.admin_only_write_tools" class="warn-text">写工具仅管理员可用</span>
              <span v-else-if="server.scope === 'user'" class="muted">写工具需本人审批</span>
              <span v-if="server.last_error" class="error-text">最近错误：{{ server.last_error }}</span>
            </p>
          </div>
          <div class="mcp-actions">
            <button
              type="button"
              class="link"
              :disabled="checkingId !== null"
              @click="check(server)"
            >
              {{ checkingId === server.id ? '检查中…' : '检查' }}
            </button>
            <button
              type="button"
              class="link"
              :disabled="refreshingId !== null"
              @click="refreshTools(server)"
            >
              {{ refreshingId === server.id ? '刷新中…' : '刷新工具' }}
            </button>
            <button type="button" class="link" @click="openTools(server)">工具</button>
            <button v-if="server.scope === 'user'" type="button" class="link" @click="openEdit(server)">
              编辑
            </button>
            <button v-if="server.scope === 'user'" type="button" class="link danger" @click="removeServer(server)">
              删除
            </button>
            <el-switch
              :model-value="server.effective_enabled ?? server.enabled"
              :loading="togglingId === server.id"
              size="small"
              :aria-label="`${(server.effective_enabled ?? server.enabled) ? '禁用' : '启用'} ${server.name}`"
              @change="onToggle(server, $event)"
            />
          </div>
        </li>
      </ul>
    </CapabilityGate>

    <el-dialog v-model="addOpen" title="添加 MCP 服务器" width="520px" :append-to-body="true">
      <form class="form" @submit.prevent="submitAdd">
        <label class="form-row">
          <span class="form-label">名称</span>
          <input v-model="addForm.name" class="input" placeholder="例如：GitHub" />
        </label>
        <label class="form-row">
          <span class="form-label">slug</span>
          <input
            v-model="addForm.slug"
            class="input mono"
            placeholder="例如：github-mcp（留空自动生成）"
          />
        </label>
        <label class="form-row">
          <span class="form-label">URL</span>
          <input v-model="addForm.url" class="input mono" placeholder="https://mcp.example.com/mcp" />
        </label>
        <label class="form-row">
          <span class="form-label">传输方式</span>
          <select v-model="addForm.transport" class="input" aria-label="传输方式">
            <option value="streamable_http">Streamable HTTP</option>
            <option value="sse">SSE</option>
            <option value="stdio" disabled>stdio（用户自建不支持）</option>
          </select>
        </label>
        <label class="form-row">
          <span class="form-label">凭据引用</span>
          <input
            v-model="addForm.secretRef"
            class="input mono"
            placeholder="env:SLACK_TOKEN"
            aria-describedby="add-secret-hint"
          />
          <span id="add-secret-hint" class="field-hint">推荐 env:NAME（环境变量值原样作为 Authorization 头）；留空表示无鉴权。</span>
        </label>
        <div class="dialog-actions">
          <button type="button" class="btn" @click="addOpen = false">取消</button>
          <button type="submit" class="btn primary" :disabled="adding">
            {{ adding ? '添加中…' : '添加' }}
          </button>
        </div>
      </form>
    </el-dialog>

    <el-dialog v-model="editOpen" title="编辑 MCP 服务器" width="520px" :append-to-body="true">
      <form class="form" @submit.prevent="submitEdit">
        <label class="form-row">
          <span class="form-label">名称</span>
          <input v-model="editForm.name" class="input" />
        </label>
        <label class="form-row">
          <span class="form-label">URL</span>
          <input v-model="editForm.url" class="input mono" />
        </label>
        <p v-if="editTarget?.auth_hint" class="current-auth">
          当前凭据：<span class="mono">{{ editTarget.auth_hint }}</span>
        </p>
        <label class="form-row">
          <span class="form-label">凭据引用</span>
          <input v-model="editForm.secretRef" class="input mono" placeholder="env:SLACK_TOKEN" />
          <span class="field-hint">留空保持不变；填写新引用将替换现有凭据。</span>
        </label>
        <label class="form-row form-row-inline">
          <el-switch v-model="editForm.autoInject" aria-label="自动注入" />
          <span class="form-label-inline">自动注入工具目录</span>
        </label>
        <div class="dialog-actions">
          <button type="button" class="btn" @click="editOpen = false">取消</button>
          <button type="submit" class="btn primary" :disabled="editing">
            {{ editing ? '保存中…' : '保存' }}
          </button>
        </div>
      </form>
    </el-dialog>

    <el-drawer v-model="toolsOpen" title="工具列表" size="480px" :append-to-body="true">
      <template #header>
        <span>{{ toolsServer?.name ?? '工具列表' }}</span>
        <span v-if="toolsServer" class="mono drawer-slug">{{ toolsServer.slug }}</span>
      </template>

      <LoadingBlock v-if="toolsLoading" label="正在加载工具…" />
      <ErrorState v-else-if="toolsError" :message="toolsError" @retry="toolsServer && openTools(toolsServer)" />
      <EmptyState v-else-if="tools.length === 0" title="暂无工具" description="该服务器尚未发现任何工具，可尝试「刷新工具」。" />

      <ul v-else class="tool-list">
        <li
          v-for="tool in tools"
          :key="tool.id"
          class="tool-item"
          :class="{ 'is-disabled': !tool.user_allowed }"
        >
          <p class="tool-title">
            <span class="mono">{{ tool.name }}</span>
            <span class="chip" :class="`risk-${tool.risk}`">{{ MCP_RISK_LABELS[tool.risk] ?? tool.risk }}</span>
            <span v-if="tool.admin_only" class="chip chip-admin">仅管理员</span>
          </p>
          <p class="mono tool-exposed">{{ tool.exposed_name }}</p>
          <p v-if="tool.description" class="tool-desc">{{ tool.description }}</p>
          <p v-if="!tool.user_allowed" class="warn-text">系统写工具仅管理员可用</p>
          <div class="tool-switches">
            <label class="switch-inline">
              <el-switch
                :model-value="tool.enabled"
                :disabled="!tool.user_allowed"
                :loading="toolTogglingId === tool.id"
                size="small"
                :aria-label="`${tool.enabled ? '禁用' : '启用'} ${tool.name}`"
                @change="onToolToggle(tool, 'enabled', $event)"
              />
              <span>启用</span>
            </label>
            <label class="switch-inline">
              <el-switch
                :model-value="tool.requires_approval"
                :disabled="!tool.user_allowed"
                :loading="toolTogglingId === tool.id"
                size="small"
                :aria-label="`${tool.requires_approval ? '关闭' : '开启'} ${tool.name} 的审批要求`"
                @change="onToolToggle(tool, 'requires_approval', $event)"
              />
              <span>需审批</span>
            </label>
          </div>
        </li>
      </ul>
    </el-drawer>
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

.muted {
  color: var(--ink-3);
  font-size: 10.5px;
}

.mcp-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.mcp-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--line-2);
  border-radius: 7px;
  background: var(--surface-2);
}

.mcp-main {
  flex: 1;
  min-width: 0;
}

.mcp-title {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  color: var(--ink);
  font-size: 12px;
  font-weight: 600;
}

.slug {
  color: var(--ink-3);
  font-size: 10px;
  font-weight: 400;
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

.chip-inject {
  color: var(--green);
  border-color: var(--green-soft);
  background: var(--green-soft);
}

.chip-admin {
  color: var(--red);
  border-color: var(--red-soft);
  background: var(--red-soft);
}

.mcp-line {
  margin-top: 4px;
  color: var(--ink-2);
  font-size: 11px;
}

.dot-sep {
  margin: 0 3px;
  color: var(--ink-3);
}

.mcp-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  margin-top: 5px;
  color: var(--ink-3);
  font-size: 10px;
}

.warn-text {
  color: var(--amber-text);
}

.error-text {
  color: var(--red);
}

.mcp-actions {
  display: flex;
  flex: none;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  max-width: 220px;
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

.form {
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

.field-hint {
  color: var(--ink-3);
  font-size: 10px;
}

.current-auth {
  padding: 8px 10px;
  border: 1px solid var(--line-2);
  border-radius: 6px;
  background: var(--surface-2);
  color: var(--ink-2);
  font-size: 11px;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 4px;
}

.drawer-slug {
  margin-left: 8px;
  color: var(--ink-3);
  font-size: 10px;
}

.tool-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.tool-item {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 10px 12px;
  border: 1px solid var(--line-2);
  border-radius: 7px;
  background: var(--surface);
}

.tool-item.is-disabled {
  opacity: 0.6;
}

.tool-title {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  color: var(--ink);
  font-size: 12px;
  font-weight: 600;
}

.risk-read {
  color: var(--green);
  border-color: var(--green-soft);
  background: var(--green-soft);
}

.risk-write {
  color: var(--amber-text);
  border-color: var(--amber-soft);
  background: var(--amber-soft);
}

.risk-destructive {
  color: var(--red);
  border-color: var(--red-soft);
  background: var(--red-soft);
}

.risk-unknown {
  color: var(--ink-3);
}

.tool-exposed {
  color: var(--ink-3);
  font-size: 10px;
  word-break: break-all;
}

.tool-desc {
  color: var(--ink-2);
  font-size: 11px;
  line-height: 1.6;
}

.tool-switches {
  display: flex;
  gap: 16px;
  padding-top: 4px;
}

.switch-inline {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--ink-2);
  font-size: 11px;
}
</style>
