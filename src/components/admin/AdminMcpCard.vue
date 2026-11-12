<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'

import ErrorState from '@/components/common/ErrorState.vue'
import LoadingSkeleton from '@/components/common/LoadingSkeleton.vue'
import { adminApi } from '@/api/admin'
import { ApiRequestError } from '@/api/client'
import { MCP_TRANSPORT_LABELS } from '@/types'
import type {
  AdminMcpServerCreateRequest,
  AdminMcpServerList,
  AdminMcpServerUpdateRequest,
  McpHealthStatus,
  McpServer,
  McpTransport,
} from '@/types'

/**
 * M8-F8 系统 MCP 卡：新建 / 编辑 / 启停 / 强制停用 / 删除。
 *
 * - 配置面接口在 MCP_ENABLED=false 时仍可读写（R1），不按能力开关隐藏入口；
 * - 凭据一律用 secret:NAME（需先在平台密钥分区创建同名密钥）或 env:NAME
 *   引用写进 headers，不提交明文密钥；
 * - `effective_enabled` 缺省时前端兜底按 `enabled && !force_disabled` 口径；
 * - slug / transport 创建后不可改（PATCH 白名单不含它们，提交会 422）；
 * - 写操作均有二次确认；同值启停是后端 no-op，前端不提交。
 */

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,63}$/

const list = ref<AdminMcpServerList | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)
const pendingId = ref<string | null>(null)
const submitting = ref(false)
const savingEdit = ref(false)

const showCreate = ref(false)
const editingId = ref<string | null>(null)

interface HeaderRow {
  key: string
  value: string
}

const createDraft = ref({
  name: '',
  slug: '',
  description: '',
  transport: 'streamable_http' as McpTransport,
  url: '',
})

const headerRows = ref<HeaderRow[]>([{ key: '', value: '' }])

const editDraft = ref({
  name: '',
  description: '',
  url: '',
  enabled: false,
  forceDisabled: false,
  autoInject: false,
})

/** 编辑态 headers：响应不回显现有值，留空=不修改；填写则整体覆盖为本次输入。 */
const editHeaderRows = ref<HeaderRow[]>([{ key: '', value: '' }])

const servers = computed<McpServer[]>(() => list.value?.items ?? [])
const stats = computed(() => list.value?.stats ?? null)

/**
 * 管理台创建暂不支持 stdio：command 必填且受 MCP_STDIO_COMMAND_ALLOWLIST 白名单限制，
 * 属运维配置场景（且 transport 创建后不可改，提交缺 command 必被 422）。
 */
const transportOptions = computed(() =>
  (Object.keys(MCP_TRANSPORT_LABELS) as McpTransport[])
    .filter((value) => value !== 'stdio')
    .map((value) => ({
      value,
      label: MCP_TRANSPORT_LABELS[value],
    })),
)

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** 生效口径：后端字段缺省时前端兜底计算。 */
function effectiveOf(server: McpServer): boolean {
  return server.effective_enabled ?? (server.enabled && !server.force_disabled)
}

function credentialHint(server: McpServer): string {
  return server.credentials_hint ?? server.auth_hint ?? '—'
}

function healthClass(status: McpHealthStatus): string {
  if (status === 'healthy') return 'st-ok'
  if (status === 'degraded') return 'st-warn'
  if (status === 'unhealthy') return 'st-bad'
  return 'st-off'
}

function healthLabel(status: McpHealthStatus): string {
  if (status === 'healthy') return '健康'
  if (status === 'degraded') return '降级'
  if (status === 'unhealthy') return '不可用'
  if (status === 'disabled') return '已停用'
  return '未检查'
}

async function load(): Promise<void> {
  if (loading.value) return
  loading.value = true
  error.value = null
  try {
    list.value = await adminApi.mcpServers()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '加载系统 MCP 失败'
  } finally {
    loading.value = false
  }
}

// ---------------------------------------------------------------- 新建

function toggleCreate(): void {
  showCreate.value = !showCreate.value
  if (showCreate.value) editingId.value = null
}

function resetCreate(): void {
  createDraft.value = { name: '', slug: '', description: '', transport: 'streamable_http', url: '' }
  headerRows.value = [{ key: '', value: '' }]
}

