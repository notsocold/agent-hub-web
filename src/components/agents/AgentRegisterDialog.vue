<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'

import AppIcon from '@/components/common/AppIcon.vue'
import { agentsApi } from '@/api/agents'
import type { AgentCreateRequest, AgentDetail, AgentPreviewResult } from '@/types'

const props = defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  created: [agent: AgentDetail]
}>()

const open = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
})

const url = ref('')
const slug = ref('')
const authType = ref<'none' | 'api_key'>('none')
const secretRef = ref('')
const preview = ref<AgentPreviewResult | null>(null)
const loading = ref(false)
const creating = ref(false)
const error = ref<string | null>(null)

const canPreview = computed(() => /^https?:\/\//.test(url.value.trim()) && !loading.value)
const authHint = computed(() =>
  authType.value === 'api_key'
    ? '只保存 env: 引用；该环境变量的值会作为 Authorization 头原样发送（可含 Bearer 前缀）'
    : '',
)

watch(open, (value) => {
  if (value) reset()
})

function reset(): void {
  url.value = ''
  slug.value = ''
  authType.value = 'none'
  secretRef.value = ''
  preview.value = null
  loading.value = false
  creating.value = false
  error.value = null
}

function validateAuth(): string | null {
  if (authType.value !== 'api_key') return null
  const ref = secretRef.value.trim()
  if (ref && !/^env:[A-Za-z_][A-Za-z0-9_]*$/.test(ref)) {
    return '凭据引用必须以 env: 开头，例如 env:DATA_AGENT_KEY'
  }
  return null
}

function buildBody(): AgentCreateRequest {
  return {
    url: url.value.trim(),
    slug: slug.value.trim() || undefined,
    name: preview.value?.normalized.name,
    auth:
      authType.value === 'api_key'
        ? { type: 'api_key', secret_ref: secretRef.value.trim() || undefined }
        : { type: 'none' },
  }
}

async function loadPreview(): Promise<void> {
  if (!canPreview.value) return
  const authError = validateAuth()
  if (authError) {
    error.value = authError
    return
  }
  loading.value = true
  error.value = null
  try {
    preview.value = await agentsApi.preview(buildBody())
  } catch (cause) {
    preview.value = null
    error.value = cause instanceof Error ? cause.message : 'Agent Card 拉取失败'
  } finally {
    loading.value = false
  }
}

async function confirmCreate(): Promise<void> {
  if (!preview.value?.valid) return
  const authError = validateAuth()
  if (authError) {
    error.value = authError
    return
  }
  creating.value = true
  error.value = null
  try {
    const body = buildBody()
    const agent = await agentsApi.create(body)
    ElMessage.success(`已注册「${agent.name}」`)
    emit('created', agent)
    open.value = false
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '注册失败'
  } finally {
    creating.value = false
  }
}
</script>

<template>
  <el-dialog v-model="open" title="注册远程智能体" width="640px" append-to-body>
    <div class="register">
      <p class="note">
        先拉取并校验 Agent Card，确认技能与能力后再落库；预览阶段不会写入数据库。
      </p>

      <div class="register-grid">
        <label class="field">
          <span>Agent URL</span>
          <input
            id="agent-url"
            v-model="url"
            class="input mono"
            type="url"
            placeholder="https://agent.example.com/a2a"
            autocomplete="off"
            @keydown.enter.prevent="loadPreview"
          />
        </label>
        <label class="field">
          <span>Slug</span>
          <input
            id="agent-slug"
            v-model="slug"
            class="input mono"
            type="text"
            placeholder="code-assistant"
            autocomplete="off"
          />
        </label>
        <label class="field">
          <span>鉴权方式</span>
          <select id="agent-auth" v-model="authType" class="input select">
            <option value="none">无鉴权</option>
            <option value="api_key">API Key / Bearer</option>
          </select>
        </label>
      </div>

      <label v-if="authType === 'api_key'" class="field">
        <span>鉴权引用</span>
        <input
          id="agent-secret"
          v-model="secretRef"
          class="input mono"
          type="text"
          placeholder="env:DATA_AGENT_KEY"
          autocomplete="off"
        />
        <small class="note">{{ authHint }}</small>
      </label>

      <p v-if="error" class="register-error">{{ error }}</p>

      <div class="register-actions">
        <button type="button" class="btn btn-outline" :disabled="!canPreview" @click="loadPreview">
          <AppIcon name="refresh" />{{ loading ? '拉取中…' : '拉取 Agent Card' }}
        </button>
        <span v-if="preview?.valid" class="register-ok">
          <AppIcon name="check" />Card 校验通过
        </span>
      </div>

      <section v-if="preview" class="preview">
        <header class="preview-head">
          <div>
            <h4>{{ preview.normalized.name }}</h4>
            <p class="note">{{ preview.normalized.description || '无描述' }}</p>
          </div>
          <span class="tag mono">A2A {{ preview.normalized.protocol_version }}</span>
        </header>

        <dl class="kv">
          <dt>URL</dt>
          <dd class="mono ellipsis">{{ preview.normalized.url }}</dd>
          <dt>能力</dt>
          <dd>
            流式 {{ preview.normalized.capabilities.streaming ? '支持' : '不支持' }} · 推送
            {{ preview.normalized.capabilities.push_notifications ? '支持' : '不支持' }}
          </dd>
        </dl>

        <div class="skills">
          <p class="preview-label">技能（{{ preview.normalized.skills.length }}）</p>
          <div v-if="preview.normalized.skills.length > 0" class="skill-list">
            <div v-for="skill in preview.normalized.skills" :key="skill.id" class="skill-row">
              <span class="skill-name">{{ skill.name }}</span>
              <span class="skill-chip">{{ skill.id }}</span>
              <span v-if="skill.description" class="skill-desc">{{ skill.description }}</span>
            </div>
          </div>
          <p v-else class="note">Agent Card 未声明技能。</p>
        </div>

        <p v-for="warning in preview.warnings" :key="warning" class="warning">⚠ {{ warning }}</p>

        <details class="agent-extra">
          <summary>
            查看原始 Agent Card<AppIcon name="chevron" class="agent-extra-chev" />
          </summary>
          <div class="agent-extra-body">
            <pre class="raw-card">{{ JSON.stringify(preview.card, null, 2) }}</pre>
          </div>
        </details>
      </section>
    </div>

    <template #footer>
      <div class="dialog-footer">
        <button type="button" class="btn btn-outline" @click="open = false">取消</button>
        <button
          type="button"
          class="btn btn-primary"
          :disabled="!preview?.valid || creating"
          @click="confirmCreate"
        >
          {{ creating ? '注册中…' : '确认注册' }}
        </button>
      </div>
    </template>
  </el-dialog>
</template>

<style scoped>
.register {
  display: flex;
  flex-direction: column;
  gap: 12px;
  color: var(--ink-2);
  font-size: 12px;
}

.register-actions {
  margin-top: 0;
}

.register-ok {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--green);
  font-size: 11px;
}

