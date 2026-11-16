<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import AppIcon from '@/components/common/AppIcon.vue'
import ErrorState from '@/components/common/ErrorState.vue'
import LoadingSkeleton from '@/components/common/LoadingSkeleton.vue'
import { adminApi } from '@/api/admin'
import type { AdminUserStats } from '@/types'

/**
 * 只读角色页：后端 v1 仅内置 user / admin 两个角色，无角色/权限管理接口。
 * 左侧角色列表 + 右侧权限矩阵、能力对照矩阵均为前端静态口径，不做编辑。
 */

type RoleKey = 'admin' | 'user'

const stats = ref<AdminUserStats | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)
const selectedRole = ref<RoleKey>('admin')

interface RoleCard {
  role: RoleKey
  title: string
  summary: string
  points: string[]
}

const roleCards: RoleCard[] = [
  {
    role: 'admin',
    title: 'admin · 管理员',
    summary: '系统内置，拥有全部菜单与操作权限，不可修改。',
    points: ['管理台全部页面', '平台级配置与治理', '全局审计查询'],
  },
  {
    role: 'user',
    title: 'user · 普通用户',
    summary: '默认角色，可使用工作台功能并管理自己的资源。',
    points: ['对话 / 工作流 / 知识库', '仅管理自己的资源', '无法进入管理台'],
  },
]

/** 内置能力矩阵（静态）：单元格描述「查看」或「查看 + 管理」两类能力，不做权限编辑。 */
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

const activeRole = computed(() => roleCards.find((card) => card.role === selectedRole.value)!)
const isBuiltInAdmin = computed(() => selectedRole.value === 'admin')

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

function roleCount(role: RoleKey): number | null {
  if (!stats.value) return null
  return role === 'admin' ? stats.value.admins : stats.value.total - stats.value.admins
}

function roleSummary(role: RoleKey): string {
  return roleCards.find((card) => card.role === role)?.summary ?? ''
}

function canView(value: string): boolean {
  return value.includes('查看')
}

function canOperate(value: string): boolean {
  return value.includes('管理') || value.includes('决定')
}

function permissionValue(module: (typeof capabilityMatrix)[number]): string {
  return selectedRole.value === 'admin' ? module.admin : module.user
}

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
    <header class="admin-page-head">
      <div>
        <h1 class="page-title">角色与权限</h1>
        <p class="page-sub">用角色控制管理菜单与操作权限。超级管理员为系统内置，不可修改。</p>
      </div>
      <div class="head-actions">
        <button type="button" class="btn btn-outline" :disabled="loading" @click="load">
          <AppIcon name="refresh" />
          {{ loading ? '刷新中…' : '刷新' }}
        </button>
      </div>
    </header>

    <div class="prototype-note" role="note">
      <AppIcon name="alert" />
      <span>
        <b>范围说明</b>：v1 仅内置 user/admin 两种角色；多角色与权限矩阵为目标形态，未排期（见
        docs/handoff/2026-11-13-accepted-deviations.md）。
        <br />
        <b>只读呈现</b>：后端无对应管理接口，不做新建角色或权限编辑；
        下列矩阵来自前端路由守卫与现有接口权限口径。
      </span>
    </div>

    <LoadingSkeleton v-if="loading && !stats" :rows="4" />
    <ErrorState v-else-if="error" :message="error" :retryable="true" @retry="load" />

    <template v-else-if="stats">
      <div class="roles-layout">
        <section class="panel role-panel">
          <div class="panel-head">
            <h2>角色</h2>
            <span class="spacer"></span>
            <span class="badge">2</span>
          </div>
          <div class="role-list">
            <button
              v-for="card in roleCards"
              :key="card.role"
              type="button"
              class="role-item"
              :class="{ 'is-active': selectedRole === card.role }"
              :aria-pressed="selectedRole === card.role"
              @click="selectedRole = card.role"
            >
              <span class="role-item-main">
                <b>
                  {{ card.title }}
                  <span v-if="card.role === 'admin'" class="lock-mini">内置</span>
                </b>
                <small>
                  {{ roleCount(card.role) ?? '—' }} 位用户 · {{ roleSummary(card.role) }}
                </small>
              </span>
              <AppIcon :name="selectedRole === card.role ? 'eye' : 'arrow'" />
            </button>
          </div>
          <dl class="role-dist" aria-label="用户角色分布">
            <div v-for="row in distributionRows" :key="row.label">
              <dt>{{ row.label }}</dt>
              <dd>{{ row.value }}</dd>
            </div>
          </dl>
          <p class="perm-note">
            口径：stats.admins 含停用管理员；活跃/停用为全表计数；普通用户数 = 总用户 − 管理员。
          </p>
        </section>

        <div class="panel-stack">
          <section class="panel permission-panel">
            <div class="panel-head">
              <div>
                <h2>{{ activeRole.title }}</h2>
                <p>{{ activeRole.summary }}</p>
              </div>
              <span class="spacer"></span>
              <span class="lock-note">
                <AppIcon name="lock" />
                {{ isBuiltInAdmin ? '系统内置' : '只读角色' }}
              </span>
            </div>
            <div class="table-wrap perm-wrap">
              <table class="data-table perm-table">
                <thead>
                  <tr>
                    <th scope="col">模块 / 权限</th>
                    <th scope="col">查看</th>
                    <th scope="col">操作</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="module in capabilityMatrix" :key="module.module">
                    <td>{{ module.module }}</td>
                    <td>
                      <input
                        v-if="canView(permissionValue(module))"
                        type="checkbox"
                        checked
                        disabled
                        :aria-label="`${module.module} 查看权限`"
                      />
                      <span v-else class="muted">—</span>
                    </td>
                    <td>
                      <input
                        v-if="canOperate(permissionValue(module))"
                        type="checkbox"
                        checked
                        disabled
                        :aria-label="`${module.module} 操作权限`"
                      />
                      <span v-else class="muted">—</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div class="panel-foot">
              <span>修改后立即对新会话生效；本页只读，不提供权限编辑。</span>
            </div>
          </section>

          <section class="panel matrix-block">
            <div class="panel-head">
              <div>
                <h2>内置能力矩阵</h2>
                <p>按模块对照 user / admin 的真实权限口径</p>
              </div>
            </div>
            <div class="table-wrap matrix-wrap">
              <table class="data-table matrix-table">
                <thead>
                  <tr>
                    <th scope="col">模块</th>
                    <th scope="col" class="mono">user</th>
                    <th scope="col" class="mono">admin</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="row in capabilityMatrix" :key="row.module">
                    <td>{{ row.module }}</td>
                    <td>{{ row.user }}</td>
                    <td>{{ row.admin }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div class="panel-foot">
              <span>口径：M7 后智能体与任务写操作仅管理员；审计管理员可查全局；平台密钥与管理台仅管理员。</span>
            </div>
          </section>
        </div>
      </div>
    </template>
  </div>
</template>
