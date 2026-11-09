<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'

import type {
  ChatContextSelection,
  ModelInfo,
  ReasoningEffortId,
  ReasoningEffortOption,
} from '@/types'

const props = withDefaults(
  defineProps<{
    streaming: boolean
    disabled?: boolean
    model: string
    reasoningEffort: ReasoningEffortId
    models: ModelInfo[]
    reasoningEfforts: ReasoningEffortOption[]
    maxChars?: number
  }>(),
  { disabled: false, maxChars: 8000 },
)

const emit = defineEmits<{
  send: [payload: { text: string; context: ChatContextSelection }]
  stop: []
  'update:model': [value: string]
  'update:reasoningEffort': [value: ReasoningEffortId]
}>()

const text = ref('')
const textarea = ref<HTMLTextAreaElement | null>(null)
const root = ref<HTMLElement | null>(null)
const menuOpen = ref(false)
const context = ref<ChatContextSelection>({})

const canSend = computed(() => !props.streaming && !props.disabled && text.value.trim().length > 0)

const count = computed(() => text.value.length)

const menuItems = [
  { key: 'attachment', label: '附件', stage: 'M1.5' },
  { key: 'skill', label: '技能', stage: 'M1.5' },
  { key: 'workflow', label: '工作流', stage: 'M5+' },
  { key: 'knowledge', label: '知识库', stage: 'M1.5' },
]

function autoResize(): void {
  const element = textarea.value
  if (!element) return
  element.style.height = 'auto'
  element.style.height = `${Math.min(element.scrollHeight, 180)}px`
}

watch(text, () => {
  void nextTick(autoResize)
})

function submit(): void {
  if (!canSend.value) return
  emit('send', { text: text.value.trim(), context: { ...context.value } })
  text.value = ''
  context.value = {}
  void nextTick(autoResize)
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return
  event.preventDefault()
  submit()
}

function onStop(): void {
  emit('stop')
}

function selectContext(item: (typeof menuItems)[number]): void {
  menuOpen.value = false
  ElMessage.info(`${item.label}选择将在 ${item.stage} 接入，本轮不会带上未上传的内容。`)
}

function onModelChange(event: Event): void {
  emit('update:model', (event.target as HTMLSelectElement).value)
}

function onEffortChange(event: Event): void {
  emit('update:reasoningEffort', (event.target as HTMLSelectElement).value as ReasoningEffortId)
}

function onDocumentClick(event: MouseEvent): void {
  if (!menuOpen.value) return
  const target = event.target as Node | null
  if (root.value && target && !root.value.contains(target)) menuOpen.value = false
}

onMounted(() => {
  document.addEventListener('click', onDocumentClick)
  autoResize()
})

onUnmounted(() => {
  document.removeEventListener('click', onDocumentClick)
})
</script>

<template>
  <footer ref="root" class="composer">
    <div class="composer-box">
      <div class="composer-toolbar">
        <div class="toolbar-left">
          <button
            class="icon-btn"
            type="button"
            aria-label="添加上下文"
            aria-haspopup="menu"
            :aria-expanded="menuOpen"
            title="添加上下文"
            @click.stop="menuOpen = !menuOpen"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>

          <div v-if="menuOpen" class="ctx-menu" role="menu">
            <p class="ctx-title">本轮上下文</p>
            <button
              v-for="item in menuItems"
              :key="item.key"
              type="button"
              role="menuitem"
              class="ctx-item"
              @click.stop="selectContext(item)"
            >
              <span>{{ item.label }}</span>
              <span class="ctx-stage">{{ item.stage }}</span>
            </button>
            <p class="ctx-foot">选择只影响当次请求，发送后清空。</p>
          </div>
        </div>

        <div class="toolbar-right">
          <label v-if="models.length > 0" class="picker">
            <span class="sr-only">模型</span>
            <select :value="model" :disabled="streaming" @change="onModelChange">
              <option v-for="item in models" :key="item.id" :value="item.id">
                {{ item.name }}
              </option>
            </select>
          </label>

          <label v-if="reasoningEfforts.length > 0" class="picker">
            <span class="sr-only">推理等级</span>
            <select :value="reasoningEffort" :disabled="streaming" @change="onEffortChange">
              <option v-for="item in reasoningEfforts" :key="item.id" :value="item.id">
                {{ item.name }}
              </option>
            </select>
          </label>
        </div>
      </div>

      <textarea
        ref="textarea"
        v-model="text"
        class="composer-input"
        rows="1"
        :maxlength="maxChars"
        :placeholder="
          streaming ? '正在生成，可点击停止…' : '继续调度…（Enter 发送，Shift+Enter 换行）'
        "
        aria-label="输入消息"
        @input="autoResize"
        @keydown="onKeydown"
      ></textarea>

      <div class="composer-footer">
        <span class="hint">Enter 发送 · Shift+Enter 换行 · @ 文件（后续接入）</span>
        <span class="count mono">{{ count }} / {{ maxChars }}</span>

        <button
          v-if="streaming"
          type="button"
          class="send is-stop"
          aria-label="停止生成"
          title="停止生成"
          @click="onStop"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="7" y="7" width="10" height="10" rx="1.5" />
          </svg>
        </button>
        <button
          v-else
          type="button"
          class="send"
          aria-label="发送"
          title="发送"
          :disabled="!canSend"
          @click="submit"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 19V5M6 11l6-6 6 6" />
          </svg>
        </button>
      </div>
    </div>
  </footer>
