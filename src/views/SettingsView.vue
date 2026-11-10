<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'

import PageHeader from '@/components/common/PageHeader.vue'
import PageShell from '@/components/common/PageShell.vue'
import InstructionPanel from '@/components/settings/InstructionPanel.vue'
import McpPanel from '@/components/settings/McpPanel.vue'
import MemoryPanel from '@/components/settings/MemoryPanel.vue'
import SkillPanel from '@/components/settings/SkillPanel.vue'
import { useAuthStore } from '@/stores/auth'
import { useSystemStore } from '@/stores/system'
import { formatDateTime } from '@/utils/format'

const auth = useAuthStore()
const system = useSystemStore()

type SectionKey = 'account' | 'capabilities' | 'model' | 'about'

const sections: ReadonlyArray<{ key: SectionKey; label: string }> = [
  { key: 'account', label: '账号' },
  { key: 'capabilities', label: '个人能力' },
  { key: 'model', label: '模型' },
  { key: 'about', label: '关于' },
]

const active = ref<SectionKey>('capabilities')

const generation = computed(() => system.info?.generation ?? null)

function notReady(label: string): void {
  ElMessage.info(`${label}将在后续接入`)
}

onMounted(() => {
  void system.load()
})
</script>

<template>
  <PageShell>
    <PageHeader
      eyebrow="SETTINGS"
      title="设置"
      description="账号、模型与个人能力（指令 / 长期记忆 / 技能 / MCP）。"
    />

    <div class="settings-layout">
      <nav class="settings-nav" aria-label="设置分区">
        <button
          v-for="section in sections"
          :key="section.key"
          type="button"
          class="settings-nav-item"
          :class="{ 'is-active': active === section.key }"
          :aria-current="active === section.key ? 'page' : undefined"
          @click="active = section.key"
        >
          {{ section.label }}
        </button>
      </nav>

      <div class="settings-content">
        <template v-if="active === 'account'">
          <section class="card">
            <header class="card-head">
              <h2>账号</h2>
              <button type="button" class="link" @click="notReady('修改密码')">修改密码</button>
            </header>
            <dl class="kv">
              <div>
                <dt>展示名</dt>
                <dd>{{ auth.user?.display_name ?? '—' }}</dd>
              </div>
              <div>
                <dt>邮箱</dt>
                <dd>{{ auth.user?.email ?? '—' }}</dd>
              </div>
              <div>
                <dt>角色</dt>
                <dd>{{ auth.user?.role === 'admin' ? '管理员' : '普通用户' }}</dd>
              </div>
              <div>
                <dt>注册时间</dt>
                <dd class="mono">{{ formatDateTime(auth.user?.created_at) }}</dd>
              </div>
              <div>
                <dt>最近登录</dt>
                <dd class="mono">{{ formatDateTime(auth.user?.last_login_at) }}</dd>
              </div>
            </dl>
          </section>
        </template>

        <div v-else-if="active === 'capabilities'" class="capabilities-stack">
          <InstructionPanel />
          <MemoryPanel />
          <SkillPanel />
          <McpPanel />
        </div>

        <template v-else-if="active === 'model'">
          <section class="card">
            <header class="card-head">
              <h2>模型</h2>
              <span class="tag mono">{{ system.info?.environment ?? '—' }}</span>
            </header>

            <p v-if="system.loading" class="muted">正在加载系统信息…</p>
            <p v-else-if="system.error" class="muted error">{{ system.error }}</p>
            <template v-else>
              <ul class="model-list">
                <li v-for="model in system.models" :key="model.id">
                  <span class="model-name">{{ model.name }}</span>
                  <span class="model-id mono">{{ model.id }}</span>
                  <span class="model-desc">{{ model.description }}</span>
                </li>
              </ul>
              <dl v-if="generation" class="kv">
                <div>
                  <dt>温度</dt>
                  <dd class="mono">{{ generation.temperature }}</dd>
                </div>
                <div>
                  <dt>超时</dt>
                  <dd class="mono">{{ generation.timeout_seconds }}s</dd>
                </div>
                <div>
                  <dt>最大输出</dt>
                  <dd class="mono">{{ generation.max_output_tokens }} tokens</dd>
                </div>
                <div>
                  <dt>推理等级</dt>
                  <dd>{{ system.reasoningEfforts.map((item) => item.name).join(' / ') || '—' }}</dd>
                </div>
              </dl>
            </template>
          </section>
        </template>

        <template v-else>
          <section class="card">
            <header class="card-head">
              <h2>关于</h2>
            </header>
            <dl class="kv">
              <div>
                <dt>版本</dt>
                <dd class="mono">{{ system.info?.version ?? '0.1.0' }}</dd>
              </div>
              <div>
                <dt>构建</dt>
                <dd class="mono">{{ system.info?.build ?? '—' }}</dd>
              </div>
              <div>
                <dt>环境</dt>
                <dd class="mono">{{ system.info?.environment ?? '—' }}</dd>
              </div>
              <div>
                <dt>前端</dt>
                <dd class="mono">Vue 3 · M1.5</dd>
              </div>
            </dl>
          </section>
        </template>
      </div>
    </div>
  </PageShell>
