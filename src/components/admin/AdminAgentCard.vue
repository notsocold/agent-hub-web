<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'

import ErrorState from '@/components/common/ErrorState.vue'
import LoadingSkeleton from '@/components/common/LoadingSkeleton.vue'
import { adminApi } from '@/api/admin'
import { ApiRequestError } from '@/api/client'
import { formatDateTime } from '@/utils/format'
import type {
  AdminAgentList,
  AdminAgentUpdateRequest,
  Agent,
  AgentAuthType,
  AgentHealthStatus,
} from '@/types'

/**
 * M8-F8 全局 Agent 卡：全部未软删 Agent 的全局注册表（R8，不按 owner 过滤）。
 *
 * - stats 是当前筛选下的全量计数（不含游标），用 `?? 0` 安全取键；
 * - PATCH 白名单：name / enabled / requires_approval / auth / headers；
 *   slug、url、description、protocol_version、card、skills、capabilities、
 *   health_status、owner_user_id 提交会被 422，不提供编辑控件；
 * - 响应不含 headers/明文凭据，无法回显，编辑区只提供 secret_ref 引用输入；
 * - 响应类型暂未声明 requires_approval（PATCH 已支持提交该字段），读取时用
 *   `in` 收窄、缺省按关闭处理，不做类型断言。
 */

const PAGE_SIZE = 20
const SEARCH_DEBOUNCE_MS = 400

const page = ref<AdminAgentList | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)
const savingEdit = ref(false)

const keyword = ref('')
const healthFilter = ref<'' | AgentHealthStatus>('')
const enabledFilter = ref<'' | 'true' | 'false'>('')

/** 往前翻页用的游标栈：栈顶是当前页的 cursor（第一页为空栈）。 */
const cursorStack = ref<string[]>([])

const editingId = ref<string | null>(null)

const editDraft = ref({
  name: '',
  enabled: false,
  requiresApproval: false,
  authType: 'none' as AgentAuthType,
  secretRef: '',
})

const agents = computed<Agent[]>(() => page.value?.items ?? [])
const hasMore = computed(() => page.value?.has_more ?? false)
const canGoPrev = computed(() => cursorStack.value.length > 0)

/** stats 是 Record<string, number>：键缺省时安全取 0。 */
const agentStats = computed(() => {
  const stats = page.value?.stats ?? {}
  return {
    total: String(stats['total'] ?? 0),
    healthy: String(stats['healthy'] ?? 0),
    degraded: String(stats['degraded'] ?? 0),
    unhealthy: String(stats['unhealthy'] ?? 0),
    enabled: String(stats['enabled'] ?? 0),
    disabled: String(stats['disabled'] ?? 0),
  }
})

const healthOptions: Array<{ value: '' | AgentHealthStatus; label: string }> = [
  { value: '', label: '全部健康状态' },
  { value: 'healthy', label: '健康' },
  { value: 'degraded', label: '降级' },
  { value: 'unhealthy', label: '不可用' },
]

const authTypeOptions: Array<{ value: AgentAuthType; label: string }> = [
  { value: 'none', label: '无鉴权' },
  { value: 'api_key', label: 'API Key' },
  { value: 'oauth2', label: 'OAuth2' },
]

function healthClass(status: AgentHealthStatus): string {
  if (status === 'healthy') return 'st-ok'
  if (status === 'degraded') return 'st-warn'
  if (status === 'unhealthy') return 'st-bad'
  return 'st-off'
}

function healthLabel(status: AgentHealthStatus): string {
  if (status === 'healthy') return '健康'
  if (status === 'degraded') return '降级'
  if (status === 'unhealthy') return '不可用'
  return '未检查'
}

/**
 * 响应类型暂未声明 requires_approval：仅当行上带该字段（后端返回）时读取，
 * 缺省按关闭处理。`in` 收窄是类型安全读取，不是类型断言。
 */
function approvalOf(agent: Agent): boolean {
  return 'requires_approval' in agent ? agent.requires_approval === true : false
}

function approvalKnown(agent: Agent): boolean {
  return 'requires_approval' in agent
}

