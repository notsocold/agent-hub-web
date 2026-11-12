import { createApp } from 'vue'
import { createPinia } from 'pinia'

import 'element-plus/theme-chalk/dark/css-vars.css'
// ElMessageBox / ElMessage 是脚本里调用的函数式组件，不经过模板解析，
// unplugin-vue-components 不会为它们注入样式，必须在入口按需引入；
// 否则弹窗会平铺整行、按钮小到无法操作，轻提示也会没有背景。
import 'element-plus/es/components/message-box/style/css'
import 'element-plus/es/components/message/style/css'
import '@/styles/index.css'

import App from './App.vue'
import { initPreferences } from '@/composables/usePreferences'
import { apiClient, setUnauthorizedHandler } from '@/api/client'
import router from './router'
import { useAuthStore } from '@/stores/auth'

async function bootstrap(): Promise<void> {
  // F1：偏好（消息密度）必须在首屏生效，不能等设置页懒加载后才应用。
  initPreferences()
  // 生产构建已在构建期拦截 mock；这里再兜一层，防止 e2e 产物被误部署后连假数据。
  // 用 MODE 而不是 PROD：vite build --mode e2e 的产物 PROD 仍为 true。
  if (import.meta.env.MODE === 'production' && import.meta.env.VITE_USE_MOCK === 'true') {
    throw new Error('生产环境禁止 mock：请使用默认构建或移除 VITE_USE_MOCK')
  }

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
      // expired=1 让登录页提示「登录已过期」，redirect 保留原目标路由。
      void router.replace({
        name: 'login',
        query: { redirect: current.fullPath, expired: '1' },
      })
    }
  })

  // 先恢复登录态，避免首屏路由守卫误判。
  await auth.restore()

  app.use(router)
  app.mount('#app')
}

void bootstrap()
