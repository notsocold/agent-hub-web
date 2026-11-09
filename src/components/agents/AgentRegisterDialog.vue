<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'

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
      <p class="lead">
        先拉取并校验 Agent Card，确认技能与能力后再落库；预览阶段不会写入数据库。
      </p>

      <div class="field">
        <label for="agent-url">Agent URL</label>
        <input
          id="agent-url"
          v-model="url"
          class="input"
          type="url"
          placeholder="https://data.example.com/a2a"
          autocomplete="off"
          @keydown.enter.prevent="loadPreview"
        />
      </div>

      <div class="row">
        <div class="field">
          <label for="agent-slug">标识 slug（可选）</label>
          <input
            id="agent-slug"
            v-model="slug"
            class="input mono"
            type="text"
            placeholder="data-analyst"
            autocomplete="off"
          />
        </div>
        <div class="field">
          <label for="agent-auth">鉴权方式</label>
          <select id="agent-auth" v-model="authType" class="input">
            <option value="none">无鉴权</option>
            <option value="api_key">API Key / Bearer</option>
          </select>
        </div>
      </div>

      <div v-if="authType === 'api_key'" class="field">
        <label for="agent-secret">凭据引用</label>
        <input
          id="agent-secret"
          v-model="secretRef"
          class="input mono"
          type="text"
          placeholder="env:DATA_AGENT_KEY"
          autocomplete="off"
        />
        <small class="hint">{{ authHint }}</small>
      </div>

      <p v-if="error" class="error">{{ error }}</p>

      <div class="actions">
        <button type="button" class="btn" :disabled="!canPreview" @click="loadPreview">
          {{ loading ? '拉取中…' : '拉取 Agent Card' }}
        </button>
        <span v-if="preview?.valid" class="ok">Card 校验通过</span>
      </div>

      <section v-if="preview" class="preview">
        <header class="preview-head">
          <div>
            <h3>{{ preview.normalized.name }}</h3>
            <p class="muted">{{ preview.normalized.description || '无描述' }}</p>
          </div>
          <span class="tag mono">{{ preview.normalized.protocol_version }}</span>
        </header>

        <dl class="kv">
          <div>
            <dt>URL</dt>
            <dd class="mono ellipsis">{{ preview.normalized.url }}</dd>
          </div>
          <div>
            <dt>能力</dt>
            <dd>
              流式 {{ preview.normalized.capabilities.streaming ? '支持' : '不支持' }} ·
              推送 {{ preview.normalized.capabilities.push_notifications ? '支持' : '不支持' }}
            </dd>
          </div>
        </dl>

        <div class="skills">
          <p class="label">技能（{{ preview.normalized.skills.length }}）</p>
          <ul>
            <li v-for="skill in preview.normalized.skills" :key="skill.id">
              <span class="skill-name">{{ skill.name }}</span>
              <span class="mono muted">{{ skill.id }}</span>
              <span v-if="skill.description" class="skill-desc">{{ skill.description }}</span>
            </li>
          </ul>
        </div>

        <p v-for="warning in preview.warnings" :key="warning" class="warning">⚠ {{ warning }}</p>

        <details class="raw">
          <summary>查看原始 Agent Card</summary>
          <pre>{{ JSON.stringify(preview.card, null, 2) }}</pre>
        </details>
      </section>
    </div>

    <template #footer>
      <button type="button" class="btn" @click="open = false">取消</button>
      <button
        type="button"
        class="btn primary"
        :disabled="!preview?.valid || creating"
        @click="confirmCreate"
      >
        {{ creating ? '注册中…' : '确认注册' }}
      </button>
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

.lead {
  color: var(--ink-3);
  line-height: 1.7;
}

.field {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
}

.field label {
  color: var(--ink-3);
  font-size: 10.5px;
}

.row {
  display: flex;
  gap: 12px;
}

.hint {
  color: var(--ink-3);
  font-size: 10px;
}

.actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.ok {
  color: var(--green);
  font-size: 11px;
}

.error {
  padding: 8px 10px;
  border: 1px solid var(--red-soft);
  border-radius: 6px;
  background: var(--red-soft);
  color: var(--red);
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

.preview-head h3 {
  color: var(--ink);
  font-size: 13px;
  font-weight: 650;
}

.muted {
  color: var(--ink-3);
}

.tag {
  padding: 1px 7px;
  border: 1px solid var(--line-2);
  border-radius: 99px;
  color: var(--ink-3);
  font-size: 9.5px;
}

.kv {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px 14px;
}

.kv dt {
  color: var(--ink-3);
  font-size: 10px;
}

.kv dd {
  margin: 2px 0 0;
  color: var(--ink);
  font-size: 11.5px;
}

.skills .label {
  margin-bottom: 5px;
  color: var(--ink-3);
  font-size: 10px;
}

.skills ul {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.skills li {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 1px 10px;
  padding: 6px 8px;
  border: 1px solid var(--line-2);
  border-radius: 6px;
  background: var(--surface);
}

.skill-name {
  color: var(--ink);
  font-size: 11.5px;
  font-weight: 550;
}

.skill-desc {
  grid-column: 1 / -1;
  color: var(--ink-3);
  font-size: 10px;
}

.warning {
  color: var(--amber-text);
  font-size: 10.5px;
}

.raw summary {
  color: var(--ink-3);
  font-size: 10.5px;
  cursor: pointer;
}

.raw pre {
  max-height: 200px;
  margin: 6px 0 0;
  padding: 8px;
  overflow: auto;
  border: 1px solid var(--line-2);
  border-radius: 6px;
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

@media (max-width: 640px) {
  .row {
    flex-direction: column;
  }
}
</style>
