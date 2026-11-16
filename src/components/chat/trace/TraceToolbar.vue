<script setup lang="ts">
import { computed } from 'vue'

import AppIcon from '@/components/common/AppIcon.vue'
import { TRACE_KINDS, TRACE_KIND_LABELS, type TraceFilter } from '@/utils/trace'

const props = defineProps<{
  counts: Record<TraceFilter, number>
  kind: TraceFilter
  query: string
}>()

const emit = defineEmits<{
  'update:kind': [kind: TraceFilter]
  'update:query': [query: string]
  'expand-all': []
  'collapse-all': []
}>()

const filters = computed<Array<{ value: TraceFilter; label: string; count: number }>>(() => [
  { value: 'all', label: '全部', count: props.counts.all },
  ...TRACE_KINDS.map((kind) => ({
    value: kind,
    label: TRACE_KIND_LABELS[kind],
    count: props.counts[kind],
  })),
])

function onSearchInput(event: Event): void {
  emit('update:query', (event.target as HTMLInputElement).value)
}

function clearSearch(): void {
  emit('update:query', '')
}
</script>

<template>
  <div class="traj-toolbar trace-toolbar" role="toolbar" aria-label="运行事件工具栏">
    <div class="traj-filters trace-filters" role="group" aria-label="按事件类型筛选">
      <button
        v-for="filter in filters"
        :key="`filter-${filter.value}`"
        type="button"
        :class="{ 'is-active': kind === filter.value }"
        :aria-pressed="kind === filter.value"
        :data-filter="filter.value"
        @click="emit('update:kind', filter.value)"
      >
        {{ filter.label }} <span>{{ filter.count }}</span>
      </button>
    </div>

    <div class="traj-search trace-search">
      <AppIcon name="search" />
      <input
        id="trace-search-input"
        type="search"
        :value="query"
        placeholder="搜索标题、事件或错误"
        aria-label="搜索运行事件"
        autocomplete="off"
        @input="onSearchInput"
        @keydown.esc="clearSearch"
      />
      <button
        v-if="query"
        type="button"
        class="trace-search-clear"
        aria-label="清除搜索"
        @click="clearSearch"
      >
        <AppIcon name="x" />
      </button>
    </div>

    <div class="trace-expand-actions" role="group" aria-label="展开状态">
      <button class="traj-toggle" type="button" @click="emit('expand-all')">全部展开</button>
      <button class="traj-toggle" type="button" @click="emit('collapse-all')">全部折叠</button>
    </div>
  </div>
</template>

<style scoped>
.trace-toolbar {
  position: sticky;
  top: 0;
  z-index: 2;
}

.trace-filters button {
  white-space: nowrap;
}

.trace-search {
  min-width: 190px;
}

.trace-search-clear {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  padding: 0;
  border: 0;
  border-radius: 3px;
  background: transparent;
  color: var(--ink-3);
  cursor: pointer;
}

.trace-search-clear:hover {
  background: var(--surface-2);
  color: var(--ink);
}

.trace-search-clear .ic {
  width: 11px;
  height: 11px;
}

.trace-expand-actions {
  display: inline-flex;
  gap: 6px;
  margin-left: auto;
}

@media (max-width: 760px) {
  .trace-search {
    flex: 1;
  }

  .trace-expand-actions {
    margin-left: 0;
  }
}
</style>
