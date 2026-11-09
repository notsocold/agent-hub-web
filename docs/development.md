# 开发指南

> **当前状态：M1 前端已实现，开发环境默认使用内置 mock。**
> 登录/注册、应用布局、对话工作台与各业务页骨架已可用；依赖已安装，命令可直接执行。
> 后端联调时在 `.env.local` 设置 `VITE_USE_MOCK=false`。

## 1. 环境要求

| 工具 | 版本 |
|---|---|
| Node.js | ^22.18 或 ≥24.12（`package.json` engines） |
| pnpm | ≥ 10 |

后端需同时运行（`agent-hub`，默认 `http://127.0.0.1:8000`）。

## 2. 常用命令

| 命令 | 作用 |
|---|---|
| `pnpm install` | 安装依赖 |
| `pnpm dev` | 开发服务器（5173，热更新） |
| `pnpm build` | 类型检查 + 生产构建 |
| `pnpm test` | Vitest 单测（46 个用例） |
| `pnpm test:watch` | Vitest 监听模式 |
| `pnpm preview` | 预览构建产物 |
| `pnpm type-check` | 仅类型检查 |
| `pnpm lint` | oxlint + eslint（自动修复） |
| `pnpm format` | Prettier 格式化 `src/` |

首次拉取后建议先跑 `pnpm install && pnpm build`，确认环境正常。

### mock 与真实后端

| 场景 | 配置 | 行为 |
|---|---|---|
| 默认开发 | `.env.development` 的 `VITE_USE_MOCK=true` | `src/api` 使用内置 adapter；SSE 走 `src/api/mock/stream.ts` |
| 联调 | `.env.local` 写 `VITE_USE_MOCK=false` | 请求经 Vite 代理 `/api`、`/a2a` 到 `http://127.0.0.1:8000` |
| 直连 | `VITE_API_BASE_URL=http://localhost:8000/api/v1` | 需后端允许 CORS |
| 生产 | `.env.production` 固定 `false` | 同源 `/api/v1`，由 Nginx 反代 |

mock 登录：任意邮箱 + 8 位以上密码；输入 `wrong-password` 可测试 401。

## 3. 目录与命名

| 类型 | 位置 | 命名 |
|---|---|---|
| 页面 | `src/views/` | `ChatView.vue`（PascalCase + View 后缀） |
| 展示组件 | `src/components/<域>/` | `MessageBubble.vue` |
| 布局 | `src/layouts/` | `AppLayout.vue` |
| Store | `src/stores/` | `useChatStore`，文件 `chat.ts` |
| API 模块 | `src/api/` | `chat.ts`，导出 `openChatStream` 等 |
| 组合式 | `src/composables/` | `useSSE.ts` |
| 类型 | `src/types/` | `chat.ts`，接口 PascalCase |

## 4. 编码规范

- 统一 `<script setup lang="ts">`，不用 Options API；
- props 用类型声明 + `withDefaults`，事件用 `defineEmits<{...}>()`；
- 组件不超过 300 行，超出时拆子组件或 composable；
- 不用 `any`；确实未知用 `unknown` 并收窄；
- 模板中避免复杂表达式，抽成 `computed`；
- 样式用 `<style scoped>`，颜色/间距优先用 CSS 变量；
- 用户可见文案用中文；代码注释解释「为什么」，不复述代码。

## 5. 状态管理约定

```ts
export const useChatStore = defineStore('chat', () => {
  const streaming = ref(false)
  const messages = ref<ChatMessage[]>([])

  async function send(text: string) {
    // 异步动作内自己管理 loading，错误向上抛
  }

  return { streaming, messages, send }
})
```

- store 只放跨页面/跨组件状态；页面局部状态用 `ref`；
- 不把组件实例、DOM 节点、AbortController 放进 store（AbortController 可放 composable）；
- 异步动作命名用动词：`loadConversations`、`sendMessage`、`cancelRun`。

## 6. 新增页面的步骤

1. 在 `src/views/` 建页面，先在 `router/index.ts` 注册路由与 `meta.title`；
2. 需要数据时，先在 `src/types/` 定义类型，再在 `src/api/` 写接口函数；
3. 复杂状态放 `src/stores/`，简单页面直接用 `ref`；
4. 复用 `PagePlaceholder` / 空态 / 错误态组件，保证三态齐全；
5. 用 `pnpm build` 验证类型，`pnpm lint` 验证规范；
6. 更新 `docs/pages.md` 的页面规格（如行为有变化）。

## 7. SSE 开发注意事项

- 用 `fetch-event-source`，不要用原生 `EventSource`（不支持 POST/header）；
- `AbortController` 必须在 `onUnmounted` / 主动停止时调用；
- 事件处理函数保持幂等：同一 `message_id` 的 delta 只追加一次；
- 高频 delta 合并渲染（`requestAnimationFrame`），避免逐 token 重排；
- 断线重连要能恢复：保存 `run_id`，重连后查询 run 状态；
- 后端默认断线不取消，前端不要一断线就清空消息。

## 8. 调试

| 场景 | 方法 |
|---|---|
| 组件状态 | Vue DevTools → Pinia / Components |
| 网络 | DevTools Network → Fetch/XHR / EventStream |
| 代理 | 检查 `vite.config.ts` 的 target 与后端端口 |
| 类型错误 | `pnpm type-check`，看完整报错 |
| 样式 | 优先检查 CSS 变量与 scoped 边界 |

## 9. 常见问题

| 问题 | 原因 | 处理 |
|---|---|---|
| `/api` 返回 500/502 | 后端未启动或端口不对 | 启动 `agent-hub`，确认 8000 |
| SSE 一直 pending 无事件 | Nginx/代理缓冲，或后端未 flush | 开发环境走 Vite 代理；生产关闭 `proxy_buffering` |
| 401 循环跳登录 | refresh 失败仍重试 | 检查 refresh 单飞锁与 token 清理 |
| 构建 OOM | Node 内存不足 | `NODE_OPTIONS=--max-old-space-size=4096 pnpm build` |
| Element Plus 样式缺失 | 未引入 `element-plus/dist/index.css` | 已在 `main.ts` 引入，检查是否被覆盖 |
| 路由刷新 404 | 静态服务器未配置 history fallback | Nginx `try_files $uri $uri/ /index.html` |

## 10. Git 约定

- 分支：`feat/<scope>`、`fix/<scope>`、`docs/<scope>`；
- 提交：`<type>(<scope>): <summary>`；
- 提交前跑 `pnpm lint && pnpm build`；
- 不提交 `node_modules`、`dist`、`.env.local`。
