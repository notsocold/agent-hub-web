<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'

import type { Theme } from '@/composables/useTheme'
import type { User } from '@/types'

const props = defineProps<{
  user: User | null
  theme: Theme
}>()

const emit = defineEmits<{
  settings: []
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
      class="account"
      type="button"
      aria-label="账号菜单"
      aria-haspopup="menu"
      :aria-expanded="open"
      @click="toggle"
    >
      <span class="avatar">{{ initials() }}</span>
      <span class="account-text">
        <span class="account-name">{{ user?.display_name || '未登录' }}</span>
        <span class="account-sub">{{ user?.email || '' }}</span>
      </span>
      <svg class="more" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
        <circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none" />
        <circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none" />
      </svg>
    </button>

    <div v-if="open" class="menu" role="menu" aria-label="账号菜单">
      <div class="menu-head">
        <span class="avatar">{{ initials() }}</span>
        <span class="head-text">
          <span class="head-name">{{ user?.display_name || '未登录' }}</span>
          <span class="head-sub">{{ user?.email || '' }}</span>
        </span>
      </div>
      <div class="sep"></div>
      <button type="button" role="menuitem" class="menu-item" @click="emit('settings'); close()">
        设置
      </button>
      <button type="button" role="menuitem" class="menu-item" @click="emit('theme'); close()">
        {{ theme === 'dark' ? '切换到浅色' : '切换到深色' }}
      </button>
      <div class="sep"></div>
      <button
        type="button"
        role="menuitem"
        class="menu-item is-danger"
        @click="emit('logout'); close()"
      >
        退出登录
      </button>
      <p class="version mono">v0.1.0 · M1</p>
    </div>
  </div>
</template>

<style scoped>
.account-wrap {
  position: relative;
  width: 100%;
}

.account {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 7px;
  border-radius: 6px;
  text-align: left;
  transition: background 0.12s;
}

.account:hover {
  background: var(--surface-2);
}

.avatar {
  display: grid;
  place-items: center;
  flex: none;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: var(--amber);
  color: #191307;
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.account-text {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.account-name,
.head-name {
  overflow: hidden;
  color: var(--ink);
  font-size: 12px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.account-sub,
.head-sub {
  overflow: hidden;
  color: var(--ink-3);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.more {
  width: 15px;
  height: 15px;
  flex: none;
  color: var(--ink-3);
}

.menu {
  position: absolute;
  right: 0;
  bottom: 46px;
  left: 0;
  z-index: 95;
  padding: 6px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
  box-shadow: var(--shadow-md);
}

.menu-head {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 6px 7px 9px;
}

.head-text {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.sep {
  height: 1px;
  margin: 5px 4px;
  background: var(--line-2);
}

.menu-item {
  display: flex;
  align-items: center;
  width: 100%;
  height: 33px;
  padding: 0 7px;
  border-radius: 5px;
  color: var(--ink-2);
  font-size: 12.5px;
  text-align: left;
  transition:
    background 0.12s,
    color 0.12s;
}

.menu-item:hover {
  background: var(--surface-2);
  color: var(--ink);
}

.menu-item.is-danger {
  color: var(--red);
}

.version {
  padding: 7px 7px 3px;
  color: var(--ink-3);
  font-size: 9px;
  letter-spacing: 0.03em;
}
</style>
