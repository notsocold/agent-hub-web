import { createApp } from 'vue'
import { createPinia } from 'pinia'

import 'element-plus/theme-chalk/dark/css-vars.css'
import '@/styles/index.css'

import App from './App.vue'
import { apiClient, setUnauthorizedHandler } from '@/api/client'
import router from './router'
import { useAuthStore } from '@/stores/auth'

async function bootstrap(): Promise<void> {
  // mock 仅开发期使用；生产构建不会加载该分包。
  if (import.meta.env.VITE_USE_MOCK === 'true') {
    const { installMockAdapter } = await import('@/api/mock')
    installMockAdapter(apiClient)
  }

  const app = createApp(App)
  const pinia = createPinia()
  app.use(pinia)

  const auth = useAuthStore(pinia)
  setUnauthorizedHandler(() => {
    auth.clearSession()
    const current = router.currentRoute.value
    if (current.name !== 'login') {
      void router.replace({ name: 'login', query: { redirect: current.fullPath } })
    }
  })

  // 先恢复登录态，避免首屏路由守卫误判。
  await auth.restore()

  app.use(router)
  app.mount('#app')
}

void bootstrap()
