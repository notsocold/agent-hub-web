<script setup lang="ts">
import ProcessCardShell from './ProcessCardShell.vue'
import type { NoticeProcess } from '@/types'

defineProps<{
  item: NoticeProcess
}>()
</script>

<template>
  <ProcessCardShell
    kind="notice"
    :title="item.code === 'memory_saved' ? '已保存记忆' : '运行提示'"
    :status="item.status"
  >
    <p class="line">{{ item.message }}</p>
  </ProcessCardShell>
</template>

<style scoped>
.line {
  margin: 0;
}
</style>
