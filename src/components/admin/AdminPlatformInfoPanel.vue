<script setup lang="ts">
import { computed, onMounted } from 'vue'

import ErrorState from '@/components/common/ErrorState.vue'
import LoadingSkeleton from '@/components/common/LoadingSkeleton.vue'
import { CAPABILITY_META } from '@/components/admin/systemMeta'
import { useSystemStore } from '@/stores/system'
import type { SystemInfo } from '@/types'

/**
 * M8（B 路径）平台信息只读面板。
 *
 * 数据唯一来源是 `GET /system/info`；页面不提供认证策略 / 配额 / 数据保留等
 * 平台运维配置的写入口，那些属于目标形态，未排期。
 */

const system = useSystemStore()

function display(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '—'
  const text = String(value).trim()
  return text || '—'
}

function embeddingText(embedding: SystemInfo['embedding'] | undefined): string {
  if (!embedding) return '—'
  const model = display(embedding.model)
  const hasModel = model !== '—'
  const hasDim = Number.isFinite(embedding.dim) && embedding.dim > 0
  if (!hasModel && !hasDim) return '—'
  return `${hasModel ? model : '—'} · ${hasDim ? `${embedding.dim} 维` : '—'}`
}

const modelsText = computed(() => {
  const models = system.info?.models ?? []
  if (models.length === 0) return '—'
  const names = models.map((model) => model.name?.trim() || model.id)
  return `${names.join('、')}（${models.length} 个）`
})

const capabilitySummary = computed(() => {
  const capabilities = system.info?.capabilities
  if (!capabilities) return '—'
  const enabled = CAPABILITY_META.filter(({ key }) => capabilities[key] === true)
  const names = enabled.map(({ label }) => label).join('、')
  return `已开启 ${enabled.length} / ${CAPABILITY_META.length} 项${names ? `（${names}）` : ''}`
})

const infoRows = computed(() => [
  { label: '版本', value: display(system.info?.version) },
  { label: 'Build', value: display(system.info?.build) },
  { label: '运行环境', value: display(system.info?.environment) },
  { label: '默认模型', value: display(system.info?.default_model) },
  { label: '对话模型', value: modelsText.value },
  { label: 'Embedding', value: embeddingText(system.info?.embedding) },
  { label: '能力开关', value: capabilitySummary.value },
])

function reload(): void {
  void system.load(true)
}

onMounted(() => {
  void system.load()
})
</script>

<template>
  <section class="panel" aria-labelledby="admin-platform-info-title">
    <div class="panel-head">
      <div>
        <h2 id="admin-platform-info-title">平台信息</h2>
        <p>只读，来自 GET /system/info；本面板不提供任何修改入口。</p>
      </div>
      <span class="spacer"></span>
      <button type="button" class="btn btn-sm" :disabled="system.loading" @click="reload">
        刷新
      </button>
    </div>

    <LoadingSkeleton v-if="system.loading && !system.info" :rows="3" />
    <template v-else>
      <ErrorState v-if="system.error" :message="system.error" :retryable="true" @retry="reload" />

      <div v-if="system.info || !system.error" class="panel-body">
        <dl class="platform-facts">
          <div v-for="row in infoRows" :key="row.label">
            <dt>{{ row.label }}</dt>
            <dd class="mono" :class="{ 'is-empty': row.value === '—' }">{{ row.value }}</dd>
          </div>
        </dl>
        <p class="panel-hint">
          空值显示为 —；版本 / Build / 环境 / 模型 / Embedding 均以后端返回为准，前端不做补造。
          <template v-if="system.error">上次刷新失败，以上为上次成功加载的数据。</template>
        </p>
      </div>
    </template>
  </section>
</template>

<style scoped>
.platform-facts {
  display: grid;
  gap: 8px;
  margin: 0;
}

.platform-facts > div {
  display: grid;
  grid-template-columns: 96px minmax(0, 1fr);
  gap: 10px;
  align-items: baseline;
}

dt {
  color: var(--ink-3);
  font-size: 11px;
}

dd {
  margin: 0;
  color: var(--ink-2);
  font-size: 11.5px;
  line-height: 1.6;
  overflow-wrap: anywhere;
}

dd.is-empty {
  color: var(--ink-3);
}

.panel-hint {
  margin-top: 10px;
  color: var(--ink-3);
  font-size: 10.5px;
  line-height: 1.6;
}
</style>
