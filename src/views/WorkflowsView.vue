<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'

import EmptyState from '@/components/common/EmptyState.vue'
import ErrorState from '@/components/common/ErrorState.vue'
import LoadingSkeleton from '@/components/common/LoadingSkeleton.vue'
import PageHeader from '@/components/common/PageHeader.vue'
import PageShell from '@/components/common/PageShell.vue'
import StatusBadge from '@/components/common/StatusBadge.vue'
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

/** 五类步骤芯片的文案与着色（answer 复用 skill 绿色系）。 */
const STEP_META: Record<WorkflowStepType, { label: string; kind: string }> = {
  knowledge_search: { label: '检索', kind: 'kind-vector' },
  tool: { label: '工具', kind: 'kind-tool' },
  a2a: { label: '远程智能体', kind: 'kind-a2a' },
  approval: { label: '审批', kind: 'kind-approval' },
  answer: { label: '回答', kind: 'kind-skill' },
}

function stepMeta(type: WorkflowStepType): { label: string; kind: string } {
  return STEP_META[type] ?? { label: type, kind: 'kind-notice' }
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
      eyebrow="WORKFLOWS"
      title="工作流"
      description="把技能、检索、A2A、MCP 与审批编排成有序步骤模板；运行轨迹与人工审批仍在对话中完成。"
    >
      <template #actions>
        <button
          type="button"
          class="btn primary"
          data-testid="workflow-new"
          :disabled="!capabilityEnabled"
          @click="router.push('/workflows/new')"
        >
          新建工作流
        </button>
      </template>
    </PageHeader>

    <el-alert
      v-if="capabilityGate"
      data-testid="capability-alert"
      title="工作流能力未启用"
      description="后端尚未启用工作流能力（capabilities.workflows=false）；开启后刷新页面即可使用。"
      type="warning"
      :closable="false"
      show-icon
    />

    <div class="toolbar">
      <input
        v-model="keyword"
        class="input"
        type="search"
        data-testid="workflow-search"
        placeholder="搜索名称或描述"
        aria-label="搜索工作流"
      />
      <span class="toolbar-count mono">{{ filtered.length }} / {{ workflows.items.length }}</span>
    </div>

    <ErrorState v-if="workflows.error" :message="workflows.error" @retry="workflows.refresh" />
    <LoadingSkeleton v-else-if="workflows.loading" />
    <EmptyState
      v-else-if="filtered.length === 0"
      title="还没有匹配的工作流"
      description="点击右上角「新建工作流」，用检索、工具、远程智能体与审批编排一条执行轨迹。"
    />

    <div v-else class="workflow-list">
      <article
        v-for="workflow in filtered"
        :key="workflow.id"
        class="wf-card"
        :class="{ 'is-draft': !workflow.enabled }"
        data-testid="workflow-card"
      >
        <div class="wf-head">
          <div class="wf-title-wrap">
            <div class="wf-name-row">
              <span class="scope-tag" :class="workflow.scope === 'system' ? 'scope-system' : 'scope-user'">
                {{ workflow.scope === 'system' ? '系统' : '我的' }}
              </span>
              <span class="wf-name">{{ workflow.name }}</span>
              <span class="version-tag mono">v{{ workflow.version }}</span>
            </div>
            <p v-if="workflow.description" class="wf-desc">{{ workflow.description }}</p>
          </div>
          <div class="wf-state">
            <span v-if="isOwn(workflow)">
              <el-switch
                :model-value="workflow.enabled"
                :loading="switchingId === workflow.id"
                :disabled="!capabilityEnabled"
                size="small"
                :aria-label="`${workflow.enabled ? '停用' : '启用'} ${workflow.name}`"
                @change="onToggleEnabled(workflow, $event)"
              />
            </span>
            <StatusBadge
              v-else
              :tone="workflow.enabled ? 'ok' : 'muted'"
              :label="workflow.enabled ? '已启用' : '已停用'"
            />
          </div>
        </div>

        <div class="wf-route">
          <span class="wf-route-label">执行轨迹</span>
          <div class="wf-steps">
            <template v-for="(step, index) in workflow.steps" :key="step.id">
              <span class="chip" :class="stepMeta(step.type).kind">
                <span class="chip-num mono">{{ String(index + 1).padStart(2, '0') }}</span>
                <span class="chip-type">{{ stepMeta(step.type).label }}</span>
                <span v-if="step.title" class="chip-title">{{ step.title }}</span>
              </span>
              <span v-if="index < workflow.steps.length - 1" class="wf-link" aria-hidden="true"></span>
            </template>
          </div>
        </div>

        <div class="wf-meta mono">
          <span>{{ workflow.steps.length }} 步</span>
          <span>·</span>
          <span>更新于 {{ formatDateTime(workflow.updated_at) }}</span>
        </div>

        <div class="wf-actions">
          <button
            type="button"
            class="btn primary"
            data-testid="workflow-use"
            :disabled="!workflow.enabled || !capabilityEnabled"
            @click="useInChat(workflow)"
          >
            在对话中使用
          </button>
          <template v-if="isOwn(workflow)">
            <button
              type="button"
              class="btn"
              data-testid="workflow-edit"
              :disabled="!capabilityEnabled"
              @click="openEditor(workflow)"
            >
              编辑
            </button>
            <button
              type="button"
              class="btn"
              data-testid="workflow-runs"
              :disabled="!capabilityEnabled"
              @click="openRuns(workflow)"
            >
              运行历史
            </button>
            <span class="spacer"></span>
            <button
              type="button"
              class="btn danger"
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
.toolbar-count {
  margin-left: auto;
  color: var(--ink-3);
  font-size: 10px;
}

.workflow-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.wf-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 16px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--surface);
}

