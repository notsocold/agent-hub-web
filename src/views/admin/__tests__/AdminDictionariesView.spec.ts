import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import AdminDictionariesView from '@/views/admin/AdminDictionariesView.vue'

describe('AdminDictionariesView', () => {
  it('渲染字典管理只读提示与 A2A 任务状态键', () => {
    const wrapper = mount(AdminDictionariesView)
    const text = wrapper.text()

    expect(text).toContain('字典管理')
    expect(text).toContain('后端无对应管理接口')
    expect(text).toContain('只读字典')
    expect(text).toContain('字典为内置枚举，当前只读；字典项变更需发版')
    expect(text).toContain('目标形态（未排期）')
    expect(
      wrapper.findAll('button').filter((button) => /新建|删除|保存/.test(button.text())),
    ).toHaveLength(0)
    // A2A 任务 8 状态键中至少 submitted/completed/canceled 出现
    expect(text).toContain('submitted')
    expect(text).toContain('completed')
    expect(text).toContain('canceled')
    expect(text).toContain('A2aTaskState')
    wrapper.unmount()
  })

  it('枚举分组齐全并标注来源类型文件', () => {
    const wrapper = mount(AdminDictionariesView)
    const text = wrapper.text()

    expect(wrapper.findAll('table').length).toBe(10)
    for (const title of [
      'A2A 任务状态',
      '运行状态',
      '知识库文档状态',
      '用户角色',
      '用户状态',
      '会话状态',
      'MCP 传输方式',
      'MCP 健康状态',
      '审批状态',
      '审批风险等级',
    ]) {
      expect(text).toContain(title)
    }

    expect(text).toContain('queued')
    expect(text).toContain('interrupted')
    expect(text).toContain('streamable_http')
    expect(text).toContain('stdio')
    expect(text).toContain('destructive')
    expect(text).toContain('src/types/task.ts')
    expect(text).toContain('src/types/approval.ts')
    expect(text).toContain('软删')
    wrapper.unmount()
  })
})
