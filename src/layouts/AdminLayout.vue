<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import { ElMessageBox } from 'element-plus'

import AppIcon from '@/components/common/AppIcon.vue'
import IconSprite from '@/components/common/IconSprite.vue'
import { adminApi } from '@/api/admin'
import { routes } from '@/router'
import { useTheme } from '@/composables/useTheme'
import { useAuthStore } from '@/stores/auth'

/**
 * 管理台外壳：深墨侧栏 + 面包屑 header + 可滚动内容区。
 * 视觉取自 ui-v8-admin.html，样式统一收敛在 src/styles/admin.css（.admin-shell 作用域）。
 */

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const { theme, toggle } = useTheme()

interface AdminNavItem {
  name: string
  label: string
  icon: string
  /** 后端契约拿不到精确计数时为空，不展示假数字。 */
  count?: number | null
}

interface AdminNavGroup {
  label: string
  items: AdminNavItem[]
}

/** 用户数来自真实管理端接口；其余计数来自本地路由/内置枚举。 */
const userCount = ref<number | null>(null)

const menuCount = computed(() => {
  let total = 0
  for (const parent of routes) {
    if (parent.path === '/' || parent.path === '/admin') {
      total += parent.children?.filter((child) => Boolean(child.meta?.title)).length ?? 0
    }
  }
  // /admin/forbidden 是独立于 AdminLayout 的回退页，也属于管理台菜单树。
  return routes.some((candidate) => candidate.path === '/admin/forbidden') ? total + 1 : total
})

const groups = computed<AdminNavGroup[]>(() => [
  {
    label: '总览',
    items: [{ name: 'admin-overview', label: '概览', icon: 'overview' }],
  },
  {
    label: '访问控制',
    items: [
      { name: 'admin-users', label: '用户管理', icon: 'users', count: userCount.value },
      { name: 'admin-roles', label: '角色与权限', icon: 'shield', count: 2 },
    ],
  },
  {
    label: '平台配置',
    items: [
      { name: 'admin-menus', label: '菜单管理', icon: 'menu', count: menuCount.value },
      { name: 'admin-dictionaries', label: '字典管理', icon: 'book', count: 10 },
      { name: 'admin-settings', label: '系统设置', icon: 'settings' },
    ],
  },
  {
    label: '治理',
    items: [{ name: 'admin-audit', label: '审计日志', icon: 'audit' }],
  },
])

const mobileOpen = ref(false)
const accountOpen = ref(false)
const accountRoot = ref<HTMLElement | null>(null)

const current = computed(() =>
  groups.value.flatMap((group) => group.items).find((item) => item.name === route.name),
)
const activeName = computed(() => route.name)

const roleLabel = computed(() => (auth.isAdmin ? '超级管理员' : '普通用户'))

const initials = computed(() => {
  const source = auth.user?.display_name?.trim() || auth.user?.email || 'AH'
  return source.slice(0, 2).toUpperCase()
})

function navigate(): void {
  mobileOpen.value = false
}

function backToWorkbench(): void {
  accountOpen.value = false
  void router.push({ name: 'chat' })
}

function toggleAccount(): void {
  accountOpen.value = !accountOpen.value
}

function closeAccount(): void {
  accountOpen.value = false
}

async function logout(): Promise<void> {
  accountOpen.value = false
  try {
    await ElMessageBox.confirm('退出后将回到登录页，确认退出？', '退出登录', {
      confirmButtonText: '退出',
      cancelButtonText: '取消',
      type: 'warning',
    })
  } catch {
    return
  }
  await auth.logout()
  void router.push({ name: 'login' })
}

async function loadUserCount(): Promise<void> {
  try {
    const page = await adminApi.users({ limit: 1 })
    userCount.value = page.stats.total
  } catch {
    // 计数是装饰信息：权限或网络异常时静默隐藏，不打断管理导航。
    userCount.value = null
  }
}

function onDocumentClick(event: MouseEvent): void {
  if (!accountOpen.value) return
  const target = event.target as Node | null
  if (accountRoot.value && target && !accountRoot.value.contains(target)) closeAccount()
}

function onGlobalKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return
  if (accountOpen.value) accountOpen.value = false
  if (mobileOpen.value) mobileOpen.value = false
}

onMounted(() => {
  document.addEventListener('click', onDocumentClick)
  document.addEventListener('keydown', onGlobalKeydown)
  if (auth.isAdmin) void loadUserCount()
})
onUnmounted(() => {
  document.removeEventListener('click', onDocumentClick)
  document.removeEventListener('keydown', onGlobalKeydown)
})
</script>

