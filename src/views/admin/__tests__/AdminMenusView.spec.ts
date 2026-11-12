import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import AdminMenusView from '@/views/admin/AdminMenusView.vue'

describe('AdminMenusView', () => {
  it('渲染菜单管理只读提示与两级菜单表', () => {
    const wrapper = mount(AdminMenusView)
    const text = wrapper.text()

    expect(text).toContain('菜单管理')
    expect(text).toContain('后端无对应管理接口')
    expect(text).toContain('只读镜像')
    expect(text).toContain('工作台路由')
    expect(text).toContain('管理台路由')
    expect(text).toContain('对话')
    expect(text).toContain('用户管理')
    expect(text).toContain('管理概览')
    expect(text).toContain('/chat')
    expect(text).toContain('/admin/users')
    expect(text).toContain('/admin/forbidden')

    const headers = wrapper.findAll('thead th').map((th) => th.text())
    expect(headers).toContain('菜单')
    expect(headers).toContain('路径')
    expect(headers).toContain('权限标识')
    expect(headers).toContain('是否登录')

    // 工作台 8 项（重定向行不计；M9 新增工作流新建/编辑两条路由）+ 管理台 7 项 + 无权限回退页 1 项
    expect(wrapper.findAll('tbody tr').length).toBe(16)
    wrapper.unmount()
  })

  it('权限标识按路由 meta 推导：管理台行为仅管理员，能力页显示开关 key', () => {
    const wrapper = mount(AdminMenusView)
    const rows = wrapper.findAll('tbody tr')

    const usersRow = rows.find((row) => row.text().includes('用户管理'))!
    expect(usersRow.text()).toContain('/admin/users')
    expect(usersRow.text()).toContain('仅管理员')

    const workflowsRow = rows.find((row) => row.text().includes('工作流'))!
    expect(workflowsRow.text()).toContain('workflows')
    expect(workflowsRow.text()).not.toContain('仅管理员')

    for (const title of ['管理概览', '审计日志', '系统设置']) {
      const row = rows.find((candidate) => candidate.text().includes(title))
      expect(row?.text()).toContain('仅管理员')
    }

    const chatRow = rows.find((row) => row.text().includes('对话'))!
    expect(chatRow.text()).toContain('/chat')
    expect(chatRow.text()).toContain('是')
    wrapper.unmount()
  })
})
