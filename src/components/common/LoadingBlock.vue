<script setup lang="ts">
withDefaults(
  defineProps<{
    label?: string
  }>(),
  { label: '正在加载…' },
)
</script>

<template>
  <div class="loading">
    <span class="spinner" aria-hidden="true"></span>
    <span>{{ label }}</span>
  </div>
</template>

<style scoped>
.loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  padding: 40px 20px;
  color: var(--ink-3);
  font-size: 12px;
}

.spinner {
  width: 14px;
  height: 14px;
  border: 2px solid var(--line);
  border-top-color: var(--prussian);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
</style>
