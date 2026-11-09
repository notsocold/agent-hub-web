import type { Router } from 'vue-router'

import { useAuthStore } from '@/stores/auth'
import { useSystemStore } from '@/stores/system'

export function setupGuards(router: Router): void {
  router.beforeEach(async (to) => {
    const auth = useAuthStore()

    if (to.meta.requiresAuth && !auth.isAuthenticated) {
      return { name: 'login', query: { redirect: to.fullPath } }
    }
    if (to.meta.guestOnly && auth.isAuthenticated) {
      return { name: 'chat' }
    }

    // 后端能力关闭的页面直接退回对话；M1 不请求 /agents、/tasks 等未注册端点。
    if (to.meta.capability && auth.isAuthenticated) {
      const system = useSystemStore()
      await system.load()
      if (system.loaded && !system.enabled(to.meta.capability)) {
        return { name: 'chat', query: { blocked: String(to.name ?? '') } }
      }
    }
    return true
  })

  router.afterEach((to) => {
    const title = to.meta.title
    document.title = title ? `${title} · Agent Hub` : 'Agent Hub'
  })
}
