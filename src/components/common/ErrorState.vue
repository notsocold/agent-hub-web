<script setup lang="ts">
defineProps<{
  message: string
}>()

const emit = defineEmits<{
  retry: []
}>()
</script>

<template>
  <div class="error-state" role="alert">
    <p>{{ message }}</p>
    <button type="button" class="retry" @click="emit('retry')">重试</button>
  </div>
</template>

<style scoped>
.error-state {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 14px;
  border: 1px solid var(--red-soft);
  border-radius: 8px;
  background: var(--red-soft);
  color: var(--red);
  font-size: 12px;
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
