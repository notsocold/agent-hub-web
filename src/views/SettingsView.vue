<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessageBox } from 'element-plus'

import PageHeader from '@/components/common/PageHeader.vue'
import PageShell from '@/components/common/PageShell.vue'
import AuditPanel from '@/components/settings/AuditPanel.vue'
import ChangePasswordDialog from '@/components/settings/ChangePasswordDialog.vue'
import InstructionPanel from '@/components/settings/InstructionPanel.vue'
import McpPanel from '@/components/settings/McpPanel.vue'
import MemoryPanel from '@/components/settings/MemoryPanel.vue'
import SecretPanel from '@/components/settings/SecretPanel.vue'
import SkillPanel from '@/components/settings/SkillPanel.vue'
import { usePreferences } from '@/composables/usePreferences'
import { useTheme } from '@/composables/useTheme'
import { useAuthStore } from '@/stores/auth'
import { useSystemStore } from '@/stores/system'
import { formatDateTime } from '@/utils/format'

const auth = useAuthStore()
const system = useSystemStore()
const router = useRouter()
const { theme, setTheme } = useTheme()
const { density, setDensity } = usePreferences()

type SectionKey = 'account' | 'capabilities' | 'model' | 'interface' | 'security' | 'about'

const SECTION_IDS: Record<SectionKey, string> = {
  account: 'settings-account',
  capabilities: 'settings-capabilities',
  model: 'settings-model',
  interface: 'settings-interface',
  security: 'settings-security',
  about: 'settings-about',
}

const sections: ReadonlyArray<{ key: SectionKey; label: string }> = [
  { key: 'account', label: '账号' },
  { key: 'capabilities', label: '个人能力' },
  { key: 'model', label: '模型' },
  { key: 'interface', label: '界面' },
  { key: 'security', label: '安全与审计' },
  { key: 'about', label: '关于' },
]

const densityOptions = [
  { value: 'compact', label: '紧凑' },
  { value: 'cozy', label: '标准' },
  { value: 'comfortable', label: '宽松' },
] as const

/** 分区标题进入视口顶部多少像素内时视为当前分区。 */
const SCROLL_ACTIVATION_OFFSET = 32

const active = ref<SectionKey>('account')
const securityTab = ref<'audit' | 'secrets'>('audit')
const passwordOpen = ref(false)
const contentRef = ref<HTMLElement | null>(null)

let scrollContainer: HTMLElement | null = null

const isAdmin = computed(() => auth.user?.role === 'admin')
const generation = computed(() => system.info?.generation ?? null)

const securityTabs = computed(() =>
  isAdmin.value
    ? [
        { key: 'audit' as const, label: '审计日志' },
        { key: 'secrets' as const, label: '平台密钥' },
      ]
    : [{ key: 'audit' as const, label: '审计日志' }],
)

function sectionElement(key: SectionKey): HTMLElement | null {
  return contentRef.value?.querySelector<HTMLElement>(`#${SECTION_IDS[key]}`) ?? null
}

