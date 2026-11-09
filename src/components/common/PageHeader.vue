<script setup lang="ts">
defineProps<{
  title: string
  description?: string
  eyebrow?: string
}>()
</script>

<template>
  <header class="page-head">
    <div class="heading">
      <p v-if="eyebrow" class="eyebrow mono">{{ eyebrow }}</p>
      <h1>{{ title }}</h1>
      <p v-if="description" class="sub">{{ description }}</p>
    </div>
    <div class="actions">
      <slot name="actions" />
    </div>
  </header>
</template>

<style scoped>
.page-head {
  display: flex;
  flex: none;
  align-items: flex-end;
  justify-content: space-between;
  gap: 20px;
}

.eyebrow {
  margin-bottom: 7px;
  color: var(--amber-text);
  font-size: 9.5px;
  letter-spacing: 0.13em;
}

h1 {
  font-size: 24px;
  font-weight: 650;
  letter-spacing: -0.022em;
  line-height: 1.2;
}

.sub {
  max-width: 640px;
  margin-top: 6px;
  color: var(--ink-3);
  font-size: 12.5px;
  line-height: 1.65;
}

.actions {
  display: flex;
  flex: none;
  align-items: center;
  gap: 8px;
}

@media (max-width: 700px) {
  .page-head {
    align-items: flex-start;
    flex-direction: column;
    gap: 10px;
  }
}
</style>
