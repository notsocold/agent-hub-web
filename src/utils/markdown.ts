import DOMPurify from 'dompurify'
import hljs from 'highlight.js/lib/common'
import { marked, type Tokens } from 'marked'

function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}

const renderer = new marked.Renderer()

renderer.code = ({ text, lang }: Tokens.Code) => {
  const language = lang && hljs.getLanguage(lang) ? lang : 'plaintext'
  const highlighted = hljs.highlight(text, { language }).value
  return `<pre class="code-block"><code class="hljs language-${language}">${highlighted}</code></pre>`
}

renderer.link = ({ href, title, text }: Tokens.Link) => {
  const safeHref = escapeAttribute(href ?? '#')
  const titleAttr = title ? ` title="${escapeAttribute(title)}"` : ''
  return `<a href="${safeHref}" target="_blank" rel="noopener noreferrer"${titleAttr}>${text}</a>`
}

marked.use({
  gfm: true,
  breaks: true,
  renderer,
})

/** 缓存条数上限，避免长会话无限占用内存。 */
const MARKDOWN_CACHE_LIMIT = 200

/** Map 的插入顺序即 LRU 顺序：最久未使用的键排在最前。 */
const cache = new Map<string, string>()

let hits = 0
let misses = 0

export interface MarkdownCacheStats {
  readonly size: number
  readonly hits: number
  readonly misses: number
}

export interface RenderMarkdownOptions {
  /** 默认 true；流式消息可传 false 以绕过缓存。 */
  cache?: boolean
}

/** 只读缓存统计，供测试与诊断使用。 */
export function getMarkdownCacheStats(): MarkdownCacheStats {
  return { size: cache.size, hits, misses }
}

/** 清空缓存并重置统计，供测试隔离使用。 */
export function resetMarkdownCache(): void {
  cache.clear()
  hits = 0
  misses = 0
}

function renderAndSanitize(content: string): string {
  const html = marked.parse(content, { async: false }) as string
  return DOMPurify.sanitize(html, {
    ADD_ATTR: ['target', 'rel'],
    ADD_TAGS: ['mark'],
  })
}

/**
 * Markdown → 安全 HTML。
 * 远程 Agent / 工具返回的内容按不可信输入处理，必须经过 DOMPurify；
 * 缓存只保存清洗后的 HTML，命中时直接复用，安全边界不变。
 * 默认开启 LRU 缓存（上限 200 条），流式消息可传 cache: false 绕过缓存。
 */
export function renderMarkdown(content: string, options?: RenderMarkdownOptions): string {
  if (!content) return ''

  if (options?.cache === false) {
    return renderAndSanitize(content)
  }

  const cached = cache.get(content)
  if (cached !== undefined) {
    hits += 1
    // 命中后移到队尾，保持 LRU 顺序。
    cache.delete(content)
    cache.set(content, cached)
    return cached
  }

  misses += 1
  const html = renderAndSanitize(content)
  cache.set(content, html)
  if (cache.size > MARKDOWN_CACHE_LIMIT) {
    const oldest = cache.keys().next().value
    if (oldest !== undefined) cache.delete(oldest)
  }
  return html
}
