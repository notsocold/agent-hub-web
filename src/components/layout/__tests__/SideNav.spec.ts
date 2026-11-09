import { RouterLinkStub, mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import SideNav from '@/components/layout/SideNav.vue'
import type { SystemCapabilities, User } from '@/types'

const user: User = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'you@example.com',
  display_name: '周丹',
  status: 'active',
  role: 'user',
  created_at: '2026-10-01T08:00:00Z',
  last_login_at: '2026-11-09T08:00:00Z',
}

function mountNav(capabilities?: SystemCapabilities): ReturnType<typeof mount> {
  return mount(SideNav, {
    props: {
      collapsed: false,
      mobile: false,
      open: false,
      user,
      theme: 'light',
      capabilities,
    },
    global: {
      stubs: {
        RouterLink: RouterLinkStub,
        AccountMenu: true,
      },
    },
  })
}

describe('SideNav', () => {
  it('渲染五个一级导航与目标路由', () => {
    const wrapper = mountNav()
    const links = wrapper.findAllComponents(RouterLinkStub)

    expect(links).toHaveLength(5)
    expect(links.map((link) => link.text())).toEqual(['对话', '工作流', '智能体', '任务', '知识库'])
    expect(links.map((link) => link.props('to'))).toEqual([
      { name: 'chat' },
      { name: 'workflows' },
      { name: 'agents' },
      { name: 'tasks' },
      { name: 'knowledge' },
    ])
  })

  it('折叠时仍保留可访问的导航标题', () => {
    const wrapper = mountNav()
    const links = wrapper.findAllComponents(RouterLinkStub)
    expect(links[0]?.attributes('title')).toBe('对话')
    expect(links[4]?.attributes('title')).toBe('知识库')
  })

  it('后端能力关闭时对应导航置灰且不可点击', () => {
    const wrapper = mountNav({
      instructions: false,
      memories: false,
      skills: false,
      mcp: false,
      knowledge: false,
      attachments: false,
      workflows: false,
      approvals: true,
      agents: false,
      tasks: false,
    })
    const links = wrapper.findAllComponents(RouterLinkStub)
    expect(links).toHaveLength(1)
    expect(links[0]?.text()).toBe('对话')

    const disabled = wrapper.findAll('button.sb-nav-item.is-disabled')
    expect(disabled).toHaveLength(4)
    expect(disabled.map((button) => button.text())).toEqual([
      '工作流M5+',
      '智能体M2',
      '任务M2',
      '知识库M4',
    ])
    expect(disabled[0]?.attributes('disabled')).toBeDefined()
  })
})
