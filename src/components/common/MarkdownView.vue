<script setup lang="ts">
import { computed } from 'vue'
import { ElMessageBox } from 'element-plus'

import { renderMarkdown } from '@/utils/markdown'

const props = withDefaults(
  defineProps<{
    content: string
    /** 默认使用 LRU 缓存；流式消息可关闭，避免中间态挤占缓存。 */
    cache?: boolean
  }>(),
  { cache: true },
)

const html = computed(() => renderMarkdown(props.content, { cache: props.cache }))

/** 邮件与电话交给系统应用处理，无需离开确认。 */
const PASS_THROUGH_PROTOCOLS = new Set(['mailto:', 'tel:'])

function parseHref(href: string): URL | null {
  try {
    return new URL(href, window.location.href)
  } catch {
    return null
  }
}

async function confirmAndOpenExternal(href: string, host: string): Promise<void> {
  try {
    await ElMessageBox.confirm(
      `将离开 Agent Hub，在新标签页打开外部链接：${host}`,
      '打开外部链接',
      {
        confirmButtonText: '继续访问',
        cancelButtonText: '取消',
        type: 'warning',
      },
    )
  } catch {
    // 用户取消或关闭弹窗：保持留在当前页面。
    return
  }
  window.open(href, '_blank', 'noopener,noreferrer')
}

/**
 * 事件委托：外链离开前二次确认。
 * 同源链接、纯锚点、mailto:/tel: 以及带修饰键/非左键的点击保持浏览器默认行为。
 */
async function onClick(event: MouseEvent): Promise<void> {
  if (event.defaultPrevented) return
  if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) {
    return
  }

  const target = event.target
  if (!(target instanceof Element)) return
  const anchor = target.closest('a[href]')
  if (!anchor) return

  const href = anchor.getAttribute('href')?.trim() ?? ''
  if (!href || href.startsWith('#')) return

  const url = parseHref(href)
  if (!url) {
    event.preventDefault()
    return
  }
  if (PASS_THROUGH_PROTOCOLS.has(url.protocol)) return
  // 非 HTTP(S) 协议（如 javascript:、data:）一律不弹确认也不打开。
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    event.preventDefault()
    return
  }
  // 同源链接留在应用内，保持默认导航。
  if (url.origin === window.location.origin) return

  event.preventDefault()
  await confirmAndOpenExternal(href, url.host)
}
</script>

<template>
  <!-- 内容已由 DOMPurify 清洗，此处仅渲染安全 HTML。 -->
  <div class="markdown" v-html="html" @click="onClick"></div>
</template>

<style scoped>
.markdown {
  font-size: 14px;
  line-height: 1.75;
  color: var(--ink);
  overflow-wrap: anywhere;
}
</style>
