<script setup lang="ts">
import { onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'

import EmptyState from '@/components/common/EmptyState.vue'
import ErrorState from '@/components/common/ErrorState.vue'
import LoadingSkeleton from '@/components/common/LoadingSkeleton.vue'
import StatusBadge from '@/components/common/StatusBadge.vue'
import { ApiRequestError } from '@/api/client'
import { secretsApi } from '@/api/secrets'
import { SECRET_NAME_PATTERN } from '@/types'
import type { PlatformSecret } from '@/types'
import { formatDateTime } from '@/utils/format'

const props = defineProps<{
  /** 平台密钥仅管理员可查看和管理。 */
  isAdmin: boolean
}>()

const items = ref<PlatformSecret[]>([])
const loading = ref(false)
const loaded = ref(false)
const error = ref<string | null>(null)
const togglingName = ref<string | null>(null)
const deletingName = ref<string | null>(null)

const createOpen = ref(false)
const creating = ref(false)
const createForm = reactive({ name: '', description: '', value: '' })
const createErrors = reactive<{
  name: string | null
  description: string | null
  value: string | null
}>({ name: null, description: null, value: null })

const rotateOpen = ref(false)
const rotating = ref(false)
const rotateTarget = ref<PlatformSecret | null>(null)
const rotateForm = reactive<{ value: string; error: string | null }>({ value: '', error: null })

watch(
  () => props.isAdmin,
  (isAdmin) => {
    if (!isAdmin) {
      items.value = []
      loaded.value = false
      error.value = null
      createOpen.value = false
      rotateOpen.value = false
      return
    }
    if (!loaded.value && !loading.value) void load()
  },
)

onMounted(() => {
  if (props.isAdmin) void load()
})

async function load(): Promise<void> {
  if (!props.isAdmin) return
  loading.value = true
  error.value = null
  try {
    items.value = await secretsApi.list()
    loaded.value = true
  } catch (cause) {
    error.value = listErrorMessage(cause)
  } finally {
    loading.value = false
  }
}

function listErrorMessage(cause: unknown): string {
  if (cause instanceof ApiRequestError) {
    if (cause.status === 403) return '无权限查看平台密钥（仅管理员）'
    if (cause.status === 503 && cause.code === 'secret_store_unavailable') {
      return '后端未配置 CAPABILITY_SECRET_KEY，暂时无法读取密钥列表'
    }
  }
  return cause instanceof Error ? cause.message : '加载平台密钥失败'
}

function handleMutationError(cause: unknown): void {
  if (cause instanceof ApiRequestError) {
    if (cause.status === 503 && cause.code === 'secret_store_unavailable') {
      ElMessage.error('后端未配置 CAPABILITY_SECRET_KEY，暂时无法保存密钥')
      return
    }
    if (cause.status === 403) {
      ElMessage.error('无权限：仅管理员可管理平台密钥')
      return
    }
  }
  ElMessage.error(cause instanceof Error ? cause.message : '操作失败，请稍后重试')
}

function resetCreateForm(): void {
  createForm.name = ''
  createForm.description = ''
  createForm.value = ''
  createErrors.name = null
  createErrors.description = null
  createErrors.value = null
}

function openCreate(): void {
  resetCreateForm()
  createOpen.value = true
}

function closeCreate(): void {
  if (creating.value) return
  createOpen.value = false
}

function validateCreate(): boolean {
  createErrors.name = null
  createErrors.description = null
  createErrors.value = null
  const name = createForm.name.trim()
  if (!name) {
    createErrors.name = '请输入密钥名称'
  } else if (!SECRET_NAME_PATTERN.test(name)) {
    createErrors.name = '名称需以字母或下划线开头，只能包含字母、数字、下划线，最长 64 位'
  }
  if (createForm.description.length > 200) {
    createErrors.description = '描述不能超过 200 个字符'
  }
  if (!createForm.value) {
    createErrors.value = '请输入密钥明文'
  } else if (createForm.value.length > 4096) {
    createErrors.value = '密钥明文不能超过 4096 个字符'
  }
  return !createErrors.name && !createErrors.description && !createErrors.value
}

async function submitCreate(): Promise<void> {
  if (creating.value) return
  if (!validateCreate()) return
  const name = createForm.name.trim()
  const description = createForm.description.trim()
  creating.value = true
  try {
    await secretsApi.create({
      name,
      value: createForm.value,
      ...(description ? { description } : {}),
    })
    createOpen.value = false
    resetCreateForm()
    await load()
    ElMessage.success('密钥已保存，明文不会再次显示')
  } catch (cause) {
    handleMutationError(cause)
  } finally {
    creating.value = false
  }
}

function openRotate(row: unknown): void {
  rotateTarget.value = row as PlatformSecret
  rotateForm.value = ''
  rotateForm.error = null
  rotateOpen.value = true
}

function closeRotate(): void {
  if (rotating.value) return
  rotateOpen.value = false
}

function resetRotateForm(): void {
  rotateForm.value = ''
  rotateForm.error = null
  rotateTarget.value = null
}

async function submitRotate(): Promise<void> {
  if (rotating.value || !rotateTarget.value) return
  rotateForm.error = null
  if (!rotateForm.value) {
    rotateForm.error = '请输入新密钥明文'
    return
  }
  if (rotateForm.value.length > 4096) {
    rotateForm.error = '密钥明文不能超过 4096 个字符'
    return
  }
  const target = rotateTarget.value
  rotating.value = true
  try {
    const updated = await secretsApi.update(target.name, { value: rotateForm.value })
    const existing = items.value.find((item) => item.name === updated.name)
    if (existing) Object.assign(existing, updated)
    rotateOpen.value = false
    rotateForm.value = ''
    ElMessage.success('密钥已轮换，明文不会再次显示')
  } catch (cause) {
    handleMutationError(cause)
  } finally {
    rotating.value = false
  }
}

async function toggleEnabled(row: unknown): Promise<void> {
  const secret = row as PlatformSecret
  togglingName.value = secret.name
  try {
    const updated = await secretsApi.update(secret.name, { enabled: !secret.enabled })
    const existing = items.value.find((item) => item.name === updated.name)
    if (existing) Object.assign(existing, updated)
    ElMessage.success(updated.enabled ? '密钥已启用' : '密钥已停用')
  } catch (cause) {
    handleMutationError(cause)
  } finally {
    togglingName.value = null
  }
}

async function removeSecret(row: unknown): Promise<void> {
  const secret = row as PlatformSecret
  try {
    await ElMessageBox.confirm(
      `将删除平台密钥「${secret.name}」。接口不会检查引用，仍被 secret:${secret.name} 引用的配置将无法解析；此操作不可撤销。`,
      '删除平台密钥？',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  deletingName.value = secret.name
  try {
    await secretsApi.remove(secret.name)
    items.value = items.value.filter((item) => item.name !== secret.name)
    ElMessage.success('密钥已删除')
  } catch (cause) {
    handleMutationError(cause)
  } finally {
    deletingName.value = null
  }
}
</script>

<template>
  <section class="card">
    <header class="card-head">
      <div class="head-title">
        <h3>平台密钥</h3>
        <span v-if="props.isAdmin" class="tag mono">{{ items.length }} 个</span>
      </div>
      <span class="mono hint">/api/v1/admin/secrets</span>
    </header>

    <EmptyState
      v-if="!props.isAdmin"
      title="仅管理员可管理平台密钥"
      description="平台密钥涉及系统凭据，普通用户无权查看或修改。"
    />

    <template v-else>
      <div class="info-bar">
        <p>
          平台密钥用于需要鉴权的集成，可通过 <span class="mono">secret:NAME</span> 被智能体、MCP
          等配置引用。
        </p>
        <p>接口与审计日志永不回显明文或密文；密钥只写入、不可读取，保存后只能轮换。</p>
        <p class="warn-text">删除不会检查引用：仍被引用的密钥删除后，相关配置将无法解析。</p>
      </div>

      <div class="toolbar">
        <button type="button" class="btn primary" @click="openCreate">新建密钥</button>
        <button type="button" class="btn" :disabled="loading" @click="load">刷新</button>
        <span class="muted">名称规则：<span class="mono">^[A-Za-z_][A-Za-z0-9_]{0,63}$</span></span>
      </div>

      <ErrorState v-if="error" :message="error" @retry="load" />
      <LoadingSkeleton v-else-if="loading" />
      <EmptyState
        v-else-if="items.length === 0"
        title="暂无平台密钥"
        description="新建密钥后，就能在需要鉴权的集成中通过 secret:NAME 引用；明文不会保存到前端或再次显示。"
      >
        <template #action>
          <button type="button" class="btn primary empty-action" @click="openCreate">
            新建密钥
          </button>
        </template>
      </EmptyState>

      <div v-else class="table-card">
        <el-table :data="items" style="width: 100%" row-key="name">
          <el-table-column label="名称" min-width="180">
            <template #default="{ row }">
              <div class="name-cell">
                <span class="mono name">{{ row.name }}</span>
                <span class="mono ref">secret:{{ row.name }}</span>
              </div>
            </template>
          </el-table-column>

          <el-table-column label="描述" min-width="200">
            <template #default="{ row }">
              <span class="description">{{ row.description || '—' }}</span>
            </template>
          </el-table-column>

          <el-table-column label="状态" width="92">
            <template #default="{ row }">
              <StatusBadge
                :tone="row.enabled ? 'ok' : 'muted'"
                :label="row.enabled ? '启用' : '停用'"
              />
            </template>
          </el-table-column>

          <el-table-column label="创建时间" width="148">
            <template #default="{ row }">
              <span class="mono time-cell">{{ formatDateTime(row.created_at) }}</span>
            </template>
          </el-table-column>

          <el-table-column label="更新时间" width="148">
            <template #default="{ row }">
              <span class="mono time-cell">{{ formatDateTime(row.updated_at) }}</span>
            </template>
          </el-table-column>

          <el-table-column label="操作" width="184" fixed="right">
            <template #default="{ row }">
              <span class="row-actions">
                <button type="button" class="link" @click="openRotate(row)">轮换</button>
                <button
                  type="button"
                  class="link"
                  :disabled="togglingName === row.name || deletingName === row.name"
                  @click="toggleEnabled(row)"
                >
                  {{ togglingName === row.name ? '处理中…' : row.enabled ? '停用' : '启用' }}
                </button>
                <button
                  type="button"
                  class="link danger"
                  :disabled="deletingName === row.name || togglingName === row.name"
                  @click="removeSecret(row)"
                >
                  {{ deletingName === row.name ? '删除中…' : '删除' }}
                </button>
              </span>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </template>

    <el-dialog
      v-model="createOpen"
      title="新建平台密钥"
      width="520px"
      :append-to-body="true"
      :close-on-click-modal="false"
      @closed="resetCreateForm"
    >
      <form class="form" @submit.prevent="submitCreate">
        <label class="form-row">
          <span class="form-label">名称</span>
          <input
            v-model="createForm.name"
            class="input mono"
            maxlength="64"
            placeholder="例如：OPENAI_API_KEY"
            autocomplete="off"
            spellcheck="false"
          />
          <span class="field-hint">
            以字母或下划线开头，只能包含字母、数字、下划线，最长 64 位。
          </span>
          <span v-if="createErrors.name" class="field-error">{{ createErrors.name }}</span>
        </label>

        <label class="form-row">
          <span class="form-label">描述（可选）</span>
          <textarea
            v-model="createForm.description"
            class="input textarea"
            rows="2"
            maxlength="200"
            placeholder="用途说明，例如：调用 OpenAI API"
          />
          <span class="field-hint">{{ createForm.description.length }} / 200</span>
          <span v-if="createErrors.description" class="field-error">
            {{ createErrors.description }}
          </span>
        </label>

        <label class="form-row">
          <span class="form-label">密钥明文</span>
          <input
            v-model="createForm.value"
            class="input mono"
            type="password"
            autocomplete="new-password"
            maxlength="4096"
            placeholder="粘贴密钥明文，保存后不会再次显示"
            spellcheck="false"
          />
          <span class="field-hint"> 必填，最长 4096 个字符。保存后接口不会回显明文或密文。 </span>
          <span v-if="createErrors.value" class="field-error">{{ createErrors.value }}</span>
        </label>

        <div class="dialog-actions">
          <button type="button" class="btn" :disabled="creating" @click="closeCreate">取消</button>
          <button type="submit" class="btn primary" :disabled="creating">
            {{ creating ? '保存中…' : '保存密钥' }}
          </button>
        </div>
      </form>
    </el-dialog>

    <el-dialog
      v-model="rotateOpen"
      title="轮换平台密钥"
      width="480px"
      :append-to-body="true"
      :close-on-click-modal="false"
      @closed="resetRotateForm"
    >
      <form class="form" @submit.prevent="submitRotate">
        <p class="rotate-note">
          将替换 <span class="mono">secret:{{ rotateTarget?.name ?? '—' }}</span> 的密钥明文；
          旧值立即失效，引用该密钥的配置无需修改。
        </p>

        <label class="form-row">
          <span class="form-label">新密钥明文</span>
          <input
            v-model="rotateForm.value"
            class="input mono"
            type="password"
            autocomplete="new-password"
            maxlength="4096"
            placeholder="粘贴新的密钥明文"
            spellcheck="false"
          />
          <span class="field-hint"> 必填，最长 4096 个字符。提交后接口不会回显明文或密文。 </span>
          <span v-if="rotateForm.error" class="field-error">{{ rotateForm.error }}</span>
        </label>

        <div class="dialog-actions">
          <button type="button" class="btn" :disabled="rotating" @click="closeRotate">取消</button>
          <button type="submit" class="btn primary" :disabled="rotating">
            {{ rotating ? '轮换中…' : '轮换密钥' }}
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

.info-bar {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 9px 12px;
  border: 1px solid var(--line-2);
  border-radius: 7px;
  background: var(--surface-2);
  color: var(--ink-2);
  font-size: 11.5px;
  line-height: 1.65;
}

.warn-text {
  color: var(--amber-text);
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

.table-card {
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
}

.name-cell {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 1px;
}

.name {
  color: var(--ink);
  font-size: 11.5px;
  font-weight: 550;
  word-break: break-all;
}

.ref {
  color: var(--ink-3);
  font-size: 9.5px;
  word-break: break-all;
}

.description {
  color: var(--ink-2);
  font-size: 11px;
  line-height: 1.5;
  word-break: break-word;
}

.time-cell {
  color: var(--ink-3);
  font-size: 10.5px;
  white-space: nowrap;
}

.row-actions {
  display: inline-flex;
  gap: 8px;
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

.empty-action {
  margin-top: 4px;
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

.form-label {
  color: var(--ink-2);
  font-size: 11.5px;
  font-weight: 550;
}

.field-hint {
  color: var(--ink-3);
  font-size: 10px;
  line-height: 1.55;
}

.field-error {
  color: var(--red);
  font-size: 10.5px;
}

.textarea {
  display: block;
  width: 100%;
  height: auto;
  padding: 8px 10px;
  resize: vertical;
  line-height: 1.6;
}

.rotate-note {
  padding: 8px 10px;
  border: 1px solid var(--line-2);
  border-radius: 6px;
  background: var(--surface-2);
  color: var(--ink-2);
  font-size: 11px;
  line-height: 1.65;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 4px;
}
</style>
