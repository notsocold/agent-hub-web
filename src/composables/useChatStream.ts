import { useChatStore } from '@/stores/chat'
import type { ChatContextSelection } from '@/types'

/**
 * 对话流入口：把 store 的发送/停止能力收敛给页面使用。
 * 离开页面时不自动取消——后端约定断线不取消，事件仍写入 store。
 */
export function useChatStream() {
  const chat = useChatStore()

  function send(text: string, context: ChatContextSelection = {}): Promise<void> {
    return chat.send(text, context)
  }

  function stop(): void {
    chat.stop()
  }

  return { send, stop }
}
