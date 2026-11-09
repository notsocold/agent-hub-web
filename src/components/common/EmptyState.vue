<script setup lang="ts">
defineProps<{
  title?: string
  description?: string
}>()
</script>

<template>
  <div class="empty">
    <p class="empty-title">{{ title ?? '暂无数据' }}</p>
    <p v-if="description" class="empty-desc">{{ description }}</p>
    <slot name="action" />
  </div>
</template>

<style scoped>
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 36px 20px;
  color: var(--ink-3);
  text-align: center;
}

.empty-title {
  color: var(--ink-2);
  font-size: 13px;
  font-weight: 550;
}

.empty-desc {
  max-width: 420px;
  font-size: 11.5px;
  line-height: 1.7;
}
</style>
