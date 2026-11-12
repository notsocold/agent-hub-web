<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { RouterView, useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'

import DiagnosticsDrawer from '@/components/common/DiagnosticsDrawer.vue'
import CommandPalette from '@/components/common/CommandPalette.vue'
import ConversationSidebar from '@/components/chat/ConversationSidebar.vue'
import SideNav from '@/components/layout/SideNav.vue'
import { useMediaQuery } from '@/composables/useMediaQuery'
import { useTheme } from '@/composables/useTheme'
import { startWebVitals } from '@/utils/web-vitals'
import { useAuthStore } from '@/stores/auth'
import { useChatStore } from '@/stores/chat'
import { useConversationsStore } from '@/stores/conversations'
import { useSystemStore } from '@/stores/system'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const chat = useChatStore()
const conversations = useConversationsStore()
const system = useSystemStore()
const { theme, toggle } = useTheme()
const isMobile = useMediaQuery('(max-width: 900px)')

const collapsed = ref(false)
const mobileOpen = ref(false)
const diagnosticsOpen = ref(false)
const paletteOpen = ref(false)
const activeId = computed(() => (typeof route.query.c === 'string' ? route.query.c : undefined))
let stopWebVitals: (() => void) | null = null

/** F1：Ctrl/Cmd+K 打开全局搜索；输入框内也允许，便于随时跳转。 */
function onGlobalKeydown(event: KeyboardEvent): void {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault()
    paletteOpen.value = !paletteOpen.value
    return
  }
  if (event.key === 'Escape' && mobileOpen.value) mobileOpen.value = false
}

onMounted(() => {
  // 登录后尽早拉取系统信息，导航按 capabilities 置灰。
  if (auth.isAuthenticated) void system.load()
  // 布局挂载即开始采集 Web Vitals，卸载时断开 observer。
  stopWebVitals = startWebVitals()
  document.addEventListener('keydown', onGlobalKeydown)
})

onUnmounted(() => {
  stopWebVitals?.()
  stopWebVitals = null
  document.removeEventListener('keydown', onGlobalKeydown)
})

function openSettings(): void {
  mobileOpen.value = false
  void router.push({ name: 'settings' })
}

function openAdmin(): void {
  mobileOpen.value = false
  void router.push({ name: 'admin-overview' })
}

async function createConversation(): Promise<void> {
  if (chat.state.streaming) chat.stop()
  try {
    const conversation = await conversations.create()
    mobileOpen.value = false
    const target = { name: 'chat' as const, query: { c: conversation.id } }
    if (route.name === 'chat') await router.replace(target)
    else await router.push(target)
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '新建会话失败')
  }
}

/** 侧栏会话在所有页面常驻；对话页内切换用 replace，跨页用 push。 */
function selectConversation(id: string): void {
  // 点击当前会话不应中止正在生成的回复。
  if (id === activeId.value) {
    mobileOpen.value = false
    return
  }
  if (chat.state.streaming) chat.stop()
  mobileOpen.value = false
  if (route.name === 'chat') {
    void router.replace({ name: 'chat', query: { ...route.query, c: id } })
  } else {
    void router.push({ name: 'chat', query: { c: id } })
  }
}

function handleRemoved(id: string): void {
  if (chat.state.conversationId === id) {
    if (chat.state.streaming) chat.stop()
    chat.reset()
  }
  if (route.name === 'chat' && route.query.c === id) {
    void router.replace({ name: 'chat', query: {} })
  }
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
    <a class="skip-link" href="#main-content">跳到主内容</a>
    <SideNav
      :collapsed="collapsed && !isMobile"
      :mobile="isMobile"
      :open="mobileOpen"
      :user="auth.user"
      :theme="theme"
      :capabilities="system.info?.capabilities"
      @toggle="collapsed = !collapsed"
      @navigate="mobileOpen = false"
      @search="paletteOpen = true"
      @settings="openSettings"
      @admin="openAdmin"
      @diagnostics="diagnosticsOpen = true"
      @toggle-theme="toggle"
      @logout="logout"
    >
      <template #new-session>
        <button type="button" @click="createConversation">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
          <span>新建会话</span>
        </button>
      </template>
      <template #sessions>
        <ConversationSidebar
          :active-id="activeId"
          @select="selectConversation"
          @removed="handleRemoved"
        />
      </template>
    </SideNav>

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
        <button
          class="mobile-search"
          type="button"
          aria-label="全局搜索"
          @click="paletteOpen = true"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="11" cy="11" r="6" />
            <path d="m15.5 15.5 4.5 4.5" />
          </svg>
        </button>
      </header>

      <div id="main-content" class="app-content" tabindex="-1">
        <RouterView />
      </div>
    </main>

    <CommandPalette
      :open="paletteOpen"
      :capabilities="system.info?.capabilities"
      @close="paletteOpen = false"
    />

    <DiagnosticsDrawer :open="diagnosticsOpen" @close="diagnosticsOpen = false" />
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

.skip-link {
  position: absolute;
  top: -48px;
  left: 12px;
  z-index: 100;
  padding: 8px 12px;
  border-radius: 6px;
  background: var(--btn-bg);
  color: var(--btn-fg);
  font-size: 12px;
  font-weight: 600;
}

.skip-link:focus {
  top: 12px;
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

.mobile-search {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  margin-left: auto;
  border: 1px solid var(--line);
  border-radius: 5px;
  background: var(--surface);
  color: var(--ink-2);
}

.mobile-search svg {
  width: 15px;
  height: 15px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.6;
  stroke-linecap: round;
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
