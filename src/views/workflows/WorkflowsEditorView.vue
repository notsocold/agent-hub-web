<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'

import AppIcon from '@/components/common/AppIcon.vue'
import LoadingSkeleton from '@/components/common/LoadingSkeleton.vue'
import PageHeader from '@/components/common/PageHeader.vue'
import PageShell from '@/components/common/PageShell.vue'
import WorkflowStepCard from '@/components/workflows/WorkflowStepCard.vue'
import { ApiRequestError } from '@/api/client'
import { workflowsApi } from '@/api/workflows'
import { WORKFLOW_STEP_TYPES, validateWorkflowSteps } from '@/types'
import type { Workflow, WorkflowStep, WorkflowStepType } from '@/types'

/**
 * M9 线性步骤编辑器：新建（/workflows/new）与编辑（/workflows/:id）共用。
 * 步骤 id 由前端自动生成（s1、s2…），增删步骤后按顺序重排；不做拖拽，
 * 顺序调整走「上移/下移」交换相邻步骤。
 */
const route = useRoute()
const router = useRouter()

const workflowId = computed(() => {
  const raw = route.params.id
  return typeof raw === 'string' && raw ? raw : null
})
const isNew = computed(() => workflowId.value === null)

const name = ref('')
const description = ref('')
const steps = ref<WorkflowStep[]>([])
const loading = ref(false)
const saving = ref(false)
const loadError = ref('')
const errors = ref<string[]>([])

/**
 * 干净基线快照：进入页面与保存成功后刷新。用规范化 JSON 比较
 * （undefined 归一、键序固定），供未保存离开守卫判定是否有改动。
 */
const snapshot = ref('')

function formKey(): string {
  return JSON.stringify({
    name: name.value,
    description: description.value,
    steps: steps.value.map((step) => ({
      id: step.id,
      type: step.type,
      title: step.title ?? '',
      instruction: step.instruction ?? '',
      tools: step.config ? [...step.config.tools] : null,
    })),
  })
}

const isDirty = computed(() => snapshot.value !== '' && formKey() !== snapshot.value)

onMounted(async () => {
  if (isNew.value) {
    snapshot.value = formKey()
    return
  }
  loading.value = true
  try {
    const workflow: Workflow = await workflowsApi.get(workflowId.value!)
    name.value = workflow.name
    description.value = workflow.description
    steps.value = workflow.steps.map((step) => ({
      ...step,
      config: step.config ? { tools: [...step.config.tools] } : undefined,
    }))
    snapshot.value = formKey()
  } catch (cause) {
    loadError.value = cause instanceof Error ? cause.message : '加载工作流失败'
  } finally {
    loading.value = false
  }
})

/** 有改动未保存时拦截离开：确认离开放行，取消停留。 */
onBeforeRouteLeave(async () => {
  if (!isDirty.value) return true
  try {
    await ElMessageBox.confirm('当前工作流有未保存的修改，离开将丢失这些更改。', '未保存的修改', {
      type: 'warning',
      confirmButtonText: '离开',
      cancelButtonText: '取消',
    })
    return true
  } catch {
    return false
  }
})

// ---------- 步骤数组操作（增删后重排 id，移动交换相邻元素） ----------

/** 五类步骤文案，与列表页执行轨迹的步骤类型标签一致。 */
const STEP_META: Record<WorkflowStepType, { label: string }> = {
  knowledge_search: { label: '检索' },
  tool: { label: '工具' },
  a2a: { label: '远程智能体' },
  approval: { label: '审批' },
  answer: { label: '回答' },
}

const addType = ref<WorkflowStepType>('knowledge_search')

/** 添加步骤：五类字段严格固定——tool 只有标题 + 工具清单，其余四类标题 + 指令。 */
function addStep(): void {
  const type = addType.value
  const step: WorkflowStep = { id: `s${steps.value.length + 1}`, type, title: '' }
  if (type !== 'tool') step.instruction = ''
  if (type === 'tool' || type === 'approval') step.config = { tools: [] }
  steps.value = [...steps.value, step]
  renumberSteps()
}

/** 增删步骤后按顺序重排 id：s1、s2…，不暴露编辑入口。 */
function renumberSteps(): void {
  steps.value = steps.value.map((step, index) => ({ ...step, id: `s${index + 1}` }))
}

function removeStep(index: number): void {
  steps.value = steps.value.filter((_, offset) => offset !== index)
  renumberSteps()
}

function moveStep(index: number, direction: -1 | 1): void {
  const target = index + direction
  if (target < 0 || target >= steps.value.length) return
  const next = [...steps.value]
  ;[next[index], next[target]] = [next[target]!, next[index]!]
  steps.value = next
}

function updateStep(index: number, next: WorkflowStep): void {
  steps.value = steps.value.map((step, offset) => (offset === index ? next : step))
}

// ---------- 字段输入（集中处理，模板不带类型断言） ----------

function onNameInput(event: Event): void {
  name.value = (event.target as HTMLInputElement).value
}

function onDescriptionInput(event: Event): void {
  description.value = (event.target as HTMLTextAreaElement).value
}

// ---------- 校验与保存 ----------

/**
 * 保存前校验：name（strip 后 1–100 字符、禁双引号与换行）、
 * description（strip 后 ≤500）与 validateWorkflowSteps 的中文错误列表。
 */
