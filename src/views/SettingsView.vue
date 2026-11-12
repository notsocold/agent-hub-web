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

const generation = computed(() => system.info?.generation ?? null)

const defaultModel = computed(
  () => system.models.find((model) => model.id === system.defaultModel) ?? system.models[0] ?? null,
)

const avatarInitials = computed(() => {
  const name = auth.user?.display_name?.trim()
  if (name) return Array.from(name).slice(0, 2).join('').toUpperCase()
  const email = auth.user?.email?.trim()
  return email ? email.slice(0, 2).toUpperCase() : 'AH'
})

const roleLabel = computed(() => (auth.isAdmin ? '管理员' : '普通用户'))

const securityTabs = computed(() =>
  auth.isAdmin
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
  const container = contentRef.value?.closest('.page-scroll, .page-shell')
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
    <PageHeader title="设置" description="账号、个人能力、模型与界面偏好" />

    <div ref="contentRef" class="settings-grid">
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
          <div class="section-head section-head-actions">
            <div>
              <h2 id="settings-account-heading">账号</h2>
              <p>登录身份与个人资料；资料修改接口待后端补。</p>
            </div>
            <button type="button" class="btn btn-outline btn-sm" @click="passwordOpen = true">
              修改密码
            </button>
          </div>

          <div class="profile-row">
            <span class="avatar" aria-hidden="true">{{ avatarInitials }}</span>
            <div>
              <div class="profile-name">
                {{ auth.user?.display_name ?? '—' }}
                <span class="tag mono role-tag">{{ roleLabel }}</span>
              </div>
              <div class="profile-email">{{ auth.user?.email ?? '—' }}</div>
            </div>
          </div>

          <div class="field-row">
            <div class="field-label">展示名<small>显示在会话与审批记录中</small></div>
            <input
              class="input"
              :value="auth.user?.display_name ?? '—'"
              readonly
              aria-label="展示名"
            />
          </div>
          <div class="field-row">
            <div class="field-label">邮箱<small>用于登录，暂不支持修改</small></div>
            <input class="input" :value="auth.user?.email ?? '—'" readonly aria-label="邮箱" />
          </div>

          <div class="settings-actions">
            <button type="button" class="btn btn-ghost is-danger-text" @click="logout">
              退出登录
            </button>
          </div>
          <p class="settings-note">账号资料暂不支持修改；密码可通过右上角「修改密码」更新。</p>
        </section>

        <section
          :id="SECTION_IDS.capabilities"
          class="settings-section"
          data-section="capabilities"
          aria-labelledby="settings-capabilities-heading"
        >
          <div class="section-head">
            <h2 id="settings-capabilities-heading">个人能力</h2>
            <p>
              账号级生效：系统默认 + 用户覆盖。各能力是否可用由后端开关决定，未开启时显示禁用说明。
            </p>
          </div>

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
          <div class="section-head">
            <h2 id="settings-model-heading">模型</h2>
            <p>来自 <span class="mono">GET /api/v1/system/info</span>，只读。</p>
          </div>

          <p v-if="system.loading" class="note">正在加载系统信息…</p>
          <p v-else-if="system.error" class="note is-error-text">{{ system.error }}</p>
          <dl v-else class="settings-kv">
            <div>
              <dt>对话模型</dt>
              <dd>
                <template v-if="defaultModel">
                  {{ defaultModel.name }}
                  <span class="mono">· {{ defaultModel.id }}</span>
                </template>
                <span v-else class="mono">—</span>
              </dd>
            </div>
            <div v-if="system.info?.embedding">
              <dt>Embedding</dt>
              <dd class="mono">
                {{ system.info.embedding.model }} · {{ system.info.embedding.dim }}d
              </dd>
            </div>
            <div v-if="generation">
              <dt>温度</dt>
              <dd class="mono">{{ generation.temperature }}</dd>
            </div>
            <div v-if="generation">
              <dt>超时</dt>
              <dd class="mono">{{ generation.timeout_seconds }}s</dd>
            </div>
            <div v-if="generation">
              <dt>最大输出</dt>
              <dd class="mono">{{ generation.max_output_tokens }} tokens</dd>
            </div>
            <div>
              <dt>推理等级</dt>
              <dd>{{ system.reasoningEfforts.map((item) => item.name).join(' / ') || '—' }}</dd>
            </div>
          </dl>
        </section>

        <section
          :id="SECTION_IDS.interface"
          class="settings-section"
          data-section="interface"
          aria-labelledby="settings-interface-heading"
        >
          <div class="section-head">
            <h2 id="settings-interface-heading">界面</h2>
            <p>只影响当前浏览器。</p>
          </div>

          <div class="field-row">
            <div class="field-label">主题</div>
            <div class="seg segmented" role="group" aria-label="主题">
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

          <div class="field-row">
            <div class="field-label">语言<small>多语言将在后续版本评估</small></div>
            <select class="select" aria-label="语言" disabled>
              <option selected>简体中文（zh-CN）</option>
            </select>
          </div>

          <div class="field-row">
            <div class="field-label">消息密度</div>
            <div class="seg segmented" role="group" aria-label="消息密度">
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

          <p class="settings-note">界面偏好仅保存在本浏览器，不随账号同步。</p>
        </section>

        <section
          :id="SECTION_IDS.security"
          class="settings-section"
          data-section="security"
          aria-labelledby="settings-security-heading"
        >
          <div class="section-head">
            <h2 id="settings-security-heading">安全与审计</h2>
            <p>
              审计记录覆盖审批、密钥、智能体、技能、MCP、记忆与安全事件；普通用户只看自己的记录，
              管理员可切换全局检索。
            </p>
          </div>

          <div class="seg security-tabs" role="tablist" aria-label="安全与审计分区">
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

          <div class="security-body">
            <AuditPanel v-if="securityTab === 'audit'" :can-view-all="auth.isAdmin" />
            <SecretPanel v-else-if="auth.isAdmin" :is-admin="auth.isAdmin" />
          </div>
        </section>

        <section
          :id="SECTION_IDS.about"
          class="settings-section"
          data-section="about"
          aria-labelledby="settings-about-heading"
        >
          <div class="section-head">
            <h2 id="settings-about-heading">关于</h2>
            <p>Agent Hub 前端与后端版本信息。</p>
          </div>
          <dl class="settings-kv">
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
      </div>
    </div>

    <ChangePasswordDialog v-model="passwordOpen" />
  </PageShell>
</template>

<style scoped>
.capabilities-stack {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-top: 16px;
}

.section-head-actions {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.role-tag {
  margin-left: 6px;
  vertical-align: 1px;
}

.security-tabs {
  margin-top: 12px;
}

.security-body {
  margin-top: 12px;
}
</style>
