<script setup lang="ts">
import { computed } from 'vue'

import AppIcon from '@/components/common/AppIcon.vue'
import type { ProcessStatus } from '@/types'

const props = defineProps<{
  kind: 'skill' | 'tool' | 'vector' | 'a2a' | 'mcp' | 'approval' | 'workflow' | 'notice' | 'error'
  title: string
  status: ProcessStatus
  statusLabel?: string
  duration?: string
  /** summary 行里的参数摘要，对应原型 .tool-args。 */
  args?: string
  /** tool.result 的图标：检索用 search，其余用 check。 */
  resultIcon?: string
}>()

const kindLabel = computed(
  () =>
    ({
      skill: '技能',
      tool: '工具',
      vector: '检索',
      a2a: 'A2A',
      mcp: 'MCP',
      approval: '审批',
      workflow: '工作流',
      notice: '提示',
      error: '错误',
    })[props.kind],
)

const statusText = computed(
  () =>
    ({
      running: '运行中',
      waiting: '等待',
      ok: '完成',
      error: '失败',
      skipped: '跳过',
      canceled: '已取消',
    })[props.status],
)

const resultIconName = computed(() => {
  if (props.status === 'error') return 'x'
  if (props.status === 'running' || props.status === 'waiting') return 'clock'
  return props.resultIcon ?? 'check'
})
</script>

<template>
  <li class="entry entry-proc" :class="`kind-${kind}`">
    <span class="node" aria-hidden="true"></span>
    <div class="entry-body">
      <details class="tool-card" open>
        <summary>
          <span class="kind">{{ kindLabel }}</span>
          <span class="tool-name">{{ title }}</span>
          <span v-if="args" class="tool-args">{{ args }}</span>
          <span class="tool-result">
            <AppIcon :name="resultIconName" />
            {{ statusLabel ?? statusText }}
          </span>
          <span v-if="duration" class="tool-time mono">{{ duration }}</span>
          <AppIcon name="chevron" class="chev" />
        </summary>
        <div class="tool-body">
          <slot />
        </div>
      </details>
    </div>
  </li>
</template>
