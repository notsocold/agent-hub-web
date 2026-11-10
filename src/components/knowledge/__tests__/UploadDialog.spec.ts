import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiRequestError } from '@/api/client'
import UploadDialog from '@/components/knowledge/UploadDialog.vue'
import type { KnowledgeDocument } from '@/types'

const api = vi.hoisted(() => ({ upload: vi.fn() }))
vi.mock('@/api/knowledge', () => ({ knowledgeApi: api }))

const DialogStub = {
  props: ['modelValue'],
  template: '<section v-if="modelValue"><slot /><slot name="footer" /></section>',
}

function document(): KnowledgeDocument {
  return {
    id: 'doc-1',
    title: '退货政策',
    source_uri: 'uploads/returns.md',
    category: '售后',
    status: 'ready',
    chunk_count: 1,
    size_bytes: 12,
    owner: { id: 'user-1', display_name: '周丹' },
    error: null,
    created_at: '2026-11-01T00:00:00Z',
    updated_at: '2026-11-01T00:00:00Z',
  }
}

function mountDialog() {
  return mount(UploadDialog, {
    props: { modelValue: true },
    global: { stubs: { 'el-dialog': DialogStub } },
  })
}

function buttonByText(wrapper: ReturnType<typeof mountDialog>, text: string) {
  return wrapper.findAll('button').find((button) => button.text().includes(text))
}

async function fillAndSubmit(wrapper: ReturnType<typeof mountDialog>): Promise<void> {
  await buttonByText(wrapper, '粘贴文本')!.trigger('click')
  await wrapper.find('textarea.paste').setValue('# 退货政策\n\n退货需要保留吊牌。')
  await wrapper.find('input[placeholder="留空则用文件名"]').setValue('退货政策')
  await wrapper.find('input[placeholder="如：售后（可留空）"]').setValue('售后')
  await buttonByText(wrapper, '上传并入库')!.trigger('click')
  await flushPromises()
}

describe('UploadDialog 上传分支', () => {
  beforeEach(() => {
    api.upload.mockReset()
  })

  it('粘贴文本作为 md 上传，幂等命中时向父级标记 created=false', async () => {
    api.upload.mockResolvedValue({ document: document(), created: false })
    const wrapper = mountDialog()
    await fillAndSubmit(wrapper)

    expect(api.upload).toHaveBeenCalledTimes(1)
    const payload = api.upload.mock.calls[0]![0] as { file: File; title?: string; category?: string }
    expect(payload.file.name).toBe('退货政策.md')
    expect(payload.title).toBe('退货政策')
    expect(payload.category).toBe('售后')
    expect(wrapper.emitted('uploaded')?.[0]?.[1]).toBe(false)
  })

  it('413 单独提示大小上限', async () => {
    api.upload.mockRejectedValue(
      new ApiRequestError('上传文件超过大小上限', { code: 'payload_too_large', status: 413 }),
    )
    const wrapper = mountDialog()
    await fillAndSubmit(wrapper)

    expect(wrapper.text()).toContain('上限')
    expect(wrapper.emitted('uploaded')).toBeUndefined()
  })

  it('422 使用服务端校验文案', async () => {
    api.upload.mockRejectedValue(
      new ApiRequestError('仅支持 Markdown、TXT、PDF、CSV 与 JSON', {
        code: 'validation_error',
        status: 422,
      }),
    )
    const wrapper = mountDialog()
    await fillAndSubmit(wrapper)

    expect(wrapper.text()).toContain('仅支持 Markdown')
  })
})
