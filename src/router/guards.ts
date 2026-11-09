import type { Router } from 'vue-router'

import { useAuthStore } from '@/stores/auth'

export function setupGuards(router: Router): void {
  router.beforeEach((to) => {
    const auth = useAuthStore()

    if (to.meta.requiresAuth && !auth.isAuthenticated) {
      return { name: 'login', query: { redirect: to.fullPath } }
    }
    if (to.meta.guestOnly && auth.isAuthenticated) {
      return { name: 'chat' }
    }
    return true
  })

  router.afterEach((to) => {
    const title = to.meta.title
    document.title = title ? `${title} · Agent Hub` : 'Agent Hub'
  })
}
