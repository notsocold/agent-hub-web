<script setup lang="ts">
withDefaults(defineProps<{ name: string; size?: number }>(), { size: 0 })
</script>

<template>
  <svg
    class="ic"
    viewBox="0 0 24 24"
    aria-hidden="true"
    :style="size ? { width: `${size}px`, height: `${size}px` } : undefined"
  >
    <use :href="`#i-${name}`" />
  </svg>
</template>
