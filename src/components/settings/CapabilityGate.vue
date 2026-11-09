<script setup lang="ts">
defineProps<{
  /** 后端能力开关（system.capabilities.*）。 */
  enabled: boolean
  name: string
  hint?: string
}>()
</script>

<template>
  <div v-if="!enabled" class="gate" role="status">
    <p class="gate-title">「{{ name }}」能力未启用</p>
    <p class="gate-desc">{{ hint ?? '后端尚未开启该能力，相关操作暂不可用。' }}</p>
  </div>
  <slot v-else />
</template>

<style scoped>
.gate {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 14px 16px;
  border: 1px dashed var(--line);
  border-radius: 8px;
  background: var(--surface-2);
  color: var(--ink-3);
}

.gate-title {
  color: var(--ink-2);
  font-size: 12.5px;
  font-weight: 600;
}

.gate-desc {
  font-size: 11.5px;
  line-height: 1.65;
}
</style>
