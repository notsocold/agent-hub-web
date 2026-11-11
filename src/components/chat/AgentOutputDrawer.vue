<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'

import { formatDuration } from '@/utils/format'
import type { A2aProcess } from '@/types'

const props = defineProps<{
  open: boolean
  item: A2aProcess | null
}>()

const emit = defineEmits<{
  close: []
}>()

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
    <div v-if="open" class="agent-scrim" @click="emit('close')"></div>
    <aside v-if="open && item" class="agent-drawer" aria-label="Agent 输出">
      <header class="agent-head">
        <div>
          <p class="eyebrow mono">AGENT OUTPUT</p>
          <h2>{{ item.agentName || item.agent }}</h2>
        </div>
        <button type="button" class="close" aria-label="关闭 Agent 输出" @click="emit('close')">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </header>

      <div class="agent-body">
        <dl class="facts">
          <div>
            <dt>任务状态</dt>
            <dd>{{ stateLabel }}</dd>
          </div>
          <div>
            <dt>耗时</dt>
            <dd class="mono">{{ formatDuration(item.durationMs) }}</dd>
          </div>
          <div>
            <dt>A2A 任务</dt>
            <dd class="mono ellipsis">{{ item.a2aTaskId || item.taskId || '—' }}</dd>
          </div>
        </dl>

        <section v-if="item.requestSummary" class="block">
          <h3>请求</h3>
          <p>{{ item.requestSummary }}</p>
        </section>

        <section v-if="item.resultSummary" class="block">
          <h3>最终结果</h3>
          <p>{{ item.resultSummary }}</p>
        </section>

        <section v-if="item.artifactSummary" class="block">
          <h3>产出</h3>
          <p>{{ item.artifactSummary }}</p>
        </section>

        <p v-if="!item.resultSummary && !item.artifactSummary" class="empty">
          该远程 Agent 尚未返回可展示的结果或 artifact。
        </p>

        <section v-if="item.error" class="block is-error">
          <h3>错误</h3>
          <p>{{ item.error }}</p>
        </section>

        <RouterLink
          v-if="item.taskId"
          class="task-link"
          :to="{ name: 'tasks', query: { task: item.taskId } }"
        >
          查看任务详情
        </RouterLink>
      </div>
    </aside>
  </Teleport>
</template>

<style scoped>
.agent-scrim {
  position: fixed;
  inset: 0;
  z-index: 70;
  background: rgba(20, 27, 32, 0.32);
}

.agent-drawer {
  position: fixed;
  inset: 0 0 0 auto;
  z-index: 80;
  display: flex;
  flex-direction: column;
  width: min(430px, 94vw);
  border-left: 1px solid var(--line);
  background: var(--paper);
  box-shadow: var(--shadow-lg);
}

.agent-head {
  display: flex;
  flex: none;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 18px 18px 12px;
  border-bottom: 1px solid var(--line);
}

.eyebrow {
  margin-bottom: 5px;
  color: var(--kind-a2a);
  font-size: 9px;
  letter-spacing: 0.12em;
}

h2 {
  overflow: hidden;
  font-size: 16px;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.close {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  flex: none;
  border-radius: 5px;
  color: var(--ink-3);
}

.close:hover {
  background: var(--surface-2);
  color: var(--ink);
}

.close svg {
  width: 15px;
  height: 15px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.7;
  stroke-linecap: round;
}

.agent-body {
  flex: 1;
  min-height: 0;
  padding: 16px 18px 24px;
  overflow-y: auto;
}

.facts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px 12px;
  margin: 0 0 16px;
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
}

.facts dt {
  color: var(--ink-3);
  font-size: 9.5px;
}

.facts dd {
  margin: 2px 0 0;
  color: var(--ink-2);
  font-size: 11.5px;
}

.block {
  margin-top: 14px;
}

.block h3 {
  margin-bottom: 5px;
  color: var(--ink-3);
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.03em;
}

.block p {
  margin: 0;
  color: var(--ink-2);
  font-size: 12.5px;
  line-height: 1.7;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.block.is-error p {
  color: var(--red);
}

.empty {
  margin: 14px 0;
  color: var(--ink-3);
  font-size: 12px;
  line-height: 1.7;
}

.task-link {
  display: inline-block;
  margin-top: 18px;
  color: var(--prussian);
  font-size: 12px;
  font-weight: 600;
}

.task-link:hover {
  text-decoration: underline;
}

.ellipsis {
  display: inline-block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: bottom;
}
</style>
