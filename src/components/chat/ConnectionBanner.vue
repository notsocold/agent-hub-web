<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'

import type { ChatConnection } from '@/stores/chat'
import { MAX_RECONNECT_ATTEMPTS } from '@/utils/retry'

const props = withDefaults(
  defineProps<{
    connection: ChatConnection
    attempt: number
    maxAttempts?: number
  }>(),
  { maxAttempts: MAX_RECONNECT_ATTEMPTS },
)

const emit = defineEmits<{
  stop: []
  retry: []
}>()

const online = ref(typeof navigator === 'undefined' ? true : navigator.onLine)

function onOnline(): void {
  online.value = true
}

function onOffline(): void {
  online.value = false
}

onMounted(() => {
  window.addEventListener('online', onOnline)
  window.addEventListener('offline', onOffline)
})

onUnmounted(() => {
  window.removeEventListener('online', onOnline)
  window.removeEventListener('offline', onOffline)
})

const visible = computed(
  () => props.connection === 'reconnecting' || props.connection === 'degraded',
)

/** online 事件立即重试时计数可能还是 0，展示时至少算第 1 次。 */
const displayAttempt = computed(() => Math.max(1, props.attempt))

const text = computed(() => {
  if (props.connection === 'reconnecting') {
    if (!online.value) return '网络已断开，恢复后自动重连'
    return `连接中断，正在重新连接（第 ${displayAttempt.value}/${props.maxAttempts} 次）`
  }
  return '连接已断开，正在通过轮询恢复'
})
</script>

<template>
  <div
    v-if="visible"
    class="connection-banner"
    :class="`is-${connection}`"
    role="status"
    aria-live="polite"
  >
    <span class="text">{{ text }}</span>
    <div class="actions">
      <button v-if="connection === 'reconnecting'" type="button" class="action" @click="emit('stop')">
        停止重连
      </button>
      <button v-else type="button" class="action" @click="emit('retry')">重新连接</button>
    </div>
  </div>
</template>

<style scoped>
.connection-banner {
  display: flex;
  flex: none;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin: 10px 32px 0;
  padding: 9px 12px;
  border: 1px solid var(--amber-soft);
  border-radius: 8px;
  background: var(--amber-soft);
  color: var(--amber-text);
  font-size: 11.5px;
}

.connection-banner.is-degraded {
  border-color: var(--line);
  background: var(--surface-2);
  color: var(--ink-2);
}

.text {
  min-width: 0;
}

.action {
  flex: none;
  padding: 3px 10px;
  border: 1px solid currentcolor;
  border-radius: 5px;
  background: transparent;
  color: inherit;
  font-size: 11px;
}

.action:hover {
  background: color-mix(in srgb, currentcolor 8%, transparent);
}
</style>