function addHeaderRow(): void {
  headerRows.value = [...headerRows.value, { key: '', value: '' }]
}

function removeHeaderRow(index: number): void {
  if (headerRows.value.length > 1) {
    headerRows.value = headerRows.value.filter((_, current) => current !== index)
  }
}

function collectHeaders(): Record<string, string> | undefined {
  const headers: Record<string, string> = {}
  for (const row of headerRows.value) {
    const key = row.key.trim()
    const value = row.value.trim()
    if (key) headers[key] = value
  }
  return Object.keys(headers).length > 0 ? headers : undefined
}

function validateCreate(): string | null {
  const name = createDraft.value.name.trim()
  if (!name) return '请填写名称'
  if (name.length > 128) return '名称不能超过 128 字符'
  if (!SLUG_PATTERN.test(createDraft.value.slug.trim())) {
    return 'slug 仅允许小写字母、数字与连字符（2-64 位，以字母或数字开头）'
  }
  if (createDraft.value.description.length > 2000) return '描述不能超过 2000 字符'
  if (createDraft.value.transport !== 'stdio') {
    const url = createDraft.value.url.trim()
    if (!url) return '远程传输必须填写 URL'
    if (url.length > 2048) return 'URL 不能超过 2048 字符'
  }
  return null
}

function createErrorText(cause: unknown): string {
  if (cause instanceof ApiRequestError) {
    if (cause.code === 'conflict') return 'slug 已被占用，请换一个'
    if (cause.code === 'mcp_ssrf_blocked') return 'URL 指向内网或非白名单主机，不允许'
    if (cause.code === 'mcp_transport_not_allowed') return '该传输方式不可用'
    if (cause.code === 'secret_ref_invalid') return '凭据引用格式错误'
    if (cause.code === 'secret_store_unavailable') {
      return '未配置 CAPABILITY_SECRET_KEY，请改用 env: 引用'
    }
    return cause.message
  }
  return cause instanceof Error ? cause.message : '创建失败'
}

async function submitCreate(): Promise<void> {
  const invalid = validateCreate()
  if (invalid) {
    ElMessage.error(invalid)
    return
  }
  const body: AdminMcpServerCreateRequest = {
    name: createDraft.value.name.trim(),
    slug: createDraft.value.slug.trim(),
  }
  if (createDraft.value.description.trim()) body.description = createDraft.value.description.trim()
  body.transport = createDraft.value.transport
  if (createDraft.value.transport !== 'stdio') body.url = createDraft.value.url.trim()
  const headers = collectHeaders()
  if (headers) body.headers = headers

  submitting.value = true
  try {
    // 201 但首检 unhealthy：配置已保存，提示 last_error，正常刷新列表（不重复提交）。
    const created = await adminApi.createMcpServer(body)
    const createdHealth = isRecord(created) ? created['health_status'] : undefined
    if (createdHealth === 'unhealthy') {
      const lastError = isRecord(created) ? created['last_error'] : undefined
      ElMessage.warning(
        `配置已保存，但连接失败：${typeof lastError === 'string' && lastError ? lastError : '未知错误'}`,
      )
    } else {
      ElMessage.success('MCP 已创建')
    }
    showCreate.value = false
    resetCreate()
    await load()
  } catch (cause) {
    ElMessage.error(createErrorText(cause))
  } finally {
    submitting.value = false
  }
}

// ---------------------------------------------------------------- 行内开关

async function toggleEnabled(server: McpServer): Promise<void> {
  const next = !server.enabled
  if (next === server.enabled) return
  try {
    await ElMessageBox.confirm(
      next
        ? `启用「${server.name}」后所有用户可按个人设置使用该 MCP。`
        : `停用「${server.name}」后所有用户不可使用该 MCP。`,
      next ? '启用系统 MCP' : '停用系统 MCP',
      {
        confirmButtonText: next ? '确认启用' : '确认停用',
        cancelButtonText: '取消',
        type: 'warning',
      },
    )
  } catch {
    return
  }
  pendingId.value = server.id
  try {
    await adminApi.updateMcpServer(server.id, { enabled: next })
    ElMessage.success(next ? '已启用' : '已停用')
  } catch (cause) {
    ElMessage.error(cause instanceof Error ? cause.message : '操作失败')
  } finally {
    pendingId.value = null
  }
  await load()
}

