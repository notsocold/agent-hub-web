<script setup lang="ts">
import { ElMessage } from 'element-plus'

const props = defineProps<{
  message: string
  /** 后端错误信封里的 request_id；有值时展示并允许复制。 */
  requestId?: string
}>()

const emit = defineEmits<{
  retry: []
}>()

async function copyRequestId(): Promise<void> {
  if (!props.requestId) return
  try {
    await navigator.clipboard.writeText(props.requestId)
    ElMessage.success('已复制 request_id')
  } catch {
    ElMessage.warning('复制失败，请手动选中 request_id 后复制')
  }
}
</script>

<template>
  <div class="error-state" role="alert">
    <div class="body">
      <p>{{ message }}</p>
      <p v-if="requestId" class="request">
        <span class="mono">request_id: {{ requestId }}</span>
        <button type="button" class="copy" aria-label="复制 request_id" @click="copyRequestId">
          复制
        </button>
      </p>
    </div>
    <button type="button" class="retry" @click="emit('retry')">重试</button>
  </div>
</template>

<style scoped>
.error-state {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 14px;
  border: 1px solid var(--red-soft);
  border-radius: 8px;
  background: var(--red-soft);
  color: var(--red);
  font-size: 12px;
}

.body {
  min-width: 0;
}

.request {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
  color: var(--ink-3);
  font-size: 11px;
}

.mono {
  font-family: var(--mono);
  overflow-wrap: anywhere;
}

.copy {
  flex: none;
  padding: 2px 8px;
  border: 1px solid var(--line);
  border-radius: 4px;
  background: transparent;
  color: var(--ink-2);
  font-size: 11px;
}

.copy:hover {
  color: var(--ink);
}

.retry {
  flex: none;
  padding: 4px 11px;
  border: 1px solid var(--red);
  border-radius: 5px;
  color: var(--red);
  font-size: 11.5px;
}

.retry:hover {
  background: color-mix(in srgb, var(--red) 8%, transparent);
}
</style>
