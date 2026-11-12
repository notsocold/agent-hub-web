<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'

import AppIcon from '@/components/common/AppIcon.vue'
import ErrorState from '@/components/common/ErrorState.vue'
import LoadingSkeleton from '@/components/common/LoadingSkeleton.vue'
import PageHeader from '@/components/common/PageHeader.vue'
import PageShell from '@/components/common/PageShell.vue'
import StatCard from '@/components/common/StatCard.vue'
import { useSystemStore } from '@/stores/system'
import { useWorkflowsStore } from '@/stores/workflows'
import { formatDateTime } from '@/utils/format'
import type { Workflow, WorkflowStepType } from '@/types'

const router = useRouter()
const system = useSystemStore()
const workflows = useWorkflowsStore()

const keyword = ref('')
const switchingId = ref<string | null>(null)

/** 能力未开启（真实模式 capabilities.workflows=false）时的操作门控。 */
const capabilityEnabled = computed(() => system.enabled('workflows'))
const capabilityGate = computed(() => system.loaded && !capabilityEnabled.value)

/** 关键词本地过滤：命中名称或描述，不重新请求。 */
const filtered = computed(() => {
  const query = keyword.value.trim().toLowerCase()
  if (!query) return workflows.items
  return workflows.items.filter((item) =>
    `${item.name} ${item.description}`.toLowerCase().includes(query),
  )
})

/** 统计条与原型一致：已配置 / 启用 / 草稿 / 平均步骤，全部由列表真实数据派生。 */
const enabledCount = computed(() => workflows.items.filter((item) => item.enabled).length)
const draftCount = computed(() => workflows.items.length - enabledCount.value)
const averageSteps = computed(() => {
  if (workflows.items.length === 0) return 0
  const total = workflows.items.reduce((sum, item) => sum + item.steps.length, 0)
  return Math.round(total / workflows.items.length)
})

/** 五类步骤芯片的文案与着色，映射到原型 .wf-step 的 step-* 修饰类。 */
const STEP_META: Record<WorkflowStepType, { label: string; kind: string }> = {
  knowledge_search: { label: '检索', kind: 'step-vector' },
  tool: { label: '工具', kind: 'step-tool' },
  a2a: { label: '远程智能体', kind: 'step-a2a' },
  approval: { label: '审批', kind: 'step-approval' },
  answer: { label: '回答', kind: 'step-skill' },
}

function stepMeta(type: WorkflowStepType): { label: string; kind: string } {
  return STEP_META[type] ?? { label: type, kind: '' }
}

/** 远程智能体步数（原型元信息「N 个远程智能体」）。 */
function remoteAgentCount(workflow: Workflow): number {
  return workflow.steps.filter((step) => step.type === 'a2a').length
}

/** 审批步数（原型元信息「N 个审批」）。 */
function approvalCount(workflow: Workflow): number {
  return workflow.steps.filter((step) => step.type === 'approval').length
}

/** 原型元信息只展示 MM-DD：复用已有格式化结果截取月日。 */
function formatUpdated(iso: string): string {
  const full = formatDateTime(iso)
  return full === '—' ? full : full.slice(5, 10)
}

function isOwn(workflow: Workflow): boolean {
  return workflow.scope === 'user'
}

/** T6 契约：在对话中使用 → /chat?workflow_id&workflow_version&workflow_name。 */
function useInChat(workflow: Workflow): void {
  void router.push({
    path: '/chat',
    query: { workflow_id: workflow.id, workflow_version: workflow.version, workflow_name: workflow.name },
  })
}

function openEditor(workflow: Workflow): void {
  void router.push({ path: `/workflows/${workflow.id}` })
}

function openRuns(workflow: Workflow): void {
  void router.push({ path: `/workflows/${workflow.id}/runs` })
}

