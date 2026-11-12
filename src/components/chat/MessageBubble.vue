<script setup lang="ts">
import { computed } from 'vue'
import { ElMessage } from 'element-plus'

import AppIcon from '@/components/common/AppIcon.vue'
import MarkdownView from '@/components/common/MarkdownView.vue'
import ThinkingCard from './cards/ThinkingCard.vue'
import { attachmentsApi } from '@/api/attachments'
import { formatBytes, formatClock, formatTokens } from '@/utils/format'
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
  const categories = props.message.capabilities.knowledge_categories
  if (categories.length > 0) parts.push(`知识库 ${categories.join('/')}`)
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
  <article v-if="isUser" class="user-turn">
    <div class="user-meta">
      <span>你</span>
      <span class="meta-sep">·</span>
      <time>{{ formatClock(message.created_at) }}</time>
      <template v-if="capabilityLabel">
        <span class="meta-sep">·</span>
        <span>{{ capabilityLabel }}</span>
      </template>
    </div>
    <div class="prompt-bubble">
      <p>{{ message.content }}</p>
      <div v-if="message.attachments.length > 0" class="attachments">
        <button
          v-for="attachment in message.attachments"
          :key="attachment.id"
          type="button"
          class="attach"
          :title="`下载 ${attachment.filename}`"
          @click="downloadAttachment(attachment)"
        >
          <AppIcon name="clip" />
          {{ attachment.filename }}
          <span class="mono">{{ formatBytes(attachment.size_bytes) }}</span>
        </button>
      </div>
    </div>
  </article>

  <article v-else class="entry entry-assistant is-main-node">
    <span class="node" aria-hidden="true"></span>
    <div class="entry-head">
      <span class="who">main-agent</span>
      <span class="who-sub">{{ message.streaming ? '生成中' : '回复' }}</span>
      <span class="spacer"></span>
      <button class="copy-btn" type="button" @click="copy(message.content)">
        <AppIcon name="copy" />复制
      </button>
      <time>{{ formatClock(message.created_at) }}</time>
    </div>
    <div class="entry-body prose">
      <ThinkingCard
        v-if="message.reasoning"
        :reasoning="message.reasoning"
        :streaming="message.streaming"
      />

      <div class="response">
        <MarkdownView :content="message.content" :cache="!message.streaming" />
        <span v-if="message.streaming" class="cursor" aria-hidden="true"></span>

        <p v-if="message.status === 'failed' && message.error" class="error">
          生成失败：{{ message.error.message }}
        </p>
        <p v-else-if="message.status === 'canceled'" class="canceled">已停止生成。</p>

        <div v-if="message.citations.length" class="citations">
          <p class="block-label">引用来源</p>
          <ol>
            <li v-for="citation in message.citations" :key="citation.chunk_id">
              <RouterLink
                :to="{
                  name: 'knowledge',
                  query: { document_id: citation.document_id, q: citation.title },
                }"
              >
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

        <footer v-if="tokenLabel" class="msg-foot">
          <span class="mono">{{ tokenLabel }}</span>
        </footer>
      </div>
    </div>
  </article>
</template>

<style scoped>
.entry-assistant::before {
  content: '';
  position: absolute;
  left: 21px;
  top: 22px;
  bottom: -26px;
  width: 1px;
  background: var(--line);
}

.cursor {
  display: inline-block;
  width: 6px;
  height: 15px;
  margin-left: 2px;
  background: var(--ink-2);
  animation: blink 1s steps(2) infinite;
  vertical-align: text-bottom;
}

@keyframes blink {
  50% {
    opacity: 0;
  }
}

.error {
  padding: 8px 10px;
  border-radius: 5px;
  background: var(--red-soft);
  color: var(--red);
  font-size: 12px;
}

.canceled {
  color: var(--ink-3);
  font-size: 12px;
}

.citations,
.artifacts {
  margin-top: 14px;
  padding-top: 10px;
  border-top: 1px dashed var(--line-2);
}

.block-label {
  margin-bottom: 6px;
  color: var(--ink-3);
  font-size: 10px;
  letter-spacing: 0.02em;
}

.citations ol {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.citations a {
  display: flex;
  align-items: baseline;
  gap: 7px;
  font-size: 11.5px;
}

.citations a:hover .citation-title {
  text-decoration: underline;
  text-underline-offset: 3px;
}

.index {
  color: var(--prussian);
  font-size: 9.5px;
}

.citation-title {
  color: var(--ink-2);
}

.citation-meta {
  color: var(--ink-3);
  font-size: 10px;
}

.artifacts {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.artifact {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11.5px;
}

.artifact-name {
  flex: 1;
  min-width: 0;
  color: var(--ink-2);
}

.text-btn {
  color: var(--ink-3);
  font-size: 10.5px;
}

.text-btn:hover:not(:disabled) {
  color: var(--ink);
}

.text-btn:disabled {
  opacity: 0.5;
}

.msg-foot {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 12px;
  color: var(--ink-3);
  font-size: 10.5px;
}
</style>
