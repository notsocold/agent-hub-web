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
    <p class="label">{{ label }}</p>
    <p class="value mono">{{ value }}</p>
    <p v-if="hint" class="hint">{{ hint }}</p>
  </div>
</template>

<style scoped>
.stat {
  padding: 12px 14px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
  box-shadow: var(--shadow-sm);
}

.label {
  color: var(--ink-3);
  font-size: 10.5px;
  letter-spacing: 0.02em;
}

.value {
  margin-top: 4px;
  color: var(--ink);
  font-size: 22px;
  font-weight: 650;
  letter-spacing: -0.02em;
  line-height: 1.2;
}

.hint {
  margin-top: 4px;
  color: var(--ink-3);
  font-size: 10px;
}

.tone-ok .value {
  color: var(--green);
}

.tone-warn .value {
  color: var(--amber-text);
}

.tone-error .value {
  color: var(--red);
}
</style>
