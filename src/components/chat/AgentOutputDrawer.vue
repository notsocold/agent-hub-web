<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'

import AppIcon from '@/components/common/AppIcon.vue'

import { formatDuration } from '@/utils/format'
import type { A2aProcess } from '@/types'

const props = defineProps<{
  open: boolean
  item: A2aProcess | null
}>()

const emit = defineEmits<{
  close: []
}>()

const stateClass = computed(() => {
  const state = props.item?.state
  if (state === 'completed') return 'st-ok'
  if (state === 'failed' || state === 'canceled' || state === 'rejected') return 'st-error'
  return 'st-live'
})

const badge = computed(() => {
  const name = props.item?.agentName || props.item?.agent || 'A2A'
  const parts = name.replace(/[-_.]/g, ' ').trim().split(/\s+/).filter(Boolean)
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
})

const stateLabel = computed(() => {
  const state = props.item?.state
  return (
    {
      submitted: '已提交',
      working: '运行中',
      input_required: '等待输入',
      auth_required: '需要授权',
      completed: '已完成',
      failed: '失败',
      canceled: '已取消',
      rejected: '已拒绝',
    } as const
  )[state ?? 'completed']
})
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="agent-scrim is-open" @click="emit('close')"></div>
    <aside
      v-if="open && item"
      class="agent-drawer is-open"
      role="dialog"
      aria-modal="true"
      aria-labelledby="agent-output-title"
    >
      <header class="agent-drawer-head">
        <div class="agent-drawer-ident">
          <span class="agent-badge" aria-hidden="true">{{ badge }}</span>
          <div class="agent-drawer-title">
            <div id="agent-output-title" class="agent-drawer-name">
              {{ item.agentName || item.agent }}
            </div>
            <div class="agent-drawer-sub">
              <span class="st" :class="stateClass">
                <span class="dot"></span>{{ stateLabel }}
              </span>
              <span class="mono">{{ item.a2aTaskId || item.taskId || '—' }}</span>
            </div>
          </div>
        </div>
        <div class="agent-drawer-actions">
          <button class="drawer-close" type="button" aria-label="关闭 Agent 输出" @click="emit('close')">
            <AppIcon name="x" />
          </button>
        </div>
      </header>

      <div class="agent-drawer-meta">
        <span>A2A 1.0</span><span class="sep">·</span>
        <span>{{ stateLabel }}</span><span class="sep">·</span>
        <span class="mono">{{ formatDuration(item.durationMs) }}</span>
        <span class="spacer"></span>
        <RouterLink
          v-if="item.taskId"
          class="text-link router-link"
          :to="{ name: 'tasks', query: { task: item.taskId } }"
        >
          查看任务
          <AppIcon name="arrow" />
        </RouterLink>
      </div>

      <div class="agent-stream">
        <p class="agent-stream-label">远程请求</p>
        <p class="agent-stream-text">{{ item.requestSummary || '—' }}</p>

        <template v-if="item.resultSummary">
          <p class="agent-stream-label" style="margin-top:20px">最终结果</p>
          <p class="agent-stream-text">{{ item.resultSummary }}</p>
        </template>

        <template v-if="item.artifactSummary">
          <p class="agent-stream-label" style="margin-top:20px">产出</p>
          <p class="agent-stream-text">{{ item.artifactSummary }}</p>
        </template>

        <p v-if="!item.resultSummary && !item.artifactSummary" class="agent-stream-text">
          该远程 Agent 尚未返回可展示的结果或 artifact。
        </p>

        <template v-if="item.error">
          <p class="agent-stream-label" style="margin-top:20px;color:var(--red)">错误</p>
          <p class="agent-stream-text" style="color:var(--red)">{{ item.error }}</p>
        </template>
      </div>

      <div class="agent-drawer-foot">
        <span>流式回放仅在 Agent 声明 streaming 时可用</span>
        <span class="spacer"></span>
        <span class="mono">{{ item.a2aTaskId || item.taskId || '' }}</span>
      </div>
    </aside>
  </Teleport>
</template>
