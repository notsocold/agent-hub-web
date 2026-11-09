<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  tone: 'ok' | 'warn' | 'error' | 'muted' | 'live'
  label: string
}>()

const dotClass = computed(
  () =>
    ({
      ok: 'is-ok',
      warn: 'is-warn',
      error: 'is-warn',
      muted: '',
      live: 'is-live',
    })[props.tone],
)
</script>

<template>
  <span class="badge" :class="`tone-${tone}`">
    <span class="dot" :class="dotClass"></span>
    {{ label }}
  </span>
</template>

<style scoped>
.badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 7px;
  border: 1px solid var(--line);
  border-radius: 99px;
  background: var(--surface);
  color: var(--ink-2);
  font-size: 10.5px;
  white-space: nowrap;
}

.badge .dot {
  width: 5px;
  height: 5px;
}

.tone-ok {
  color: var(--green);
  border-color: var(--green-soft);
  background: var(--green-soft);
}

.tone-warn {
  color: var(--amber-text);
  border-color: var(--amber-soft);
  background: var(--amber-soft);
}

.tone-error {
  color: var(--red);
  border-color: var(--red-soft);
  background: var(--red-soft);
}

.tone-live {
  color: var(--prussian);
  border-color: var(--prussian-soft);
  background: var(--prussian-soft);
}
</style>
