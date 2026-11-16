<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue'

import AppIcon from '@/components/common/AppIcon.vue'
import { agentsApi } from '@/api/agents'
import { ApiRequestError } from '@/api/client'
import type { AgentAuthInput, AgentAuthType, AgentDetail, AgentUpdateRequest } from '@/types'

/**
 * A1 智能体编辑：名称、鉴权类型、凭据引用。
 *
 * - headers 不在编辑范围：响应不回显明文，编辑会覆盖现有值（接受清单 A2）；
 * - 后端 `AgentUpdateRequest.auth.type` 取值为 none/api_key/oauth2，
 *   `secret_ref` 只接受 `env:环境变量名` / `secret:平台密钥名` 引用；
 * - 凭据引用留空且鉴权类型未变时不发送 auth，表示「不修改」。
 */
const props = defineProps<{
  modelValue: boolean
  agent: AgentDetail | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  saved: [agent: AgentDetail]
}>()

const open = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
})

/** 与后端 `app/modules/agents/schemas.py` 的 AgentAuthType 枚举一致。 */
const AUTH_OPTIONS: Array<{ value: AgentAuthType; label: string }> = [
  { value: 'none', label: '无鉴权' },
  { value: 'api_key', label: 'API Key / Bearer' },
  { value: 'oauth2', label: 'OAuth2' },
]

/** backend: env 变量名 `[A-Za-z_][A-Za-z0-9_]*`，平台密钥名 `[A-Za-z_][A-Za-z0-9_]{0,63}`。 */
const SECRET_REF_PATTERN = /^(?:env:[A-Za-z_][A-Za-z0-9_]*|secret:[A-Za-z_][A-Za-z0-9_]{0,63})$/

const form = reactive({
  name: '',
  authType: 'none' as AgentAuthType,
  secretRef: '',
})

const error = ref<string | null>(null)
const saving = ref(false)
const nameInput = ref<HTMLInputElement | null>(null)

/** 只有 api_key 会消费凭据引用；oauth2 由远程 Agent 自行完成授权流程。 */
const needsSecretRef = computed(() => form.authType === 'api_key')

watch(
  open,
  async (value) => {
    if (!value) return
    const agent = props.agent
    form.name = agent?.name ?? ''
    form.authType = agent?.auth_type ?? 'none'
    form.secretRef = ''
    error.value = null
    saving.value = false
    await nextTick()
    nameInput.value?.focus()
  },
  { immediate: true },
)

function validationMessage(): string | null {
  const name = form.name.trim()
  if (!name) return '名称不能为空'
  if (name.length > 128) return `名称长度 ${name.length} 超过上限 128`
  const secretRef = form.secretRef.trim()
  if (needsSecretRef.value && secretRef && !SECRET_REF_PATTERN.test(secretRef)) {
    return '凭据引用格式无效：应为 env:环境变量名 或 secret:平台密钥名，例如 env:DATA_AGENT_KEY'
  }
  // 切换到 api_key 时必须给出凭据引用，否则会清空现有引用并让调用无鉴权。
  if (needsSecretRef.value && !secretRef && form.authType !== props.agent?.auth_type) {
    return 'API Key 鉴权需要填写凭据引用（env:NAME 或 secret:NAME）'
  }
  return null
}

function buildPayload(agent: AgentDetail): AgentUpdateRequest {
  const payload: AgentUpdateRequest = {}
  const name = form.name.trim()
  if (name !== agent.name) payload.name = name

  const secretRef = form.secretRef.trim()
  const authChanged = form.authType !== agent.auth_type
  if (authChanged || (secretRef && needsSecretRef.value)) {
    const auth: AgentAuthInput = { type: form.authType }
    if (needsSecretRef.value && secretRef) auth.secret_ref = secretRef
    payload.auth = auth
  }
  return payload
}

