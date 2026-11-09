<script setup lang="ts">
import { computed } from 'vue'
import { ElMessage } from 'element-plus'

import MarkdownView from '@/components/common/MarkdownView.vue'
import ThinkingCard from './cards/ThinkingCard.vue'
import { formatTokens } from '@/utils/format'
import type { ChatMessageView } from '@/types'

const props = defineProps<{
  message: ChatMessageView
}>()

const isUser = computed(() => props.message.role === 'user')

const tokenLabel = computed(() => {
  const usage = props.message.usage
  if (!usage) return ''
  const total = usage.total_tokens ?? usage.input_tokens + usage.output_tokens
  return `${formatTokens(total)} tokens`
})

async function copy(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
    ElMessage.success('已复制')
  } catch {
    ElMessage.error('复制失败，请手动选择内容')
  }
}
</script>

<template>
  <article class="turn" :class="`role-${message.role}`">
    <div v-if="isUser" class="user-bubble">{{ message.content }}</div>

    <div v-else class="assistant">
      <ThinkingCard
        v-if="message.reasoning"
        :reasoning="message.reasoning"
        :streaming="message.streaming"
      />

      <div class="response">
        <MarkdownView :content="message.content" />
        <span v-if="message.streaming" class="cursor" aria-hidden="true"></span>

        <p v-if="message.status === 'failed' && message.error" class="error">
          生成失败：{{ message.error.message }}
        </p>
        <p v-else-if="message.status === 'canceled'" class="canceled">已停止生成。</p>

        <div v-if="message.citations.length" class="citations">
          <p class="block-label">引用来源</p>
          <ol>
            <li v-for="citation in message.citations" :key="citation.chunk_id">
              <RouterLink :to="{ name: 'knowledge', query: { q: citation.title } }">
                <span class="index mono">[{{ citation.index }}]</span>
                <span class="citation-title">{{ citation.title }}</span>
                <span class="citation-meta"
                  >{{ citation.category }} · {{ citation.score.toFixed(2) }}</span
                >
              </RouterLink>
            </li>
          </ol>
        </div>

        <div v-if="message.artifacts.length" class="artifacts">
          <p class="block-label">产物</p>
          <div v-for="artifact in message.artifacts" :key="artifact.id" class="artifact">
            <span class="artifact-name">{{ artifact.name }}</span>
            <button
              v-if="artifact.content"
              type="button"
              class="text-btn"
              @click="copy(artifact.content)"
            >
              复制
            </button>
          </div>
        </div>

        <footer class="meta">
          <span v-if="tokenLabel" class="mono">{{ tokenLabel }}</span>
          <button type="button" class="text-btn" @click="copy(message.content)">复制</button>
        </footer>
      </div>
    </div>
  </article>
</template>

<style scoped>
.turn {
  display: flex;
  flex-direction: column;
  margin-bottom: 22px;
}

.turn.role-user {
  align-items: flex-end;
}

.user-bubble {
  max-width: min(680px, 86%);
  padding: 10px 14px;
  border: 1px solid var(--user-bubble-border);
  border-radius: 12px 12px 3px 12px;
  background: var(--user-bubble-bg);
  color: var(--user-bubble-fg);
  font-size: 13.5px;
  line-height: 1.7;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.assistant {
  width: 100%;
  max-width: var(--content-max);
}

.response {
  position: relative;
}

.cursor {
  display: inline-block;
  width: 7px;
  height: 15px;
  margin-left: 2px;
  border-radius: 2px;
  background: var(--prussian);
  vertical-align: -2px;
  animation: pulse 1s ease-in-out infinite;
}

.error {
  margin-top: 10px;
  padding: 8px 11px;
  border: 1px solid var(--red-soft);
  border-radius: 6px;
  background: var(--red-soft);
  color: var(--red);
  font-size: 12px;
}

.canceled {
  margin-top: 8px;
  color: var(--ink-3);
  font-size: 11.5px;
}

.citations,
.artifacts {
  margin-top: 14px;
  padding-top: 10px;
  border-top: 1px solid var(--line-2);
}

.block-label {
  margin-bottom: 6px;
  color: var(--ink-3);
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.03em;
}

.citations ol {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.citations a {
  display: flex;
  align-items: baseline;
  gap: 7px;
  padding: 3px 0;
  font-size: 11.5px;
}

.citations a:hover .citation-title {
  text-decoration: underline;
}

.index {
  color: var(--prussian);
  font-size: 10px;
}

.citation-title {
  color: var(--ink-2);
}

.citation-meta {
  color: var(--ink-3);
  font-size: 10px;
}

.artifact {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11.5px;
}

.artifact-name {
  color: var(--ink-2);
}

.meta {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 10px;
  color: var(--ink-3);
  font-size: 10px;
  opacity: 0;
  transition: opacity 0.12s;
}

.response:hover .meta,
.meta:focus-within {
  opacity: 1;
}

.text-btn {
  color: var(--ink-3);
  font-size: 10.5px;
}

.text-btn:hover {
  color: var(--ink);
  text-decoration: underline;
}
</style>
