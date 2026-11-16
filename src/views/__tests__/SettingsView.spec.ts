import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { ElDialog, ElForm, ElFormItem, ElInput } from 'element-plus'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiRequestError } from '@/api/client'
import { usePreferences } from '@/composables/usePreferences'
import { useTheme } from '@/composables/useTheme'
import { useAuthStore } from '@/stores/auth'
import { useSystemStore } from '@/stores/system'
import type { SystemInfo, User } from '@/types'
import SettingsView from '@/views/SettingsView.vue'

const authApiMock = vi.hoisted(() => ({
  login: vi.fn(),
  register: vi.fn(),
  refresh: vi.fn(),
  logout: vi.fn(),
  me: vi.fn(),
  updateMe: vi.fn(),
  changePassword: vi.fn(),
}))

vi.mock('@/api/auth', () => ({ authApi: authApiMock }))

const messageMock = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
}))

const messageBoxMock = vi.hoisted(() => ({
  confirm: vi.fn(),
}))

vi.mock('element-plus', async (importOriginal) => {
  const actual = await importOriginal<typeof import('element-plus')>()
  return {
    ...actual,
    ElMessage: messageMock,
    ElMessageBox: messageBoxMock,
  }
})

const routerMock = vi.hoisted(() => ({
  replace: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRouter: () => routerMock,
}))

function systemInfo(): SystemInfo {
  return {
    version: '0.1.0',
    build: 'test',
    environment: 'test',
    models: [
      {
        id: 'deepseek-chat',
        name: 'DeepSeek Chat',
        description: '通用对话模型',
        capabilities: { streaming: true, reasoning: true, tools: true },
      },
    ],
    default_model: 'deepseek-chat',
    reasoning_efforts: [],
    default_reasoning_effort: 'low',
    embedding: { model: 'test-embedding', dim: 3 },
    generation: { temperature: 0.7, timeout_seconds: 30, max_output_tokens: 1000 },
    capabilities: {
      instructions: true,
      memories: true,
      skills: true,
      mcp: true,
      knowledge: false,
      attachments: true,
      workflows: false,
      approvals: true,
      agents: true,
      tasks: true,
    },
    limits: {
      skills_per_message: 3,
      mcp_servers_per_message: 5,
      mcp_tools_per_message: 10,
      knowledge_categories_per_message: 5,
      attachments_per_message: 5,
      attachment_max_bytes: 20 * 1024 * 1024,
      message_max_chars: 8000,
    },
  }
}

function currentUser(role: User['role'] = 'user'): User {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'you@example.com',
    display_name: '周丹',
    status: 'active',
    role,
    created_at: '2026-10-01T08:00:00Z',
    last_login_at: '2026-11-09T08:00:00Z',
  }
}

function mountSettings(role: User['role'] = 'user'): VueWrapper {
  setActivePinia(createPinia())
  const system = useSystemStore()
  system.info = systemInfo()
  system.loaded = true
  const auth = useAuthStore()
  auth.user = currentUser(role)

  return mount(SettingsView, {
    global: {
      components: { ElDialog, ElForm, ElFormItem, ElInput },
      stubs: {
        InstructionPanel: true,
        MemoryPanel: true,
        SkillPanel: true,
        McpPanel: true,
        AuditPanel: true,
        SecretPanel: true,
      },
    },
  })
}

function navButton(wrapper: VueWrapper, label: string) {
  return wrapper.findAll('.settings-nav-item').find((button) => button.text() === label)
}

async function openPasswordDialog(wrapper: VueWrapper) {
  const trigger = wrapper.findAll('button').find((button) => button.text() === '修改密码')
  expect(trigger).toBeDefined()
  await trigger!.trigger('click')
  await nextTick()
  await flushPromises()
  return {
    current: wrapper.find('input[name="current_password"]'),
    next: wrapper.find('input[name="new_password"]'),
    confirm: wrapper.find('input[name="confirm_password"]'),
    submit: wrapper.find('[data-testid="submit-password"]'),
  }
}

async function settle(): Promise<void> {
  await flushPromises()
  await nextTick()
  await flushPromises()
}

function domRect(top: number, height = 120): DOMRect {
  return {
    top,
    bottom: top + height,
    left: 0,
    right: 0,
    width: 0,
    height,
    x: 0,
    y: top,
    toJSON: () => ({}),
  } as DOMRect
}

beforeEach(() => {
  vi.clearAllMocks()
  messageBoxMock.confirm.mockResolvedValue('confirm')
  authApiMock.logout.mockResolvedValue(undefined)
  authApiMock.changePassword.mockResolvedValue(undefined)
})

