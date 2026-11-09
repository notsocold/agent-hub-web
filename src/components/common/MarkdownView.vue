<script setup lang="ts">
import { computed } from 'vue'

import { renderMarkdown } from '@/utils/markdown'

const props = defineProps<{
  content: string
}>()

const html = computed(() => renderMarkdown(props.content))
</script>

<template>
  <!-- 内容已由 DOMPurify 清洗，此处仅渲染安全 HTML。 -->
  <div class="markdown" v-html="html"></div>
</template>

<style scoped>
.markdown {
  font-size: 14px;
  line-height: 1.75;
  color: var(--ink);
  overflow-wrap: anywhere;
}
</style>
