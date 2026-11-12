<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'

import { ApiRequestError } from '@/api/client'
import { knowledgeApi } from '@/api/knowledge'
import { formatDateTime } from '@/utils/format'
import { formatScore } from '@/utils/knowledge'
import type { KnowledgeSearchHit } from '@/types'

const props = withDefaults(
  defineProps<{
    categories?: string[]
    initialQuery?: string
  }>(),
  {
    categories: () => [],
    initialQuery: '',
  },
)

const query = ref(props.initialQuery)
const topK = ref(5)
const category = ref('')
const loading = ref(false)
const error = ref<string | null>(null)
const capabilityDisabled = ref(false)
const hits = ref<KnowledgeSearchHit[]>([])
const elapsedMs = ref<number | null>(null)
const lastQuery = ref('')

watch(
  () => props.initialQuery,
  (next) => {
    if (next) query.value = next
  },
)

const canSubmit = computed(() => query.value.trim().length > 0 && !loading.value)

/** chunk 子行只展示 MM-DD，避免长 chunk_id 撑出第二行。 */
function shortDate(iso: string): string {
  const formatted = formatDateTime(iso)
  return formatted === '—' ? '—' : formatted.slice(5, 10)
}

function errorMessage(cause: unknown): string {
  if (cause instanceof ApiRequestError) {
    if (cause.code === 'capability_disabled') {
      capabilityDisabled.value = true
      return '知识库能力未启用'
    }
    if (cause.status === 503) return '检索服务暂不可用（Embedding 未就绪或网络异常）'
    return cause.message
  }
  return cause instanceof Error ? cause.message : '检索失败，请稍后重试'
}

async function run(nextQuery?: string): Promise<void> {
  if (nextQuery !== undefined) query.value = nextQuery
  const text = query.value.trim()
  if (!text || loading.value) return

  loading.value = true
  error.value = null
  capabilityDisabled.value = false
  try {
    const result = await knowledgeApi.search({
      query: text,
      top_k: topK.value,
      filters: category.value ? { category: category.value } : undefined,
    })
    hits.value = result.hits
    elapsedMs.value = result.elapsed_ms
    lastQuery.value = text
  } catch (cause) {
    hits.value = []
    elapsedMs.value = null
    error.value = errorMessage(cause)
  } finally {
    loading.value = false
  }
}

function copyResults(): void {
  const payload = {
    query: lastQuery.value,
    top_k: topK.value,
    category: category.value || null,
    elapsed_ms: elapsedMs.value,
    hits: hits.value,
  }
  const text = JSON.stringify(payload, null, 2)
  const clipboard = navigator.clipboard
  if (clipboard?.writeText) {
    void clipboard.writeText(text).then(
      () => ElMessage.success('检索结果已复制'),
      () => ElMessage.warning('复制失败，请手动选择文本'),
    )
    return
  }
  ElMessage.warning('当前浏览器不支持自动复制')
}

defineExpose({ run })
</script>

<template>
  <section class="panel debug-panel" aria-label="检索调试">
    <div class="panel-head">
      <h2>检索调试</h2>
      <span class="tag">pgvector</span>
    </div>
    <p class="panel-desc">
      直接调用 <span class="mono">POST /api/v1/knowledge/search</span>，验证召回与相似度。
    </p>

    <form class="debug-form" @submit.prevent="run()">
      <label class="field">
        <span>查询</span>
        <input
          v-model="query"
          class="input"
          data-testid="debug-query"
          maxlength="500"
          placeholder="如：退款需要保留吊牌吗"
        />
      </label>
      <div class="debug-row">
        <label class="field">
          <span>top_k</span>
          <select v-model.number="topK" class="select">
            <option v-for="value in [3, 5, 10, 20]" :key="value" :value="value">{{ value }}</option>
          </select>
        </label>
        <label class="field">
          <span>分类</span>
          <select v-model="category" class="select">
            <option value="">全部分类</option>
            <option v-for="item in categories" :key="item" :value="item">{{ item }}</option>
          </select>
        </label>
        <button type="submit" class="btn btn-primary" :disabled="!canSubmit">
          {{ loading ? '检索中…' : '检索' }}
        </button>
      </div>
    </form>

    <p v-if="error" class="debug-error" role="alert">{{ error }}</p>

    <div v-if="hits.length > 0" class="debug-results">
      <article v-for="hit in hits" :key="hit.chunk_id" class="result">
        <div class="result-top">
          <span class="result-title">{{ hit.title }}</span>
          <span class="result-score mono">{{ formatScore(hit.score) }}</span>
        </div>
        <div class="result-src mono">
          chunk {{ hit.chunk_index + 1 }} · {{ hit.document_filename }} ·
          {{ shortDate(hit.updated_at) }}
        </div>
        <p class="result-excerpt">{{ hit.content }}</p>
      </article>
    </div>

    <p v-else-if="lastQuery && !loading && !error" class="empty-state">
      没有命中片段。确认文档已就绪，或换一个分类/查询。
    </p>
    <p v-else-if="!loading && !error" class="debug-hint">
      输入问题，查看召回片段、来源与分数。
    </p>

    <div v-if="hits.length > 0" class="debug-meta">
      <span>{{ elapsedMs ?? '—' }}ms · top_k={{ topK }} · cosine</span>
      <button type="button" class="text-link" @click="copyResults">复制结果</button>
    </div>
  </section>
</template>

<style scoped>
.debug-error {
  margin: 0 15px 12px;
  padding: 8px 10px;
  border-radius: 6px;
  background: var(--red-soft);
  color: var(--red);
  font-size: 11px;
  line-height: 1.6;
}

.debug-hint {
  margin: 0;
  padding: 10px 15px 14px;
  color: var(--ink-3);
  font-size: 11px;
  line-height: 1.6;
}
</style>