async function toggleForceDisabled(server: McpServer): Promise<void> {
  const current = server.force_disabled ?? false
  const next = !current
  if (next === current) return
  try {
    await ElMessageBox.confirm(
      next
        ? `强制停用「${server.name}」后，即使 enabled=true 也会对所有用户生效停用（最高优先级）。`
        : `解除「${server.name}」的强制停用后，生效状态恢复按 enabled 与用户个人覆盖计算。`,
      next ? '强制停用系统 MCP' : '解除强制停用',
      {
        confirmButtonText: next ? '确认强制停用' : '确认解除',
        cancelButtonText: '取消',
        type: 'warning',
      },
    )
  } catch {
    return
  }
  pendingId.value = server.id
  try {
    await adminApi.updateMcpServer(server.id, { force_disabled: next })
    ElMessage.success(next ? '已强制停用（优先级最高）' : '已解除强制停用')
  } catch (cause) {
    ElMessage.error(cause instanceof Error ? cause.message : '操作失败')
  } finally {
    pendingId.value = null
  }
  await load()
}

// ---------------------------------------------------------------- 编辑

function startEdit(server: McpServer): void {
  editingId.value = server.id
  showCreate.value = false
  editDraft.value = {
    name: server.name,
    description: server.description ?? '',
    url: server.url ?? '',
    enabled: server.enabled,
    forceDisabled: server.force_disabled ?? false,
    autoInject: server.auto_inject,
  }
  // headers 不回显（响应不含密文）：打开编辑时给一个空行，留空即不提交。
  editHeaderRows.value = [{ key: '', value: '' }]
}

function cancelEdit(): void {
  editingId.value = null
}

function addEditHeaderRow(): void {
  editHeaderRows.value = [...editHeaderRows.value, { key: '', value: '' }]
}

function removeEditHeaderRow(index: number): void {
  if (editHeaderRows.value.length > 1) {
    editHeaderRows.value = editHeaderRows.value.filter((_, current) => current !== index)
  }
}

function collectEditHeaders(): { headers?: Record<string, string>; invalid?: string } {
  const headers: Record<string, string> = {}
  for (const row of editHeaderRows.value) {
    const key = row.key.trim()
    const value = row.value.trim()
    if (!key && !value) continue
    if (!key || !value)
      return { invalid: 'headers 的键与值需同时填写（支持 secret:NAME / env:NAME 引用）' }
    headers[key] = value
  }
  return Object.keys(headers).length > 0 ? { headers } : {}
}

async function submitEdit(): Promise<void> {
  const server = servers.value.find((row) => row.id === editingId.value)
  if (!server || savingEdit.value) return
  const name = editDraft.value.name.trim()
  if (!name) {
    ElMessage.error('名称不能为空')
    return
  }
  if (name.length > 128) {
    ElMessage.error('名称不能超过 128 字符')
    return
  }
  const url = editDraft.value.url.trim()
  if (server.transport !== 'stdio' && !url) {
    ElMessage.error('远程传输必须填写 URL')
    return
  }
  const collected = collectEditHeaders()
  if (collected.invalid) {
    ElMessage.error(collected.invalid)
    return
  }
  const patch: AdminMcpServerUpdateRequest = {}
  if (name !== server.name) patch.name = name
  if (editDraft.value.description !== (server.description ?? '')) {
    patch.description = editDraft.value.description
  }
  if (url !== (server.url ?? '')) patch.url = url
  if (collected.headers) patch.headers = collected.headers
  if (editDraft.value.enabled !== server.enabled) patch.enabled = editDraft.value.enabled
  if (editDraft.value.forceDisabled !== (server.force_disabled ?? false)) {
    patch.force_disabled = editDraft.value.forceDisabled
  }
  if (editDraft.value.autoInject !== server.auto_inject)
    patch.auto_inject = editDraft.value.autoInject
  // 空对象不发请求。
  if (Object.keys(patch).length === 0) {
    ElMessage.info('没有变更')
    return
  }
  try {
    await ElMessageBox.confirm(`保存对「${server.name}」的修改？变更会写入审计日志。`, '保存修改', {
      confirmButtonText: '确认保存',
      cancelButtonText: '取消',
      type: 'warning',
    })
  } catch {
    return
  }
  savingEdit.value = true
  try {
    await adminApi.updateMcpServer(server.id, patch)
    ElMessage.success('已保存')
    editingId.value = null
    await load()
  } catch (cause) {
    ElMessage.error(cause instanceof Error ? cause.message : '保存失败')
    await load()
  } finally {
    savingEdit.value = false
  }
}

