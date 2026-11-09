<script setup lang="ts">
import { ref } from 'vue'
import { RouterView, useRoute, useRouter } from 'vue-router'
import { ElMessageBox } from 'element-plus'

import SideNav from '@/components/layout/SideNav.vue'
import { useMediaQuery } from '@/composables/useMediaQuery'
import { useTheme } from '@/composables/useTheme'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const { theme, toggle } = useTheme()
const isMobile = useMediaQuery('(max-width: 900px)')

const collapsed = ref(false)
const mobileOpen = ref(false)

function openSettings(): void {
  mobileOpen.value = false
  void router.push({ name: 'settings' })
}

async function logout(): Promise<void> {
  try {
    await ElMessageBox.confirm('退出后需要重新登录，未发送的内容不会保留。', '退出登录', {
      confirmButtonText: '退出',
      cancelButtonText: '取消',
      type: 'warning',
    })
  } catch {
    return
  }
  await auth.logout()
  await router.replace({ name: 'login' })
}
</script>

<template>
  <div class="app-shell" :class="{ 'is-collapsed': collapsed && !isMobile }">
    <SideNav
      :collapsed="collapsed"
      :mobile="isMobile"
      :open="mobileOpen"
      :user="auth.user"
      :theme="theme"
      @toggle="collapsed = !collapsed"
      @navigate="mobileOpen = false"
      @settings="openSettings"
      @toggle-theme="toggle"
      @logout="logout"
    />

    <div
      v-if="isMobile && mobileOpen"
      class="scrim"
      aria-hidden="true"
      @click="mobileOpen = false"
    ></div>

    <main class="app-main">
      <header v-if="isMobile" class="mobile-bar">
        <button class="mobile-menu" type="button" aria-label="打开导航" @click="mobileOpen = true">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>
        <span class="mobile-title">{{ route.meta.title }}</span>
      </header>

      <div class="app-content">
        <RouterView />
      </div>
    </main>
  </div>
</template>

<style scoped>
.app-shell {
  display: grid;
  grid-template-columns: var(--sidebar-w) minmax(0, 1fr);
  height: 100dvh;
  min-height: 0;
  transition: grid-template-columns 0.22s ease;
}

.app-shell.is-collapsed {
  grid-template-columns: var(--sidebar-rail) minmax(0, 1fr);
}

.app-main {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: var(--paper);
}

.app-content {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.mobile-bar {
  display: flex;
  flex: none;
  align-items: center;
  gap: 10px;
  height: 48px;
  padding: 0 14px;
  border-bottom: 1px solid var(--line);
  background: var(--paper);
}

.mobile-menu {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border: 1px solid var(--line);
  border-radius: 5px;
  background: var(--surface);
  color: var(--ink-2);
}

.mobile-menu svg {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.6;
  stroke-linecap: round;
}

.mobile-title {
  font-size: 13px;
  font-weight: 600;
}

.scrim {
  position: fixed;
  inset: 0;
  z-index: 25;
  background: rgba(20, 27, 32, 0.42);
}

@media (max-width: 900px) {
  .app-shell,
  .app-shell.is-collapsed {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
