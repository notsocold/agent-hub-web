<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'

import { formatRelative } from '@/utils/format'
import type { Conversation } from '@/types'

const props = defineProps<{
  conversation: Conversation
  active: boolean
}>()

const emit = defineEmits<{
  select: [id: string]
  menu: [id: string, action: 'rename' | 'archive' | 'restore' | 'remove']
}>()

const menuOpen = ref(false)
const root = ref<HTMLElement | null>(null)

const isArchived = computed(() => props.conversation.status === 'archived')

const meta = computed(() => {
  const parts: string[] = []
  const time = formatRelative(props.conversation.last_message_at)
  if (time) parts.push(time)
  parts.push(`${props.conversation.message_count} 条消息`)
  return parts
})

function action(next: 'rename' | 'archive' | 'restore' | 'remove'): void {
  menuOpen.value = false
  emit('menu', props.conversation.id, next)
}

function onDocumentClick(event: MouseEvent): void {
  if (!menuOpen.value) return
  const target = event.target as Node | null
  if (root.value && target && !root.value.contains(target)) menuOpen.value = false
}

onMounted(() => document.addEventListener('click', onDocumentClick))
onUnmounted(() => document.removeEventListener('click', onDocumentClick))
</script>

<template>
  <div ref="root" class="session-wrap">
    <button
      class="session"
      :class="{ 'is-active': active, 'is-archived': isArchived }"
      type="button"
      :aria-current="active ? 'page' : undefined"
      @click="emit('select', conversation.id)"
    >
      <span class="session-title">{{ conversation.title }}</span>
      <span class="session-meta">
        <span v-if="conversation.pending_approval_count > 0" class="dot is-live"></span>
        <span v-else-if="isArchived" class="dot"></span>
        <template v-for="(part, index) in meta" :key="part">
          <span v-if="index > 0" class="sep">·</span>
          <span>{{ part }}</span>
        </template>
      </span>
    </button>

    <button
      class="session-more"
      type="button"
      aria-label="会话操作"
      aria-haspopup="menu"
      :aria-expanded="menuOpen"
      title="会话操作"
      @click.stop="menuOpen = !menuOpen"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="5" cy="12" r="1.3" fill="currentColor" stroke="none" />
        <circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" />
        <circle cx="19" cy="12" r="1.3" fill="currentColor" stroke="none" />
      </svg>
    </button>

    <div v-if="menuOpen" class="session-menu" role="menu">
      <button type="button" role="menuitem" @click.stop="action('rename')">重命名</button>
      <button
        v-if="!isArchived"
        type="button"
        role="menuitem"
        @click.stop="action('archive')"
      >
        归档
      </button>
      <button v-else type="button" role="menuitem" @click.stop="action('restore')">
        恢复
      </button>
      <button type="button" role="menuitem" class="danger" @click.stop="action('remove')">
        删除
      </button>
    </div>
  </div>
</template>

<style scoped>
.session-wrap {
  position: relative;
}

.session {
  display: block;
  width: 100%;
  padding: 8px 30px 8px 10px;
  border-left: 2px solid transparent;
  border-radius: 6px;
  text-align: left;
  transition: background 0.12s;
}

.session:hover {
  background: rgba(20, 27, 32, 0.045);
}

html[data-theme='dark'] .session:hover {
  background: rgba(255, 255, 255, 0.04);
}

.session.is-active {
  border-left-color: var(--ink);
  background: var(--surface);
  box-shadow: var(--shadow-sm);
}

.session-title {
  display: block;
  overflow: hidden;
  font-size: 12.5px;
  font-weight: 550;
  letter-spacing: -0.005em;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.session.is-active .session-title {
  font-weight: 650;
}

.session.is-archived .session-title {
  color: var(--ink-3);
}

.session-meta {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-top: 3px;
  color: var(--ink-3);
  font-size: 10.5px;
}

.session-meta .sep {
  opacity: 0.5;
}

.session-more {
  position: absolute;
  top: 50%;
  right: 4px;
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border-radius: 4px;
  color: var(--ink-3);
  opacity: 0;
  transform: translateY(-50%);
  transition:
    opacity 0.12s,
    background 0.12s;
}

.session-wrap:hover .session-more,
.session-more:focus-visible,
.session-more[aria-expanded='true'] {
  opacity: 1;
}

.session-more:hover {
  background: var(--surface-2);
  color: var(--ink);
}

.session-more svg {
  width: 14px;
  height: 14px;
}

.session-menu {
  position: absolute;
  top: 30px;
  right: 6px;
  z-index: 60;
  min-width: 116px;
  padding: 5px;
  border: 1px solid var(--line);
  border-radius: 7px;
  background: var(--surface);
  box-shadow: var(--shadow-md);
}

.session-menu button {
  display: flex;
  align-items: center;
  width: 100%;
  height: 30px;
  padding: 0 8px;
  border-radius: 5px;
  color: var(--ink-2);
  font-size: 12px;
  text-align: left;
}

.session-menu button:hover {
  background: var(--surface-2);
  color: var(--ink);
}

.session-menu .danger {
  color: var(--red);
}
</style>
