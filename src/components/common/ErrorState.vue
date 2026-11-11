<script setup lang="ts">
import { ElMessage } from 'element-plus'

const props = withDefaults(
  defineProps<{
    message: string
    /** 错误码（error.code），用于排障与区分业务语义。 */
    code?: string
    /** 后端错误信封里的 request_id；有值时展示并允许复制。 */
    requestId?: string
    /** 后端标记不可重试时隐藏重试按钮（如 4xx 业务错误）。 */
    retryable?: boolean
  }>(),
  // Vue 的 Boolean prop 缺省会被转成 false，这里显式默认 true。
  { retryable: true },
)

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
      <p v-if="code || requestId" class="request">
        <span v-if="code" class="mono code">{{ code }}</span>
        <span v-if="requestId" class="mono">request_id: {{ requestId }}</span>
        <button
          v-if="requestId"
          type="button"
          class="copy"
          aria-label="复制 request_id"
          @click="copyRequestId"
        >
          复制
        </button>
      </p>
    </div>
    <button v-if="retryable !== false" type="button" class="retry" @click="emit('retry')">
      重试
    </button>
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

.code {
  flex: none;
  padding: 1px 6px;
  border-radius: 4px;
  background: color-mix(in srgb, var(--red) 10%, transparent);
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
