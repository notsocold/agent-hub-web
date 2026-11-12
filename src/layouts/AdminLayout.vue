<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import { ElMessageBox } from 'element-plus'

import { useTheme } from '@/composables/useTheme'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const { theme, toggle } = useTheme()

interface AdminNavItem {
  name: string
  label: string
  icon: string
}

interface AdminNavGroup {
  label: string
  items: AdminNavItem[]
}

const groups: AdminNavGroup[] = [
  {
    label: '总览',
    items: [
      {
        name: 'admin-overview',
        label: '概览',
        icon: 'M4 13h6V4H4v9Zm0 7h6v-4H4v4Zm10 0h6V11h-6v9Zm0-13h6V4h-6v3Z',
      },
    ],
  },
  {
    label: '访问控制',
    items: [
      {
        name: 'admin-users',
        label: '用户管理',
        icon: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm7 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M16 14.2c2.3.6 4 2.6 4 5.1',
      },
      {
        name: 'admin-roles',
        label: '角色与权限',
        icon: 'M12 3l7 3v5c0 4.4-3 8-7 10-4-2-7-5.6-7-10V6l7-3Zm-1.2 12 4.2-4.2-1.4-1.4-2.8 2.8-1.4-1.4-1.4 1.4 2.8 2.8Z',
      },
    ],
  },
  {
    label: '平台配置',
    items: [
      {
        name: 'admin-menus',
        label: '菜单管理',
        icon: 'M4 7h16M4 12h16M4 17h10',
      },
      {
        name: 'admin-dictionaries',
        label: '字典管理',
        icon: 'M4 5c0-1 3.6-2 8-2s8 1 8 2v14c0 1-3.6 2-8 2s-8-1-8-2V5ZM4 5c0 1 3.6 2 8 2s8-1 8-2',
      },
      {
        name: 'admin-settings',
        label: '系统设置',
        icon: 'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm8-3.5-1.9-.7-.5-1.2 1-1.8-1.4-1.4-1.8 1-1.2-.5L13.5 4h-2l-.7 1.9-1.2.5-1.8-1L6.4 6.8l1 1.8-.5 1.2L5 10.5v2l1.9.7.5 1.2-1 1.8 1.4 1.4 1.8-1 1.2.5.7 1.9h2l.7-1.9 1.2-.5 1.8 1 1.4-1.4-1-1.8.5-1.2 1.9-.7v-2Z',
      },
    ],
  },
  {
    label: '治理',
    items: [
      {
        name: 'admin-audit',
        label: '审计日志',
        icon: 'M6 3h12a1 1 0 0 1 1 1v16l-3-2-2 2-2-2-2 2-2-2-3 2V4a1 1 0 0 1 1-1Zm2 5h8M8 11h8M8 14h5',
      },
    ],
  },
]

const mobileOpen = ref(false)
const current = computed(() => groups.flatMap((group) => group.items).find((item) => item.name === route.name))
const activeName = computed(() => route.name)

function navigate(): void {
  mobileOpen.value = false
}

function backToWorkbench(): void {
  void router.push({ name: 'chat' })
}

async function logout(): Promise<void> {
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

function onGlobalKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && mobileOpen.value) mobileOpen.value = false
}

onMounted(() => document.addEventListener('keydown', onGlobalKeydown))
onUnmounted(() => document.removeEventListener('keydown', onGlobalKeydown))
</script>

<template>
  <div class="admin-shell">
    <a class="admin-skip" href="#admin-main">跳到主内容</a>

    <div v-if="mobileOpen" class="admin-scrim" @click="mobileOpen = false"></div>

    <aside
      class="admin-rail"
      :class="{ 'is-open': mobileOpen }"
      aria-label="管理导航"
      :inert="mobileOpen ? undefined : undefined"
    >
      <div class="rail-brand">
        <span class="brand-mark" aria-hidden="true">A</span>
        <span class="brand-text">
          <b>Agent Hub</b>
          <small>管理控制台</small>
        </span>
        <span class="admin-badge">管理员</span>
      </div>

      <button type="button" class="rail-back" @click="backToWorkbench">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
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
            <svg class="ic" viewBox="0 0 24 24" aria-hidden="true">
              <path :d="item.icon" />
            </svg>
            <span>{{ item.label }}</span>
          </RouterLink>
        </div>
      </nav>

      <div class="rail-foot">
        <div class="rail-health">
          <span class="dot" aria-hidden="true"></span>
          <span>管理端已连接</span>
        </div>
        <div class="rail-account">
          <span class="rail-avatar">{{ (auth.user?.display_name || 'AH').slice(0, 2) }}</span>
          <span class="rail-account-main">
            <b>{{ auth.user?.display_name || '管理员' }}</b>
            <small>{{ auth.user?.email || '' }}</small>
          </span>
          <button type="button" class="rail-logout" aria-label="退出登录" @click="logout">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M10 5H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h4M15 8l4 4-4 4M19 12H9" />
            </svg>
          </button>
        </div>
      </div>
    </aside>

    <div class="admin-main">
      <header class="admin-topbar">
        <button
          type="button"
          class="icon-btn admin-burger"
          aria-label="打开管理导航"
          :aria-expanded="mobileOpen"
          @click="mobileOpen = !mobileOpen"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
        </button>
        <p class="crumb">
          <span>管理控制台</span>
          <span aria-hidden="true">/</span>
          <b>{{ current?.label ?? '概览' }}</b>
        </p>
        <div class="topbar-tools">
          <button type="button" class="icon-btn" aria-label="打开工作台" @click="backToWorkbench">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M14 5h5v5M19 5l-7 7M10 5H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" />
            </svg>
          </button>
          <button
            type="button"
            class="icon-btn"
            :aria-label="theme === 'dark' ? '切换到浅色' : '切换到深色'"
            @click="toggle"
          >
            <svg v-if="theme === 'dark'" viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" />
            </svg>
            <svg v-else viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z" /></svg>
          </button>
        </div>
      </header>

      <main id="admin-main" class="admin-content">
        <RouterView />
      </main>
    </div>
  </div>
