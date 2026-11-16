<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue'

import AppIcon from '@/components/common/AppIcon.vue'
import RunTracePanel from './RunTracePanel.vue'
import type { ProcessItem, Usage } from '@/types'

const props = defineProps<{
  open: boolean
  items: ProcessItem[]
  runId: string | null
  streaming: boolean
  usage: Usage | null
  finishReason: string | null
  conversationTitle: string
}>()

const emit = defineEmits<{
  close: []
}>()

const closeButton = ref<HTMLButtonElement | null>(null)

function onKeydown(event: KeyboardEvent): void {
  if (!props.open || event.key !== 'Escape') return
  event.stopPropagation()
  emit('close')
}

watch(
  () => props.open,
  async (open) => {
    if (!open) return
    await nextTick()
    closeButton.value?.focus()
  },
  { immediate: true },
)

onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="run-scrim is-open" @click="emit('close')"></div>
    <aside
      v-if="open"
      class="run-drawer is-open"
      role="dialog"
      aria-modal="true"
      aria-labelledby="run-trace-title"
    >
      <header class="run-head">
        <div class="run-head-main">
          <div class="run-title-row">
            <h2 id="run-trace-title">运行事件</h2>
            <span class="tag mono">{{ runId ? runId.slice(0, 8) : '—' }}</span>
          </div>
          <div class="run-sub">
            <span>{{ conversationTitle || '未命名会话' }}</span>
            <span class="sep">·</span>
            <span>{{ streaming ? '运行中' : '已结束' }}</span>
            <span class="sep">·</span>
            <span class="mono">{{ items.length }} 步</span>
          </div>
        </div>
        <button
          ref="closeButton"
          class="drawer-close"
          type="button"
          aria-label="关闭运行事件"
          @click="emit('close')"
        >
          <AppIcon name="x" />
        </button>
      </header>

      <RunTracePanel
        :items="items"
        :run-id="runId"
        :streaming="streaming"
        :usage="usage"
        :finish-reason="finishReason"
        :conversation-title="conversationTitle"
        mode="drawer"
      />
    </aside>
  </Teleport>
</template>
