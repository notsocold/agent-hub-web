<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import ErrorState from '@/components/common/ErrorState.vue'
import LoadingSkeleton from '@/components/common/LoadingSkeleton.vue'
import PageHeader from '@/components/common/PageHeader.vue'
import { adminApi } from '@/api/admin'
import type { AdminUserStats } from '@/types'

const stats = ref<AdminUserStats | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)

/**
 * 两角色说明（静态）：依据 src/router（meta.requiresAdmin 仅守卫管理台路由）、
 * src/router/guards.ts 与 docs/pages.md「写操作仅管理员」的口径。
 */
const roleCards = [
  {
    role: 'user' as const,
    title: 'user · 普通用户',
    summary: '工作台全功能，仅管理自己创建的资源。',
    points: [
      '工作台全功能：对话/会话、工作流、智能体、任务、知识库与个人设置',
      '仅管理自己的资源：会话、文档、个人能力配置等',
      '访问 /admin/* 会被守卫退回 /admin/forbidden 无权限页',
    ],
  },
  {
    role: 'admin' as const,
    title: 'admin · 管理员',
    summary: '在普通用户能力之上，额外负责平台级配置与治理。',
    points: [
      '管理台 /admin/* 全部页面（守卫 meta.requiresAdmin 仅放行管理员）',
      '智能体与任务写操作：注册/编辑/删除、取消/补充/授权/拒绝（M7 后写操作仅管理员）',
      '知识库系统文档管理与按 all/system 范围重建',
      '全局审计日志查询（普通用户仅自查自己的记录）',
      '平台密钥等平台级配置管理（管理台系统设置）',
    ],
  },
]

/** 内置能力矩阵（静态）：单元格只描述「查看」或「查看+管理」两类能力，不做权限编辑。 */
const capabilityMatrix = [
  { module: '对话 / 会话', user: '查看 + 管理（仅自己的）', admin: '查看 + 管理（仅自己的）' },
  { module: '智能体', user: '查看', admin: '查看 + 管理（写操作仅管理员）' },
  { module: '任务', user: '查看', admin: '查看 + 管理（写动作仅管理员）' },
  { module: '知识库', user: '查看 + 管理（仅自己的文档）', admin: '查看 + 管理（含系统文档管理）' },
  { module: '审批', user: '查看 + 决定（自己的会话内）', admin: '查看 + 决定（自己的会话内）' },
  { module: '审计', user: '查看（仅自己的）', admin: '查看（全局，可按操作者/资源筛选）' },
  { module: '平台密钥', user: '—（无权限）', admin: '查看 + 管理（CRUD/轮换/启停）' },
  { module: '管理台', user: '—（无权限）', admin: '查看 + 管理（/admin/* 全部页面）' },
]

const distributionRows = computed(() => {
  const s = stats.value
  if (!s) return []
  return [
    { label: '总用户', value: s.total },
    { label: '活跃', value: s.active },
    { label: '停用', value: s.disabled },
    { label: '管理员', value: s.admins },
    { label: '普通用户', value: s.total - s.admins },
  ]
})

async function load(): Promise<void> {
  if (loading.value) return
  loading.value = true
  error.value = null
  try {
    stats.value = (await adminApi.users()).stats
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '加载用户角色分布失败'
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
      eyebrow="ADMIN · ROLES"
      title="角色与权限"
      description="user / admin 两角色说明、内置能力矩阵与用户角色分布。后端无对应管理接口，本页为只读呈现。"
    >
      <template #actions>
        <button type="button" class="btn" :disabled="loading" @click="load">
          {{ loading ? '刷新中…' : '刷新' }}
        </button>
      </template>
    </PageHeader>

    <section class="notice" role="note" aria-label="只读说明">
      <p class="notice-tag mono">READ-ONLY · 只读呈现</p>
      <p class="notice-body">
        后端 v1 仅内置 user / admin
        两个角色，无角色/权限管理接口，不做新建角色或权限编辑；本页所有内容均为只读呈现。
      </p>
    </section>

    <LoadingSkeleton v-if="loading && !stats" :rows="4" />
    <ErrorState v-else-if="error" :message="error" :retryable="true" @retry="load" />

    <template v-else-if="stats">
      <section class="role-cards" aria-label="角色说明">
        <article v-for="card in roleCards" :key="card.role" class="panel">
          <h2>{{ card.title }}</h2>
          <p class="summary">{{ card.summary }}</p>
          <ul>
            <li v-for="point in card.points" :key="point">{{ point }}</li>
          </ul>
        </article>
      </section>

      <section class="panels">
        <article class="panel">
          <h2>用户角色分布</h2>
          <dl>
            <div v-for="row in distributionRows" :key="row.label">
              <dt>{{ row.label }}</dt>
              <dd class="mono">{{ row.value }}</dd>
            </div>
          </dl>
          <p class="note">
            口径：stats.admins 含停用管理员，活跃/停用为全表计数；普通用户数 = 总用户 −
            管理员，不反推活跃管理员数。
          </p>
        </article>

        <article class="panel">
          <h2>内置能力矩阵</h2>
          <table>
            <thead>
              <tr>
                <th scope="col">模块</th>
                <th scope="col" class="mono">user</th>
                <th scope="col" class="mono">admin</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in capabilityMatrix" :key="row.module">
                <th scope="row">{{ row.module }}</th>
                <td>{{ row.user }}</td>
                <td>{{ row.admin }}</td>
              </tr>
            </tbody>
          </table>
          <p class="note">
            口径：M7
            后智能体与任务写操作仅管理员；知识库系统文档管理仅管理员；审计管理员可查全局；平台密钥与管理台仅管理员。
          </p>
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

.notice {
  padding: 12px 16px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--surface-2);
}

.notice-tag {
  margin: 0 0 4px;
  color: var(--amber-text);
  font-size: 9.5px;
  letter-spacing: 0.13em;
}

.notice-body {
  margin: 0;
  color: var(--ink-2);
  font-size: 12px;
  line-height: 1.7;
}

.role-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 12px;
}

.panels {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 12px;
  align-items: start;
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

.summary {
  margin: 0 0 8px;
  color: var(--ink-2);
  font-size: 12px;
  line-height: 1.6;
}

.role-cards ul {
  display: flex;
  flex-direction: column;
  gap: 5px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.role-cards li {
  position: relative;
  padding-left: 14px;
  color: var(--ink-3);
  font-size: 11.5px;
  line-height: 1.6;
}

.role-cards li::before {
  content: '';
  position: absolute;
  top: 0.6em;
  left: 2px;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--ink-3);
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

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

th,
td {
  padding: 6px 10px;
  border-bottom: 1px solid var(--line-2);
  color: var(--ink);
  font-weight: 400;
  text-align: left;
  vertical-align: top;
}

thead th {
  border-bottom: 1px solid var(--line);
  color: var(--ink-3);
  font-size: 11px;
  font-weight: 550;
  white-space: nowrap;
}

tbody th {
  color: var(--ink);
  font-weight: 500;
  white-space: nowrap;
}

tbody tr:last-child th,
tbody tr:last-child td {
  border-bottom: none;
}

.note {
  margin: 10px 0 0;
  color: var(--ink-3);
  font-size: 10.5px;
  line-height: 1.7;
}
</style>
