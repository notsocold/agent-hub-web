<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'

import ErrorState from '@/components/common/ErrorState.vue'
import LoadingSkeleton from '@/components/common/LoadingSkeleton.vue'
import { instructionsApi } from '@/api/instructions'
import { useSystemStore } from '@/stores/system'
import type { InstructionState } from '@/types'
import CapabilityGate from './CapabilityGate.vue'

const system = useSystemStore()
const enabled = computed(() => system.enabled('instructions'))

const state = ref<InstructionState | null>(null)
const draft = ref('')
const loading = ref(false)
const loaded = ref(false)
const error = ref<string | null>(null)
const saving = ref(false)
const resetting = ref(false)

const sourceLabel = computed(() => (state.value?.source === 'user' ? '用户覆盖' : '平台默认'))
const charCount = computed(() => draft.value.length)
const maxChars = computed(() => state.value?.max_chars ?? 0)
const hasOverride = computed(() => state.value?.source === 'user')
const dirty = computed(() => draft.value !== (state.value?.effective ?? ''))

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
    const result = await instructionsApi.get()
    state.value = result
    draft.value = result.effective
    loaded.value = true
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '加载指令失败'
  } finally {
    loading.value = false
  }
}

async function save(): Promise<void> {
  if (saving.value) return
  saving.value = true
  try {
    const result = await instructionsApi.save(draft.value)
    state.value = result
    draft.value = result.effective
    ElMessage.success('指令已保存，下一轮生效')
  } catch (cause) {
    ElMessage.error(cause instanceof Error ? cause.message : '保存失败')
  } finally {
    saving.value = false
  }
}

async function resetDefault(): Promise<void> {
  if (resetting.value) return
  try {
    await ElMessageBox.confirm(
      '将清除你的自定义指令并恢复平台默认。此操作立即生效，不写入历史会话。',
      '恢复默认指令？',
      { type: 'warning', confirmButtonText: '恢复默认', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  resetting.value = true
  try {
    const result = await instructionsApi.save(null)
    state.value = result
    draft.value = result.effective
    ElMessage.success('已恢复平台默认指令')
  } catch (cause) {
    ElMessage.error(cause instanceof Error ? cause.message : '恢复默认失败')
  } finally {
    resetting.value = false
  }
}
</script>

<template>
  <section class="panel cap-card">
    <div class="cap-inner">
      <header class="cap-head">
        <div class="cap-title">
          <h3>指令</h3>
          <span v-if="state" class="tag">{{ sourceLabel }}</span>
        </div>
        <span class="cap-hint">GET / PUT /api/v1/instructions</span>
      </header>

      <CapabilityGate
        :enabled="enabled"
        name="指令"
        hint="后端尚未开启指令能力，无法查看或编辑生效指令。"
      >
        <ErrorState v-if="error" :message="error" @retry="load" />
        <LoadingSkeleton v-else-if="loading" variant="text" />

        <template v-else-if="state">
          <p class="cap-desc">
            覆盖平台默认指令，只影响你自己的对话；不得覆盖安全规则、工具权限与审批要求。保存后下一轮生效，不写入历史会话。
          </p>
          <label class="cap-field">
            <span class="sr-only">指令内容</span>
            <textarea
              v-model="draft"
              class="input cap-textarea"
              rows="4"
              :maxlength="maxChars"
              placeholder="例如：回答先给结论，再给依据；不确定时明确说明。"
            />
            <span class="cap-count mono"
              ><b>{{ charCount }}</b> / {{ maxChars }}</span
            >
          </label>
          <div class="cap-actions">
            <button
              type="button"
              class="btn btn-primary btn-sm"
              :disabled="saving || !dirty"
              @click="save"
            >
              {{ saving ? '保存中…' : '保存指令' }}
            </button>
            <button
              type="button"
              class="btn btn-ghost btn-sm"
              :disabled="resetting || !hasOverride"
              @click="resetDefault"
            >
              {{ resetting ? '恢复中…' : '恢复默认' }}
            </button>
            <span class="spacer"></span>
            <span class="cap-note">平台默认由管理员在「系统设置」维护。</span>
          </div>
        </template>
      </CapabilityGate>
    </div>
  </section>
</template>

<style scoped>
.cap-inner {
  padding: 14px;
}
</style>
