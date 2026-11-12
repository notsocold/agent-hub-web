<script setup lang="ts">
defineProps<{
  /** 后端能力开关（system.capabilities.*）。 */
  enabled: boolean
  name: string
  hint?: string
}>()
</script>

<template>
  <div v-if="!enabled" class="empty-state gate" role="status">
    <p class="gate-title">「{{ name }}」能力未启用</p>
    <p class="gate-desc">{{ hint ?? '后端尚未开启该能力，相关操作暂不可用。' }}</p>
  </div>
  <slot v-else />
</template>

<style scoped>
.gate {
  margin-top: 10px;
  padding: 18px 12px;
  border: 1px dashed var(--line);
  border-bottom: 1px dashed var(--line);
  border-radius: 6px;
  background: var(--surface-2);
}

.gate-title {
  color: var(--ink-2);
  font-size: 12px;
  font-weight: 600;
}

.gate-desc {
  margin-top: 4px;
  font-size: 11px;
  line-height: 1.65;
}
</style>