// ---------------------------------------------------------------- 删除

async function removeServer(server: McpServer): Promise<void> {
  try {
    await ElMessageBox.confirm(
      `删除「${server.name}」（${server.slug}）后不可恢复，将清理用户级启停覆盖与工具缓存。`,
      '删除系统 MCP',
      { confirmButtonText: '确认删除', cancelButtonText: '取消', type: 'warning' },
    )
  } catch {
    return
  }
  pendingId.value = server.id
  try {
    await adminApi.deleteMcpServer(server.id)
    if (list.value) {
      const removed = server
      const enabledCount = effectiveOf(removed) ? 1 : 0
      const healthyCount = removed.health_status === 'healthy' ? 1 : 0
      const stats = list.value.stats
      list.value = {
        ...list.value,
        items: list.value.items.filter((row) => row.id !== server.id),
        // 契约：stats 基于当前筛选结果（total == len(items)），本地同步重算。
        stats: {
          ...stats,
          total: stats.total - 1,
          system: stats.system - 1,
          enabled: stats.enabled - enabledCount,
          healthy: stats.healthy - healthyCount,
        },
      }
    }
    ElMessage.success('已删除')
  } catch (cause) {
    if (cause instanceof ApiRequestError && cause.code === 'not_found') {
      // 已不存在：按服务端为准刷新列表。
      ElMessage.error('系统 MCP 不存在，已刷新列表')
      await load()
    } else {
      ElMessage.error(cause instanceof Error ? cause.message : '删除失败')
    }
  } finally {
    pendingId.value = null
  }
}

onMounted(() => {
  void load()
})
</script>