/** 请求序号：响应乱序时丢弃旧结果，避免「筛选已变、列表仍是旧数据」。 */
let requestSeq = 0

async function load(options: { cursor?: string } = {}): Promise<void> {
  const seq = ++requestSeq
  loading.value = true
  error.value = null
  try {
    page.value = await adminApi.agents({
      q: keyword.value.trim() || undefined,
      health_status: healthFilter.value || undefined,
      enabled: enabledFilter.value || undefined,
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
      error.value = cause instanceof Error ? cause.message : '加载 Agent 列表失败'
    }
  } finally {
    if (seq === requestSeq) loading.value = false
  }
}

function resetAndLoad(): void {
  cursorStack.value = []
  editingId.value = null
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
  editingId.value = null
  void load({ cursor: next })
}

function goPrev(): void {
  if (cursorStack.value.length === 0) return
  cursorStack.value = cursorStack.value.slice(0, -1)
  const previous = cursorStack.value[cursorStack.value.length - 1]
  editingId.value = null
  void load({ cursor: previous })
}

/** 提交后的行更新与 404/校验失败修正：整页按当前游标刷新，成本低且 stats 一致。 */
async function reloadCurrent(): Promise<void> {
  await load({ cursor: cursorStack.value[cursorStack.value.length - 1] })
}

function startEdit(agent: Agent): void {
  editingId.value = agent.id
  editDraft.value = {
    name: agent.name,
    enabled: agent.enabled,
    requiresApproval: approvalOf(agent),
    authType: agent.auth_type,
    secretRef: '',
  }
}

function cancelEdit(): void {
  editingId.value = null
}

async function submitEdit(): Promise<void> {
  const agent = agents.value.find((row) => row.id === editingId.value)
  if (!agent || savingEdit.value) return
  const name = editDraft.value.name.trim()
  if (!name) {
    ElMessage.error('名称不能为空')
    return
  }
  if (name.length > 128) {
    ElMessage.error('名称不能超过 128 字符')
    return
  }
  const patch: AdminAgentUpdateRequest = {}
  if (name !== agent.name) patch.name = name
  if (editDraft.value.enabled !== agent.enabled) patch.enabled = editDraft.value.enabled
  if (editDraft.value.requiresApproval !== approvalOf(agent)) {
    patch.requires_approval = editDraft.value.requiresApproval
  }
  const secretRef = editDraft.value.secretRef.trim()
  const authChanged = editDraft.value.authType !== agent.auth_type
  // api_key 必须带凭据引用（secret:NAME / env:NAME）；none/oauth2 不带引用是合法的「清空」。
  if ((authChanged || secretRef) && editDraft.value.authType === 'api_key' && !secretRef) {
    ElMessage.error('API Key 鉴权需要填写凭据引用（secret:NAME 或 env:NAME）')
    return
  }
  if (authChanged || secretRef) {
    patch.auth = secretRef
      ? { type: editDraft.value.authType, secret_ref: secretRef }
      : { type: editDraft.value.authType }
  }
  // 空对象不发请求。
  if (Object.keys(patch).length === 0) {
    ElMessage.info('没有变更')
    return
  }
  try {
    await ElMessageBox.confirm(`保存对「${agent.name}」的修改？变更会写入审计日志。`, '保存修改', {
      confirmButtonText: '确认保存',
      cancelButtonText: '取消',
      type: 'warning',
    })
  } catch {
    return
  }
  savingEdit.value = true
  try {
    await adminApi.updateAgent(agent.id, patch)
    ElMessage.success('已保存')
    editingId.value = null
    await reloadCurrent()
  } catch (cause) {
    if (cause instanceof ApiRequestError && cause.code === 'not_found') {
      ElMessage.error('Agent 不存在，已刷新列表')
    } else {
      ElMessage.error(cause instanceof Error ? cause.message : '保存失败')
    }
    await reloadCurrent()
  } finally {
    savingEdit.value = false
  }
}

onMounted(() => {
  void load()
})
</script>

<template>
  <section class="panel" aria-labelledby="admin-agents-title">
    <div class="panel-head">
      <div>
        <h2 id="admin-agents-title">全局 Agent</h2>
        <p class="panel-sub">
          全部未软删 Agent 的全局注册表（不按 owner 过滤）。管理端翻页时 stats
          为当前筛选下的全量计数。
        </p>
      </div>
      <button type="button" class="btn btn-sm" :disabled="loading" @click="resetAndLoad">
        刷新
      </button>
    </div>

    <div v-if="page" class="toolbar">
      <input
        v-model="keyword"
        class="input search"
        type="search"
        maxlength="100"
        placeholder="搜索名称、slug 或 URL"
        aria-label="搜索 Agent"
        @input="onSearchInput"
      />
      <select
        v-model="healthFilter"
        class="input select"
        aria-label="按健康状态筛选"
        @change="resetAndLoad"
      >
        <option v-for="option in healthOptions" :key="option.value" :value="option.value">
          {{ option.label }}
        </option>
      </select>
      <select
        v-model="enabledFilter"
        class="input select"
        aria-label="按启用状态筛选"
        @change="resetAndLoad"
      >
        <option value="">全部启用状态</option>
        <option value="true">已启用</option>
        <option value="false">已停用</option>
      </select>
      <span class="mono stats" aria-live="polite">
        {{ agentStats.total }} 全部 · {{ agentStats.healthy }} 健康 · {{ agentStats.degraded }} 降级
        · {{ agentStats.unhealthy }} 不可用 · {{ agentStats.enabled }} 启用 ·
        {{ agentStats.disabled }} 停用
      </span>
    </div>

    <LoadingSkeleton v-if="loading && !page" :rows="3" />
    <ErrorState v-else-if="error" :message="error" :retryable="true" @retry="resetAndLoad" />

    <div v-else-if="page" class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th scope="col">名称</th>
            <th scope="col">健康</th>
            <th scope="col">鉴权</th>
            <th scope="col">启用</th>
            <th scope="col">审批要求</th>
            <th scope="col">最近检查</th>
            <th scope="col" class="actions-col">操作</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="agent in agents" :key="agent.id">
            <tr>
              <td>
                <div class="who">
                  <span class="name">{{ agent.name }}</span>
                  <span class="slug mono">{{ agent.slug }}</span>
                </div>
              </td>
              <td>
                <span class="st" :class="healthClass(agent.health_status)">
                  {{ healthLabel(agent.health_status) }}
                </span>
              </td>
              <td class="mono muted auth-cell" :title="agent.auth_hint">
                {{ agent.auth_hint || '—' }}
              </td>
              <td>
                <span class="st" :class="agent.enabled ? 'st-ok' : 'st-off'">
                  {{ agent.enabled ? '启用' : '停用' }}
                </span>
              </td>
              <td>
                <span
                  v-if="approvalKnown(agent)"
                  class="st"
                  :class="approvalOf(agent) ? 'st-warn' : 'st-off'"
                >
                  {{ approvalOf(agent) ? '需审批' : '免审批' }}
                </span>
                <span v-else class="muted">未返回</span>
              </td>
              <td class="mono muted">{{ formatDateTime(agent.last_checked_at) }}</td>
              <td class="actions-col">
                <button
                  type="button"
                  class="text-link"
                  :disabled="savingEdit"
                  @click="startEdit(agent)"
                >
                  编辑
                </button>
              </td>
            </tr>
            <tr v-if="editingId === agent.id">
              <td colspan="7">
                <form class="edit-form" @submit.prevent="submitEdit">
                  <div class="readonly-line">
                    <span class="mono">{{ agent.slug }}</span>
                    <span class="readonly-tag">
                      slug/url/description/protocol_version/card/skills/capabilities/health_status
                      为只读，提交会被 422
                    </span>
                  </div>
                  <div class="form-grid">
                    <label>
                      <span class="label-text">名称（1-128）</span>
                      <input
                        v-model="editDraft.name"
                        class="input"
                        type="text"
                        maxlength="128"
                        aria-label="Agent 名称"
                      />
                    </label>
                    <label>
                      <span class="label-text">鉴权类型</span>
                      <select v-model="editDraft.authType" class="input" aria-label="编辑鉴权类型">
                        <option
                          v-for="option in authTypeOptions"
                          :key="option.value"
                          :value="option.value"
                        >
                          {{ option.label }}
                        </option>
                      </select>
                    </label>
                    <label>
                      <span class="label-text">凭据引用（secret_ref）</span>
                      <input
                        v-model="editDraft.secretRef"
                        class="input mono"
                        type="text"
                        placeholder="secret:AGENT_KEY 或留空不改"
                        aria-label="编辑凭据引用"
                      />
                    </label>
                    <div class="switch-line">
                      <label class="checkbox">
                        <input v-model="editDraft.enabled" type="checkbox" aria-label="编辑启用" />
                        启用
                      </label>
                      <label class="checkbox">
                        <input
                          v-model="editDraft.requiresApproval"
                          type="checkbox"
                          aria-label="编辑审批要求"
                        />
                        需审批
                      </label>
                    </div>
                  </div>
                  <p class="form-note">
                    headers/明文凭据不支持在此编辑（响应不回显）；如需修改请用 API 提交 secret:/env:
                    引用。 仅管理员可引用平台密钥 secret:NAME，需先在平台密钥分区创建。
                  </p>
                  <div class="form-actions">
                    <!-- jsdom 不实现表单隐式提交，按钮直接绑 click；form 的 submit.prevent 兜底回车提交。 -->
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
          <tr v-if="agents.length === 0">
            <td colspan="7" class="empty">没有匹配的 Agent</td>
          </tr>
        </tbody>
      </table>
      <div class="table-foot">
        <span class="mono">本页 {{ agents.length }} 条</span>
        <span class="spacer"></span>
        <button type="button" class="btn btn-sm" :disabled="!canGoPrev || loading" @click="goPrev">
          ‹ 上一页
        </button>
        <button type="button" class="btn btn-sm" :disabled="!hasMore || loading" @click="goNext">
          下一页 ›
        </button>
      </div>
    </div>
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

.toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin-top: 12px;
}

