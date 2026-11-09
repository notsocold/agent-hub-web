<script setup lang="ts">
defineProps<{
  title: string
  description?: string
}>()
</script>

<template>
  <section class="placeholder-page">
    <header class="placeholder-head">
      <h1>{{ title }}</h1>
      <p v-if="description">{{ description }}</p>
    </header>
    <div class="placeholder-body">
      <slot>
        <p>页面骨架已就绪，数据接入将在后续里程碑完成。</p>
      </slot>
    </div>
  </section>
</template>

<style scoped>
.placeholder-page {
  display: flex;
  flex-direction: column;
  gap: 20px;
  height: 100%;
  padding: 28px 32px;
  overflow: auto;
}

h1 {
  font-size: 24px;
  font-weight: 650;
  letter-spacing: -0.022em;
}

.placeholder-head p {
  margin-top: 6px;
  color: var(--ink-3);
  font-size: 13px;
}

.placeholder-body {
  display: grid;
  place-items: center;
  flex: 1;
  min-height: 240px;
  border: 1px dashed var(--line);
  border-radius: 10px;
  background: var(--surface);
  color: var(--ink-3);
  font-size: 13px;
}
</style>