function describeError(cause: unknown): string {
  if (cause instanceof ApiRequestError) {
    if (cause.status === 403) return '无权限：仅管理员可编辑智能体（403）'
    if (cause.status === 422 || cause.code === 'validation_error') {
      return `参数校验失败：${cause.message}`
    }
    if (cause.status === 409 || cause.code === 'conflict') {
      return '保存冲突：智能体可能已被其他操作修改，请刷新后重试（409）'
    }
    if (cause.status === 404 || cause.code === 'not_found') {
      return '该智能体已被删除或不存在（404），请关闭详情后刷新列表'
    }
    return cause.message
  }
  return cause instanceof Error ? cause.message : '保存失败，请稍后重试'
}

async function submit(): Promise<void> {
  const agent = props.agent
  if (!agent || saving.value) return
  const invalid = validationMessage()
  if (invalid) {
    error.value = invalid
    return
  }
  const payload = buildPayload(agent)
  if (Object.keys(payload).length === 0) {
    error.value = '没有需要保存的变更'
    return
  }
  saving.value = true
  error.value = null
  try {
    const updated = await agentsApi.update(agent.id, payload)
    emit('saved', updated)
    open.value = false
  } catch (cause) {
    error.value = describeError(cause)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <el-dialog
    v-model="open"
    title="编辑智能体"
    width="520px"
    append-to-body
    :close-on-click-modal="false"
  >
    <div class="agent-edit">
      <p class="note">修改名称或鉴权后立即生效；凭据只保存 env: / secret: 引用，不会回显明文。</p>

      <label class="field">
        <span>名称（必填，1–128 字符）</span>
        <input
          ref="nameInput"
          v-model="form.name"
          class="input"
          type="text"
          maxlength="128"
          autocomplete="off"
          data-testid="agent-edit-name"
          @keydown.enter.prevent="submit"
        />
      </label>

      <label class="field">
        <span>鉴权类型</span>
        <select
          v-model="form.authType"
          class="input select"
          data-testid="agent-edit-auth-type"
          aria-label="鉴权类型"
        >
          <option v-for="option in AUTH_OPTIONS" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
      </label>

      <label v-if="needsSecretRef" class="field">
        <span>凭据引用（选填，留空表示不修改）</span>
        <input
          v-model="form.secretRef"
          class="input mono"
          type="text"
          autocomplete="off"
          placeholder="env:DATA_AGENT_KEY 或 secret:AGENT_KEY"
          data-testid="agent-edit-secret"
        />
        <small class="note">
          仅支持 env:环境变量名（所有管理员）或 secret:平台密钥名；secret: 需先在平台密钥创建。
        </small>
      </label>
      <p v-else-if="form.authType === 'oauth2'" class="note">
        OAuth2 由远程 Agent 自行完成授权流程，无需在此填写凭据引用。
      </p>

      <p class="note headers-note" data-testid="agent-edit-headers-note">
        Headers 含敏感值，当前不支持编辑（见接受清单 A2）。
      </p>

      <p v-if="error" class="edit-error" role="alert" data-testid="agent-edit-error">
        {{ error }}
      </p>
    </div>

    <template #footer>
      <div class="dialog-footer">
        <button type="button" class="btn btn-outline" @click="open = false">取消</button>
        <button
          type="button"
          class="btn btn-primary"
          data-testid="agent-edit-save"
          :disabled="saving"
          @click="submit"
        >
          <AppIcon name="check" />{{ saving ? '保存中…' : '保存' }}
        </button>
      </div>
    </template>
  </el-dialog>
</template>

<style scoped>
.agent-edit {
  display: flex;
  flex-direction: column;
  gap: 12px;
  color: var(--ink-2);
  font-size: 12px;
}

.agent-edit .note {
  line-height: 1.6;
}

.headers-note {
  padding-top: 10px;
  border-top: 1px solid var(--line-2);
  color: var(--ink-3);
  font-size: 10.5px;
}

.edit-error {
  margin: 0;
  padding: 7px 9px;
  border-radius: 4px;
  background: var(--red-soft);
  color: var(--red);
  font-size: 11px;
  line-height: 1.6;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.dialog-footer .btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
</style>