</template>

<style scoped>
.admin-shell {
  display: grid;
  grid-template-columns: 248px minmax(0, 1fr);
  min-height: 100vh;
  background: var(--paper);
  color: var(--ink);
}

.admin-skip {
  position: absolute;
  left: 8px;
  top: -48px;
  z-index: 30;
  padding: 8px 12px;
  border-radius: 6px;
  background: var(--surface);
  color: var(--ink);
}

.admin-skip:focus {
  top: 8px;
}

/* 深墨侧栏：不随主题翻转，与原型的“管理后台”气质一致。 */
.admin-rail {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 18px 14px 14px;
  background: #141b20;
  color: #e8e7df;
  border-right: 1px solid rgba(255, 255, 255, 0.08);
  min-height: 100vh;
}

.rail-brand {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 2px 6px 10px;
}

.brand-mark {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 8px;
  background: #f0efe8;
  color: #141b20;
  font-weight: 700;
}

.brand-text {
  display: flex;
  flex-direction: column;
  line-height: 1.15;
}

.brand-text b {
  font-size: 13px;
}

.brand-text small {
  color: #9aa6ad;
  font-size: 10.5px;
}

.admin-badge {
  margin-left: auto;
  padding: 2px 7px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 999px;
  color: #cbd3d8;
  font-size: 10px;
}

.rail-back {
  display: flex;
  align-items: center;
  gap: 7px;
  margin: 0 6px 2px;
  padding: 7px 9px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 6px;
  background: transparent;
  color: #cbd3d8;
  font-size: 12px;
}

.rail-back:hover {
  border-color: rgba(255, 255, 255, 0.3);
  color: #fff;
}

.rail-back svg,
.rail-link svg,
.rail-logout svg {
  width: 15px;
  height: 15px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.rail-nav {
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.rail-group {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.rail-label {
  margin: 4px 8px;
  color: #7f8b93;
  font-size: 10px;
  letter-spacing: 0.08em;
}

.rail-link {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 8px 10px;
  border-radius: 6px;
  color: #cbd3d8;
  font-size: 12.5px;
}

.rail-link:hover {
  background: rgba(255, 255, 255, 0.06);
  color: #fff;
}

.rail-link.is-active {
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
  font-weight: 600;
}

.rail-link .ic {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.rail-foot {
  display: flex;
  flex-direction: column;
  gap: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  padding-top: 10px;
}

.rail-health {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 8px;
  color: #9aa6ad;
  font-size: 10.5px;
}

.rail-health .dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #7fbf8f;
}

.rail-account {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
}

.rail-avatar {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.14);
  color: #fff;
  font-size: 11px;
}

.rail-account-main {
  display: flex;
  flex-direction: column;
  line-height: 1.2;
  min-width: 0;
}

.rail-account-main b {
  font-size: 11.5px;
  color: #f2f1ea;
}

.rail-account-main small {
  color: #8d99a1;
  font-size: 10px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rail-logout {
  margin-left: auto;
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 6px;
  background: transparent;
  color: #cbd3d8;
}

.rail-logout:hover {
  border-color: rgba(255, 255, 255, 0.32);
  color: #fff;
}

.admin-main {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 100vh;
}

.admin-topbar {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 10px;
  height: 52px;
  padding: 0 22px;
  border-bottom: 1px solid var(--line);
  background: color-mix(in srgb, var(--paper) 92%, transparent);
  backdrop-filter: blur(6px);
}

.crumb {
  display: flex;
  align-items: center;
  gap: 7px;
  margin: 0;
  color: var(--ink-3);
  font-size: 12px;
}

.crumb b {
  color: var(--ink);
  font-weight: 600;
}

.topbar-tools {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
}

.icon-btn {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--surface);
  color: var(--ink-2);
}

.icon-btn:hover {
  border-color: var(--ink-3);
  color: var(--ink);
}

.icon-btn svg {
  width: 15px;
  height: 15px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.admin-burger {
  display: none;
}

.admin-content {
  flex: 1;
  min-height: 0;
  padding: 26px 28px 56px;
}

.admin-scrim {
  display: none;
}

@media (max-width: 900px) {
  .admin-shell {
    grid-template-columns: 1fr;
  }

  .admin-rail {
    position: fixed;
    inset: 0 auto 0 0;
    z-index: 40;
    width: 260px;
    transform: translateX(-100%);
    transition: transform 0.18s ease;
  }

  .admin-rail.is-open {
    transform: translateX(0);
  }

  .admin-scrim {
    display: block;
    position: fixed;
    inset: 0;
    z-index: 35;
    background: rgba(20, 27, 32, 0.4);
  }

  .admin-burger {
    display: grid;
  }

  .admin-content {
    padding: 20px 16px 44px;
  }
}
</style>
