<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'

import { knowledgeApi } from '@/api/knowledge'
import { ApiRequestError } from '@/api/client'
import { formatBytes } from '@/utils/format'
import {
  KNOWLEDGE_MAX_UPLOAD_BYTES,
  titleFromFilename,
} from '@/utils/knowledge'
import type { KnowledgeDocument } from '@/types'

const props = withDefaults(
  defineProps<{
    modelValue: boolean
    categories?: string[]
    isAdmin?: boolean
  }>(),
  {
    categories: () => [],
    isAdmin: false,
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  uploaded: [document: KnowledgeDocument, created: boolean]
}>()

const ALLOWED_EXTENSIONS = ['md', 'markdown', 'txt', 'pdf', 'csv', 'json']

const mode = ref<'file' | 'text'>('file')
const file = ref<File | null>(null)
const pasteText = ref('')
const title = ref('')
const category = ref('')
const scope = ref<'user' | 'system'>('user')
const uploading = ref(false)
const progress = ref(0)
const error = ref<string | null>(null)
const dragging = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)

/** 粘贴文本按 Markdown 文件上传；后端只接受 multipart 文件。 */
const effectiveFile = computed<File | null>(() => {
  if (mode.value === 'file') return file.value
  const text = pasteText.value.trim()
  if (!text) return null
  const safeTitle = (title.value.trim() || '粘贴文本').replace(/[\\/:*?"<>|]/g, '-')
  return new File([text], `${safeTitle}.md`, { type: 'text/markdown' })
})

const canSubmit = computed(() => Boolean(effectiveFile.value) && !uploading.value)

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      error.value = null
      progress.value = 0
    }
  },
)

function extensionOf(name: string): string {
  return name.includes('.') ? name.split('.').pop()!.toLowerCase() : ''
}

function acceptFile(next: File | null): void {
  error.value = null
  if (!next) {
    file.value = null
    return
  }
  if (!ALLOWED_EXTENSIONS.includes(extensionOf(next.name))) {
    error.value = '仅支持 Markdown、TXT、PDF、CSV 与 JSON'
    file.value = null
    return
  }
  if (next.size > KNOWLEDGE_MAX_UPLOAD_BYTES) {
    error.value = `文件超过 ${formatBytes(KNOWLEDGE_MAX_UPLOAD_BYTES)} 上限`
    file.value = null
    return
  }
  file.value = next
  if (!title.value.trim()) title.value = titleFromFilename(next.name)
}

function onFilePicked(event: Event): void {
  const input = event.target as HTMLInputElement
  acceptFile(input.files?.[0] ?? null)
  input.value = ''
}

function onDrop(event: DragEvent): void {
  dragging.value = false
  acceptFile(event.dataTransfer?.files?.[0] ?? null)
}

function switchMode(next: 'file' | 'text'): void {
  mode.value = next
  error.value = null
}

function errorMessage(cause: unknown): string {
  if (cause instanceof ApiRequestError) {
    if (cause.status === 413) return `文件超过 ${formatBytes(KNOWLEDGE_MAX_UPLOAD_BYTES)} 上限`
    if (cause.status === 403) return '没有权限执行该上传（系统文档仅管理员可上传）'
    return cause.message
  }
  return cause instanceof Error ? cause.message : '上传失败，请稍后重试'
}

async function submit(): Promise<void> {
  const target = effectiveFile.value
  if (!target || uploading.value) return
  if (target.size > KNOWLEDGE_MAX_UPLOAD_BYTES) {
    error.value = `文件超过 ${formatBytes(KNOWLEDGE_MAX_UPLOAD_BYTES)} 上限`
    return
  }

  uploading.value = true
  progress.value = 0
  error.value = null
  try {
    const result = await knowledgeApi.upload({
      file: target,
      title: title.value.trim() || undefined,
      category: category.value.trim() || undefined,
      scope: props.isAdmin ? scope.value : 'user',
      onProgress: (percent) => {
        progress.value = percent
      },
    })
    ElMessage.success(result.created ? '文档已上传，入库完成' : '同内容文档已存在，已返回已有文档')
    emit('uploaded', result.document, result.created)
    close()
  } catch (cause) {
    error.value = errorMessage(cause)
  } finally {
    uploading.value = false
  }
}

function close(): void {
  if (uploading.value) return
  emit('update:modelValue', false)
}

