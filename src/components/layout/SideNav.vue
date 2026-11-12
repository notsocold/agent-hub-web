<script setup lang="ts">
import { RouterLink } from 'vue-router'

import AccountMenu from './AccountMenu.vue'
import AppIcon from '@/components/common/AppIcon.vue'
import type { Theme } from '@/composables/useTheme'
import type { SystemCapabilities, User } from '@/types'

defineProps<{
  collapsed: boolean
  mobile: boolean
  open: boolean
  user: User | null
  theme: Theme
  /** 未加载时传 undefined，导航按可用处理；加载后由能力开关决定置灰。 */
  capabilities?: SystemCapabilities
  /** 侧栏底部 A2A 连接概览。 */
  connection?: { online: number; degraded: number }
}>()

const emit = defineEmits<{
  home: []
  toggle: []
  navigate: []
  search: []
  settings: []
  diagnostics: []
  admin: []
  'toggle-theme': []
  logout: []
}>()

interface NavItem {
  name: string
  label: string
  icon: string
  capability?: keyof SystemCapabilities
  stage?: string
}

const items: NavItem[] = [
  { name: 'chat', label: '对话', icon: 'chat' },
  {
    name: 'workflows',
    label: '工作流',
    icon: 'workflow',
    capability: 'workflows',
    stage: 'M9',
  },
  { name: 'agents', label: '智能体', icon: 'bot', capability: 'agents', stage: 'M2' },
  { name: 'tasks', label: '任务', icon: 'flow', capability: 'tasks', stage: 'M2' },
  { name: 'knowledge', label: '知识库', icon: 'db', capability: 'knowledge', stage: 'M4' },
]

function isEnabled(item: NavItem, capabilities?: SystemCapabilities): boolean {
  if (!item.capability) return true
  if (!capabilities) return true
  return capabilities[item.capability] === true
}

function disabledHint(item: NavItem): string {
  return `${item.label}将在 ${item.stage ?? '后续版本'} 接入，当前后端能力关闭`
}
</script>

<template>
  <aside
    class="sidebar"
    aria-label="主导航"
    :inert="mobile && !open"
    :aria-hidden="mobile && !open ? 'true' : undefined"
  >
    <div class="sb-top">
      <a
        class="sb-brand"
        href="/chat"
        aria-label="Agent Hub 首页"
        @click.prevent="emit('home')"
      >
        <svg class="sb-brand-mark" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4.5 6.5h5.2a3.8 3.8 0 0 1 3.8 3.8v3.4a3.8 3.8 0 0 0 3.8 3.8h2.2" />
          <circle cx="4.5" cy="6.5" r="1.9" />
          <circle class="hot" cx="19.5" cy="17.5" r="2" />
        </svg>
        <span>Agent Hub</span>
      </a>
      <button
        v-if="!mobile"
        class="sb-toggle"
        type="button"
        :aria-label="collapsed ? '展开侧栏' : '收起侧栏'"
        :aria-expanded="!collapsed"
        title="收起侧栏"
        @click="emit('toggle')"
      >
        <AppIcon name="panel-left" />
      </button>
      <button v-else class="sb-toggle" type="button" aria-label="关闭侧栏" @click="emit('navigate')">
        <AppIcon name="x" />
      </button>
    </div>

    <slot name="new-session" />

    <nav class="sb-nav" aria-label="主导航">
      <template v-for="item in items" :key="item.name">
        <RouterLink
          v-if="isEnabled(item, capabilities)"
          :to="{ name: item.name }"
          class="sb-nav-item"
          active-class="is-active"
          :aria-label="item.label"
          :title="item.label"
          @click="emit('navigate')"
        >
          <AppIcon :name="item.icon" />
          <span>{{ item.label }}</span>
        </RouterLink>
        <button
          v-else
          type="button"
          class="sb-nav-item is-disabled"
          :aria-label="item.label"
          :title="disabledHint(item)"
          disabled
        >
          <AppIcon :name="item.icon" />
          <span>{{ item.label }}</span>
          <span v-if="item.stage" class="stage mono">{{ item.stage }}</span>
        </button>
      </template>
    </nav>

    <slot name="sessions" />

    <div class="sb-foot">
      <div class="sb-conn">
        <span class="dot" :class="connection?.degraded ? 'is-warn' : 'is-ok'"></span>
        <span>A2A 已连接</span>
        <span class="spacer"></span>
        <span class="mono">
          {{ connection?.online ?? 0 }} ONLINE
          <template v-if="connection?.degraded">
            · {{ connection.degraded }} 降级
          </template>
        </span>
      </div>
      <AccountMenu
        :user="user"
        :theme="theme"
        @settings="emit('settings')"
        @admin="emit('admin')"
        @diagnostics="emit('diagnostics')"
        @theme="emit('toggle-theme')"
        @logout="emit('logout')"
      />
    </div>
  </aside>
</template>

<style scoped>
.sb-nav-item.is-disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.sb-nav-item .stage {
  margin-left: auto;
  color: var(--ink-3);
  font-size: 9px;
}
</style>
