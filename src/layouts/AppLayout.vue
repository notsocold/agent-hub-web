<script setup lang="ts">
import { computed, onMounted, onUnmounted, provide, ref } from 'vue'
import { RouterView, useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'

import DiagnosticsDrawer from '@/components/common/DiagnosticsDrawer.vue'
import CommandPalette from '@/components/common/CommandPalette.vue'
import IconSprite from '@/components/common/IconSprite.vue'
import AppIcon from '@/components/common/AppIcon.vue'
import ConversationSidebar from '@/components/chat/ConversationSidebar.vue'
import SideNav from '@/components/layout/SideNav.vue'
import { agentsApi } from '@/api/agents'
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
const isChat = computed(() => route.name === 'chat')
let stopWebVitals: (() => void) | null = null

/** 侧栏底部 A2A 连接概览：来自远程智能体列表（仅能力开启时拉取）。 */
const connection = ref<{ online: number; degraded: number } | undefined>(undefined)

/** 供对话页 chat-head 使用的移动端侧栏开关。 */
provide('appSidebar', { open: () => (mobileOpen.value = true) })
provide('appPalette', { open: () => (paletteOpen.value = true) })

function onGlobalKeydown(event: KeyboardEvent): void {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault()
    paletteOpen.value = !paletteOpen.value
    return
  }
  if (event.key === 'Escape' && mobileOpen.value) mobileOpen.value = false
}

async function loadConnection(): Promise<void> {
  if (!auth.isAuthenticated) return
  if (system.info?.capabilities && system.info.capabilities.agents !== true) return
  try {
    const page = await agentsApi.list({ limit: 100 })
    const enabled = page.items.filter((item) => item.enabled)
    connection.value = {
      online: enabled.filter((item) => item.health_status === 'healthy').length,
      degraded: enabled.filter((item) => item.health_status !== 'healthy').length,
    }
  } catch {
    connection.value = undefined
  }
}

onMounted(async () => {
  if (auth.isAuthenticated) {
    await system.load()
    void loadConnection()
  }
  stopWebVitals = startWebVitals()
  document.addEventListener('keydown', onGlobalKeydown)
})

onUnmounted(() => {
  stopWebVitals?.()
  stopWebVitals = null
  document.removeEventListener('keydown', onGlobalKeydown)
})

function goHome(): void {
  mobileOpen.value = false
  void router.push({ name: 'chat' })
}

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
  <div class="app" :class="{ 'sidebar-collapsed': collapsed && !isMobile, 'sidebar-open': mobileOpen }">
    <IconSprite />
    <a class="skip-link" href="#main-content">跳到主内容</a>
    <SideNav
      :collapsed="collapsed && !isMobile"
      :mobile="isMobile"
      :open="mobileOpen"
      :user="auth.user"
      :theme="theme"
      :capabilities="system.info?.capabilities"
      :connection="connection"
      @home="goHome"
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
        <button class="sb-new" type="button" aria-label="新建会话" title="新建会话" @click="createConversation">
          <AppIcon name="plus" />
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

    <div class="sidebar-scrim" aria-hidden="true" @click="mobileOpen = false"></div>

    <div id="main-content" class="app-main">
      <header v-if="isMobile && !isChat" class="mobile-topbar">
        <button class="icon-btn" type="button" aria-label="打开导航" @click="mobileOpen = true">
          <AppIcon name="menu-burger" />
        </button>
        <span class="mobile-title">{{ route.meta.title || 'Agent Hub' }}</span>
        <span class="spacer"></span>
        <button class="icon-btn" type="button" aria-label="搜索" @click="paletteOpen = true">
          <AppIcon name="search" />
        </button>
      </header>
      <RouterView />
    </div>

    <CommandPalette
      :open="paletteOpen"
      :capabilities="system.info?.capabilities"
      @close="paletteOpen = false"
    />

    <DiagnosticsDrawer :open="diagnosticsOpen" @close="diagnosticsOpen = false" />
  </div>
</template>

<style scoped>
.app-main {
  position: relative;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.app-main > .page-main,
.app-main > .chat-layout {
  flex: 1;
  min-height: 0;
}

.mobile-topbar {
  display: flex;
  flex: none;
  align-items: center;
  gap: 10px;
  height: 56px;
  padding: 0 16px;
  border-bottom: 1px solid var(--line);
  background: var(--paper);
}

.mobile-title {
  font-size: 14px;
  font-weight: 650;
}

.mobile-topbar .spacer {
  flex: 1;
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

@media (max-width: 900px) {
  .app-main {
    grid-column: 1;
  }
}
</style>
