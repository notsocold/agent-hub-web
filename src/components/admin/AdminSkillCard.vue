<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'

import ErrorState from '@/components/common/ErrorState.vue'
import LoadingSkeleton from '@/components/common/LoadingSkeleton.vue'
import { adminApi } from '@/api/admin'
import { ApiRequestError } from '@/api/client'
import { formatTokens } from '@/utils/format'
import type { AdminSkillList, Skill } from '@/types'

/**
 * M8-F8 系统技能卡：全局启停 + 强制停用。
 *
 * - 全局启停：该技能对所有人是否启用；强制停用：最高优先级，压过用户个人覆盖；
 * - `effective_enabled` 是全局口径（不合并用户个人覆盖）；
 * - 同值启停是后端 no-op，前端不提交；
 * - 404「系统技能不存在」→ 刷新列表。
 */

const SEARCH_DEBOUNCE_MS = 400

const list = ref<AdminSkillList | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)
const keyword = ref('')
const pendingId = ref<string | null>(null)

let searchTimer: ReturnType<typeof setTimeout> | null = null

const skills = computed<Skill[]>(() => list.value?.items ?? [])

function effectiveOf(skill: Skill): boolean {
  return skill.effective_enabled ?? (skill.enabled && !skill.force_disabled)
}

async function load(): Promise<void> {
  if (loading.value) return
  loading.value = true
  error.value = null
  try {
    list.value = await adminApi.skills(keyword.value.trim() || undefined)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '加载系统技能失败'
  } finally {
    loading.value = false
  }
}

function onSearchInput(): void {
  if (searchTimer !== null) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    searchTimer = null
    void load()
  }, SEARCH_DEBOUNCE_MS)
}

onUnmounted(() => {
  if (searchTimer !== null) clearTimeout(searchTimer)
})

function replaceRow(updated: Skill): void {
  if (!list.value) return
  list.value = {
    ...list.value,
    items: list.value.items.map((row) => (row.id === updated.id ? updated : row)),
  }
}

async function toggleEnabled(skill: Skill): Promise<void> {
  const next = !skill.enabled
  try {
    await ElMessageBox.confirm(
      next ? `启用「${skill.name}」后所有用户可用该技能。` : `停用「${skill.name}」后所有用户不可用。`,
      next ? '全局启用技能' : '全局停用技能',
      { confirmButtonText: next ? '确认启用' : '确认停用', cancelButtonText: '取消', type: 'warning' },
    )
  } catch {
    return
  }
  pendingId.value = skill.id
  try {
    replaceRow(await adminApi.setSkillEnabled(skill.id, next))
    ElMessage.success(next ? '技能已启用' : '技能已停用')
  } catch (cause) {
    ElMessage.error(cause instanceof Error ? cause.message : '操作失败')
    await load()
  } finally {
    pendingId.value = null
  }
}

async function toggleForceDisabled(skill: Skill): Promise<void> {
  const next = !skill.force_disabled
  try {
    await ElMessageBox.confirm(
      next
        ? `强制停用「${skill.name}」后，任何用户个人覆盖都无法再启用它。`
        : `解除「${skill.name}」的强制停用后，用户个人覆盖按原值生效。`,
      next ? '强制停用技能' : '解除强制停用',
      { confirmButtonText: next ? '确认强制停用' : '确认解除', cancelButtonText: '取消', type: 'warning' },
    )
  } catch {
    return
  }
  pendingId.value = skill.id
  try {
    replaceRow(await adminApi.setSkillForceDisabled(skill.id, next))
    ElMessage.success(next ? '已强制停用（优先级最高）' : '已解除强制停用')
  } catch (cause) {
    if (cause instanceof ApiRequestError && cause.code === 'not_found') {
      ElMessage.error('系统技能不存在')
    } else {
      ElMessage.error(cause instanceof Error ? cause.message : '操作失败')
    }
    await load()
  } finally {
    pendingId.value = null
  }
}

onMounted(() => {
  void load()
})
</script>

