<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { ElMessageBox } from 'element-plus'

import ConversationItem from './ConversationItem.vue'
import { useConversationsStore } from '@/stores/conversations'

const props = defineProps<{
  activeId?: string
}>()

const emit = defineEmits<{
  select: [id: string]
  removed: [id: string]
}>()

const store = useConversationsStore()
const keyword = ref(store.q)
let searchTimer: number | undefined

watch(
  () => store.q,
  (value) => {
    if (value !== keyword.value) keyword.value = value
  },
)

function scheduleSearch(): void {
  window.clearTimeout(searchTimer)
  searchTimer = window.setTimeout(() => {
    void store.search(keyword.value)
  }, 300)
}

async function createConversation(): Promise<void> {
  const conversation = await store.create()
  emit('select', conversation.id)
  keyword.value = ''
  await store.search('')
}

async function handleMenu(
  id: string,
  action: 'rename' | 'archive' | 'restore' | 'remove',
): Promise<void> {
  const conversation = store.items.find((item) => item.id === id)
  if (!conversation) return

  if (action === 'rename') {
    try {
      const result = await ElMessageBox.prompt('输入新的会话标题', '重命名', {
        confirmButtonText: '保存',
        cancelButtonText: '取消',
        inputValue: conversation.title,
        inputValidator: (value) => Boolean(value?.trim()) || '标题不能为空',
      })
      await store.rename(id, result.value.trim())
    } catch {
      // 用户取消。
    }
    return
  }

  if (action === 'archive') {
    await store.archive(id)
    return
  }

  if (action === 'restore') {
    await store.restore(id)
    return
  }

  try {
    await ElMessageBox.confirm('删除后会话将从列表中移除，该操作不可撤销。', '删除会话', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
    })
    await store.remove(id)
    emit('removed', id)
  } catch {
    // 用户取消。
  }
}

onMounted(() => {
  if (store.items.length === 0 && !store.loading) {
    void store.load()
  }
})
</script>

<template>
  <aside class="conversation-sidebar" aria-label="会话列表">
    <header class="sidebar-head">
      <span class="label">会话</span>
      <span class="count mono">{{ store.stats.total ?? store.items.length }}</span>
    </header>

    <button class="new-session" type="button" @click="createConversation">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 5v14M5 12h14" />
      </svg>
      <span>新建会话</span>
    </button>

    <label class="search">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="11" cy="11" r="6" />
        <path d="M16 16l4 4" />
      </svg>
      <input
        v-model="keyword"
        type="search"
        placeholder="搜索会话"
        aria-label="搜索会话"
        @input="scheduleSearch"
      />
    </label>

    <div class="session-scroll">
      <div v-if="store.loading && store.items.length === 0" class="state">正在加载会话…</div>

      <div v-else-if="store.error" class="state is-error">
        <p>{{ store.error }}</p>
        <button type="button" class="retry" @click="store.load()">重试</button>
      </div>

      <div v-else-if="store.groups.length === 0" class="state">
        <p>还没有匹配的会话。</p>
        <p class="hint">新建会话开始第一轮对话。</p>
      </div>

      <template v-else>
        <div v-for="group in store.groups" :key="group.label" class="session-group">
          <p class="group-label">{{ group.label }}</p>
          <ConversationItem
            v-for="item in group.items"
            :key="item.id"
            :conversation="item"
            :active="item.id === props.activeId"
            @select="emit('select', $event)"
            @menu="handleMenu"
          />
        </div>

        <button
          v-if="store.hasMore"
          type="button"
          class="load-more"
          :disabled="store.loading"
          @click="store.load(false)"
        >
          {{ store.loading ? '加载中…' : '加载更多' }}
        </button>
      </template>
    </div>
  </aside>
</template>

<style scoped>
.conversation-sidebar {
  display: flex;
  flex-direction: column;
  width: 100%;
  min-height: 0;
  padding: 10px 8px;
  background: var(--paper-2);
  border-right: 1px solid var(--line);
}

.sidebar-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 8px 6px;
}

.label {
  color: var(--ink-3);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.03em;
}

.count {
  color: var(--ink-3);
  font-size: 9.5px;
}

.new-session {
  display: flex;
  align-items: center;
  gap: 7px;
  height: 34px;
  margin: 0 2px 8px;
  padding: 0 10px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--surface);
  color: var(--ink);
  font-size: 12.5px;
  font-weight: 550;
  white-space: nowrap;
  box-shadow: var(--shadow-sm);
  transition:
    border-color 0.15s,
    background 0.15s;
}

.new-session:hover {
  border-color: var(--ink-3);
}

.new-session svg {
  width: 15px;
  height: 15px;
  flex: none;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
}

.search {
  position: relative;
  display: block;
  margin: 0 2px 6px;
}

.search svg {
  position: absolute;
  top: 50%;
  left: 9px;
  width: 14px;
  height: 14px;
  transform: translateY(-50%);
  fill: none;
  stroke: var(--ink-3);
  stroke-width: 1.6;
  stroke-linecap: round;
}

.search input {
  width: 100%;
  height: 32px;
  padding: 0 9px 0 30px;
  border: 1px solid transparent;
  border-radius: 6px;
  outline: none;
  background: var(--surface-2);
  color: var(--ink);
  font: inherit;
  font-size: 12px;
  transition:
    border-color 0.15s,
    background 0.15s;
}

.search input::placeholder {
  color: var(--ink-3);
}

.search input:focus {
  border-color: var(--line);
  background: var(--surface);
}

.session-scroll {
  flex: 1;
  min-height: 0;
  padding: 0 2px 8px;
  overflow-y: auto;
}

.session-group {
  padding-top: 6px;
}

.group-label {
  padding: 0 8px 5px;
  color: var(--ink-3);
  font-size: 10.5px;
  font-weight: 500;
  letter-spacing: 0.03em;
}

.state {
  padding: 28px 12px;
  color: var(--ink-3);
  font-size: 12px;
  line-height: 1.7;
  text-align: center;
}

.state.is-error {
  color: var(--red);
}

.hint {
  margin-top: 4px;
  color: var(--ink-3);
  font-size: 11px;
}

.retry {
  margin-top: 8px;
  padding: 5px 12px;
  border: 1px solid var(--line);
  border-radius: 5px;
  background: var(--surface);
  font-size: 12px;
}

.load-more {
  display: block;
  width: 100%;
  padding: 8px;
  color: var(--ink-3);
  font-size: 11.5px;
}

.load-more:hover {
  color: var(--ink);
}
</style>
