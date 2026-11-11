import type { ChatMessageView, ProcessItem } from '@/types'

export type MessageRow =
  | { id: string; kind: 'message'; message: ChatMessageView }
  | { id: 'process'; kind: 'process' }

/**
 * 把消息列表与「当前轮的执行过程」拍平成虚拟列表行。
 *
 * process 行锚定规则（设计 2026-11-11 F1 5.1）：
 * 1. 本轮（run_id === currentRunId）的第一条 assistant 之前；
 * 2. 没有本轮 assistant 时，最后一条 assistant 之前；
 * 3. 完全没有 assistant 时，放在列表末尾；
 * 4. process 为空时不产生 process 行。
 *
 * 纯函数：不修改入参，不依赖 store。
 */
export function buildMessageRows(
  messages: ChatMessageView[],
  process: ProcessItem[],
  currentRunId: string | null,
): MessageRow[] {
  const rows: MessageRow[] = messages.map((message) => ({
    id: message.id,
    kind: 'message',
    message,
  }))
  if (process.length === 0) return rows

  const processRow: MessageRow = { id: 'process', kind: 'process' }

  let anchor = -1
  if (currentRunId) {
    anchor = messages.findIndex(
      (message) => message.role === 'assistant' && message.run_id === currentRunId,
    )
  }
  if (anchor < 0) {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      if (messages[index]?.role === 'assistant') {
        anchor = index
        break
      }
    }
  }

  if (anchor < 0) {
    rows.push(processRow)
    return rows
  }
  rows.splice(anchor, 0, processRow)
  return rows
}
