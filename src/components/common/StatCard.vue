<script setup lang="ts">
withDefaults(
  defineProps<{
    label: string
    value: string | number
    hint?: string
    tone?: 'default' | 'ok' | 'warn' | 'error'
  }>(),
  { tone: 'default' },
)
</script>

<template>
  <div class="stat" :class="`tone-${tone}`">
    <span class="stat-value mono">{{ value }}</span>
    <span class="stat-label">
      {{ label }}
      <template v-if="hint"> · {{ hint }}</template>
    </span>
  </div>
</template>

<style scoped>
.tone-ok .stat-value {
  color: var(--green);
}

.tone-warn .stat-value {
  color: var(--amber-text);
}

.tone-error .stat-value {
  color: var(--red);
}
</style>
