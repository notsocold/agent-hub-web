import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright E2E 配置。
 *
 * - 默认使用 mock 模式的 e2e 构建产物（`dist-e2e`）+ `vite preview`，不依赖真实后端。
 * - 本机设置了 HTTP_PROXY，chromium 必须加 `--no-proxy-server`，避免 E2E 流量被代理拦截。
 * - CI 下不复用已有服务，保证每次都从干净构建启动。
 */
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    launchOptions: {
      args: ['--no-proxy-server'],
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'pnpm e2e:server',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