</template>

<style scoped>
.composer {
  position: relative;
  flex: none;
  padding: 8px 32px 18px;
  background: linear-gradient(to bottom, transparent, var(--paper) 24%);
}

.composer-box {
  width: min(100%, var(--content-max));
  margin: 0 auto;
  padding: 6px 8px 6px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--surface);
  box-shadow: var(--shadow-md);
  transition: border-color 0.15s;
}

.composer-box:focus-within {
  border-color: var(--ink-3);
}

.composer-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 0 2px;
}

.toolbar-left,
.toolbar-right {
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
}

.icon-btn {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 5px;
  color: var(--ink-3);
}

.icon-btn:hover {
  background: var(--surface-2);
  color: var(--ink);
}

.icon-btn svg {
  width: 17px;
  height: 17px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
}

.ctx-menu {
  position: absolute;
  bottom: 34px;
  left: 0;
  z-index: 40;
  width: 210px;
  padding: 6px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
  box-shadow: var(--shadow-md);
}

.ctx-title {
  padding: 4px 7px 5px;
  color: var(--ink-3);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.04em;
}

.ctx-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  height: 31px;
  padding: 0 7px;
  border-radius: 5px;
  color: var(--ink-2);
  font-size: 12px;
  text-align: left;
}

.ctx-item:hover {
  background: var(--surface-2);
  color: var(--ink);
}

.ctx-stage {
  padding: 1px 5px;
  border: 1px solid var(--line-2);
  border-radius: 4px;
  color: var(--ink-3);
  font-family: var(--font-mono);
  font-size: 9px;
}

.ctx-foot {
  margin-top: 4px;
  padding: 5px 7px 2px;
  border-top: 1px solid var(--line-2);
  color: var(--ink-3);
  font-size: 9.5px;
  line-height: 1.5;
}

.picker select {
  height: 24px;
  padding: 0 20px 0 7px;
  border: 1px solid transparent;
  border-radius: 5px;
  outline: none;
  background:
    linear-gradient(45deg, transparent 50%, var(--ink-3) 50%) no-repeat right 9px center / 4px 4px,
    linear-gradient(135deg, var(--ink-3) 50%, transparent 50%) no-repeat right 6px center / 4px 4px,
    var(--surface-2);
  color: var(--ink-2);
  font: inherit;
  font-size: 10.5px;
  appearance: none;
  cursor: pointer;
}

.picker select:hover:not(:disabled) {
  border-color: var(--line);
  color: var(--ink);
}

.picker select:disabled {
  cursor: not-allowed;
  opacity: 0.7;
}

.composer-input {
  display: block;
  width: 100%;
  max-height: 180px;
  min-height: 46px;
  padding: 8px 8px 4px;
  border: 0;
  outline: none;
  resize: none;
  background: transparent;
  color: var(--ink);
  font: inherit;
  font-size: 13.5px;
  line-height: 1.65;
}

.composer-input::placeholder {
  color: var(--ink-3);
}

.composer-footer {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 2px 1px 8px;
}

.hint {
  flex: 1;
  overflow: hidden;
  color: var(--ink-3);
  font-size: 9.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.count {
  color: var(--ink-3);
  font-size: 9px;
}

.send {
  display: grid;
  place-items: center;
  flex: none;
  width: 30px;
  height: 30px;
  border-radius: 7px;
  background: var(--btn-bg);
  color: var(--btn-fg);
  transition:
    opacity 0.15s,
    filter 0.15s;
}

.send:hover:not(:disabled) {
  filter: brightness(1.12);
}

.send:disabled {
  cursor: not-allowed;
  opacity: 0.4;
}

.send.is-stop {
  background: var(--red);
  color: var(--surface);
}

.send svg {
  width: 15px;
  height: 15px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.9;
  stroke-linecap: round;
  stroke-linejoin: round;
}

@media (max-width: 900px) {
  .composer {
    padding: 6px 14px 12px;
  }
}
</style>
