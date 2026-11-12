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

/** 五类步骤的文案与着色（answer 复用 skill 绿色系），与列表页芯片配色一致。 */
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
  <article class="step-card" data-testid="step-card" :data-step-type="step.type">
    <header class="step-head">
      <span class="step-no mono">{{ String(index + 1).padStart(2, '0') }}</span>
      <span class="chip" :class="meta.kind">
        <span class="chip-type">{{ meta.label }}</span>
        <span class="chip-code mono">{{ step.type }}</span>
      </span>
      <span class="spacer"></span>
      <button
        type="button"
        class="btn"
        data-testid="step-up"
        :disabled="index === 0"
        aria-label="上移该步骤"
        @click="emit('move-up')"
      >
        上移
      </button>
      <button
        type="button"
        class="btn"
        data-testid="step-down"
        :disabled="index === total - 1"
        aria-label="下移该步骤"
        @click="emit('move-down')"
      >
        下移
      </button>
      <button type="button" class="btn danger" data-testid="step-remove" @click="emit('remove')">
        删除
      </button>
    </header>

    <div class="step-body">
      <label class="field">
        <span class="field-label">标题（选填）</span>
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
        <span class="field-label">执行指令（选填，≤500 字符）</span>
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
        <span class="field-label">工具清单（必填，至少 1 个）</span>
        <div class="tag-box">
          <span v-for="tool in tools" :key="tool" class="tag" data-testid="step-tool-tag">
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
            class="input tag-input"
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
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 14px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--surface);
}

.step-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.step-no {
  color: var(--ink-3);
  font-size: 11px;
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 24px;
  padding: 0 8px;
  border: 1px solid var(--line-2);
  border-left: 2px solid var(--chip-color, var(--line));
  border-radius: 4px;
  background: var(--chip-bg, var(--surface-2));
  font-size: 10.5px;
  color: var(--ink-2);
}

.chip-type {
  color: var(--chip-color, var(--ink-3));
  font-size: 9.5px;
}

.chip-code {
  color: var(--ink-3);
  font-size: 8.5px;
}

.kind-vector {
  --chip-color: var(--kind-vector);
  --chip-bg: var(--kind-vector-soft);
}

.kind-tool {
  /* 芯片为 10px 小字：amber 在 amber-soft 上对比不足，改用文字色 amber-text。 */
  --chip-color: var(--amber-text);
  --chip-bg: var(--kind-tool-soft);
}

.kind-a2a {
  --chip-color: var(--kind-a2a);
  --chip-bg: var(--kind-a2a-soft);
}

.kind-approval {
  --chip-color: var(--kind-approval);
  --chip-bg: var(--kind-approval-soft);
}

.kind-skill {
  --chip-color: var(--kind-skill);
  --chip-bg: var(--kind-skill-soft);
}

.spacer {
  flex: 1;
}

.btn.danger {
  color: var(--red);
}

.btn.danger:hover:not(:disabled) {
  border-color: var(--red);
  color: var(--red);
}

.step-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.field-label {
  color: var(--ink-3);
  font-size: 10px;
  letter-spacing: 0.03em;
}

.step-instruction {
  height: auto;
  padding: 7px 10px;
  line-height: 1.6;
  resize: vertical;
}

.tag-box {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  min-height: 32px;
  padding: 4px 6px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--surface);
}

.tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 1px 4px 1px 8px;
  border: 1px solid var(--line-2);
  border-radius: 4px;
  background: var(--surface-2);
  color: var(--ink-2);
  font-size: 10.5px;
}

.tag-remove {
  border: none;
  background: none;
  color: var(--ink-3);
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
  padding: 2px;
}

.tag-remove:hover {
  color: var(--red);
}

.tag-input {
  flex: 1;
  min-width: 180px;
  border: none;
  background: none;
  height: 24px;
  padding: 0 4px;
}

.tag-input:focus {
  border: none;
}
</style>