.register-ok .ic {
  width: 12px;
  height: 12px;
}

.register-error {
  padding: 7px 9px;
  border-radius: 4px;
  background: var(--red-soft);
  color: var(--red);
  font-size: 11px;
  line-height: 1.6;
}

.preview {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface-2);
}

.preview-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.preview-head h4 {
  margin-bottom: 3px;
  color: var(--ink);
  font-size: 12.5px;
  font-weight: 650;
}

.preview .kv {
  margin-top: 0;
}

.preview-label {
  margin-bottom: 6px;
  color: var(--ink-3);
  font-size: 10px;
}

.skill-list {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.skill-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 8px;
}

.skill-name {
  color: var(--ink);
  font-size: 11.5px;
  font-weight: 550;
}

.skill-desc {
  flex-basis: 100%;
  color: var(--ink-3);
  font-size: 10px;
  line-height: 1.55;
}

.warning {
  color: var(--amber-text);
  font-size: 10.5px;
  line-height: 1.6;
}

.raw-card {
  max-height: 200px;
  margin: 6px 0 0;
  padding: 8px;
  overflow: auto;
  border: 1px solid var(--line-2);
  border-radius: 5px;
  background: var(--surface);
  font-family: var(--font-mono);
  font-size: 10px;
  line-height: 1.55;
  white-space: pre-wrap;
}

.ellipsis {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
