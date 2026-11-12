<script setup lang="ts">
import { computed, ref } from 'vue'

import AppIcon from '@/components/common/AppIcon.vue'
import { routes } from '@/router'
import type { RouteRecordRaw } from 'vue-router'

/**
 * 菜单管理：前端路由表的只读镜像。
 * 后端无菜单配置接口，菜单变更需改代码并重新构建；本页只呈现真实路由数据。
 */

interface MenuRow {
  title: string
  path: string
  requiresAdmin: boolean
  /** meta.capability 的能力开关 key（如 workflows）；无则为 null。 */
  capability: string | null
  requiresAuth: boolean
  type: '目录' | '页面' | '按钮'
}

const keyword = ref('')
const groupFilter = ref<'all' | 'workbench' | 'admin'>('all')

function joinPath(parentPath: string, childPath: string): string {
  const base = parentPath.endsWith('/') ? parentPath.slice(0, -1) : parentPath
  return childPath ? `${base}/${childPath}` : base || '/'
}

function toRow(parent: RouteRecordRaw, child: RouteRecordRaw): MenuRow | null {
  // 子路由继承父级 meta（与 vue-router 匹配时合并 matched meta 的行为一致）。
  const meta = { ...parent.meta, ...child.meta }
  if (!meta.title) return null
  return {
    title: meta.title,
    path: joinPath(parent.path, child.path),
    requiresAdmin: meta.requiresAdmin === true,
    capability: meta.capability ?? null,
    requiresAuth: meta.requiresAuth === true,
    type: '页面',
  }
}

function collectChildren(parent: RouteRecordRaw | undefined): MenuRow[] {
  if (!parent?.children) return []
  return parent.children.flatMap((child) => {
    const row = toRow(parent, child)
    return row ? [row] : []
  })
}

function compact(row: MenuRow | null): MenuRow[] {
  return row ? [row] : []
}

const workbenchParent = routes.find((route) => route.path === '/')
const adminParent = routes.find((route) => route.path === '/admin')

const workbenchRows = collectChildren(workbenchParent)

const adminRows = [
  ...collectChildren(adminParent),
  // /admin/forbidden 是独立于 AdminLayout 的无权限回退页，单独补一行。
  ...compact(
    (() => {
      const route = routes.find((candidate) => candidate.path === '/admin/forbidden')
      if (!route?.meta?.title) return null
      return {
        title: route.meta.title,
        path: route.path,
        requiresAdmin: false,
        capability: null,
        requiresAuth: route.meta.requiresAuth === true,
        type: '页面',
      } satisfies MenuRow
    })(),
  ),
]

function matches(row: MenuRow): boolean {
  const query = keyword.value.trim().toLowerCase()
  if (!query) return true
  return [row.title, row.path, row.capability ?? ''].some((value) =>
    value.toLowerCase().includes(query),
  )
}

const filteredWorkbench = computed(() =>
  groupFilter.value === 'admin' ? [] : workbenchRows.filter(matches),
)
const filteredAdmin = computed(() =>
  groupFilter.value === 'workbench' ? [] : adminRows.filter(matches),
)
const totalVisible = computed(() => filteredWorkbench.value.length + filteredAdmin.value.length)

function setGroup(next: 'all' | 'workbench' | 'admin'): void {
  groupFilter.value = next
}
</script>