<template>
  <section class="panel" aria-labelledby="admin-skills-title">
    <div class="panel-head">
      <div>
        <h2 id="admin-skills-title">系统技能</h2>
        <p class="panel-sub">
          全局启停与强制停用（最高优先级，压过用户个人覆盖）。生效状态为全局口径，不含用户个人覆盖。
        </p>
      </div>
      <button type="button" class="btn btn-sm" :disabled="loading" @click="load">刷新</button>
    </div>

    <div v-if="list" class="toolbar">
      <input
        v-model="keyword"
        class="input search"
        type="search"
        maxlength="100"
        placeholder="搜索名称或描述"
        aria-label="搜索系统技能"
        @input="onSearchInput"
      />
      <span class="mono stats" aria-live="polite">
        {{ list.stats.total }} 个 · {{ list.stats.enabled }} 启用 ·
        {{ list.stats.force_disabled }} 强制停用
      </span>
    </div>

    <LoadingSkeleton v-if="loading && !list" :rows="3" />
    <ErrorState v-else-if="error" :message="error" :retryable="true" @retry="load" />

    <div v-else-if="list" class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th scope="col">技能</th>
            <th scope="col">版本 / 来源</th>
            <th scope="col">估算 Token</th>
            <th scope="col">生效</th>
            <th scope="col" class="switch-col">全局启用</th>
            <th scope="col" class="switch-col">强制停用</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="skill in skills" :key="skill.id">
            <td>
              <div class="who">
                <span class="name">{{ skill.name }}</span>
                <span class="slug mono">{{ skill.slug }}</span>
                <span v-if="skill.description" class="desc">{{ skill.description }}</span>
              </div>
            </td>
            <td class="mono muted">
              {{ skill.version ?? '—' }} / {{ skill.source ?? '—' }}
            </td>
            <td class="mono muted">{{ formatTokens(skill.estimated_tokens) }}</td>
            <td>
              <span
                class="st"
                :class="effectiveOf(skill) ? 'st-ok' : skill.force_disabled ? 'st-forced' : 'st-off'"
              >
                {{ effectiveOf(skill) ? '启用' : skill.force_disabled ? '已强制停用' : '停用' }}
              </span>
            </td>
            <td class="switch-col">
              <button
                type="button"
                class="btn btn-sm"
                :disabled="pendingId === skill.id"
                :aria-label="`全局${skill.enabled ? '停用' : '启用'} ${skill.name}`"
                @click="toggleEnabled(skill)"
              >
                {{ skill.enabled ? '停用' : '启用' }}
              </button>
            </td>
            <td class="switch-col">
              <button
                type="button"
                class="btn btn-sm"
                :class="{ danger: !skill.force_disabled }"
                :disabled="pendingId === skill.id"
                :aria-label="`${skill.force_disabled ? '解除' : ''}强制停用 ${skill.name}`"
                @click="toggleForceDisabled(skill)"
              >
                {{ skill.force_disabled ? '解除' : '强制停用' }}
              </button>
            </td>
          </tr>
          <tr v-if="skills.length === 0">
            <td colspan="6" class="empty">没有匹配的系统技能</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<style scoped>
.panel {
  padding: 16px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--surface);
}

.panel-head {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.panel-head > div {
  flex: 1;
  min-width: 0;
}

.panel-head h2 {
  margin: 0 0 4px;
  font-size: 13px;
  font-weight: 650;
  color: var(--ink);
}

.panel-sub {
  margin: 0;
  color: var(--ink-3);
  font-size: 11.5px;
  line-height: 1.6;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 12px;
}

.toolbar .input {
  height: 32px;
  padding: 0 10px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--bg, var(--surface));
  color: var(--ink);
  font-size: 12px;
}

.toolbar .search {
  width: 220px;
}

.toolbar .stats {
  color: var(--ink-3);
  font-size: 10.5px;
}

.table-wrap {
  margin-top: 10px;
  border: 1px solid var(--line);
  border-radius: 8px;
  overflow: hidden;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.data-table th {
  padding: 8px 12px;
  border-bottom: 1px solid var(--line);
  color: var(--ink-3);
  font-size: 11px;
  font-weight: 600;
  text-align: left;
  white-space: nowrap;
}

.data-table td {
  padding: 10px 12px;
  border-bottom: 1px solid var(--line);
  vertical-align: top;
}

.data-table tbody tr:last-child td {
  border-bottom: 0;
}

.who {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.who .name {
  color: var(--ink);
  font-weight: 550;
}

.who .slug {
  color: var(--ink-3);
  font-size: 10.5px;
}

.who .desc {
  color: var(--ink-2);
  font-size: 11px;
  line-height: 1.5;
}

.muted {
  color: var(--ink-3);
  font-size: 11px;
  white-space: nowrap;
}

.st {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid var(--line);
  font-size: 10.5px;
  color: var(--ink-3);
  white-space: nowrap;
}

.st-ok {
  border-color: color-mix(in srgb, var(--green) 35%, transparent);
  color: var(--green);
}

.st-forced {
  border-color: color-mix(in srgb, var(--red) 40%, transparent);
  color: var(--red);
}

.switch-col {
  text-align: center;
  white-space: nowrap;
}

.btn-sm {
  height: 26px;
  padding: 0 10px;
  font-size: 11px;
}

.btn-sm.danger {
  border-color: color-mix(in srgb, var(--red) 45%, transparent);
  color: var(--red);
}

.empty {
  padding: 24px 12px;
  color: var(--ink-3);
  text-align: center;
}
</style>
