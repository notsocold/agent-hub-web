import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'

import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'

const pkg = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
) as { version: string }

const gitSha = ((): string => {
  try {
    return execSync('git rev-parse --short HEAD', {
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim()
  } catch {
    return 'unknown'
  }
})()

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  // 生产构建禁止 mock：mock 打包进产物会让前端连假数据，必须在构建期失败。
  // 只拦 build，不拦 preview，否则 shell 里遗留的 VITE_USE_MOCK 会让预览误报。
  if (command === 'build' && mode === 'production' && env.VITE_USE_MOCK === 'true') {
    throw new Error('生产构建禁止 mock：请检查 .env.production 与 shell 环境变量 VITE_USE_MOCK')
  }

  return {
    base: env.VITE_BASE_PATH || '/',
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
      __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
      __GIT_SHA__: JSON.stringify(gitSha),
    },
    plugins: [
      vue(),
      vueDevTools(),
      AutoImport({
        imports: ['vue', 'vue-router', 'pinia'],
        resolvers: [ElementPlusResolver()],
        dts: 'src/auto-imports.d.ts',
      }),
      Components({
        resolvers: [ElementPlusResolver({ importStyle: 'css' })],
        dts: 'src/components.d.ts',
      }),
    ],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:8000',
          changeOrigin: true,
        },
        '/a2a': {
          target: 'http://127.0.0.1:8000',
          changeOrigin: true,
        },
        '/healthz': {
          target: 'http://127.0.0.1:8000',
          changeOrigin: true,
        },
        '/readyz': {
          target: 'http://127.0.0.1:8000',
          changeOrigin: true,
        },
      },
    },
    build: {
      rollupOptions: {
        output: {
          // Vite 8 / Rolldown 只接受函数形式的 manualChunks：
          // 把 Markdown 三件套、Vue 运行时与 HTTP 层拆成独立块，避免对话页首屏全量加载。
          manualChunks(id: string) {
            const normalized = id.replace(/\\/g, '/')
            const groups: Array<[string, string[]]> = [
              ['vue-vendor', ['node_modules/vue/', 'node_modules/vue-router/', 'node_modules/pinia/']],
              [
                'markdown',
                ['node_modules/marked/', 'node_modules/dompurify/', 'node_modules/highlight.js/'],
              ],
              ['http', ['node_modules/axios/', 'node_modules/@microsoft/fetch-event-source/']],
            ]
            for (const [name, prefixes] of groups) {
              if (prefixes.some((prefix) => normalized.includes(prefix))) return name
            }
            return undefined
          },
        },
      },
    },
  }
})
