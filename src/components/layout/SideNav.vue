<script setup lang="ts">
import { RouterLink } from 'vue-router'

import AccountMenu from './AccountMenu.vue'
import type { Theme } from '@/composables/useTheme'
import type { User } from '@/types'

defineProps<{
  collapsed: boolean
  mobile: boolean
  open: boolean
  user: User | null
  theme: Theme
}>()

const emit = defineEmits<{
  toggle: []
  navigate: []
  settings: []
  'toggle-theme': []
  logout: []
}>()

interface NavItem {
  name: string
  label: string
  icon: string
}

const items: NavItem[] = [
  {
    name: 'chat',
    label: '对话',
    icon: 'M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v8a2.5 2.5 0 0 1-2.5 2.5H9l-5 3.5V6.5Z',
  },
  {
    name: 'workflows',
    label: '工作流',
    icon: 'M4 6h4M4 12h4M4 18h4M8 6h3a3 3 0 0 1 3 3v6a3 3 0 0 0 3 3h3M16 6h4M16 18h4',
  },
  {
    name: 'agents',
    label: '智能体',
    icon: 'M4 7h16v12H4zM12 3v4M8 12h.01M16 12h.01M9 16h6',
  },
  {
    name: 'tasks',
    label: '任务',
    icon: 'M4 7h16M4 12h16M4 17h10',
  },
  {
    name: 'knowledge',
    label: '知识库',
    icon: 'M4 5c0-1 3.6-2 8-2s8 1 8 2v14c0 1-3.6 2-8 2s-8-1-8-2V5ZM4 5c0 1 3.6 2 8 2s8-1 8-2',
  },
]
</script>

<template>
  <aside
    class="sidebar"
    :class="{ 'is-collapsed': collapsed, 'is-open': open, 'is-mobile': mobile }"
    aria-label="主导航"
  >
    <div class="sb-top">
      <span class="brand">
        <span class="brand-mark">A</span>
        <span class="brand-name">Agent Hub</span>
      </span>
      <button
        v-if="!mobile"
        class="sb-toggle"
        type="button"
        :aria-label="collapsed ? '展开侧栏' : '收起侧栏'"
        :aria-expanded="!collapsed"
        @click="emit('toggle')"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
          <path d="M9 4.5v15" />
        </svg>
      </button>
      <button
        v-else
        class="sb-toggle"
        type="button"
        aria-label="关闭侧栏"
        @click="emit('navigate')"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>

    <nav class="sb-nav">
      <RouterLink
        v-for="item in items"
        :key="item.name"
        :to="{ name: item.name }"
        class="sb-nav-item"
        :title="item.label"
        @click="emit('navigate')"
      >
        <svg class="ic" viewBox="0 0 24 24" aria-hidden="true">
          <path :d="item.icon" />
        </svg>
        <span>{{ item.label }}</span>
      </RouterLink>
    </nav>

    <div class="sb-foot">
      <AccountMenu
        :user="user"
        :theme="theme"
        @settings="emit('settings')"
        @theme="emit('toggle-theme')"
        @logout="emit('logout')"
      />
    </div>
  </aside>
</template>

<style scoped>
.sidebar {
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 6px 8px;
  background: var(--paper-2);
  border-right: 1px solid var(--line);
  z-index: 30;
  overflow: hidden;
}

.sb-top {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  height: 44px;
  padding: 0 2px 0 6px;
}

.brand {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  color: var(--ink);
  font-size: 14px;
  font-weight: 650;
  letter-spacing: -0.01em;
  white-space: nowrap;
}

.brand-mark {
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  flex: none;
  border-radius: 5px;
  background: var(--btn-bg);
  color: var(--btn-fg);
  font-family: var(--font-mono);
  font-size: 11px;
}

.sb-toggle {
  display: grid;
  place-items: center;
  flex: none;
  width: 28px;
  height: 28px;
  border-radius: 5px;
  color: var(--ink-3);
  transition:
    color 0.15s,
    background 0.15s;
}

.sb-toggle:hover {
  background: var(--surface-2);
  color: var(--ink);
}

.sb-toggle svg {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.sb-nav {
  display: flex;
  flex: none;
  flex-direction: column;
  gap: 1px;
  margin-top: 6px;
}

.sb-nav-item {
  display: flex;
  align-items: center;
  gap: 9px;
  height: 31px;
  padding: 0 9px;
  border-radius: 5px;
  color: var(--ink-2);
  font-size: 12.5px;
  white-space: nowrap;
  transition:
    background 0.12s,
    color 0.12s;
}

.sb-nav-item .ic {
  width: 16px;
  height: 16px;
  flex: none;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-linejoin: round;
  color: var(--ink-3);
}

.sb-nav-item:hover {
  background: rgba(20, 27, 32, 0.045);
  color: var(--ink);
}

html[data-theme='dark'] .sb-nav-item:hover {
  background: rgba(255, 255, 255, 0.05);
}

.sb-nav-item.router-link-active {
  background: var(--surface);
  color: var(--ink);
  font-weight: 600;
  box-shadow: var(--shadow-sm);
}

.sb-nav-item.router-link-active .ic {
  color: var(--prussian);
}

.sb-foot {
  flex: none;
  margin-top: auto;
  padding-top: 8px;
  border-top: 1px solid var(--line);
}

/* 折叠为图标栏 */
.sidebar.is-collapsed:not(.is-mobile) {
  padding: 6px 0;
  align-items: center;
}

.sidebar.is-collapsed .sb-top {
  width: 100%;
  justify-content: center;
  padding: 0;
}

.sidebar.is-collapsed .brand-name {
  display: none;
}

.sidebar.is-collapsed .sb-nav {
  width: 100%;
  align-items: center;
  gap: 2px;
}

.sidebar.is-collapsed .sb-nav-item {
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 0;
  border-radius: 7px;
}

.sidebar.is-collapsed .sb-nav-item span {
  display: none;
}

.sidebar.is-collapsed .sb-foot {
  width: 100%;
  display: flex;
  justify-content: center;
}

/* 移动端抽屉 */
.sidebar.is-mobile {
  position: fixed;
  inset: 0 auto 0 0;
  width: var(--sidebar-w);
  transform: translateX(-100%);
  transition: transform 0.22s ease;
  box-shadow: var(--shadow-lg);
}

.sidebar.is-mobile.is-open {
  transform: translateX(0);
}
</style>