.wf-card.is-draft {
  opacity: 0.82;
}

.wf-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.wf-title-wrap {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.wf-name-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.scope-tag {
  padding: 1px 7px;
  border-radius: 3px;
  font-size: 9.5px;
  white-space: nowrap;
}

.scope-system {
  color: var(--prussian);
  background: var(--prussian-soft);
}

.scope-user {
  color: var(--ink-3);
  border: 1px solid var(--line-2);
}

.wf-name {
  color: var(--ink);
  font-size: 13px;
  font-weight: 600;
}

.version-tag {
  padding: 1px 6px;
  border: 1px solid var(--line-2);
  border-radius: 3px;
  color: var(--ink-2);
  font-size: 9.5px;
}

.wf-desc {
  margin: 0;
  color: var(--ink-3);
  font-size: 11px;
  line-height: 1.6;
}

.wf-state {
  display: flex;
  flex: none;
  align-items: center;
  gap: 8px;
}

.wf-route {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.wf-route-label {
  flex: none;
  padding-top: 6px;
  color: var(--ink-3);
  font-size: 9.5px;
  letter-spacing: 0.04em;
  white-space: nowrap;
}

.wf-steps {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 5px;
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
  white-space: nowrap;
}

.chip-num {
  color: var(--ink-3);
  font-size: 8.5px;
}

.chip-type {
  color: var(--chip-color, var(--ink-3));
  font-size: 9px;
}

.chip-title {
  max-width: 220px;
  overflow: hidden;
  color: var(--ink-2);
  font-size: 10px;
  text-overflow: ellipsis;
}

.wf-link {
  flex: none;
  width: 12px;
  height: 1px;
  background: var(--line);
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

.wf-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--ink-3);
  font-size: 10px;
}

.wf-actions {
  display: flex;
  align-items: center;
  gap: 8px;
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

@media (max-width: 700px) {
  .wf-route {
    flex-direction: column;
    gap: 4px;
  }

  .wf-route-label {
    padding-top: 0;
  }
}
</style>