function prefersSmoothScroll(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

/** 点击左侧锚点：立即高亮并平滑滚动；scroll-margin-top 在样式里保证不贴边。 */
function scrollToSection(key: SectionKey): void {
  active.value = key
  const target = sectionElement(key)
  target?.scrollIntoView?.({
    behavior: prefersSmoothScroll() ? 'smooth' : 'auto',
    block: 'start',
  })
}

/** 根据滚动位置更新高亮：取最后一个越过顶部参考线的分区。 */
function updateActiveSection(): void {
  const container = scrollContainer
  if (!container) return

  const atBottom =
    container.scrollHeight > container.clientHeight &&
    container.scrollTop + container.clientHeight >= container.scrollHeight - 2
  if (atBottom) {
    active.value = sections[sections.length - 1]!.key
    return
  }

  const containerTop = container.getBoundingClientRect().top
  let next = sections[0]!.key
  for (const section of sections) {
    const element = sectionElement(section.key)
    if (!element) continue
    if (element.getBoundingClientRect().top - containerTop <= SCROLL_ACTIVATION_OFFSET) {
      next = section.key
    }
  }
  active.value = next
}

async function logout(): Promise<void> {
  try {
    await ElMessageBox.confirm('退出后需要重新登录，未发送的内容不会保留。', '退出登录', {
      confirmButtonText: '退出',
      cancelButtonText: '取消',
      type: 'warning',
    })
  } catch {
    return
  }
  await auth.logout()
  await router.replace({ name: 'login' })
}

onMounted(() => {
  void system.load()
  const container = contentRef.value?.closest('.page-shell')
  if (container) {
    scrollContainer = container as HTMLElement
    scrollContainer.addEventListener('scroll', updateActiveSection, { passive: true })
    // 浏览器恢复滚动位置时（刷新/后退），先按当前位置高亮一次。
    if (scrollContainer.scrollTop > 0) updateActiveSection()
  }
})

onUnmounted(() => {
  scrollContainer?.removeEventListener('scroll', updateActiveSection)
  scrollContainer = null
})
</script>

<template>
  <PageShell>
    <PageHeader
      eyebrow="SETTINGS"
      title="设置"
      description="账号资料、个人能力、模型与界面偏好；审计与平台密钥按角色显示。"
    />

    <div ref="contentRef" class="settings-layout">
      <nav class="settings-nav" aria-label="设置分区">
        <button
          v-for="section in sections"
          :key="section.key"
          type="button"
          class="settings-nav-item"
          :class="{ 'is-active': active === section.key }"
          :aria-current="active === section.key ? 'page' : undefined"
          :aria-controls="SECTION_IDS[section.key]"
          @click="scrollToSection(section.key)"
        >
          {{ section.label }}
        </button>
      </nav>

      <div class="settings-content">
        <section
          :id="SECTION_IDS.account"
          class="settings-section"
          data-section="account"
          aria-labelledby="settings-account-heading"
        >
          <div class="card">
            <header class="card-head">
              <h2 id="settings-account-heading">账号</h2>
              <div class="card-actions">
                <button type="button" class="link" @click="passwordOpen = true">修改密码</button>
                <button type="button" class="link danger" @click="logout">退出登录</button>
              </div>
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
          </div>
        </section>

        <section
          :id="SECTION_IDS.capabilities"
          class="settings-section"
          data-section="capabilities"
          aria-labelledby="settings-capabilities-heading"
        >
          <header class="section-head">
            <h2 id="settings-capabilities-heading">个人能力</h2>
            <p class="card-lede">
              账号级生效：系统默认 + 用户覆盖。各能力是否可用由后端开关决定，未开启时显示禁用说明。
            </p>
          </header>

          <div class="capabilities-stack">
            <InstructionPanel />
            <MemoryPanel />
            <SkillPanel />
            <McpPanel />
          </div>
        </section>

        <section
          :id="SECTION_IDS.model"
          class="settings-section"
          data-section="model"
          aria-labelledby="settings-model-heading"
        >
          <div class="card">
            <header class="card-head">
              <h2 id="settings-model-heading">模型</h2>
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
          </div>
        </section>

        <section
          :id="SECTION_IDS.interface"
          class="settings-section"
          data-section="interface"
          aria-labelledby="settings-interface-heading"
        >
          <div class="card">
            <header class="card-head">
              <h2 id="settings-interface-heading">界面</h2>
            </header>

            <p class="card-lede">调整外观与对话阅读密度，改动会立即生效。</p>

            <div class="pref-row">
              <div class="pref-copy">
                <span class="pref-name">主题</span>
                <span class="pref-hint">切换浅色或深色外观。</span>
              </div>
              <div class="segmented" role="group" aria-label="主题">
                <button
                  type="button"
                  :class="{ 'is-active': theme === 'light' }"
                  :aria-pressed="theme === 'light'"
                  @click="setTheme('light')"
                >
                  浅色
                </button>
                <button
                  type="button"
                  :class="{ 'is-active': theme === 'dark' }"
                  :aria-pressed="theme === 'dark'"
                  @click="setTheme('dark')"
                >
                  深色
                </button>
              </div>
            </div>

            <div class="pref-row">
              <div class="pref-copy">
                <span class="pref-name">消息密度</span>
                <span class="pref-hint">控制对话中相邻消息的间距。</span>
              </div>
              <div class="segmented" role="group" aria-label="消息密度">
                <button
                  v-for="option in densityOptions"
                  :key="option.value"
                  type="button"
                  :class="{ 'is-active': density === option.value }"
                  :aria-pressed="density === option.value"
                  @click="setDensity(option.value)"
                >
                  {{ option.label }}
                </button>
              </div>
            </div>

            <div class="pref-row">
              <div class="pref-copy">
                <span class="pref-name">语言</span>
                <span class="pref-hint">多语言将在后续版本评估</span>
              </div>
              <span class="pref-value">简体中文（zh-CN）</span>
            </div>

            <p class="pref-footnote">界面偏好仅保存在本浏览器，不随账号同步。</p>
          </div>
        </section>

        <section
          :id="SECTION_IDS.security"
          class="settings-section"
          data-section="security"
          aria-labelledby="settings-security-heading"
        >
          <div class="card">
            <header class="card-head">
              <h2 id="settings-security-heading">安全与审计</h2>
              <span class="tag mono">{{ isAdmin ? '管理员' : '个人范围' }}</span>
            </header>
            <p class="card-lede">
              审计记录覆盖审批、密钥、智能体、技能、MCP、记忆与安全事件；普通用户只看自己的记录，
              管理员可切换全局检索。
            </p>

            <div class="security-tabs" role="tablist" aria-label="安全与审计分区">
              <button
                v-for="tab in securityTabs"
                :key="tab.key"
                type="button"
                role="tab"
                class="security-tab"
                :class="{ 'is-active': securityTab === tab.key }"
                :aria-selected="securityTab === tab.key"
                @click="securityTab = tab.key"
              >
                {{ tab.label }}
              </button>
            </div>

            <AuditPanel v-if="securityTab === 'audit'" :can-view-all="isAdmin" />
            <SecretPanel v-else-if="isAdmin" :is-admin="isAdmin" />
          </div>
        </section>

        <section
          :id="SECTION_IDS.about"
          class="settings-section"
          data-section="about"
          aria-labelledby="settings-about-heading"
        >
          <div class="card">
            <header class="card-head">
              <h2 id="settings-about-heading">关于</h2>
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
          </div>
        </section>
      </div>
    </div>

    <ChangePasswordDialog v-model="passwordOpen" />
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
  display: flex;
  flex-direction: column;
  gap: 22px;
  min-width: 0;
}

