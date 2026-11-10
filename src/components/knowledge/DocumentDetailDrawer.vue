<script setup lang="ts">
import { computed } from 'vue'

import { formatBytes, formatDateTime } from '@/utils/format'
import { statusLabel, statusTone } from '@/utils/knowledge'
import type { KnowledgeDocument } from '@/types'
import StatusBadge from '@/components/common/StatusBadge.vue'

const props = defineProps<{
  modelValue: boolean
  document: KnowledgeDocument | null
  /** 当前用户是否可写（所有者或管理员）；系统文档普通用户只读。 */
  writable?: boolean
  /** 重试/删除请求进行中，禁用操作避免重复提交。 */
  busy?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  retry: [document: KnowledgeDocument]
  remove: [document: KnowledgeDocument]
  search: [document: KnowledgeDocument]
}>()

const tone = computed(() =>
  props.document ? statusTone(props.document.status) : 'muted',
)

const label = computed(() =>
  props.document ? statusLabel(props.document.status) : '',
)

function close(): void {
  emit('update:modelValue', false)
}
</script>

<template>
  <el-drawer
    :model-value="modelValue"
    title="文档详情"
    size="440px"
    append-to-body
    @update:model-value="close"
  >
    <div v-if="document" class="detail">
      <header class="head">
        <h2>{{ document.title }}</h2>
        <StatusBadge :tone="tone" :label="label" />
      </header>

      <p class="source mono">{{ document.source_uri }}</p>

      <dl class="meta">
        <div><dt>分类</dt><dd>{{ document.category || '未分类' }}</dd></div>
        <div><dt>分块</dt><dd>{{ document.chunk_count }}</dd></div>
        <div><dt>大小</dt><dd>{{ formatBytes(document.size_bytes) }}</dd></div>
        <div><dt>归属</dt><dd>{{ document.owner?.display_name ?? '系统文档' }}</dd></div>
        <div><dt>更新时间</dt><dd>{{ formatDateTime(document.updated_at) }}</dd></div>
        <div><dt>创建时间</dt><dd>{{ formatDateTime(document.created_at) }}</dd></div>
        <div><dt>文档 ID</dt><dd class="mono">{{ document.id }}</dd></div>
      </dl>

      <section v-if="document.error" class="error-block" role="alert">
        <p class="block-title">入库失败</p>
        <p>{{ document.error }}</p>
      </section>

      <ul class="hits-hint">
        <li>检索命中按章节标题跳转；重建索引会让历史 chunk 失效，但引用快照仍可读。</li>
        <li>分数来自当前 Embedding 模型，仅用于排序，不做相关性阈值判断。</li>
      </ul>

      <div class="actions">
        <button type="button" class="btn" @click="emit('search', document)">
          在检索调试中查找
        </button>
        <button
          v-if="writable"
          type="button"
          class="btn"
          :disabled="busy"
          @click="emit('retry', document)"
        >
          {{ document.status === 'failed' ? '重试入库' : '重建此文档' }}
        </button>
        <button
          v-if="writable"
          type="button"
          class="btn danger"
          :disabled="busy"
          @click="emit('remove', document)"
        >
          删除文档
        </button>
      </div>
    </div>
    <p v-else class="empty">未选择文档。</p>
  </el-drawer>
</template>

<style scoped>
.detail {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.head h2 {
  margin: 0;
  color: var(--ink);
  font-size: 16px;
  font-weight: 650;
  line-height: 1.35;
}

.source {
  margin: 0;
  overflow-wrap: anywhere;
  color: var(--ink-3);
  font-size: 10.5px;
}

.meta {
  display: grid;
  gap: 8px 14px;
  margin: 0;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.meta > div {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.meta dt {
  color: var(--ink-3);
  font-size: 10px;
}

.meta dd {
  margin: 0;
  overflow-wrap: anywhere;
  color: var(--ink-2);
  font-size: 11.5px;
}

.error-block {
  padding: 10px 12px;
  border: 1px solid var(--red-soft);
  border-radius: 8px;
  background: var(--red-soft);
  color: var(--red);
  font-size: 11.5px;
  line-height: 1.65;
}

.error-block p {
  margin: 0;
}

.block-title {
  margin-bottom: 3px !important;
  font-weight: 650;
}

.hits-hint {
  margin: 0;
  padding-left: 16px;
  color: var(--ink-3);
  font-size: 11px;
  line-height: 1.7;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 4px;
}

.btn.danger {
  border-color: var(--red-soft);
  color: var(--red);
}

.btn.danger:hover:not(:disabled) {
  border-color: var(--red);
}

.empty {
  margin: 0;
  color: var(--ink-3);
  font-size: 12px;
}
</style>