function reset(): void {
  mode.value = 'file'
  file.value = null
  pasteText.value = ''
  title.value = ''
  category.value = ''
  scope.value = 'user'
  progress.value = 0
  error.value = null
  dragging.value = false
}
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    title="上传知识库文档"
    width="540px"
    append-to-body
    :close-on-click-modal="!uploading"
    :show-close="!uploading"
    @update:model-value="close"
    @closed="reset"
  >
    <div class="upload">
      <div class="mode-row" role="tablist" aria-label="上传方式">
        <button
          type="button"
          role="tab"
          class="mode"
          :class="{ 'is-active': mode === 'file' }"
          :aria-selected="mode === 'file'"
          @click="switchMode('file')"
        >
          选择文件
        </button>
        <button
          type="button"
          role="tab"
          class="mode"
          :class="{ 'is-active': mode === 'text' }"
          :aria-selected="mode === 'text'"
          @click="switchMode('text')"
        >
          粘贴文本
        </button>
      </div>

      <template v-if="mode === 'file'">
        <div
          class="drop-zone"
          :class="{ 'is-dragging': dragging, 'has-file': file }"
          role="button"
          tabindex="0"
          @click="fileInput?.click()"
          @keydown.enter.prevent="fileInput?.click()"
          @dragenter.prevent="dragging = true"
          @dragover.prevent="dragging = true"
          @dragleave.prevent="dragging = false"
          @drop.prevent="onDrop"
        >
          <template v-if="file">
            <p class="drop-title">{{ file.name }}</p>
            <p class="drop-hint mono">{{ formatBytes(file.size) }} · 点击重新选择</p>
          </template>
          <template v-else>
            <p class="drop-title">拖拽文件到这里，或点击选择</p>
            <p class="drop-hint">支持 Markdown / TXT / PDF / CSV / JSON，上限 10 MB</p>
          </template>
        </div>
        <input
          ref="fileInput"
          class="file-input"
          type="file"
          accept=".md,.markdown,.txt,.pdf,.csv,.json"
          @change="onFilePicked"
        />
      </template>

      <template v-else>
        <textarea
          v-model="pasteText"
          class="paste"
          rows="8"
          placeholder="粘贴 Markdown 或纯文本内容，将作为 .md 文档入库"
          aria-label="粘贴知识库文本"
        />
        <p class="drop-hint">粘贴文本会转为 Markdown 文件上传；标题留空时使用「粘贴文本」。</p>
      </template>

      <div class="fields">
        <label class="field">
          <span>标题</span>
          <input v-model="title" class="input" maxlength="200" placeholder="留空则用文件名" />
        </label>
        <label class="field">
          <span>分类</span>
          <input
            v-model="category"
            class="input"
            maxlength="64"
            list="knowledge-category-options"
            placeholder="如：售后（可留空）"
          />
          <datalist id="knowledge-category-options">
            <option v-for="item in categories" :key="item" :value="item" />
          </datalist>
        </label>
        <label v-if="isAdmin" class="field">
          <span>归属</span>
          <select v-model="scope" class="input">
            <option value="user">我的文档</option>
            <option value="system">系统文档（所有人可见）</option>
          </select>
        </label>
      </div>

      <div v-if="uploading" class="progress" role="progressbar" :aria-valuenow="progress">
        <span :style="{ width: `${progress}%` }" />
      </div>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
    </div>

    <template #footer>
      <button type="button" class="btn" :disabled="uploading" @click="close">取消</button>
      <button type="button" class="btn primary" :disabled="!canSubmit" @click="submit">
        {{ uploading ? `上传中 ${progress}%` : '上传并入库' }}
      </button>
    </template>
  </el-dialog>
</template>

<style scoped>
.upload {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.mode-row {
  display: flex;
  gap: 6px;
}

.mode {
  height: 28px;
  padding: 0 12px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--surface);
  color: var(--ink-3);
  font-size: 11.5px;
}

.mode.is-active {
  border-color: var(--prussian);
  background: var(--prussian-soft);
  color: var(--prussian);
  font-weight: 600;
}

.drop-zone {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-height: 120px;
  padding: 18px;
  border: 1px dashed var(--line);
  border-radius: 8px;
  background: var(--surface-2);
  cursor: pointer;
  text-align: center;
}

.drop-zone.is-dragging,
.drop-zone:hover {
  border-color: var(--prussian);
  background: var(--prussian-soft);
}

.drop-zone.has-file {
  border-style: solid;
}

.drop-title {
  color: var(--ink);
  font-size: 12.5px;
  font-weight: 600;
}

.drop-hint {
  margin: 0;
  color: var(--ink-3);
  font-size: 11px;
  line-height: 1.6;
}

.file-input {
  display: none;
}

.paste {
  width: 100%;
  padding: 10px;
  border: 1px solid var(--line);
  border-radius: 8px;
  outline: none;
  background: var(--surface);
  color: var(--ink);
  font: inherit;
  font-size: 12px;
  line-height: 1.7;
  resize: vertical;
}

.paste:focus {
  border-color: var(--ink-3);
}

.fields {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
}

.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  color: var(--ink-3);
  font-size: 11px;
}

.progress {
  overflow: hidden;
  height: 4px;
  border-radius: 99px;
  background: var(--line-2);
}

.progress span {
  display: block;
  height: 100%;
  background: var(--prussian);
  transition: width 0.15s;
}

.error {
  margin: 0;
  color: var(--red);
  font-size: 11.5px;
}
</style>
