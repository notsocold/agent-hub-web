import type { ChatMessageView, SystemCapabilities } from '@/types'

/** 命令面板的静态页面项；能力关闭的页面由 `filterPalettePages` 过滤。 */
export interface PalettePage {
  id: string
  label: string
  description: string
  route: string
  capability?: keyof SystemCapabilities
}

export const palettePages: PalettePage[] = [
  { id: 'chat', label: '对话', description: '对话工作台与历史会话', route: 'chat' },
  { id: 'agents', label: '智能体', description: '远程智能体与 Agent Card', route: 'agents', capability: 'agents' },
  { id: 'tasks', label: '任务', description: 'A2A 任务与执行详情', route: 'tasks', capability: 'tasks' },
  {
    id: 'knowledge',
    label: '知识库',
    description: '文档、分类与检索调试',
    route: 'knowledge',
    capability: 'knowledge',
  },
  { id: 'settings', label: '设置', description: '账号、个人能力与界面偏好', route: 'settings' },
]

/**
 * 按关键词与能力开关过滤页面项。
 * 能力信息尚未加载（undefined）时与侧栏一致：按可用处理，避免首屏把入口藏掉。
 */
export function filterPalettePages(
  query: string,
  capabilities?: SystemCapabilities | null,
): PalettePage[] {
  const keyword = query.trim().toLowerCase()
  return palettePages.filter((page) => {
    if (page.capability && capabilities && capabilities[page.capability] !== true) return false
    if (!keyword) return true
    return `${page.label} ${page.description}`.toLowerCase().includes(keyword)
  })
}

/** 当前会话内按正文匹配消息，取最近的 `limit` 条。 */
export function matchMessages(
  messages: ChatMessageView[],
  query: string,
  limit = 8,
): ChatMessageView[] {
  const keyword = query.trim().toLowerCase()
  if (!keyword) return []
  const matched: ChatMessageView[] = []
  for (let index = messages.length - 1; index >= 0 && matched.length < limit; index -= 1) {
    const message = messages[index]
    if (!message) continue
    if (message.content.toLowerCase().includes(keyword)) matched.push(message)
  }
  return matched
}
