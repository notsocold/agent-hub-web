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
    :args="item.code"
  >
    <p class="proc-desc">{{ item.message }}</p>
  </ProcessCardShell>
</template>