afterEach(() => {
  useTheme().setTheme('light')
  usePreferences().setDensity('cozy')
  window.localStorage.clear()
})

describe('SettingsView 长滚动信息架构', () => {
  it('按账号/个人能力/模型/界面/安全与审计/关于的顺序同时渲染六个分区', () => {
    const wrapper = mountSettings()
    const labels = wrapper.findAll('.settings-nav-item').map((item) => item.text())
    expect(labels).toEqual(['账号', '个人能力', '模型', '界面', '安全与审计', '关于'])

    const ids = wrapper.findAll('.settings-section').map((item) => item.attributes('id'))
    expect(ids).toEqual([
      'settings-account',
      'settings-capabilities',
      'settings-model',
      'settings-interface',
      'settings-security',
      'settings-about',
    ])

    // 所有分区同时存在于 DOM，而不是靠 v-if 一次只渲染一个。
    expect(wrapper.find('#settings-account').text()).toContain('展示名')
    expect(wrapper.find('#settings-capabilities').exists()).toBe(true)
    expect(wrapper.find('#settings-model').text()).toContain('DeepSeek Chat')
    expect(wrapper.find('#settings-model').text()).toContain('温度')
    expect(wrapper.find('#settings-interface').text()).toContain('简体中文（zh-CN）')
    expect(wrapper.find('#settings-security').text()).toContain('审计记录覆盖')
    expect(wrapper.find('#settings-about').text()).toContain('前端')
    expect(wrapper.text()).not.toContain('A2A')
    expect(wrapper.find('[data-testid="copy-card-url"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="copy-jsonrpc-url"]').exists()).toBe(false)

    const stack = wrapper.find('#settings-capabilities .capabilities-stack')
    expect(stack.element.children).toHaveLength(4)
  })

  it('点击左侧导航平滑滚动到对应分区并立即更新高亮', async () => {
    const wrapper = mountSettings()
    const target = wrapper.find('#settings-model').element
    const scrollIntoView = vi.fn()
    target.scrollIntoView = scrollIntoView

    const modelNav = navButton(wrapper, '模型')
    expect(modelNav).toBeDefined()
    await modelNav!.trigger('click')

    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' })
    expect(modelNav!.classes()).toContain('is-active')
    expect(modelNav!.attributes('aria-current')).toBe('page')
  })

  it('滚动时按阅读位置同步左侧高亮', async () => {
    const wrapper = mountSettings()
    const shell = wrapper.find('.page-scroll').element as HTMLElement
    Object.defineProperty(shell, 'clientHeight', { configurable: true, value: 800 })
    Object.defineProperty(shell, 'scrollHeight', { configurable: true, value: 3200 })
    Object.defineProperty(shell, 'scrollTop', {
      configurable: true,
      value: 990,
      writable: true,
    })
    shell.getBoundingClientRect = () => domRect(0, 800)

    const absoluteTops: Record<string, number> = {
      'settings-account': 0,
      'settings-capabilities': 400,
      'settings-model': 1000,
      'settings-interface': 1800,
      'settings-security': 2300,
      'settings-about': 2800,
    }
    for (const section of wrapper.findAll('.settings-section')) {
      const id = section.attributes('id') ?? ''
      const top = absoluteTops[id] ?? 0
      section.element.getBoundingClientRect = () => domRect(top - 990)
    }

    shell.dispatchEvent(new Event('scroll'))
    await nextTick()

    const active = wrapper.findAll('.settings-nav-item.is-active')
    expect(active).toHaveLength(1)
    expect(active[0]!.text()).toBe('模型')
  })

  it('保留角色门控：管理员才显示平台密钥页签', () => {
    const userWrapper = mountSettings('user')
    expect(userWrapper.findAll('.security-tab').map((tab) => tab.text())).toEqual(['审计日志'])

    const adminWrapper = mountSettings('admin')
    expect(adminWrapper.findAll('.security-tab').map((tab) => tab.text())).toEqual([
      '审计日志',
      '平台密钥',
    ])
  })
})

