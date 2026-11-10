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
  <section class="panel" aria-label="检索调试">
    <header class="panel-head">
      <h2>检索调试</h2>
      <span class="tag mono">POST /knowledge/search</span>
    </header>
    <p class="desc">直接调用后端检索接口，验证召回片段与相似度分数。</p>

    <form class="form" @submit.prevent="run()">
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
      <div class="row">
        <label class="field is-narrow">
          <span>top_k</span>
          <select v-model.number="topK" class="input">
            <option v-for="value in [3, 5, 10, 20]" :key="value" :value="value">{{ value }}</option>
          </select>
        </label>
        <label class="field is-narrow">
          <span>分类</span>
          <select v-model="category" class="input">
            <option value="">全部分类</option>
            <option v-for="item in categories" :key="item" :value="item">{{ item }}</option>
          </select>
        </label>
        <button type="submit" class="btn primary" :disabled="!canSubmit">
          {{ loading ? '检索中…' : '检索' }}
        </button>
      </div>
    </form>

    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <p v-else-if="capabilityDisabled" class="error" role="alert">知识库能力未启用</p>

    <div v-if="hits.length > 0" class="results">
      <article v-for="hit in hits" :key="hit.chunk_id" class="hit">
        <header class="hit-head">
          <span class="hit-title">{{ hit.title }}</span>
          <span class="score mono">{{ formatScore(hit.score) }}</span>
        </header>
        <p class="hit-source mono">
          {{ hit.document_title }} · {{ hit.document_filename }} · #{{ hit.chunk_index }} ·
          {{ hit.category || '未分类' }} · {{ formatDateTime(hit.updated_at) }}
        </p>
        <p class="hit-content">{{ hit.content }}</p>
      </article>
      <footer class="meta-row">
        <span class="mono">
          {{ elapsedMs ?? '—' }} ms · top_k={{ topK }} · {{ category || '全部分类' }}
        </span>
        <button type="button" class="link" @click="copyResults">复制结果</button>
      </footer>
    </div>

    <p v-else-if="lastQuery && !loading && !error" class="empty">
      没有命中片段。确认文档已就绪，或换一个分类/查询。
    </p>
    <p v-else-if="!loading && !error" class="empty hint">
      输入问题，查看召回片段、来源与分数。
    </p>
  </section>
</template>

<style scoped>
.panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
  padding: 16px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--surface);
}

.panel-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

.panel-head h2 {
  margin: 0;
  color: var(--ink);
  font-size: 13.5px;
  font-weight: 650;
}

.tag {
  color: var(--ink-3);
  font-size: 9.5px;
}

.desc {
  margin: 0;
  color: var(--ink-3);
  font-size: 11px;
  line-height: 1.65;
}

.form {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 3px;
  color: var(--ink-3);
  font-size: 10.5px;
}

.field.is-narrow {
  flex: 1;
  min-width: 78px;
}

.row {
  display: flex;
  align-items: flex-end;
  gap: 8px;
}

.error {
  margin: 0;
  padding: 8px 10px;
  border-radius: 6px;
  background: var(--red-soft);
  color: var(--red);
  font-size: 11.5px;
}

.results {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.hit {
  padding: 10px 12px;
  border: 1px solid var(--line-2);
  border-radius: 8px;
  background: var(--surface-2);
}

.hit-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

.hit-title {
  color: var(--ink);
  font-size: 12px;
  font-weight: 600;
}

.score {
  color: var(--prussian);
  font-size: 11px;
}

.hit-source {
  margin: 3px 0 6px;
  overflow-wrap: anywhere;
  color: var(--ink-3);
  font-size: 9.5px;
}

.hit-content {
  margin: 0;
  color: var(--ink-2);
  font-size: 11.5px;
  line-height: 1.7;
  white-space: pre-wrap;
}

.meta-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  color: var(--ink-3);
  font-size: 10px;
}

.link {
  padding: 0;
  color: var(--prussian);
  font-size: 11px;
}

.link:hover {
  text-decoration: underline;
}

.empty {
  margin: 0;
  padding: 18px 8px;
  color: var(--ink-3);
  font-size: 11.5px;
  text-align: center;
}

.empty.hint {
  padding: 10px 8px;
}
</style>
