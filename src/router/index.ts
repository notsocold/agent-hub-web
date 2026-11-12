import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'

import { setupGuards } from './guards'
import type { SystemCapabilities } from '@/types'

declare module 'vue-router' {
  interface RouteMeta {
    title?: string
    requiresAuth?: boolean
    guestOnly?: boolean
    /** 后端能力关闭时守卫会退回对话页，不在 M1 请求未注册端点。 */
    capability?: keyof SystemCapabilities
    /** M8：仅管理员可访问；非管理员进无权限页。 */
    requiresAdmin?: boolean
  }
}

export const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/auth/LoginView.vue'),
    meta: { title: '登录', guestOnly: true },
  },
  {
    path: '/register',
    name: 'register',
    component: () => import('@/views/auth/RegisterView.vue'),
    meta: { title: '注册', guestOnly: true },
  },
  {
    path: '/',
    component: () => import('@/layouts/AppLayout.vue'),
    meta: { requiresAuth: true },
    children: [
      { path: '', redirect: { name: 'chat' } },
      {
        path: 'chat',
        name: 'chat',
        component: () => import('@/views/chat/ChatView.vue'),
        meta: { title: '对话' },
      },
      {
        path: 'workflows',
        name: 'workflows',
        component: () => import('@/views/WorkflowsView.vue'),
        meta: { title: '工作流', capability: 'workflows' },
      },
      {
        // 静态段在动态段之前声明，避免 /workflows/new 被 /workflows/:id 吞掉。
        path: 'workflows/new',
        name: 'workflow-new',
        component: () => import('@/views/workflows/WorkflowsEditorView.vue'),
        meta: { title: '工作流编辑', capability: 'workflows' },
      },
      {
        path: 'workflows/:id',
        name: 'workflow-edit',
        component: () => import('@/views/workflows/WorkflowsEditorView.vue'),
        meta: { title: '工作流编辑', capability: 'workflows' },
      },
      {
        // 运行历史：仅模板 owner 可查（系统模板 403、他人/不存在 404），F3。
        path: 'workflows/:id/runs',
        name: 'workflow-runs',
        component: () => import('@/views/workflows/WorkflowsRunsView.vue'),
        meta: { title: '运行历史', capability: 'workflows' },
      },
      {
        path: 'agents',
        name: 'agents',
        component: () => import('@/views/AgentsView.vue'),
        meta: { title: '智能体', capability: 'agents' },
      },
      {
        path: 'tasks',
        name: 'tasks',
        component: () => import('@/views/TasksView.vue'),
        meta: { title: '任务', capability: 'tasks' },
      },
      {
        path: 'knowledge',
        name: 'knowledge',
        component: () => import('@/views/KnowledgeView.vue'),
        meta: { title: '知识库', capability: 'knowledge' },
      },
      {
        path: 'settings',
        name: 'settings',
        component: () => import('@/views/SettingsView.vue'),
        meta: { title: '设置' },
      },
    ],
  },
  {
    path: '/admin',
    component: () => import('@/layouts/AdminLayout.vue'),
    meta: { requiresAuth: true, requiresAdmin: true },
    children: [
      {
        path: '',
        name: 'admin-overview',
        component: () => import('@/views/admin/AdminOverviewView.vue'),
        meta: { title: '管理概览' },
      },
      {
        path: 'users',
        name: 'admin-users',
        component: () => import('@/views/admin/AdminUsersView.vue'),
        meta: { title: '用户管理' },
      },
      {
        path: 'roles',
        name: 'admin-roles',
        component: () => import('@/views/admin/AdminRolesView.vue'),
        meta: { title: '角色与权限' },
      },
      {
        path: 'menus',
        name: 'admin-menus',
        component: () => import('@/views/admin/AdminMenusView.vue'),
        meta: { title: '菜单管理' },
      },
      {
        path: 'dictionaries',
        name: 'admin-dictionaries',
        component: () => import('@/views/admin/AdminDictionariesView.vue'),
        meta: { title: '字典管理' },
      },
      {
        path: 'audit',
        name: 'admin-audit',
        component: () => import('@/views/admin/AdminAuditView.vue'),
        meta: { title: '审计日志' },
      },
      {
        path: 'settings',
        name: 'admin-settings',
        component: () => import('@/views/admin/AdminSettingsView.vue'),
        meta: { title: '系统设置' },
      },
    ],
  },
  {
    path: '/admin/forbidden',
    name: 'admin-forbidden',
    component: () => import('@/views/admin/AdminForbiddenView.vue'),
    meta: { requiresAuth: true, title: '无权限' },
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: () => import('@/views/NotFoundView.vue'),
    meta: { title: '页面不存在' },
  },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

setupGuards(router)

export default router
