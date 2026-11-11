<script setup lang="ts">
withDefaults(
  defineProps<{
    title?: string
    description?: string
    size?: 'sm' | 'md' | 'lg'
  }>(),
  { size: 'md' },
)
</script>

<template>
  <div class="empty" :class="`size-${size}`">
    <div v-if="$slots.icon" class="empty-icon">
      <slot name="icon" />
    </div>
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
  color: var(--ink-3);
  text-align: center;
}

.empty-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--ink-3);
  font-size: 24px;
  line-height: 1;
}

.empty-title {
  color: var(--ink-2);
  font-weight: 550;
}

.empty-desc {
  max-width: 420px;
  line-height: 1.7;
}

/* 尺寸仅影响留白与字号，保持三种状态的布局骨架一致。 */
.size-sm {
  gap: 4px;
  padding: 20px 14px;
}

.size-sm .empty-icon {
  font-size: 20px;
}

.size-sm .empty-title {
  font-size: 12.5px;
}

.size-sm .empty-desc {
  max-width: 340px;
  font-size: 11px;
}

.size-md {
  padding: 36px 20px;
}

.size-md .empty-title {
  font-size: 13px;
}

.size-md .empty-desc {
  font-size: 11.5px;
}

.size-lg {
  gap: 8px;
  padding: 52px 24px;
}

.size-lg .empty-icon {
  font-size: 30px;
}

.size-lg .empty-title {
  font-size: 15px;
}

.size-lg .empty-desc {
  max-width: 480px;
  font-size: 12.5px;
}
</style>
