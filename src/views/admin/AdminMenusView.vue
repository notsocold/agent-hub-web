<script setup lang="ts">
import PageHeader from '@/components/common/PageHeader.vue'
import { routes } from '@/router'
import type { RouteRecordRaw } from 'vue-router'

interface MenuRow {
  title: string
  path: string
  requiresAdmin: boolean
  /** meta.capability 的能力开关 key（如 workflows）；无则为 null。 */
  capability: string | null
  requiresAuth: boolean
}

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
      } satisfies MenuRow
    })(),
  ),
]
</script>

<template>
  <div class="admin-page">
    <PageHeader
      eyebrow="ADMIN · MENUS"
      title="菜单管理"
      description="工作台与管理台两级路由菜单的只读镜像。后端无对应管理接口，本页为只读呈现，菜单变更需改代码并重新构建。"
    />

    <section class="notice" role="note" aria-label="只读说明">
      <p class="notice-tag mono">READ-ONLY · 只读呈现</p>
      <p class="notice-body">
        后端无菜单配置接口，此页为前端路由的只读镜像：菜单数据直接取自 src/router/index.ts
        的路由表，菜单变更需修改代码并重新构建生效；登录 / 注册等访客页与 404 不在菜单树内。
      </p>
    </section>

    <section class="panel">
      <h2>
        工作台路由 · AppLayout 子路由
        <span class="count mono">{{ workbenchRows.length }}</span>
      </h2>
      <table>
        <thead>
          <tr>
            <th scope="col">菜单</th>
            <th scope="col">路径</th>
            <th scope="col">权限标识</th>
            <th scope="col">是否登录</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in workbenchRows" :key="row.path">
            <td>{{ row.title }}</td>
            <td class="mono path">{{ row.path }}</td>
            <td>
              <span v-if="row.requiresAdmin">仅管理员</span>
              <span v-else-if="row.capability" class="mono">{{ row.capability }}</span>
              <span v-else class="muted">—</span>
            </td>
            <td>{{ row.requiresAuth ? '是' : '否' }}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <section class="panel">
      <h2>
        管理台路由 · AdminLayout 子路由 + 无权限页
        <span class="count mono">{{ adminRows.length }}</span>
      </h2>
      <table>
        <thead>
          <tr>
            <th scope="col">菜单</th>
            <th scope="col">路径</th>
            <th scope="col">权限标识</th>
            <th scope="col">是否登录</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in adminRows" :key="row.path">
            <td>{{ row.title }}</td>
            <td class="mono path">{{ row.path }}</td>
            <td>
              <span v-if="row.requiresAdmin">仅管理员</span>
              <span v-else-if="row.capability" class="mono">{{ row.capability }}</span>
              <span v-else class="muted">—</span>
            </td>
            <td>{{ row.requiresAuth ? '是' : '否' }}</td>
          </tr>
        </tbody>
      </table>
      <p class="note">
        管理台子路由经父级 /admin 继承
        meta.requiresAdmin，权限标识统一为「仅管理员」；/admin/forbidden
        为非管理员访问管理台时的回退页，本身不设额外管理权限。
      </p>
    </section>
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

.count {
  margin-left: 8px;
  color: var(--ink-3);
  font-size: 10.5px;
  font-weight: 400;
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

tbody tr:last-child th,
tbody tr:last-child td {
  border-bottom: none;
}

td.path {
  color: var(--ink-2);
  overflow-wrap: anywhere;
}

.muted {
  color: var(--ink-3);
}

.note {
  margin: 10px 0 0;
  color: var(--ink-3);
  font-size: 10.5px;
  line-height: 1.7;
}
</style>
