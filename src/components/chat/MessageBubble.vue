<script setup lang="ts">
import { computed } from 'vue'
import { ElMessage } from 'element-plus'

import MarkdownView from '@/components/common/MarkdownView.vue'
import ThinkingCard from './cards/ThinkingCard.vue'
import { attachmentsApi } from '@/api/attachments'
import { formatBytes, formatTokens } from '@/utils/format'
import type { ChatMessageView, MessageAttachment } from '@/types'

const props = defineProps<{
  message: ChatMessageView
}>()

const isUser = computed(() => props.message.role === 'user')

const capabilityLabel = computed(() => {
  const parts: string[] = []
  const skills = props.message.capabilities.skills.length
  const servers = props.message.capabilities.mcp_servers.length
  const tools = props.message.capabilities.mcp_tools.length
  if (skills > 0) parts.push(`技能 ×${skills}`)
  if (servers > 0) parts.push(`MCP ×${servers}`)
  if (tools > 0) parts.push(`工具 ×${tools}`)
  return parts.join(' · ')
})

async function downloadAttachment(attachment: MessageAttachment): Promise<void> {
  try {
    const blob = await attachmentsApi.download(attachment.id)
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = attachment.filename
    link.click()
    URL.revokeObjectURL(url)
  } catch (cause) {
    ElMessage.error(cause instanceof Error ? cause.message : '下载附件失败')
  }
}

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

    <div v-if="isUser && (message.attachments.length > 0 || capabilityLabel)" class="user-context">
      <button
        v-for="attachment in message.attachments"
        :key="attachment.id"
        type="button"
        class="ctx-chip is-attachment"
        :title="`下载 ${attachment.filename}`"
        @click="downloadAttachment(attachment)"
      >
        <span class="ctx-chip-kind">附件</span>
        <span class="ctx-chip-name">{{ attachment.filename }}</span>
        <span class="ctx-chip-meta mono">{{ formatBytes(attachment.size_bytes) }}</span>
      </button>
      <span v-if="capabilityLabel" class="ctx-chip is-capability">
        <span class="ctx-chip-kind">本轮</span>
        <span class="ctx-chip-name">{{ capabilityLabel }}</span>
      </span>
    </div>

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
            <a
              v-if="artifact.download_url"
              class="text-btn"
              :href="artifact.download_url"
              target="_blank"
              rel="noopener noreferrer"
            >
              下载
            </a>
            <button
              v-else
              type="button"
              class="text-btn"
              disabled
              title="受控下载端点将在 M1.5 提供"
            >
              下载
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

.user-context {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 5px;
  max-width: min(680px, 86%);
  margin-top: 5px;
}

.ctx-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  max-width: 260px;
  padding: 2px 7px;
  border: 1px solid var(--line-2);
  border-radius: 5px;
  background: var(--surface-2);
  color: var(--ink-3);
  font-size: 10px;
}

.ctx-chip.is-attachment {
  border-color: var(--kind-vector);
  background: var(--kind-vector-soft);
  color: var(--kind-vector);
  cursor: pointer;
}

.ctx-chip.is-attachment:hover {
  filter: brightness(0.98);
}

.ctx-chip-kind {
  font-size: 8.5px;
  opacity: 0.8;
}

.ctx-chip-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ctx-chip-meta {
  font-size: 8.5px;
  opacity: 0.8;
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

.text-btn:hover:not(:disabled) {
  color: var(--ink);
  text-decoration: underline;
}

.text-btn:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}
</style>
