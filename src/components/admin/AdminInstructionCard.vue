<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'

import ErrorState from '@/components/common/ErrorState.vue'
import LoadingSkeleton from '@/components/common/LoadingSkeleton.vue'
import { adminApi } from '@/api/admin'
import { ApiRequestError } from '@/api/client'
import { formatDateTime } from '@/utils/format'
import type { AdminInstruction } from '@/types'

/**
 * M8-F8 平台默认指令卡：无个人覆盖用户实际注入的文本。
 *
 * - `content` 为 `null` 或纯空白等价于恢复内置默认（响应 `is_default=true`）；
 * - 超过 `max_chars` → 422 `instruction_too_long`；
 * - 属配置面：INSTRUCTIONS_ENABLED=false 时仍可读写（R1）。
 */

const instruction = ref<AdminInstruction | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)
const saving = ref(false)
const draft = ref('')

const remaining = computed(() => {
  if (!instruction.value) return null
  return instruction.value.max_chars - draft.value.length
})

const overLimit = computed(() => remaining.value !== null && remaining.value < 0)

const dirty = computed(() => {
  if (!instruction.value) return false
  return draft.value !== instruction.value.content
})

const canSave = computed(() => {
  if (!instruction.value) return false
  return dirty.value && draft.value.trim().length > 0 && !overLimit.value && !saving.value
})

async function load(): Promise<void> {
  if (loading.value) return
  loading.value = true
  error.value = null
  try {
    instruction.value = await adminApi.instruction()
    draft.value = instruction.value.content
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '加载平台指令失败'
  } finally {
    loading.value = false
  }
}

async function save(): Promise<void> {
  if (!instruction.value || !canSave.value) return
  try {
    await ElMessageBox.confirm('保存后所有未设置个人指令的用户将立即使用新指令。', '保存平台指令', {
      confirmButtonText: '确认保存',
      cancelButtonText: '取消',
      type: 'warning',
    })
  } catch {
    return
  }
  await submit(draft.value.trim())
}

async function restoreDefault(): Promise<void> {
  if (!instruction.value || saving.value) return
  if (instruction.value.is_default && draft.value.trim() === instruction.value.content) {
    ElMessage.info('当前已是内置默认指令')
    return
  }
  try {
    await ElMessageBox.confirm(
      '恢复后平台将使用代码内置默认指令，该操作会写入审计日志。',
      '恢复内置默认',
      { confirmButtonText: '确认恢复', cancelButtonText: '取消', type: 'warning' },
    )
  } catch {
    return
  }
  await submit(null)
}

async function submit(content: string | null): Promise<void> {
  saving.value = true
  try {
    instruction.value = await adminApi.saveInstruction(content)
    draft.value = instruction.value.content
    ElMessage.success(instruction.value.is_default ? '已恢复内置默认指令' : '平台指令已保存')
  } catch (cause) {
    if (cause instanceof ApiRequestError && cause.code === 'instruction_too_long') {
      const limit = instruction.value?.max_chars ?? 4000
      ElMessage.error(`指令超过 ${limit} 字符上限`)
    } else {
      ElMessage.error(cause instanceof Error ? cause.message : '保存失败')
    }
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  void load()
})
</script>

<template>
  <section class="panel" aria-labelledby="admin-instruction-title">
    <div class="panel-head">
      <div>
        <h2 id="admin-instruction-title">平台默认指令</h2>
        <p class="panel-sub">
          未设置个人指令的用户实际注入的文本。属配置面：能力总开关关闭时仍可读写。
        </p>
      </div>
      <span v-if="instruction" class="tag" :class="{ default: instruction.is_default }">
        {{ instruction.is_default ? '内置默认' : '已自定义' }}
      </span>
      <button type="button" class="btn btn-sm" :disabled="loading" @click="load">刷新</button>
    </div>

    <LoadingSkeleton v-if="loading && !instruction" :rows="3" />
    <ErrorState v-else-if="error" :message="error" :retryable="true" @retry="load" />

    <template v-else-if="instruction">
      <label class="editor-label" for="admin-instruction-content">指令正文</label>
      <textarea
        id="admin-instruction-content"
        v-model="draft"
        class="editor"
        rows="7"
        aria-describedby="admin-instruction-meta"
      ></textarea>
      <div class="editor-meta" id="admin-instruction-meta">
        <span class="mono" :class="{ over: overLimit }">
          {{ draft.length }} / {{ instruction.max_chars }}
          <template v-if="remaining !== null">（剩余 {{ remaining }}）</template>
        </span>
        <span class="hint">清空请用「恢复内置默认」；空白内容不会单独保存。</span>
      </div>

      <div class="actions">
        <button
          type="button"
          class="btn primary"
          :disabled="!canSave"
          :title="overLimit ? '已超过字符上限' : dirty ? '' : '内容未变更'"
          @click="save"
        >
          {{ saving ? '保存中…' : '保存' }}
        </button>
        <button type="button" class="btn" :disabled="saving" @click="restoreDefault">
          恢复内置默认
        </button>
        <span class="spacer"></span>
        <span class="override mono">{{ instruction.user_override_count }} 位用户写了个人指令</span>
      </div>

      <p v-if="!instruction.is_default" class="updated mono">
        {{ instruction.updated_by_email ?? '—' }} 更新于
        {{ formatDateTime(instruction.updated_at) }}
      </p>
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

.panel-head > div {
  flex: 1;
  min-width: 0;
}

.tag {
  flex: none;
  padding: 2px 8px;
  border: 1px solid var(--line);
  border-radius: 999px;
  color: var(--ink-2);
  font-size: 10px;
  white-space: nowrap;
}

.tag.default {
  border-color: color-mix(in srgb, var(--green) 40%, transparent);
  color: var(--green);
}

.editor-label {
  display: block;
  margin: 12px 0 6px;
  color: var(--ink-3);
  font-size: 11px;
}

.editor {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--bg, var(--surface));
  color: var(--ink);
  font-family: inherit;
  font-size: 12.5px;
  line-height: 1.7;
  resize: vertical;
}

.editor:focus {
  outline: none;
  border-color: var(--amber-text);
}

.editor-meta {
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin-top: 6px;
  font-size: 10.5px;
  color: var(--ink-3);
}

.editor-meta .over {
  color: var(--red);
}

.actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
}

.actions .spacer {
  flex: 1;
}

.override {
  color: var(--ink-3);
  font-size: 10.5px;
}

.updated {
  margin: 8px 0 0;
  color: var(--ink-3);
  font-size: 10.5px;
}

.btn-sm {
  flex: none;
  height: 28px;
  padding: 0 10px;
  font-size: 11px;
}
</style>