<template>
  <div class="admin-shell">
    <IconSprite />
    <a class="admin-skip" href="#admin-main">跳到主内容</a>

    <div v-if="mobileOpen" class="rail-scrim admin-scrim" @click="mobileOpen = false"></div>

    <aside class="rail admin-rail" :class="{ 'is-open': mobileOpen }" aria-label="管理导航">
      <div class="rail-brand">
        <RouterLink
          class="brand-lockup"
          :to="{ name: 'admin-overview' }"
          aria-label="Agent Hub 管理控制台"
        >
          <span class="brand-mark" aria-hidden="true"><AppIcon name="brand" /></span>
          <span class="brand-text">
            <b>Agent Hub</b>
            <small>管理控制台</small>
          </span>
        </RouterLink>
        <span class="admin-badge">管理员</span>
      </div>

      <button type="button" class="rail-back" @click="backToWorkbench">
        <AppIcon name="back" />
        返回工作台
      </button>

      <nav class="rail-nav" aria-label="管理页面">
        <div v-for="group in groups" :key="group.label" class="rail-group">
          <p class="rail-label">{{ group.label }}</p>
          <RouterLink
            v-for="item in group.items"
            :key="item.name"
            :to="{ name: item.name }"
            class="rail-link"
            :class="{ 'is-active': activeName === item.name }"
            :aria-current="activeName === item.name ? 'page' : undefined"
            @click="navigate"
          >
            <AppIcon :name="item.icon" />
            <span>{{ item.label }}</span>
            <span v-if="item.count !== undefined && item.count !== null" class="rail-count" aria-hidden="true">
              {{ item.count }}
            </span>
          </RouterLink>
        </div>
      </nav>

      <div class="rail-foot">
        <div class="rail-health">
          <span class="dot" aria-hidden="true"></span>
          <span>管理端已连接</span>
        </div>
        <div class="rail-account">
          <span class="rail-avatar" aria-hidden="true">{{ initials }}</span>
          <span class="rail-account-main">
            <b>{{ auth.user?.display_name || '管理员' }}</b>
            <small>{{ auth.user?.email || '' }}</small>
          </span>
          <button type="button" class="rail-logout" aria-label="退出登录" @click="logout">
            <AppIcon name="logout" />
          </button>
        </div>
      </div>
    </aside>

    <div class="admin-main">
      <header class="topbar">
        <button
          type="button"
          class="icon-btn mobile-menu"
          aria-label="打开管理导航"
          :aria-expanded="mobileOpen"
          @click="mobileOpen = !mobileOpen"
        >
          <AppIcon name="menu-burger" />
        </button>
        <p class="crumb">
          <span>管理控制台</span>
          <span class="crumb-sep" aria-hidden="true">/</span>
          <b>{{ current?.label ?? '概览' }}</b>
        </p>
        <div class="topbar-tools">
          <button
            type="button"
            class="icon-btn"
            :aria-label="theme === 'dark' ? '切换到浅色' : '切换到深色'"
            @click="toggle"
          >
            <AppIcon :name="theme === 'dark' ? 'sun' : 'moon'" />
          </button>
          <div ref="accountRoot" class="account-entry">
            <button
              type="button"
              class="topbar-avatar"
              :aria-label="`账号菜单：${auth.user?.display_name || '管理员'}`"
              aria-haspopup="menu"
              :aria-expanded="accountOpen"
              @click="toggleAccount"
            >
              {{ initials }}
            </button>
            <div v-if="accountOpen" class="admin-account-pop" role="menu">
              <div class="account-pop-head">
                <b>{{ auth.user?.display_name || '管理员' }}</b>
                <small>{{ auth.user?.email || '' }} · {{ roleLabel }}</small>
              </div>
              <RouterLink
                class="account-pop-item"
                role="menuitem"
                :to="{ name: 'settings' }"
                @click="closeAccount"
              >
                <AppIcon name="settings" />
                个人设置
              </RouterLink>
              <button type="button" class="account-pop-item" role="menuitem" @click="backToWorkbench">
                <AppIcon name="external" />
                返回工作台
              </button>
              <button type="button" class="account-pop-item is-danger" role="menuitem" @click="logout">
                <AppIcon name="logout" />
                退出登录
              </button>
            </div>
          </div>
        </div>
      </header>

      <main id="admin-main" class="admin-scroll">
        <RouterView />
      </main>
    </div>
  </div>
</template>
