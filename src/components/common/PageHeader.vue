<script setup lang="ts">
defineProps<{
  title: string
  description?: string
  /** 兼容旧调用：原型页头不再显示 eyebrow，保留 prop 以免调用处改动。 */
  eyebrow?: string
}>()
</script>

<template>
  <header class="page-head">
    <div class="page-heading">
      <h1 class="page-title">{{ title }}</h1>
      <p v-if="description" class="page-sub">{{ description }}</p>
    </div>
    <div class="page-actions">
      <slot name="actions" />
    </div>
  </header>
</template>