.toolbar .input {
  height: 32px;
  padding: 0 10px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--bg, var(--surface));
  color: var(--ink);
  font-size: 12px;
}

.toolbar .search {
  width: 220px;
}

.toolbar .select {
  width: 130px;
}

.toolbar .stats {
  color: var(--ink-3);
  font-size: 10.5px;
}

.table-wrap {
  margin-top: 10px;
  border: 1px solid var(--line);
  border-radius: 8px;
  overflow: hidden;
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

.auth-cell {
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.muted {
  color: var(--ink-3);
  font-size: 11px;
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

.text-link:disabled {
  color: var(--ink-3);
  cursor: not-allowed;
}

.text-link:hover:not(:disabled) {
  text-decoration: underline;
}

.edit-form {
  padding: 12px 14px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: color-mix(in srgb, var(--amber) 4%, var(--surface));
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

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.form-grid label {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.label-text {
  color: var(--ink-3);
  font-size: 11px;
}

.edit-form .input {
  height: 30px;
  padding: 0 10px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
  color: var(--ink);
  font-size: 12px;
}

.edit-form .input:focus {
  outline: none;
  border-color: var(--amber-text);
}

.switch-line {
  display: flex;
  align-items: center;
  gap: 16px;
}

.checkbox {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 6px;
  color: var(--ink-2);
  font-size: 11.5px;
}

.form-note {
  margin: 10px 0 0;
  color: var(--ink-3);
  font-size: 10.5px;
  line-height: 1.6;
}

.form-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
}

.btn-sm {
  height: 26px;
  padding: 0 10px;
  font-size: 11px;
}

.table-foot {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-top: 1px solid var(--line);
  color: var(--ink-3);
  font-size: 11px;
}

.table-foot .spacer {
  flex: 1;
}

.empty {
  padding: 24px 12px;
  color: var(--ink-3);
  text-align: center;
}
</style>