/** 启停需二次确认；取消时开关不落库（model-value 由 store 状态驱动自动回显）。 */
async function onToggleEnabled(workflow: Workflow, value: string | number | boolean): Promise<void> {
  const next = Boolean(value)
  const action = next ? '启用' : '停用'
  try {
    await ElMessageBox.confirm(`${action}「${workflow.name}」？`, `${action}工作流`, {
      type: 'warning',
      confirmButtonText: action,
      cancelButtonText: '取消',
    })
  } catch {
    return
  }
  switchingId.value = workflow.id
  try {
    await workflows.setEnabled(workflow.id, next)
    ElMessage.success(next ? '已启用' : '已停用')
  } catch (cause) {
    ElMessage.error(cause instanceof Error ? cause.message : '启停失败')
  } finally {
    switchingId.value = null
  }
}

/** 删除需二次确认；成功后 store 本地剔除，卡片随之消失。 */
async function removeWorkflow(workflow: Workflow): Promise<void> {
  try {
    await ElMessageBox.confirm(`删除「${workflow.name}」？运行历史将一并删除，此操作不可撤销。`, '删除工作流', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }
  try {
    await workflows.remove(workflow.id)
    ElMessage.success('工作流已删除')
  } catch (cause) {
    ElMessage.error(cause instanceof Error ? cause.message : '删除失败')
  }
}

onMounted(() => {
  void system.load()
  void workflows.load()
})
</script>

<template>
  <PageShell>
    <PageHeader
      title="工作流"
      description="把技能、工具、远程智能体和审批编排成可复用的执行轨迹。在对话里用「+」选择工作流，本轮任务会按这条轨迹执行。"
    >
      <template #actions>
        <label class="tool-search wf-search">
          <AppIcon name="search" />
          <input
            v-model="keyword"
            type="search"
            data-testid="workflow-search"
            placeholder="搜索工作流"
            aria-label="搜索工作流"
          />
        </label>
        <button type="button" class="btn btn-outline" disabled title="导入能力暂未接入">导入</button>
        <button
          type="button"
          class="btn btn-primary"
          data-testid="workflow-new"
          :disabled="!capabilityEnabled"
          @click="router.push('/workflows/new')"
        >
          <AppIcon name="plus" />新建工作流
        </button>
      </template>
    </PageHeader>

    <div v-if="capabilityGate" class="capability-note" data-testid="capability-alert" role="alert">
      工作流能力未启用：后端 capabilities.workflows=false，开启后刷新页面即可使用。
    </div>

    <div class="stats">
      <StatCard label="已配置" :value="workflows.items.length" />
      <StatCard label="启用" :value="enabledCount" />
      <StatCard label="草稿" :value="draftCount" />
      <StatCard label="平均步骤" :value="averageSteps" />
    </div>

    <ErrorState v-if="workflows.error" :message="workflows.error" @retry="workflows.refresh" />
    <LoadingSkeleton v-else-if="workflows.loading" />
    <div v-else-if="filtered.length === 0" class="empty-state">
      {{ workflows.items.length === 0 ? '还没有工作流。点击「新建工作流」开始编排。' : '还没有匹配的工作流，换个关键词试试。' }}
    </div>

    <div v-else class="workflow-list">
      <article
        v-for="workflow in filtered"
        :key="workflow.id"
        class="wf-card"
        :class="{ 'is-draft': !workflow.enabled }"
        data-testid="workflow-card"
      >
        <div class="wf-head">
          <span class="wf-mark"><AppIcon name="workflow" /></span>
          <div class="wf-title-wrap">
            <div class="wf-name">
              {{ workflow.name }}
              <span class="tag">v{{ workflow.version }}</span>
              <span v-if="workflow.scope === 'system'" class="tag">系统</span>
            </div>
            <p v-if="workflow.description" class="wf-desc">{{ workflow.description }}</p>
          </div>
          <div class="wf-state">
            <span v-if="isOwn(workflow)" class="wf-switch-wrap">
              <el-switch
                :model-value="workflow.enabled"
                :loading="switchingId === workflow.id"
                :disabled="!capabilityEnabled"
                size="small"
                :aria-label="`${workflow.enabled ? '停用' : '启用'} ${workflow.name}`"
                @change="onToggleEnabled(workflow, $event)"
              />
            </span>
            <span class="wf-state-text">{{ workflow.enabled ? '启用' : '草稿' }}</span>
          </div>
        </div>

        <div class="wf-route">
          <div class="wf-route-label">执行轨迹</div>
          <div class="wf-steps">
            <template v-for="(step, index) in workflow.steps" :key="step.id">
              <span class="wf-step chip" :class="stepMeta(step.type).kind">
                <span class="wf-step-num">{{ String(index + 1).padStart(2, '0') }}</span>
                <span class="wf-step-type">{{ stepMeta(step.type).label }}</span>
                <span v-if="step.title" class="wf-step-name">{{ step.title }}</span>
              </span>
              <span v-if="index < workflow.steps.length - 1" class="wf-link" aria-hidden="true"></span>
            </template>
          </div>
        </div>

        <div class="wf-meta">
          <span>{{ workflow.steps.length }} 步</span>
          <span>·</span>
          <span>{{ remoteAgentCount(workflow) }} 个远程智能体</span>
          <span>·</span>
          <span>{{ approvalCount(workflow) }} 个审批</span>
          <span class="spacer"></span>
          <span>更新于 {{ formatUpdated(workflow.updated_at) }}</span>
        </div>

        <div class="wf-actions">
          <button
            type="button"
            class="btn btn-primary btn-sm"
            data-testid="workflow-use"
            :disabled="!workflow.enabled || !capabilityEnabled"
            @click="useInChat(workflow)"
          >
            {{ workflow.enabled ? '在对话中使用' : '草稿不可用' }}
          </button>
          <template v-if="isOwn(workflow)">
            <button
              type="button"
              class="btn btn-outline btn-sm"
              data-testid="workflow-edit"
              :disabled="!capabilityEnabled"
              @click="openEditor(workflow)"
            >
              编辑
            </button>
            <button
              type="button"
              class="btn btn-ghost btn-sm"
              data-testid="workflow-runs"
              :disabled="!capabilityEnabled"
              @click="openRuns(workflow)"
            >
              运行历史
            </button>
            <span class="spacer"></span>
            <button
              type="button"
              class="btn btn-ghost btn-sm is-danger-text"
              data-testid="workflow-remove"
              :disabled="!capabilityEnabled"
              @click="removeWorkflow(workflow)"
            >
              删除
            </button>
          </template>
        </div>
      </article>
    </div>
  </PageShell>
</template>

<style scoped>
.capability-note {
  margin-top: 12px;
  padding: 8px 12px;
  border: 1px solid var(--amber-soft);
  border-radius: 6px;
  background: var(--amber-soft);
  color: var(--amber-text);
  font-size: 11px;
  line-height: 1.6;
}

.wf-search {
  width: 190px;
  height: 31px;
}

/* 原型 .wf-step 与旧 .chip 类叠加：只保留原型的排版与配色。 */
.wf-steps .wf-step {
  font-family: var(--font-sans);
}

.wf-steps .wf-step .wf-step-name {
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Element Plus 开关按原型 .wf-switch 的 28×16 尺寸重绘（测试以 el-switch 为准）。 */
.wf-switch-wrap {
  display: inline-flex;
  flex: none;
}

.wf-state :deep(.el-switch--small) {
  height: 16px;
}

.wf-state :deep(.el-switch--small .el-switch__core) {
  min-width: 28px;
  width: 28px;
  height: 16px;
  border: 1px solid var(--line);
  border-radius: 9px;
  background: var(--line-2);
}

.wf-state :deep(.el-switch--small.is-checked .el-switch__core) {
  border-color: var(--prussian);
  background: var(--prussian);
}

.wf-state :deep(.el-switch--small .el-switch__core .el-switch__action) {
  width: 10px;
  height: 10px;
  left: 2px;
  background: var(--surface);
  box-shadow: 0 1px 1px rgba(20, 27, 32, 0.16);
}

.wf-state :deep(.el-switch--small.is-checked .el-switch__core .el-switch__action) {
  left: calc(100% - 12px);
}

.wf-state :deep(.el-switch--small .el-switch__core .el-switch__inner) {
  display: none;
}

.wf-state :deep(.el-switch.is-disabled) {
  opacity: 0.5;
}
</style>