<template>
  <section class="panel" aria-labelledby="admin-mcp-title">
    <div class="panel-head">
      <div>
        <h2 id="admin-mcp-title">系统 MCP</h2>
        <p class="panel-sub">
          配置面接口在 MCP_ENABLED=false 时仍可读写。凭据请用
          secret:NAME（需先在平台密钥分区创建同名密钥） 或 env:NAME 引用写进
          headers，不提交明文密钥。
        </p>
      </div>
      <button type="button" class="btn btn-sm" :disabled="loading" @click="load">刷新</button>
      <button type="button" class="btn btn-sm" @click="toggleCreate">
        {{ showCreate ? '收起表单' : '新建 MCP' }}
      </button>
    </div>

    <p v-if="stats" class="stats mono" aria-live="polite">
      {{ stats.total }} 个 · {{ stats.enabled }} 启用 · {{ stats.healthy }} 健康
    </p>

    <LoadingSkeleton v-if="loading && !list" :rows="3" />
    <ErrorState v-else-if="error" :message="error" :retryable="true" @retry="load" />

    <template v-else-if="list">
      <form v-if="showCreate" class="inline-form" @submit.prevent="submitCreate">
        <h3>新建系统 MCP</h3>
        <div class="form-grid">
          <label>
            <span class="label-text">名称（必填，1-128 字符）</span>
            <input
              v-model="createDraft.name"
              class="input"
              type="text"
              maxlength="128"
              aria-label="MCP 名称"
            />
          </label>
          <label>
            <span class="label-text">slug（必填，创建后不可改）</span>
            <input
              v-model="createDraft.slug"
              class="input mono"
              type="text"
              maxlength="64"
              placeholder="如 slack-mcp"
              aria-label="MCP slug"
            />
          </label>
          <label class="full">
            <span class="label-text">描述（≤2000 字符）</span>
            <textarea
              v-model="createDraft.description"
              class="input"
              rows="2"
              maxlength="2000"
              aria-label="描述"
            ></textarea>
          </label>
          <label>
            <span class="label-text">传输（创建后不可改）</span>
            <select v-model="createDraft.transport" class="input" aria-label="传输方式">
              <option v-for="option in transportOptions" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </select>
          </label>
          <label>
            <span class="label-text">URL（远程必填，≤2048）</span>
            <input
              v-model="createDraft.url"
              class="input mono"
              type="text"
              maxlength="2048"
              placeholder="https://mcp.example.com/mcp"
              aria-label="URL"
            />
          </label>
        </div>

        <div class="headers-block">
          <span class="label-text"
            >Headers（value 支持 secret:NAME / env:NAME 引用，不发明文）</span
          >
          <div v-for="(row, index) in headerRows" :key="index" class="header-row">
            <input
              v-model="row.key"
              class="input mono"
              type="text"
              placeholder="Header 名，如 Authorization"
              aria-label="Header 名"
            />
            <input
              v-model="row.value"
              class="input mono"
              type="text"
              placeholder="如 secret:SLACK_MCP_TOKEN"
              aria-label="Header 值"
            />
            <button
              type="button"
              class="btn btn-sm"
              :disabled="headerRows.length <= 1"
              aria-label="移除该组 Header"
              @click="removeHeaderRow(index)"
            >
              移除
            </button>
          </div>
          <button type="button" class="btn btn-sm" @click="addHeaderRow">添加一组 Header</button>
        </div>

        <div class="form-actions">
          <!-- jsdom 不实现表单隐式提交，按钮直接绑 click；form 的 submit.prevent 兜底回车提交。 -->
          <button
            type="button"
            class="btn primary btn-sm"
            :disabled="submitting"
            @click="submitCreate"
          >
            {{ submitting ? '创建中…' : '创建' }}
          </button>
          <button type="button" class="btn btn-sm" :disabled="submitting" @click="toggleCreate">
            取消
          </button>
        </div>
      </form>

      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th scope="col">名称</th>
              <th scope="col">传输</th>
              <th scope="col">URL</th>
              <th scope="col">生效</th>
              <th scope="col">健康</th>
              <th scope="col">工具数</th>
              <th scope="col">凭据</th>
              <th scope="col" class="switch-col">启用</th>
              <th scope="col" class="switch-col">强制停用</th>
              <th scope="col" class="actions-col">操作</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="server in servers" :key="server.id">
              <tr>
                <td>
                  <div class="who">
                    <span class="name">{{ server.name }}</span>
                    <span class="slug mono">{{ server.slug }}</span>
                    <span
                      v-if="server.health_status === 'unhealthy' && server.last_error"
                      class="last-error"
                      :title="server.last_error"
                    >
                      {{ server.last_error }}
                    </span>
                  </div>
                </td>
                <td class="muted">{{ MCP_TRANSPORT_LABELS[server.transport] }}</td>
                <td class="mono muted url-cell" :title="server.url ?? ''">
                  {{ server.url ?? '—' }}
                </td>
                <td>
                  <span
                    class="st"
                    :class="
                      effectiveOf(server) ? 'st-ok' : server.force_disabled ? 'st-forced' : 'st-off'
                    "
                  >
                    {{
                      effectiveOf(server) ? '启用' : server.force_disabled ? '已强制停用' : '停用'
                    }}
                  </span>
                </td>
                <td>
                  <span class="st" :class="healthClass(server.health_status)">
                    {{ healthLabel(server.health_status) }}
                  </span>
                </td>
                <td class="mono muted">{{ server.tool_count }}</td>
                <td class="mono muted credential-cell">{{ credentialHint(server) }}</td>
                <td class="switch-col">
                  <button
                    type="button"
                    class="btn btn-sm"
                    :disabled="pendingId === server.id || editingId === server.id"
                    :aria-label="`${server.enabled ? '停用' : '启用'} ${server.name}`"
                    @click="toggleEnabled(server)"
                  >
                    {{ server.enabled ? '停用' : '启用' }}
                  </button>
                </td>
                <td class="switch-col">
                  <button
                    type="button"
                    class="btn btn-sm"
                    :class="{ danger: !(server.force_disabled ?? false) }"
                    :disabled="pendingId === server.id || editingId === server.id"
                    :aria-label="`${server.force_disabled ? '解除' : ''}强制停用 ${server.name}`"
                    @click="toggleForceDisabled(server)"
                  >
                    {{ server.force_disabled ? '解除' : '强制停用' }}
                  </button>
                </td>
                <td class="actions-col">
                  <button
                    type="button"
                    class="text-link"
                    :disabled="pendingId === server.id"
                    @click="startEdit(server)"
                  >
                    编辑
                  </button>
                  <button
                    type="button"
                    class="text-link danger"
                    :disabled="pendingId === server.id"
                    @click="removeServer(server)"
                  >
                    删除
                  </button>
                </td>
              </tr>
              <tr v-if="editingId === server.id">
                <td colspan="10">
                  <form class="inline-form edit-form" @submit.prevent="submitEdit">
                    <div class="readonly-line">
                      <span class="mono">{{ server.slug }}</span>
                      <span class="muted">/ {{ MCP_TRANSPORT_LABELS[server.transport] }}</span>
                      <span class="readonly-tag">slug 与传输创建后不可改</span>
                    </div>
                    <div class="form-grid">
                      <label>
                        <span class="label-text">名称（1-128）</span>
                        <input
                          v-model="editDraft.name"
                          class="input"
                          type="text"
                          maxlength="128"
                          aria-label="编辑名称"
                        />
                      </label>
                      <label>
                        <span class="label-text">URL</span>
                        <input
                          v-model="editDraft.url"
                          class="input mono"
                          type="text"
                          maxlength="2048"
                          aria-label="编辑 URL"
                        />
                      </label>
                      <label class="full">
                        <span class="label-text">描述</span>
                        <textarea
                          v-model="editDraft.description"
                          class="input"
                          rows="2"
                          maxlength="2000"
                          aria-label="编辑描述"
                        ></textarea>
                      </label>
                    </div>
                    <div class="switch-line">
                      <label class="checkbox">
                        <input v-model="editDraft.enabled" type="checkbox" aria-label="编辑启用" />
                        启用
                      </label>
                      <label class="checkbox">
                        <input
                          v-model="editDraft.forceDisabled"
                          type="checkbox"
                          aria-label="编辑强制停用"
                        />
                        强制停用
                      </label>
                      <label class="checkbox">
                        <input
                          v-model="editDraft.autoInject"
                          type="checkbox"
                          aria-label="编辑自动注入"
                        />
                        自动注入
                      </label>
                    </div>
                    <div class="headers-block">
                      <p class="headers-note">
                        现有 headers
                        不回显（响应不含密文）。留空=不修改；填写任意一行则整体覆盖为本次输入，凭据用
                        <span class="mono">secret:NAME</span>（需先建平台密钥）或
                        <span class="mono">env:NAME</span> 引用，不发明文。
                      </p>
                      <div v-for="(row, index) in editHeaderRows" :key="index" class="header-row">
                        <input
                          v-model="row.key"
                          class="input mono"
                          type="text"
                          placeholder="Header 名（如 Authorization）"
                          :aria-label="`编辑 header 名 ${index + 1}`"
                        />
                        <input
                          v-model="row.value"
                          class="input mono"
                          type="text"
                          placeholder="值（secret:NAME / env:NAME）"
                          :aria-label="`编辑 header 值 ${index + 1}`"
                        />
                        <button
                          type="button"
                          class="btn btn-sm"
                          :disabled="editHeaderRows.length === 1"
                          @click="removeEditHeaderRow(index)"
                        >
                          移除
                        </button>
                      </div>
                      <button type="button" class="btn btn-sm" @click="addEditHeaderRow">
                        添加 header
                      </button>
                    </div>
                    <div class="form-actions">
                      <button
                        type="button"
                        class="btn primary btn-sm"
                        :disabled="savingEdit"
                        @click="submitEdit"
                      >
                        {{ savingEdit ? '保存中…' : '保存' }}
                      </button>
                      <button
                        type="button"
                        class="btn btn-sm"
                        :disabled="savingEdit"
                        @click="cancelEdit"
                      >
                        取消
                      </button>
                    </div>
                  </form>
                </td>
              </tr>
            </template>
            <tr v-if="servers.length === 0">
              <td colspan="10" class="empty">没有系统 MCP</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </section>
