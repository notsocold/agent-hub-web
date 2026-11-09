<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'

import PageHeader from '@/components/common/PageHeader.vue'
import PageShell from '@/components/common/PageShell.vue'
import { useAuthStore } from '@/stores/auth'
import { useSystemStore } from '@/stores/system'
import { formatDateTime } from '@/utils/format'

const auth = useAuthStore()
const system = useSystemStore()

const capabilityItems = computed(() => {
  const capabilities = system.capabilities
  return [
    {
      key: 'instructions',
      title: '指令',
      description: '生效指令与用户覆盖',
      enabled: capabilities.instructions,
    },
    {
      key: 'memories',
      title: '长期记忆',
      description: '按 kind / 来源管理记忆',
      enabled: capabilities.memories,
    },
    {
      key: 'skills',
      title: '技能',
      description: '系统与用户技能启停、导入',
      enabled: capabilities.skills,
    },
    {
      key: 'mcp',
      title: 'MCP',
      description: '服务器启停、凭据与工具发现',
      enabled: capabilities.mcp,
    },
  ]
})

const generation = computed(() => system.info?.generation ?? null)

async function copy(value: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(value)
    ElMessage.success('已复制')
  } catch {
    ElMessage.error('复制失败，请手动选择内容')
  }
}

function notReady(label: string): void {
  ElMessage.info(`${label}将在 M1.5 / M6 接入`)
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
      description="账号、模型与 A2A 端点；个人能力（指令 / 记忆 / 技能 / MCP）在 M1.5 接入。"
    />

    <div class="settings-grid">
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

      <section class="card">
        <header class="card-head">
          <h2>A2A 端点</h2>
          <span class="tag mono">{{ system.a2a?.auth_type ?? '未配置' }}</span>
        </header>
        <dl class="kv">
          <div>
            <dt>Agent Card</dt>
            <dd class="mono ellipsis">{{ system.a2a?.card_url ?? '—' }}</dd>
          </div>
          <div>
            <dt>JSON-RPC</dt>
            <dd class="mono ellipsis">{{ system.a2a?.jsonrpc_url ?? '—' }}</dd>
          </div>
        </dl>
        <div class="card-actions">
          <button
            type="button"
            class="btn"
            :disabled="!system.a2a?.card_url"
            @click="copy(system.a2a?.card_url ?? '')"
          >
            复制 Card 地址
          </button>
          <button
            type="button"
            class="btn"
            :disabled="!system.a2a?.jsonrpc_url"
            @click="copy(system.a2a?.jsonrpc_url ?? '')"
          >
            复制 JSON-RPC
          </button>
        </div>
      </section>

      <section class="card">
        <header class="card-head">
          <h2>个人能力</h2>
          <span class="tag mono">M1.5</span>
        </header>
        <ul class="capability-list">
          <li v-for="item in capabilityItems" :key="item.key">
            <div>
              <p class="capability-name">{{ item.title }}</p>
              <p class="capability-desc">{{ item.description }}</p>
            </div>
            <span class="capability-state" :class="{ 'is-on': item.enabled }">
              {{ item.enabled ? '后端已支持' : '未启用' }}
            </span>
          </li>
        </ul>
        <p class="muted small">
          指令、记忆、技能与 MCP 的编辑入口将在 M1.5 接入；系统项只读，用户只能启停或覆盖。
        </p>
      </section>

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
            <dd class="mono">Vue 3 · M1</dd>
          </div>
        </dl>
      </section>
    </div>
  </PageShell>
</template>

<style scoped>
.settings-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  align-items: start;
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

.card-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.capability-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.capability-list li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--line-2);
}

.capability-list li:last-child {
  padding-bottom: 0;
  border-bottom: 0;
}

.capability-name {
  color: var(--ink);
  font-size: 12px;
  font-weight: 550;
}

.capability-desc {
  color: var(--ink-3);
  font-size: 10.5px;
}

.capability-state {
  flex: none;
  color: var(--ink-3);
  font-size: 9.5px;
}

.capability-state.is-on {
  color: var(--green);
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

.small {
  font-size: 10.5px;
  line-height: 1.65;
}

.ellipsis {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
