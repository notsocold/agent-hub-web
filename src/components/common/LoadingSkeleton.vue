<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    variant?: 'list' | 'card' | 'text'
    count?: number
  }>(),
  { variant: 'list', count: 4 },
)

// 允许 count=0（只保留读屏状态），负数/小数做一次归一化。
const rows = computed(() => Math.max(0, Math.floor(props.count)))
</script>

<template>
  <div class="loading-skeleton" role="status" aria-live="polite" aria-label="正在加载">
    <span class="sr-only">正在加载</span>
    <div class="skeleton" :class="`skeleton-${variant}`" aria-hidden="true">
      <div v-for="row in rows" :key="row" class="skeleton-item">
        <template v-if="variant === 'list'">
          <span class="skeleton-avatar" />
          <span class="skeleton-lines">
            <span class="skeleton-line line-title" />
            <span class="skeleton-line line-wide" />
          </span>
        </template>
        <template v-else-if="variant === 'card'">
          <span class="skeleton-line line-title" />
          <span class="skeleton-line line-wide" />
          <span class="skeleton-line line-medium" />
        </template>
        <span v-else class="skeleton-line line-wide" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.loading-skeleton {
  width: 100%;
}

.skeleton {
  display: flex;
  flex-direction: column;
  width: 100%;
}

.skeleton-line,
.skeleton-avatar {
  display: block;
  border-radius: 4px;
  background-color: var(--surface-2);
  background-image: linear-gradient(
    90deg,
    var(--surface-2) 25%,
    var(--line) 50%,
    var(--surface-2) 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.4s ease-in-out infinite;
}

.skeleton-avatar {
  flex: none;
  width: 30px;
  height: 30px;
  border-radius: 50%;
}

.skeleton-line {
  height: 9px;
}

.line-title {
  width: 38%;
}

.line-wide {
  width: 82%;
}

.line-medium {
  width: 64%;
}

/* list：适合表格/列表页首屏，每行模拟一条记录。 */
.skeleton-list {
  gap: 10px;
}

.skeleton-list .skeleton-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px;
  border: 1px solid var(--line-2);
  border-radius: 8px;
  background: var(--surface);
}

.skeleton-list .skeleton-lines {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

/* card：适合抽屉/详情首屏，模拟标题与正文块。 */
.skeleton-card {
  gap: 12px;
}

.skeleton-card .skeleton-item {
  display: flex;
  flex-direction: column;
  gap: 9px;
  padding: 16px;
  border: 1px solid var(--line-2);
  border-radius: 8px;
  background: var(--surface);
}

/* text：适合表单/指令等纯文本区域，每行即一条文本占位。 */
.skeleton-text {
  gap: 10px;
  padding: 4px 0;
}

.skeleton-text .skeleton-line {
  height: 11px;
}

@media (prefers-reduced-motion: reduce) {
  .skeleton-line,
  .skeleton-avatar {
    animation: none;
  }
}

@keyframes shimmer {
  0% {
    background-position: 200% 0;
  }

  100% {
    background-position: -200% 0;
  }
}
</style>
