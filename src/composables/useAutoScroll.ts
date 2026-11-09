import { computed, nextTick, onMounted, ref, watch, type Ref } from 'vue'

/**
 * 消息列表自动滚动：用户上滑后暂停跟随，并提供“回到底部”。
 */
export function useAutoScroll(container: Ref<HTMLElement | null>, source: () => unknown) {
  const pinned = ref(true)
  const showJump = computed(() => !pinned.value)

  function onScroll(): void {
    const element = container.value
    if (!element) return
    pinned.value = element.scrollHeight - element.scrollTop - element.clientHeight < 80
  }

  function scrollToBottom(smooth = false): void {
    const element = container.value
    if (!element) return
    element.scrollTo({ top: element.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })
  }

  watch(source, () => {
    if (pinned.value) {
      void nextTick(() => scrollToBottom())
    }
  })

  onMounted(() => {
    void nextTick(() => scrollToBottom())
  })

  return { pinned, showJump, onScroll, scrollToBottom }
}
