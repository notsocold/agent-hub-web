<script setup lang="ts">
import { computed, ref } from 'vue'

import AppIcon from '@/components/common/AppIcon.vue'
import A2ACard from './cards/A2ACard.vue'
import ApprovalCard from './cards/ApprovalCard.vue'
import NoticeCard from './cards/NoticeCard.vue'
import SkillCard from './cards/SkillCard.vue'
import ToolCard from './cards/ToolCard.vue'
import WorkflowStepCard from './cards/WorkflowStepCard.vue'
import type { A2aProcess, ProcessItem } from '@/types'

const props = defineProps<{
  items: ProcessItem[]
  busy?: boolean
  /** M5：正在处理的审批 id；多审批时只禁用对应卡片。 */
  resolvingApprovalId?: string | null
  /** 本轮思考总时长；用于还原原型“思考 12s · 7 步 …”摘要。 */
  reasoningMs?: number
}>()

const emit = defineEmits<{
  approve: [id: string]
  reject: [id: string]
  'open-output': [item: A2aProcess]
}>()

const open = ref(true)

/** 原型摘要：思考时长 / 步骤数 / 远程智能体数 / 审批数；无数据项不显示。 */
const summary = computed(() => {
  const parts: string[] = []
  if (props.reasoningMs && props.reasoningMs > 0) {
    parts.push(`思考 ${Math.max(1, Math.round(props.reasoningMs / 1000))}s`)
  }
  const steps = props.items.filter((item) => item.kind !== 'notice').length
  if (steps > 0) parts.push(`${steps} 步`)
  const a2a = props.items.filter((item) => item.kind === 'a2a').length
  if (a2a > 0) parts.push(`${a2a} 个远程智能体`)
  const approvals = props.items.filter((item) => item.kind === 'approval').length
  if (approvals > 0) parts.push(`${approvals} 个审批`)
  return parts.length > 0 ? parts.join(' · ') : '执行过程'
})

const hasPendingApproval = computed(() =>
  props.items.some((item) => item.kind === 'approval' && item.status === 'waiting'),
)

const hasRunning = computed(() => props.items.some((item) => item.status === 'running'))

const stateChip = computed(() => {
  if (hasPendingApproval.value) return { cls: 'st-warn', label: '待审批' }
  if (hasRunning.value) return { cls: 'st-live', label: '运行中' }
  return { cls: 'st-ok', label: '完成' }
})

/** 原型「处理审批 →」把视口带到审批卡。 */
function focusApproval(): void {
  const target = document.querySelector('.entry-approval')
  target?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}
</script>

<template>
  <section class="turn-process" :class="{ 'is-collapsed': !open }" aria-label="执行过程">
    <div class="run-viewbar">
      <span class="run-view-icon"><AppIcon name="spark" /></span>
      <span class="run-view-title">{{ open ? '执行过程' : '过程已收起' }}</span>
      <span class="run-view-meta">{{ summary }}</span>
      <span class="st" :class="stateChip.cls">
        <span class="dot"></span>{{ stateChip.label }}
      </span>
      <span class="spacer"></span>
      <button
        v-if="hasPendingApproval"
        type="button"
        class="text-link run-approval-link"
        @click="focusApproval"
      >
        处理审批
        <AppIcon name="arrow" />
      </button>
      <button class="run-toggle" type="button" :aria-expanded="open" @click="open = !open">
        <span>{{ open ? '收起过程' : '展开过程' }}</span>
        <AppIcon name="chevron" class="run-chev" />
      </button>
    </div>

    <ol v-if="open" class="thread">
      <template v-for="item in items" :key="item.id">
        <SkillCard v-if="item.kind === 'skill'" :item="item" />
        <ToolCard v-else-if="item.kind === 'tool'" :item="item" />
        <A2ACard
          v-else-if="item.kind === 'a2a'"
          :item="item"
          @open-output="emit('open-output', item)"
        />
        <WorkflowStepCard v-else-if="item.kind === 'workflow'" :item="item" />
        <NoticeCard v-else-if="item.kind === 'notice'" :item="item" />
        <ApprovalCard
          v-else-if="item.kind === 'approval'"
          :item="item"
          :busy="busy || resolvingApprovalId === item.approvalId"
          @approve="emit('approve', item.approvalId)"
          @reject="emit('reject', item.approvalId)"
        />
      </template>
    </ol>
  </section>
</template>

<style scoped>
.turn-process {
  margin-bottom: 18px;
}

.run-viewbar {
  margin-left: 0;
}
</style>
