<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import ErrorState from '@/components/common/ErrorState.vue'
import LoadingSkeleton from '@/components/common/LoadingSkeleton.vue'
import PageHeader from '@/components/common/PageHeader.vue'
import StatCard from '@/components/common/StatCard.vue'
import { adminApi } from '@/api/admin'
import { formatBytes, formatDateTime } from '@/utils/format'
import type { AdminOverview } from '@/types'

const overview = ref<AdminOverview | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)

const runRows = computed(() => {
  const runs = overview.value?.runs
  if (!runs) return []
  return [
    { label: '排队', value: runs.queued },
    { label: '运行中', value: runs.running },
    { label: '成功', value: runs.succeeded },
    { label: '失败', value: runs.failed },
    { label: '已取消', value: runs.canceled },
    { label: '等待审批', value: runs.interrupted },
  ]
})

const taskRows = computed(() => {
  const tasks = overview.value?.a2a_tasks
  if (!tasks) return []
  return [
    { label: '已提交', value: tasks.submitted },
    { label: '运行中', value: tasks.working },
    { label: '等待输入', value: tasks.input_required },
    { label: '需要授权', value: tasks.auth_required },
    { label: '已完成', value: tasks.completed },
    { label: '失败', value: tasks.failed },
    { label: '已取消', value: tasks.canceled },
    { label: '已拒绝', value: tasks.rejected },
  ]
})

const knowledgeRows = computed(() => {
  const knowledge = overview.value?.knowledge
  if (!knowledge) return []
  return [
    { label: '待处理', value: knowledge.documents_pending },
    { label: '索引中', value: knowledge.documents_indexing },
    { label: '就绪', value: knowledge.documents_ready },
    { label: '入库失败', value: knowledge.documents_failed },
  ]
})

async function load(): Promise<void> {
  if (loading.value) return
  loading.value = true
  error.value = null
  try {
    overview.value = await adminApi.overview()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '加载管理概览失败'
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void load()
})
</script>

<template>
  <div class="admin-page">
    <PageHeader
      eyebrow="ADMIN · OVERVIEW"
      title="管理概览"
      description="平台运行、用户、任务与知识库的实时计数。数据为全表原始值，建议手动刷新（≥30s）。"
    >
      <template #actions>
        <button type="button" class="btn" :disabled="loading" @click="load">
          {{ loading ? '刷新中…' : '刷新' }}
        </button>
      </template>
    </PageHeader>

    <LoadingSkeleton v-if="loading && !overview" :rows="4" />
    <ErrorState v-else-if="error" :message="error" :retryable="true" @retry="load" />

    <template v-else-if="overview">
      <p class="generated mono">
        数据时间：{{ formatDateTime(overview.generated_at) }} · 全表计数（含软删/终态行）
      </p>

      <section class="metrics" aria-label="关键计数">
        <StatCard
          label="用户"
          :value="overview.users.total"
          :hint="`${overview.users.active} 活跃 · ${overview.users.admins} 管理员`"
        />
        <StatCard
          label="会话"
          :value="overview.conversations.total"
          :hint="`${overview.conversations.active} 活跃 · ${overview.conversations.archived} 已归档`"
        />
        <StatCard label="消息" :value="overview.messages.total" />
        <StatCard
          label="运行"
          :value="overview.runs.total"
          :hint="`${overview.runs.running} 运行中 · ${overview.runs.failed} 失败`"
          tone="default"
        />
        <StatCard
          label="A2A 任务"
          :value="overview.a2a_tasks.total"
          :hint="`${overview.a2a_tasks.completed} 已完成`"
        />
        <StatCard
          label="知识文档"
          :value="overview.knowledge.documents"
          :hint="`${overview.knowledge.documents_ready} 就绪 · ${overview.knowledge.documents_failed} 失败`"
        />
        <StatCard
          label="附件存储"
          :value="formatBytes(overview.attachments.storage_bytes)"
          :hint="`${overview.attachments.total} 个文件 · ${overview.attachments.deleted} 已删除`"
        />
      </section>

      <section class="panels">
        <article class="panel">
          <h2>运行状态</h2>
          <dl>
            <div v-for="row in runRows" :key="row.label">
              <dt>{{ row.label }}</dt>
              <dd class="mono">{{ row.value }}</dd>
            </div>
          </dl>
        </article>

        <article class="panel">
          <h2>A2A 任务状态</h2>
          <dl>
            <div v-for="row in taskRows" :key="row.label">
              <dt>{{ row.label }}</dt>
              <dd class="mono">{{ row.value }}</dd>
            </div>
          </dl>
        </article>

        <article class="panel">
          <h2>知识库与附件</h2>
          <dl>
            <div v-for="row in knowledgeRows" :key="row.label">
              <dt>{{ row.label }}</dt>
              <dd class="mono">{{ row.value }}</dd>
            </div>
            <div>
              <dt>文档块</dt>
              <dd class="mono">{{ overview.knowledge.chunks }}</dd>
            </div>
            <div>
              <dt>软删会话</dt>
              <dd class="mono">{{ overview.conversations.deleted }}</dd>
            </div>
          </dl>
        </article>
      </section>
    </template>
  </div>
</template>

<style scoped>
.admin-page {
  display: flex;
  flex-direction: column;
  gap: 18px;
  max-width: 1120px;
}

.generated {
  margin: 0;
  color: var(--ink-3);
  font-size: 10.5px;
}

.metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: 10px;
}

.panels {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 12px;
}

.panel {
  padding: 14px 16px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--surface);
}

.panel h2 {
  margin: 0 0 10px;
  font-size: 12px;
  font-weight: 650;
  color: var(--ink-2);
}

.panel dl {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
}

.panel dl div {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.panel dt {
  color: var(--ink-3);
  font-size: 11.5px;
}

.panel dd {
  margin: 0;
  color: var(--ink);
  font-size: 12px;
}
</style>
