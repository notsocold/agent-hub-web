<script setup lang="ts">
import { computed, ref } from 'vue'

import type { WorkflowStep, WorkflowStepType } from '@/types'

/**
 * 编辑器单个步骤的编辑卡：纯展示 + 事件上抛，steps 数组状态由父组件持有。
 * 与对话页 `chat/cards/WorkflowStepCard.vue`（运行回放展示卡）不同目录不同职责。
 */
const props = defineProps<{
  step: WorkflowStep
  /** 从 0 计的步骤下标，用于序号与上移/下移禁用。 */
  index: number
  total: number
}>()

const emit = defineEmits<{
  /** 字段变更：上抛合并后的完整步骤对象。 */
  update: [step: WorkflowStep]
  remove: []
  'move-up': []
  'move-down': []
}>()

/** 五类步骤的文案与着色，与列表页执行轨迹的芯片类型配色一致。 */
const STEP_META: Record<WorkflowStepType, { label: string; kind: string }> = {
  knowledge_search: { label: '检索', kind: 'kind-vector' },
  tool: { label: '工具', kind: 'kind-tool' },
  a2a: { label: '远程智能体', kind: 'kind-a2a' },
  approval: { label: '审批', kind: 'kind-approval' },
  answer: { label: '回答', kind: 'kind-skill' },
}

const meta = computed(() => STEP_META[props.step.type] ?? { label: props.step.type, kind: 'kind-notice' })

/** 五类字段严格固定：tool 只有标题 + 工具清单，其余四类是标题 + 指令；approval 额外带工具清单。 */
const showInstruction = computed(() => props.step.type !== 'tool')
const showTools = computed(() => props.step.type === 'tool' || props.step.type === 'approval')

const tools = computed(() => props.step.config?.tools ?? [])

function patchFields(patch: Partial<Omit<WorkflowStep, 'id' | 'type'>>): void {
  emit('update', { ...props.step, ...patch })
}

/** 工具标签草稿：Enter / 逗号（含全角）触发添加，失焦也兜底收口。 */
const toolDraft = ref('')

function addTool(): void {
  const parts = toolDraft.value
    .split(/[,，]/)
    .map((item) => item.trim())
    .filter(Boolean)
  if (parts.length === 0) return
  const merged = [...tools.value]
  for (const name of parts) {
    if (!merged.includes(name)) merged.push(name)
  }
  patchFields({ config: { tools: merged } })
  toolDraft.value = ''
}

function removeTool(tool: string): void {
  patchFields({ config: { tools: tools.value.filter((item) => item !== tool) } })
}
</script>

<template>
  <article
    class="step-card tool-card"
    :class="meta.kind"
    data-testid="step-card"
    :data-step-type="step.type"
  >
    <header class="step-head">
      <span class="step-no mono">{{ String(index + 1).padStart(2, '0') }}</span>
      <span class="step-type">{{ meta.label }}</span>
      <span class="step-code mono">{{ step.type }}</span>
      <span class="spacer"></span>
      <button
        type="button"
        class="wf-step-btn"
        data-testid="step-up"
        :disabled="index === 0"
        aria-label="上移该步骤"
        title="上移"
        @click="emit('move-up')"
      >
        ↑
      </button>
      <button
        type="button"
        class="wf-step-btn"
        data-testid="step-down"
        :disabled="index === total - 1"
        aria-label="下移该步骤"
        title="下移"
        @click="emit('move-down')"
      >
        ↓
      </button>
      <button
        type="button"
        class="btn btn-danger btn-sm"
        data-testid="step-remove"
        @click="emit('remove')"
      >
        删除
      </button>
    </header>

    <div class="step-body">
      <label class="field">
        <span>标题（选填）</span>
        <input
          class="input"
          type="text"
          data-testid="step-title"
          :value="step.title ?? ''"
          :aria-label="`第 ${index + 1} 步标题`"
          @input="patchFields({ title: ($event.target as HTMLInputElement).value })"
        />
      </label>

      <label v-if="showInstruction" class="field">
        <span>执行指令（选填，≤500 字符）</span>
        <textarea
          class="input step-instruction"
          rows="2"
          data-testid="step-instruction"
          :value="step.instruction ?? ''"
          :aria-label="`第 ${index + 1} 步执行指令`"
          @input="patchFields({ instruction: ($event.target as HTMLTextAreaElement).value })"
        ></textarea>
      </label>

      <div v-if="showTools" class="field">
        <span>工具清单（必填，至少 1 个）</span>
        <div class="tag-box">
          <span v-for="tool in tools" :key="tool" class="tool-tag" data-testid="step-tool-tag">
            {{ tool }}
            <button
              type="button"
              class="tag-remove"
              data-testid="step-tool-remove"
              :aria-label="`删除工具 ${tool}`"
              @click="removeTool(tool)"
            >
              ×
            </button>
          </span>
          <input
            v-model="toolDraft"
            class="tag-input"
            type="text"
            data-testid="step-tool-input"
            placeholder="输入工具名，回车或逗号添加"
            :aria-label="`第 ${index + 1} 步工具名输入`"
            @keydown.enter.prevent="addTool"
            @blur="addTool"
          />
        </div>
      </div>
    </div>
  </article>
</template>

<style scoped>
.step-card {
  border-left: 2px solid var(--line);
}

.step-card.kind-vector {
  border-left-color: var(--kind-vector);
}

.step-card.kind-tool {
  border-left-color: var(--amber);
}

.step-card.kind-a2a {
  border-left-color: var(--kind-a2a);
}

.step-card.kind-approval {
  border-left-color: var(--red);
}

.step-card.kind-skill {
  border-left-color: var(--green);
}

.step-head {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--line-2);
  background: var(--surface-2);
}

.step-no {
  color: var(--ink-3);
  font-size: 9px;
}

.step-type {
  color: var(--ink-2);
  font-size: 10.5px;
  font-weight: 600;
}

.kind-vector .step-type {
  color: var(--kind-vector);
}

.kind-tool .step-type {
  color: var(--amber-text);
}

.kind-a2a .step-type {
  color: var(--kind-a2a);
}

.kind-approval .step-type {
  color: var(--red);
}

.kind-skill .step-type {
  color: var(--green);
}

.step-code {
  color: var(--ink-3);
  font-size: 8.5px;
}

.spacer {
  flex: 1;
}

.step-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px 12px 12px;
}

.step-instruction {
  height: auto;
  padding: 7px 9px;
  line-height: 1.55;
  resize: vertical;
}

.tag-box {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 5px;
  min-height: 30px;
  padding: 3px 5px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--surface);
}

.tag-box:focus-within {
  border-color: var(--ink-3);
}

.tool-tag {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  height: 22px;
  padding: 0 3px 0 7px;
  border: 1px solid var(--line-2);
  border-radius: 4px;
  background: var(--surface-2);
  color: var(--ink-2);
  font-family: var(--font-mono);
  font-size: 9.5px;
  white-space: nowrap;
}

.tag-remove {
  display: grid;
  place-items: center;
  width: 16px;
  height: 16px;
  border-radius: 3px;
  color: var(--ink-3);
  font-size: 12px;
  line-height: 1;
}

.tag-remove:hover {
  background: var(--red-soft);
  color: var(--red);
}

.tag-input {
  flex: 1;
  min-width: 160px;
  height: 22px;
  padding: 0 4px;
  border: none;
  background: transparent;
  color: var(--ink);
  font: inherit;
  font-size: 11.5px;
  outline: none;
}
</style>
