<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { ElMessageBox } from 'element-plus'

import AppIcon from '@/components/common/AppIcon.vue'
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
  <section class="sb-sessions" aria-label="会话列表">
    <div class="sb-sessions-head">
      <h2>会话</h2>
      <span class="mono">{{ store.stats.total ?? store.items.length }}</span>
    </div>

    <label class="search">
      <AppIcon name="search" />
      <input
        v-model="keyword"
        type="search"
        placeholder="搜索会话"
        aria-label="搜索会话"
        autocomplete="off"
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
  </section>
</template>

<style scoped>
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
