<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'

import AppIcon from '@/components/common/AppIcon.vue'
import type { Theme } from '@/composables/useTheme'
import type { User } from '@/types'

const props = defineProps<{
  user: User | null
  theme: Theme
}>()

const emit = defineEmits<{
  settings: []
  diagnostics: []
  admin: []
  theme: []
  logout: []
}>()

const open = ref(false)
const root = ref<HTMLElement | null>(null)

function toggle(): void {
  open.value = !open.value
}

function close(): void {
  open.value = false
}

function initials(): string {
  const name = props.user?.display_name?.trim() || props.user?.email || 'AH'
  return name.slice(0, 2).toUpperCase()
}

function onDocumentClick(event: MouseEvent): void {
  if (!open.value) return
  const target = event.target as Node | null
  if (root.value && target && !root.value.contains(target)) close()
}

function onEscape(event: KeyboardEvent): void {
  if (event.key === 'Escape') close()
}

function openSettings(): void {
  emit('settings')
  close()
}

function openDiagnostics(): void {
  emit('diagnostics')
  close()
}

function openAdmin(): void {
  emit('admin')
  close()
}

function toggleTheme(): void {
  emit('theme')
  close()
}

function logout(): void {
  emit('logout')
  close()
}

onMounted(() => {
  document.addEventListener('click', onDocumentClick)
  document.addEventListener('keydown', onEscape)
})

onUnmounted(() => {
  document.removeEventListener('click', onDocumentClick)
  document.removeEventListener('keydown', onEscape)
})
</script>

<template>
  <div ref="root" class="account-wrap">
    <button
      class="sb-account"
      type="button"
      data-testid="account-menu"
      aria-haspopup="menu"
      :aria-expanded="open"
      @click="toggle"
    >
      <span class="avatar">{{ initials() }}</span>
      <span class="sb-account-text">
        <span class="sb-account-name">{{ user?.display_name || '个人工作区' }}</span>
        <span class="sb-account-sub">{{ user?.email || '' }}</span>
      </span>
      <AppIcon name="more" class="sb-account-more" />
    </button>

    <div v-if="open" class="account-menu is-open" role="menu" aria-label="账号菜单">
      <div class="account-menu-head">
        <span class="avatar">{{ initials() }}</span>
        <div>
          <div class="account-menu-name">{{ user?.display_name || '个人工作区' }}</div>
          <div class="account-menu-sub">{{ user?.email || '' }}</div>
        </div>
      </div>
      <div class="menu-sep"></div>
      <button type="button" role="menuitem" class="menu-item" @click="openSettings">
        <AppIcon name="user" />设置
      </button>
      <button
        v-if="user?.role === 'admin'"
        type="button"
        role="menuitem"
        class="menu-item"
        @click="openAdmin"
      >
        <AppIcon name="overview" />管理控制台
      </button>
      <button type="button" role="menuitem" class="menu-item" @click="openDiagnostics">
        <AppIcon name="sliders" />诊断信息
      </button>
      <button type="button" role="menuitem" class="menu-item" @click="toggleTheme">
        <AppIcon :name="theme === 'dark' ? 'sun' : 'moon'" />切换主题
      </button>
      <div class="menu-sep"></div>
      <button type="button" role="menuitem" class="menu-item is-danger" @click="logout">
        <AppIcon name="logout" />退出登录
      </button>
      <div class="menu-version mono">Agent Hub v0.1.0 · 设计原型</div>
    </div>
  </div>
</template>

<style scoped>
.account-wrap {
  position: relative;
  width: 100%;
}

.account-menu {
  left: 0;
  right: 0;
  bottom: 42px;
}
</style>
