import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import DocumentDetailDrawer from '@/components/knowledge/DocumentDetailDrawer.vue'
import type { KnowledgeDocument } from '@/types'

const DrawerStub = {
  props: ['modelValue'],
  template: '<div class="drawer-stub"><slot /></div>',
}

function document(overrides: Partial<KnowledgeDocument> = {}): KnowledgeDocument {
  return {
    id: 'doc-1',
    title: '待处理文档',
    source_uri: 'uploads/doc-1.md',
    category: '售后',
    status: 'pending',
    chunk_count: 0,
    size_bytes: 1024,
    owner: { id: 'user-1', display_name: '周丹' },
    error: null,
    created_at: '2026-11-01T00:00:00Z',
    updated_at: '2026-11-01T00:00:00Z',
    ...overrides,
  }
}

function mountDrawer(props: Record<string, unknown>) {
  return mount(DocumentDetailDrawer, {
    props: { modelValue: true, document: document(), writable: true, ...props },
    global: { stubs: { 'el-drawer': DrawerStub } },
  })
}

function buttonByText(wrapper: ReturnType<typeof mountDrawer>, text: string) {
  return wrapper.findAll('button').find((button) => button.text().includes(text))
}

describe('DocumentDetailDrawer 重试与权限', () => {
  it('pending 且 chunk_count=0 的文档仍可重试（/retry 不限制原状态）', () => {
    const retry = buttonByText(mountDrawer({}), '重建此文档')
    expect(retry).toBeTruthy()
    expect(retry!.attributes('disabled')).toBeUndefined()
  })

  it('普通用户对系统文档不显示重试与删除', () => {
    const wrapper = mountDrawer({ document: document({ owner: null }), writable: false })
    expect(buttonByText(wrapper, '重建此文档')).toBeUndefined()
    expect(buttonByText(wrapper, '删除文档')).toBeUndefined()
  })

  it('busy 时禁用重试与删除，避免重复提交', () => {
    const wrapper = mountDrawer({ busy: true })
    expect(buttonByText(wrapper, '重建此文档')!.attributes('disabled')).toBeDefined()
    expect(buttonByText(wrapper, '删除文档')!.attributes('disabled')).toBeDefined()
  })
})
