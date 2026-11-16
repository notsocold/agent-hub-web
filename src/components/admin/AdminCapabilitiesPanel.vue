<script setup lang="ts">
import { computed, onMounted } from 'vue'

import ErrorState from '@/components/common/ErrorState.vue'
import LoadingSkeleton from '@/components/common/LoadingSkeleton.vue'
import { CAPABILITY_META, LIMIT_META } from '@/components/admin/systemMeta'
import { useSystemStore } from '@/stores/system'

/**
 * M8（B 路径）能力开关只读面板。
 *
 * `capabilities` 的布尔值显示为「已开启 / 已关闭」，`limits` 的数字原样显示；
 * 缺字段（老版本后端 / 空响应）显示「—」，不猜测、不补造。
 */

const system = useSystemStore()

const capabilityRows = computed(() =>
  CAPABILITY_META.map(({ key, label }) => {
    const value = system.info?.capabilities?.[key]
    return {
      key,
      label,
      enabled: typeof value === 'boolean' ? value : null,
    }
  }),
)

const limitRows = computed(() =>
  LIMIT_META.map(({ key, label }) => {
    const value = system.info?.limits?.[key]
    return {
      key,
      label,
      value: typeof value === 'number' && Number.isFinite(value) ? String(value) : '—',
    }
  }),
)

function stateLabel(enabled: boolean | null): string {
  if (enabled === null) return '—'
  return enabled ? '已开启' : '已关闭'
}

function stateClass(enabled: boolean | null): string {
  return enabled === true ? 'st-ok' : 'st-muted'
}

function reload(): void {
  void system.load(true)
}

onMounted(() => {
  void system.load()
})
</script>

<template>
  <section class="panel" aria-labelledby="admin-capabilities-title">
    <div class="panel-head">
      <div>
        <h2 id="admin-capabilities-title">能力开关</h2>
        <p>只读，来自 GET /system/info 的 capabilities 与 limits；本面板不提供开关写入口。</p>
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
        <div class="capability-grid">
          <section class="capability-block" aria-labelledby="admin-capabilities-flags-title">
            <h3 id="admin-capabilities-flags-title">
              能力状态
              <span class="badge">{{ capabilityRows.length }}</span>
            </h3>
            <div class="table-wrap">
              <table class="data-table">
                <thead>
                  <tr>
                    <th scope="col">能力</th>
                    <th scope="col">状态</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="row in capabilityRows" :key="row.key">
                    <td>
                      <span class="row-label">{{ row.label }}</span>
                      <small class="mono row-key">{{ row.key }}</small>
                    </td>
                    <td>
                      <span class="st" :class="stateClass(row.enabled)">
                        <span class="dot" aria-hidden="true"></span>
                        {{ stateLabel(row.enabled) }}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section class="capability-block" aria-labelledby="admin-capabilities-limits-title">
            <h3 id="admin-capabilities-limits-title">
              限制值
              <span class="badge">{{ limitRows.length }}</span>
            </h3>
            <div class="table-wrap">
              <table class="data-table">
                <thead>
                  <tr>
                    <th scope="col">限制项</th>
                    <th scope="col" class="value-col">值</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="row in limitRows" :key="row.key">
                    <td>
                      <span class="row-label">{{ row.label }}</span>
                      <small class="mono row-key">{{ row.key }}</small>
                    </td>
                    <td class="mono value-col">{{ row.value }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <p class="panel-hint">
          空值显示为 —。平台运维类配置（认证策略/配额/数据保留/危险操作）为目标形态，未排期。
          <br />
          本页不提供任何可写假控件。
          <template v-if="system.error">上次刷新失败，以上为上次成功加载的数据。</template>
        </p>
      </div>
    </template>
  </section>
</template>

<style scoped>
.capability-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 14px;
  align-items: start;
}

.capability-block h3 {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 0 7px;
  color: var(--ink-2);
  font-size: 11px;
  font-weight: 600;
}

.table-wrap {
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 6px;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 11px;
}

.data-table th {
  padding: 7px 10px;
  border-bottom: 1px solid var(--line);
  color: var(--ink-3);
  font-size: 10px;
  font-weight: 600;
  text-align: left;
  white-space: nowrap;
}

.data-table td {
  padding: 7px 10px;
  border-bottom: 1px solid var(--line-2);
  vertical-align: middle;
}

.data-table tbody tr:last-child td {
  border-bottom: 0;
}

.row-label {
  display: block;
  color: var(--ink-2);
}

.row-key {
  display: block;
  margin-top: 1px;
  color: var(--ink-3);
  font-size: 8.5px;
  overflow-wrap: anywhere;
}

.value-col {
  text-align: right;
  white-space: nowrap;
  color: var(--ink-2);
}

.panel-hint {
  margin-top: 10px;
  color: var(--ink-3);
  font-size: 10.5px;
  line-height: 1.6;
}
</style>