function validateForm(): string[] {
  const found: string[] = []
  const trimmedName = name.value.trim()
  if (!trimmedName) found.push('工作流名称不能为空')
  if (trimmedName && trimmedName.length > 100) {
    found.push(`工作流名称长度 ${trimmedName.length} 超过上限 100`)
  }
  if (/["\r\n]/.test(trimmedName)) found.push('工作流名称不能包含双引号或换行')
  const trimmedDescription = description.value.trim()
  if (trimmedDescription.length > 500) {
    found.push(`工作流描述长度 ${trimmedDescription.length} 超过上限 500`)
  }
  found.push(...validateWorkflowSteps(steps.value))
  return found
}

async function save(): Promise<void> {
  const found = validateForm()
  errors.value = found
  if (found.length > 0) return
  saving.value = true
  try {
    const payload = {
      name: name.value.trim(),
      description: description.value.trim(),
      steps: steps.value.map((step) => ({ ...step })),
    }
    if (isNew.value) {
      await workflowsApi.create(payload)
    } else {
      await workflowsApi.update(workflowId.value!, payload)
    }
    // 先清 dirty 再跳转：离开守卫放行，不弹确认框。
    snapshot.value = formKey()
    ElMessage.success(isNew.value ? '工作流已创建' : '工作流已保存')
    await router.replace('/workflows')
  } catch (cause) {
    // 保存失败行内展示错误，表单内容不丢。
    if (cause instanceof ApiRequestError) {
      errors.value = [`保存失败（${cause.code}）：${cause.message}`]
    } else {
      errors.value = [cause instanceof Error ? `保存失败：${cause.message}` : '保存失败，请稍后重试']
    }
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <PageShell>
    <PageHeader
      :title="isNew ? '新建工作流' : '编辑工作流'"
      description="按顺序编排检索、工具、远程智能体、审批与回答；步骤顺序通过上移/下移调整，保存后在对话中使用。"
    >
      <template #actions>
        <button type="button" class="btn btn-outline" data-testid="editor-back" @click="router.push('/workflows')">
          <AppIcon name="back" />返回列表
        </button>
        <button
          type="button"
          class="btn btn-primary"
          data-testid="editor-save"
          :disabled="saving || loading"
          @click="save"
        >
          <AppIcon name="check" />{{ saving ? '保存中…' : '保存' }}
        </button>
      </template>
    </PageHeader>

    <div v-if="loadError" class="res-error load-error" role="alert">
      <span>加载工作流失败：{{ loadError }}</span>
      <button type="button" class="btn btn-outline btn-sm" @click="router.push('/workflows')">返回列表</button>
    </div>
    <LoadingSkeleton v-else-if="loading" />

    <div v-else class="editor-form">
      <section class="panel">
        <header class="panel-head">
          <h2>基本信息</h2>
          <span class="count">WORKFLOW</span>
        </header>
        <div class="panel-body">
          <label class="field">
            <span>名称（必填，1–100 字符，不含双引号或换行）</span>
            <input
              class="input"
              type="text"
              data-testid="editor-name"
              :value="name"
              aria-label="工作流名称"
              @input="onNameInput"
            />
          </label>
          <label class="field">
            <span>描述（选填，≤500 字符）</span>
            <textarea
              class="input editor-desc"
              rows="3"
              data-testid="editor-description"
              :value="description"
              aria-label="工作流描述"
              @input="onDescriptionInput"
            ></textarea>
          </label>
        </div>
      </section>

      <div
        v-if="errors.length > 0"
        class="res-error"
        data-testid="editor-errors"
        role="alert"
      >
        <p v-for="(item, offset) in errors" :key="offset" class="error-line">{{ item }}</p>
      </div>

      <section class="panel">
        <header class="panel-head">
          <h2>执行步骤</h2>
          <span class="count">{{ steps.length }}</span>
          <span class="spacer"></span>
          <span class="note">按顺序执行 · 最多 12 步</span>
        </header>
        <div class="step-list">
          <p v-if="steps.length === 0" class="wf-edit-empty">还没有步骤，从下方选择类型添加第一步。</p>
          <WorkflowStepCard
            v-for="(step, index) in steps"
            :key="step.id"
            :step="step"
            :index="index"
            :total="steps.length"
            @update="updateStep(index, $event)"
            @remove="removeStep(index)"
            @move-up="moveStep(index, -1)"
            @move-down="moveStep(index, 1)"
          />
        </div>
        <footer class="step-add-row">
          <span class="step-add-label">添加步骤</span>
          <select v-model="addType" class="select" data-testid="step-add-type" aria-label="选择步骤类型">
            <option v-for="type in WORKFLOW_STEP_TYPES" :key="type" :value="type">
              {{ STEP_META[type].label }}（{{ type }}）
            </option>
          </select>
          <button type="button" class="btn btn-primary btn-sm" data-testid="step-add" @click="addStep">
            <AppIcon name="plus" />添加步骤
          </button>
          <span class="spacer"></span>
          <span class="note">步骤 id 由系统按顺序自动生成</span>
        </footer>
      </section>
    </div>
  </PageShell>
</template>

<style scoped>
.load-error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.editor-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.panel-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 15px;
}

.editor-desc {
  height: auto;
  min-height: 64px;
  padding: 8px 10px;
  line-height: 1.55;
  resize: vertical;
}

.error-line {
  margin: 0;
  font-size: 11px;
  line-height: 1.6;
}

.error-line + .error-line {
  margin-top: 4px;
}

.step-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px 15px 0;
}

.step-add-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 14px;
  padding: 10px 15px;
  border-top: 1px solid var(--line-2);
  background: var(--surface-2);
}

.step-add-label {
  font-size: 10px;
  color: var(--ink-3);
}

.step-add-row .select {
  height: 28px;
  font-size: 11px;
}
</style>