.settings-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-bottom: 22px;
  border-bottom: 1px solid var(--line-2);
  scroll-margin-top: 20px;
}

.settings-section:last-child {
  padding-bottom: 0;
  border-bottom: 0;
}

.section-head {
  display: flex;
  flex-direction: column;
  gap: 4px;
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

.card-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
}

.card-lede {
  color: var(--ink-2);
  font-size: 11.5px;
  line-height: 1.7;
}

.pref-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px 16px;
}

.pref-copy {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.pref-name {
  color: var(--ink);
  font-size: 12px;
  font-weight: 550;
}

.pref-hint {
  color: var(--ink-3);
  font-size: 10.5px;
  line-height: 1.6;
}

.pref-value {
  color: var(--ink-2);
  font-size: 11.5px;
}

.segmented {
  display: inline-flex;
  flex: none;
  gap: 2px;
  padding: 3px;
  border: 1px solid var(--line);
  border-radius: 7px;
  background: var(--surface-2);
}

.segmented button {
  padding: 5px 12px;
  border-radius: 5px;
  color: var(--ink-2);
  font-size: 11.5px;
  font-weight: 550;
}

.segmented button:hover {
  color: var(--ink);
}

.segmented button.is-active {
  background: var(--surface);
  color: var(--prussian);
  box-shadow: var(--shadow-sm);
}

.pref-footnote {
  padding-top: 10px;
  border-top: 1px solid var(--line-2);
  color: var(--ink-3);
  font-size: 10.5px;
  line-height: 1.7;
}

.security-tabs {
  display: flex;
  gap: 4px;
  padding: 3px;
  border: 1px solid var(--line);
  border-radius: 7px;
  background: var(--surface-2);
  align-self: flex-start;
}

.security-tab {
  padding: 5px 12px;
  border-radius: 5px;
  color: var(--ink-2);
  font-size: 11.5px;
  font-weight: 550;
}

.security-tab:hover {
  color: var(--ink);
}

.security-tab.is-active {
  background: var(--surface);
  color: var(--prussian);
  box-shadow: var(--shadow-sm);
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

.link.danger {
  color: var(--red);
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
    flex-wrap: wrap;
    gap: 6px;
    padding-bottom: 4px;
  }

  .settings-nav-item {
    width: auto;
    padding: 6px 11px;
    border: 1px solid var(--line);
    background: var(--surface);
    white-space: nowrap;
  }

  .settings-section {
    scroll-margin-top: 12px;
  }
}
</style>
