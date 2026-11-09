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

/**
 * Markdown → 安全 HTML。
 * 远程 Agent / 工具返回的内容按不可信输入处理，必须经过 DOMPurify。
 */
export function renderMarkdown(content: string): string {
  if (!content) return ''
  const html = marked.parse(content, { async: false }) as string
  return DOMPurify.sanitize(html, {
    ADD_ATTR: ['target', 'rel'],
    ADD_TAGS: ['mark'],
  })
}