</template>

<style scoped>
.settings-layout {
  display: grid;
  grid-template-columns: 168px minmax(0, 1fr);
  gap: 20px;
  align-items: start;
  min-height: 0;
}

.settings-nav {
  position: sticky;
  top: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.settings-nav-item {
  display: block;
  width: 100%;
  padding: 8px 12px;
  border-radius: 6px;
  color: var(--ink-2);
  font-size: 12.5px;
  font-weight: 550;
  text-align: left;
  transition:
    background 0.15s,
    color 0.15s;
}

.settings-nav-item:hover {
  background: var(--surface-2);
  color: var(--ink);
}

.settings-nav-item.is-active {
  background: var(--prussian-soft);
  color: var(--prussian);
}

.settings-content {
  min-width: 0;
}

.capabilities-stack {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  border: 1px solid var(--line);
  border-radius: 9px;
  background: var(--surface);
  box-shadow: var(--shadow-sm);
}

.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

h2 {
  font-size: 14px;
  font-weight: 650;
}

.tag {
  padding: 1px 7px;
  border: 1px solid var(--line-2);
  border-radius: 99px;
  color: var(--ink-3);
  font-size: 9.5px;
}

.kv {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px 14px;
  margin: 0;
}

.kv dt {
  color: var(--ink-3);
  font-size: 10px;
}

.kv dd {
  margin: 2px 0 0;
  overflow: hidden;
  color: var(--ink-2);
  font-size: 11.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.model-list {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.model-list li {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 2px 10px;
  padding: 8px 10px;
  border: 1px solid var(--line-2);
  border-radius: 7px;
  background: var(--surface-2);
}

.model-name {
  color: var(--ink);
  font-size: 12px;
  font-weight: 550;
}

.model-id {
  justify-self: end;
  color: var(--ink-3);
  font-size: 9.5px;
}

.model-desc {
  grid-column: 1 / -1;
  color: var(--ink-3);
  font-size: 10.5px;
}

.link {
  color: var(--prussian);
  font-size: 11.5px;
}

.link:hover {
  text-decoration: underline;
}

.muted {
  color: var(--ink-3);
  font-size: 11.5px;
}

.muted.error {
  color: var(--red);
}

@media (max-width: 900px) {
  .settings-layout {
    grid-template-columns: minmax(0, 1fr);
  }

  .settings-nav {
    position: static;
    flex-direction: row;
    gap: 6px;
    overflow-x: auto;
    padding-bottom: 4px;
  }

  .settings-nav-item {
    flex: none;
    width: auto;
    white-space: nowrap;
  }
}
</style>