<template>
  <div class="admin-page">
    <header class="admin-page-head">
      <div>
        <h1 class="page-title">菜单管理</h1>
        <p class="page-sub">
          维护工作台与管理控制台的导航结构、可见性和权限标识。管理菜单只对管理员角色开放。
        </p>
      </div>
      <div class="head-actions">
        <button type="button" class="btn btn-outline" @click="keyword = ''; groupFilter = 'all'">
          <AppIcon name="refresh" />
          重置筛选
        </button>
      </div>
    </header>

    <div class="prototype-note" role="note">
      <AppIcon name="alert" />
      <span>
        <b>只读镜像</b>：后端无对应管理接口，此页为前端路由的只读镜像；菜单数据直接取自
        src/router/index.ts 的路由表，菜单变更需修改代码并重新构建生效。登录 / 注册等访客页与 404
        不在菜单树内。
      </span>
    </div>

    <div class="toolbar">
      <label class="search-field">
        <AppIcon name="search" />
        <input
          v-model="keyword"
          type="search"
          placeholder="搜索菜单名称、路径或权限标识"
          aria-label="搜索菜单"
          autocomplete="off"
        />
      </label>
      <div class="seg" role="group" aria-label="按菜单分组筛选">
        <button
          type="button"
          :class="{ 'is-active': groupFilter === 'all' }"
          :aria-pressed="groupFilter === 'all'"
          @click="setGroup('all')"
        >
          全部
        </button>
        <button
          type="button"
          :class="{ 'is-active': groupFilter === 'workbench' }"
          :aria-pressed="groupFilter === 'workbench'"
          @click="setGroup('workbench')"
        >
          工作台
        </button>
        <button
          type="button"
          :class="{ 'is-active': groupFilter === 'admin' }"
          :aria-pressed="groupFilter === 'admin'"
          @click="setGroup('admin')"
        >
          管理台
        </button>
      </div>
      <span class="spacer"></span>
      <span class="mono count-label">{{ totalVisible }} 项</span>
    </div>

    <section v-if="filteredWorkbench.length > 0" class="menu-section">
      <div class="table-wrap">
        <table class="data-table menu-table">
          <caption>
            <span class="tree-group">
              <AppIcon name="overview" />
              工作台路由
            </span>
            <span class="badge">{{ filteredWorkbench.length }} 项</span>
          </caption>
          <colgroup>
            <col style="width: 30%" />
            <col style="width: 18%" />
            <col style="width: 8%" />
            <col style="width: 18%" />
            <col style="width: 8%" />
            <col style="width: 8%" />
            <col style="width: 10%" />
          </colgroup>
          <thead>
            <tr>
              <th scope="col">菜单</th>
              <th scope="col">路径</th>
              <th scope="col">类型</th>
              <th scope="col">权限标识</th>
              <th scope="col">是否登录</th>
              <th scope="col">状态</th>
              <th scope="col" class="actions">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in filteredWorkbench" :key="row.path">
              <td>
                <span class="tree-indent" aria-hidden="true"></span>
                <span class="tree-name">{{ row.title }}</span>
              </td>
              <td class="path">{{ row.path }}</td>
              <td><span class="type-chip">页面</span></td>
              <td>
                <span v-if="row.requiresAdmin">仅管理员</span>
                <span v-else-if="row.capability" class="perm mono">{{ row.capability }}</span>
                <span v-else class="muted">—</span>
              </td>
              <td class="visibility">{{ row.requiresAuth ? '是' : '否' }}</td>
              <td><span class="st st-ok"><span class="dot"></span>启用</span></td>
              <td class="actions"><span class="muted">—</span></td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section v-if="filteredAdmin.length > 0" class="menu-section">
      <div class="table-wrap">
        <table class="data-table menu-table is-continuation">
          <caption>
            <span class="tree-group">
              <AppIcon name="shield" />
              管理台路由
            </span>
            <span class="badge">{{ filteredAdmin.length }} 项</span>
          </caption>
          <colgroup>
            <col style="width: 30%" />
            <col style="width: 18%" />
            <col style="width: 8%" />
            <col style="width: 18%" />
            <col style="width: 8%" />
            <col style="width: 8%" />
            <col style="width: 10%" />
          </colgroup>
          <thead class="sr-only">
            <tr>
              <th scope="col">菜单</th>
              <th scope="col">路径</th>
              <th scope="col">类型</th>
              <th scope="col">权限标识</th>
              <th scope="col">是否登录</th>
              <th scope="col">状态</th>
              <th scope="col" class="actions">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in filteredAdmin" :key="row.path">
              <td>
                <span class="tree-indent" aria-hidden="true"></span>
                <span class="tree-name">{{ row.title }}</span>
              </td>
              <td class="path">{{ row.path }}</td>
              <td>
                <span class="type-chip">{{ row.type }}</span>
              </td>
              <td>
                <span v-if="row.requiresAdmin">仅管理员</span>
                <span v-else-if="row.capability" class="perm mono">{{ row.capability }}</span>
                <span v-else class="muted">—</span>
              </td>
              <td class="visibility">{{ row.requiresAuth ? '是' : '否' }}</td>
              <td><span class="st st-ok"><span class="dot"></span>启用</span></td>
              <td class="actions"><span class="muted">—</span></td>
            </tr>
          </tbody>
        </table>
        <div class="table-foot">
          <span>
            共 {{ adminRows.length }} 项 · {{ workbenchRows.length }} 个工作台路由 ·
            {{ adminRows.length }} 个管理台路由（含无权限回退页）
          </span>
          <span class="spacer"></span>
          <span>菜单变更后需重新登录生效</span>
        </div>
      </div>
    </section>

    <div v-if="filteredWorkbench.length === 0 && filteredAdmin.length === 0" class="empty-state">
      没有匹配的菜单。
    </div>
  </div>
</template>