</template>

<style scoped>
.panel {
  padding: 16px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--surface);
}

.panel-head {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.panel-head > div {
  flex: 1;
  min-width: 0;
}

.panel-head h2 {
  margin: 0 0 4px;
  font-size: 13px;
  font-weight: 650;
  color: var(--ink);
}

.panel-sub {
  margin: 0;
  color: var(--ink-3);
  font-size: 11.5px;
  line-height: 1.6;
}

.stats {
  margin: 10px 0 0;
  color: var(--ink-3);
  font-size: 10.5px;
}

.inline-form {
  margin-top: 12px;
  padding: 12px 14px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: color-mix(in srgb, var(--amber) 4%, var(--surface));
}

.inline-form h3 {
  margin: 0 0 10px;
  font-size: 12px;
  font-weight: 650;
  color: var(--ink-2);
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.form-grid .full {
  grid-column: 1 / -1;
}

.inline-form label {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.label-text {
  color: var(--ink-3);
  font-size: 11px;
}

.inline-form .input {
  height: 30px;
  padding: 0 10px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
  color: var(--ink);
  font-size: 12px;
}

.inline-form textarea.input {
  height: auto;
  padding: 8px 10px;
  font-family: inherit;
  line-height: 1.6;
  resize: vertical;
}

.inline-form .input:focus {
  outline: none;
  border-color: var(--amber-text);
}

.headers-block {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  margin-top: 10px;
}

.headers-note {
  margin: 0;
  color: var(--ink-3);
  font-size: 10.5px;
  line-height: 1.6;
}

.header-row {
  display: flex;
  width: 100%;
  gap: 8px;
}

.header-row .input {
  flex: 1;
  min-width: 0;
}

.form-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
}

.table-wrap {
  margin-top: 10px;
  border: 1px solid var(--line);
  border-radius: 8px;
  overflow-x: auto;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.data-table th {
  padding: 8px 12px;
  border-bottom: 1px solid var(--line);
  color: var(--ink-3);
  font-size: 11px;
  font-weight: 600;
  text-align: left;
  white-space: nowrap;
}

.data-table td {
  padding: 10px 12px;
  border-bottom: 1px solid var(--line);
  vertical-align: top;
}

.data-table tbody tr:last-child td {
  border-bottom: 0;
}

.who {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 140px;
}

.who .name {
  color: var(--ink);
  font-weight: 550;
}

.who .slug {
  color: var(--ink-3);
  font-size: 10.5px;
}

.last-error {
  overflow: hidden;
  max-width: 220px;
  color: var(--red);
  font-size: 10.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.muted {
  color: var(--ink-3);
  font-size: 11px;
}

.url-cell,
.credential-cell {
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.st {
  display: inline-block;
  padding: 2px 8px;
  border: 1px solid var(--line);
  border-radius: 999px;
  color: var(--ink-3);
  font-size: 10.5px;
  white-space: nowrap;
}

.st-ok {
  border-color: color-mix(in srgb, var(--green) 35%, transparent);
  color: var(--green);
}

.st-warn {
  border-color: color-mix(in srgb, var(--amber-text) 40%, transparent);
  color: var(--amber-text);
}

.st-bad {
  border-color: color-mix(in srgb, var(--red) 40%, transparent);
  color: var(--red);
}

.st-forced {
  border-color: color-mix(in srgb, var(--red) 40%, transparent);
  color: var(--red);
}

.switch-col {
  text-align: center;
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
  margin-left: 8px;
  color: var(--red);
}

.text-link:disabled {
  color: var(--ink-3);
  cursor: not-allowed;
}

.text-link:hover:not(:disabled) {
  text-decoration: underline;
}

.btn-sm {
  height: 26px;
  padding: 0 10px;
  font-size: 11px;
}

.btn-sm.danger {
  border-color: color-mix(in srgb, var(--red) 45%, transparent);
  color: var(--red);
}

.readonly-line {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
  color: var(--ink-2);
  font-size: 11.5px;
}

.readonly-tag {
  padding: 1px 6px;
  border: 1px solid var(--line);
  border-radius: 999px;
  color: var(--ink-3);
  font-size: 9.5px;
}

.switch-line {
  display: flex;
  gap: 16px;
  margin-top: 10px;
}

.checkbox {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 6px;
  color: var(--ink-2);
  font-size: 11.5px;
}

.empty {
  padding: 24px 12px;
  color: var(--ink-3);
  text-align: center;
}

.edit-form {
  background: var(--surface);
}
</style>