describe('SettingsView 修改密码', () => {
  it('校验新密码长度、新旧不同与两次一致，校验失败不调用接口', async () => {
    const wrapper = mountSettings()
    const dialog = await openPasswordDialog(wrapper)

    await dialog.current.setValue('password123')
    await dialog.next.setValue('short')
    await dialog.confirm.setValue('short')
    await dialog.submit.trigger('click')
    await settle()
    expect(wrapper.text()).toContain('新密码至少 8 位')

    await dialog.next.setValue('password123')
    await dialog.confirm.setValue('password123')
    await dialog.submit.trigger('click')
    await settle()
    expect(wrapper.text()).toContain('新密码不能与旧密码相同')

    await dialog.next.setValue('newpassword123')
    await dialog.confirm.setValue('different123')
    await dialog.submit.trigger('click')
    await settle()
    expect(wrapper.text()).toContain('两次输入的新密码不一致')

    expect(authApiMock.changePassword).not.toHaveBeenCalled()
    expect(messageMock.success).not.toHaveBeenCalled()
  })

  it('成功提交后调用 changePassword 并提示密码已修改', async () => {
    const wrapper = mountSettings()
    const dialog = await openPasswordDialog(wrapper)

    await dialog.current.setValue('password123')
    await dialog.next.setValue('newpassword123')
    await dialog.confirm.setValue('newpassword123')
    await dialog.submit.trigger('click')
    await settle()

    expect(authApiMock.changePassword).toHaveBeenCalledWith({
      current_password: 'password123',
      new_password: 'newpassword123',
    })
    expect(messageMock.success).toHaveBeenCalledWith('密码已修改')
    expect(messageMock.error).not.toHaveBeenCalled()
  })

  it('接口失败时行内展示后端错误，不伪造成功', async () => {
    authApiMock.changePassword.mockRejectedValue(
      new ApiRequestError('当前密码错误', { code: 'invalid_password', status: 400 }),
    )
    const wrapper = mountSettings()
    const dialog = await openPasswordDialog(wrapper)

    await dialog.current.setValue('wrong-password')
    await dialog.next.setValue('newpassword123')
    await dialog.confirm.setValue('newpassword123')
    await dialog.submit.trigger('click')
    await settle()

    expect(wrapper.text()).toContain('当前密码错误')
    expect(messageMock.success).not.toHaveBeenCalled()
    expect(messageMock.error).not.toHaveBeenCalled()
  })
})

describe('SettingsView 退出登录', () => {
  it('确认后清理会话并跳转登录页', async () => {
    const wrapper = mountSettings()
    const logoutButton = wrapper.findAll('button').find((button) => button.text() === '退出登录')
    expect(logoutButton).toBeDefined()

    await logoutButton!.trigger('click')
    await settle()

    expect(messageBoxMock.confirm).toHaveBeenCalledWith(
      expect.stringContaining('退出后需要重新登录'),
      '退出登录',
      expect.objectContaining({ confirmButtonText: '退出', cancelButtonText: '取消' }),
    )
    expect(authApiMock.logout).toHaveBeenCalledTimes(1)
    expect(routerMock.replace).toHaveBeenCalledWith({ name: 'login' })
    expect(useAuthStore().user).toBeNull()
  })

  it('取消确认时不登出、不跳转', async () => {
    messageBoxMock.confirm.mockRejectedValue('cancel')
    const wrapper = mountSettings()
    const logoutButton = wrapper.findAll('button').find((button) => button.text() === '退出登录')

    await logoutButton!.trigger('click')
    await settle()

    expect(authApiMock.logout).not.toHaveBeenCalled()
    expect(routerMock.replace).not.toHaveBeenCalled()
  })
})

describe('SettingsView 界面偏好', () => {
  beforeEach(() => {
    useTheme().setTheme('light')
    usePreferences().setDensity('cozy')
  })

  it('界面分区可切换主题与消息密度，并展示语言与本地保存说明', async () => {
    const wrapper = mountSettings()

    expect(wrapper.text()).toContain('简体中文（zh-CN）')
    expect(wrapper.text()).toContain('多语言未启用（未排期）')
    expect(wrapper.text()).toContain('界面偏好仅保存在本浏览器，不随账号同步。')

    // S1：语言下拉保持禁用，文案不暗示可切换。
    const language = wrapper.find('select[aria-label="语言"]')
    expect(language.exists()).toBe(true)
    expect(language.attributes('disabled')).toBeDefined()

    const compact = wrapper.findAll('.segmented button').find((button) => button.text() === '紧凑')
    expect(compact).toBeDefined()
    await compact!.trigger('click')
    expect(compact!.attributes('aria-pressed')).toBe('true')
    expect(document.documentElement.dataset.density).toBe('compact')
    expect(JSON.parse(window.localStorage.getItem('agent-hub.preferences') ?? '{}')).toEqual({
      density: 'compact',
    })

    const dark = wrapper.findAll('.segmented button').find((button) => button.text() === '深色')
    expect(dark).toBeDefined()
    await dark!.trigger('click')
    expect(dark!.attributes('aria-pressed')).toBe('true')
    expect(document.documentElement.dataset.theme).toBe('dark')
  })
})
