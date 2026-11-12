<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'

import AppIcon from '@/components/common/AppIcon.vue'

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
  <div ref="root" class="session-row" :class="{ 'is-archived': isArchived }">
    <button
      class="session"
      :class="{ 'is-active': active, 'is-archived': isArchived }"
      type="button"
      :aria-current="active ? 'page' : undefined"
      @click="emit('select', conversation.id)"
    >
      <span class="session-title">{{ conversation.title }}</span>
      <span class="session-meta">
        <template v-if="conversation.pending_approval_count > 0">
          <span class="dot is-live"></span>
          <span>待审批</span>
          <span class="sep">·</span>
        </template>
        <template v-else-if="isArchived">
          <span class="dot"></span>
          <span>已归档</span>
          <span class="sep">·</span>
        </template>
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
      <AppIcon name="more" />
    </button>

    <div v-if="menuOpen" class="session-menu is-open" role="menu">
      <button type="button" role="menuitem" class="menu-item" @click.stop="action('rename')">
        <AppIcon name="edit" />重命名
      </button>
      <button
        v-if="!isArchived"
        type="button"
        role="menuitem"
        class="menu-item"
        @click.stop="action('archive')"
      >
        <AppIcon name="archive" />归档
      </button>
      <button v-else type="button" role="menuitem" class="menu-item" @click.stop="action('restore')">
        <AppIcon name="archive" />恢复
      </button>
      <button
        type="button"
        role="menuitem"
        class="menu-item is-danger"
        @click.stop="action('remove')"
      >
        <AppIcon name="trash" />删除
      </button>
    </div>
  </div>
</template>

<style scoped>
.session-menu {
  position: absolute;
  top: 30px;
  right: 4px;
  display: block;
}
</style>
