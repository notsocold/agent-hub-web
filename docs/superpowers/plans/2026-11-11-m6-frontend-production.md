# M6 前端生产化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 `agent-hub-web` 具备上生产的前置条件：可部署的构建产物与体积门禁、断线自动重连、`request_id`/构建信息可诊断、Playwright 主链路 E2E、Nginx SSE 配置与实测证据。

**Architecture:** 以「基础数据层 → 门禁/工具 → UI」分层。可观测数据统一进 `src/utils/diagnostics.ts` 的环形缓冲，由 `client.ts` 拦截器与 Web Vitals 采集器写入，诊断抽屉只读渲染；重连做成 store 内的独立状态机（不经过 `startStream` 的重置路径），重连前用 `GET /runs/{id}` 回填 `conversation_id` 并用 `lastSeq` 去重；E2E 用 `--mode e2e` 构建 mock 产物 + `vite preview`；Nginx 验证复用现有 `dev_nginx` 容器内的独立临时实例。

**Tech Stack:** Vue 3.5 / TypeScript 6 / Vite 8 / Pinia 4 / Element Plus / Axios / @microsoft/fetch-event-source / Vitest 5 + @vue/test-utils / Playwright（新增）/ Nginx 1.31（容器内）/ busybox nc。

**Spec:** `docs/superpowers/specs/2026-11-11-m6-frontend-production-design.md`

## Global Constraints

- 包管理器 `pnpm`；Node `^22.18.0 || >=24.12.0`。
- 生产构建禁止 mock：`command === 'build' && mode === 'production' && VITE_USE_MOCK === 'true'` 必须构建失败。
- E2E 构建用 `--mode e2e` + `dist-e2e`，不得覆盖 `dist`；运行期 mock 门禁用 `import.meta.env.MODE`，不得用 `PROD`。
- 体积门禁：单 chunk gzip ≤ 110 KB，JS 总 gzip ≤ 420 KB，CSS 总 gzip ≤ 60 KB；gzip 口径 = 逐文件 gzip 后求和。
- 重连：最多 5 次、总窗口 60s、退避 1/2/4/8/16s ±20%；重连前必须 `GET /runs/{id}` 回填 `conversation_id` 并校验 run 一致；重连保留 `lastSeq`。
- 不新增后端 API、不改既有契约；不引入 Sentry / web-vitals 包；不启动新容器；不写宿主 `/home/zhaodan/work/docker_work/nginx/`。
- 任何 UI 不展示 token、消息内容、审批 payload 原文（诊断抽屉只展示 id、状态、耗时、版本）。
- 提交信息用 `feat|fix|test|docs|build|chore(scope): 中文摘要`；每个 Task 一个提交。

## Review Focus

以下五类输入/失败模式，spec 隐含但最容易在验收时才暴露；每个都在对应 Task 里加了测试：

1. **断线发生在 `conversation.created` 之前**：重连若不带回填的 `conversation_id`，会新建会话/run、重复用户消息 → Task 5 单测钉住。
2. **服务端静默关流（正常 EOF、未收到 `message.done`）**：只处理 `onerror` 会导致界面永远卡在 streaming → Task 5 单测钉住。
3. **生产误开 mock**：构建期门禁必须失败，且 `vite preview` 不被误伤 → Task 2 验证命令钉住。
4. **分包没生效导致首屏回退**：`size` 门禁必须在 ChatView 不拆分时失败 → Task 2 验证命令钉住。
5. **Nginx 漏 `proxy_buffering off`**：SSE 在反向代理后被整段缓冲 → Task 9 的 `verify:nginx` 对照组钉住。

---

## 执行顺序

- **Phase 1（串行，root）**：Task 1 → Task 2 → Task 3。这三个任务共享 `vite.config.ts` / `src/api/client.ts` / `src/utils/`，串行避免冲突。
- **Phase 2（并行，子代理）**：Task 4（诊断抽屉）、Task 5（重连状态机）、Task 7（E2E 基础设施）、Task 9（部署与 Nginx）。文件互不重叠；子代理**不得修改 `package.json`**，脚本项由 root 在 Phase 3 统一加。
- **Phase 3（串行，root）**：Task 6（重连 UI，依赖 5）→ Task 8（E2E 用例，依赖 7）→ package.json 脚本合并。
- **Phase 4**：Task 10（CI + 文档收尾 + 全量验证），再由独立子代理做整分支审查。

分支：`feat/m6-production`（从当前 `master` 切出）。

---

### Task 1: 可观测数据层（构建信息 + 请求/错误环形缓冲）

**Files:**
- Modify: `vite.config.ts`（加 `define`）
- Modify: `src/env.d.ts`
- Create: `src/utils/diagnostics.ts`
- Modify: `src/api/client.ts`
- Test: `src/utils/__tests__/diagnostics.spec.ts`、`src/api/__tests__/client.spec.ts`（追加用例）

**Interfaces:**
- Produces:
  - `interface RequestRecord { method: string; url: string; status: number; durationMs: number; requestId: string; traceId: string; at: number }`
  - `interface ErrorRecord { code: string; message: string; requestId: string; at: number }`
  - `interface BuildInfo { version: string; buildTime: string; gitSha: string; apiBase: string; mock: boolean }`
  - `recordRequest(r: RequestRecord): void`、`recordError(e: ErrorRecord): void`
  - `getRecentRequests(limit?: number): RequestRecord[]`（新→旧）
  - `getRecentErrors(limit?: number): ErrorRecord[]`（新→旧）
  - `getBuildInfo(): BuildInfo`
  - `setRuntimeContext(ctx: { runId?: string | null; conversationId?: string | null }): void`、`getRuntimeContext(): { runId: string | null; conversationId: string | null }`
  - `resetDiagnostics(): void`（测试用）
  - 全局常量 `__APP_VERSION__: string`、`__BUILD_TIME__: string`、`__GIT_SHA__: string`

- [ ] **Step 1: 写失败测试**

`src/utils/__tests__/diagnostics.spec.ts`：

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { getBuildInfo, getRecentErrors, getRecentRequests, recordError, recordRequest, resetDiagnostics } from '@/utils/diagnostics'

const req = (i: number) => ({ method: 'GET', url: `/x/${i}`, status: 200, durationMs: 5, requestId: `req-${i}`, traceId: '', at: i })

describe('diagnostics', () => {
  beforeEach(() => resetDiagnostics())

  it('环形缓冲只保留最近 20 条且新在前', () => {
    for (let i = 1; i <= 25; i += 1) recordRequest(req(i))
    const rows = getRecentRequests()
    expect(rows).toHaveLength(20)
    expect(rows[0]?.requestId).toBe('req-25')
    expect(rows.at(-1)?.requestId).toBe('req-6')
  })

  it('错误也进环形缓冲', () => {
    recordError({ code: 'forbidden', message: '无权限', requestId: 'req-a', at: 1 })
    expect(getRecentErrors()[0]?.requestId).toBe('req-a')
  })

  it('构建信息包含版本与 API base', () => {
    const info = getBuildInfo()
    expect(info.version).toBeTruthy()
    expect(info.apiBase).toMatch(/^\/api\/v1$|^https?:/)
    expect(typeof info.mock).toBe('boolean')
  })
})
```

`src/api/__tests__/client.spec.ts` 追加：

```ts
it('成功响应记录 X-Request-ID 到诊断缓冲', async () => {
  resetDiagnostics()
  const client = createHttpClient({ baseURL: 'http://x' })
  // 用 axios mock adapter（仓库已有 mock adapter 工具，见同文件现有写法）返回 200 + header
  // 断言 getRecentRequests()[0].requestId === 'req-ok' 且 status === 200
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run src/utils/__tests__/diagnostics.spec.ts`
Expected: FAIL（`Cannot find module '@/utils/diagnostics'`）

- [ ] **Step 3: 实现**

`vite.config.ts` 顶部加：

```ts
import { execSync } from 'node:child_process'
import pkg from './package.json' with { type: 'json' }

const gitSha = (() => { try { return execSync('git rev-parse --short HEAD').toString().trim() } catch { return 'unknown' } })()
```

`define`：`__APP_VERSION__: JSON.stringify(pkg.version)`、`__BUILD_TIME__: JSON.stringify(new Date().toISOString())`、`__GIT_SHA__: JSON.stringify(gitSha)`。

`src/env.d.ts` 增加：

```ts
declare const __APP_VERSION__: string
declare const __BUILD_TIME__: string
declare const __GIT_SHA__: string
```

`src/utils/diagnostics.ts`：模块级 `const CAPACITY = 20`，`requests: RequestRecord[]`、`errors: ErrorRecord[]`，`record*` 用 `unshift` + `length > CAPACITY && pop()`；`getBuildInfo()` 读全局常量 + `import.meta.env.VITE_API_BASE_URL || '/api/v1'` + `import.meta.env.VITE_USE_MOCK === 'true'`。

`src/api/client.ts`：请求拦截器写 `config.metadata = { startedAt: performance.now() }`；响应成功/失败拦截器里用 `response.headers['x-request-id']` / `['x-trace-id']`（大小写不敏感，axios 已归一化为小写）调 `recordRequest`；失败分支另调 `recordError({ code, message, requestId, at: Date.now() })`。记录失败不得抛错（包一层 try/catch）。

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm vitest run src/utils/__tests__/diagnostics.spec.ts src/api/__tests__/client.spec.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add vite.config.ts src/env.d.ts src/utils/diagnostics.ts src/api/client.ts src/utils/__tests__/diagnostics.spec.ts src/api/__tests__/client.spec.ts
git commit -m "feat(observability): 采集构建信息与请求/错误诊断数据"
```

---

### Task 2: 构建门禁（mock 硬门禁 + 分包 + 体积脚本）

**Files:**
- Modify: `vite.config.ts`（函数式配置、manualChunks、base、构建期门禁）
- Modify: `src/main.ts`（运行期门禁）
- Create: `scripts/check-bundle-size.mjs`
- Modify: `package.json`（`size` 脚本）
- Test: 命令验证（无单测）

**Interfaces:**
- Produces: `pnpm size` 命令（退出码 0/1）；`manualChunks` 产出 `markdown` / `vue-vendor` / `http` 三个命名 chunk。

- [ ] **Step 1: 写体积脚本（先让它校验失败）**

`scripts/check-bundle-size.mjs`：

- `readdirSync('dist/assets')` 过滤 `.js` / `.css`，逐文件 `gzipSync` 求大小；
- 阈值常量 `MAX_CHUNK_KB = 110`、`MAX_JS_TOTAL_KB = 420`、`MAX_CSS_TOTAL_KB = 60`，支持同名环境变量覆盖；
- 打印 Top 10 表格（name、raw KB、gzip KB）、总 JS/CSS gzip；
- 任一超限打印 `✗` 并 `process.exit(1)`，全过打印 `✓ bundle size ok`。

- [ ] **Step 2: 跑脚本确认当前失败**

Run: `node scripts/check-bundle-size.mjs`
Expected: FAIL（`ChatView-*.js` gzip 122 KB > 110 KB），exit 1。

- [ ] **Step 3: 实现配置与门禁**

`vite.config.ts` 改为：

```ts
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  if (command === 'build' && mode === 'production' && env.VITE_USE_MOCK === 'true') {
    throw new Error('生产构建禁止 mock：请检查 .env.production / shell 环境变量 VITE_USE_MOCK')
  }
  return {
    base: env.VITE_BASE_PATH || '/',
    plugins: [...],
    resolve: {...},
    server: {...},
    define: { ... },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            'vue-vendor': ['vue', 'vue-router', 'pinia'],
            markdown: ['marked', 'dompurify', 'highlight.js'],
            http: ['axios', '@microsoft/fetch-event-source'],
          },
        },
      },
    },
  }
})
```

`src/main.ts` 在 `bootstrap()` 首行加：

```ts
if (import.meta.env.MODE === 'production' && import.meta.env.VITE_USE_MOCK === 'true') {
  throw new Error('生产环境禁止 mock：请使用默认构建或移除 VITE_USE_MOCK')
}
```

`package.json` 加 `"size": "node scripts/check-bundle-size.mjs"`。

- [ ] **Step 4: 验证四条命令**

```bash
pnpm build                         # 通过
pnpm size                          # 通过；ChatView gzip < 110 KB
VITE_USE_MOCK=true pnpm build      # 必须失败，报「生产构建禁止 mock」
pnpm preview --port 4174 &         # 起 preview 不能被门禁误伤（能正常启动）
```

- [ ] **Step 5: 提交**

```bash
git add vite.config.ts src/main.ts scripts/check-bundle-size.mjs package.json
git commit -m "build(web): 强制生产关 mock 与产物体积分包门禁"
```

---

### Task 3: 错误展示带 request_id 与复制

**Files:**
- Create: `src/utils/errors.ts`
- Modify: `src/components/common/ErrorState.vue`
- Modify: `src/views/chat/ChatView.vue`（错误条展示 request_id）
- Test: `src/utils/__tests__/errors.spec.ts`、`src/components/common/__tests__/ErrorState.spec.ts`

**Interfaces:**
- Produces: `describeError(error: unknown): { message: string; code: string; status: number; requestId: string }`
- `ErrorState` props 变为 `{ message: string; requestId?: string }`，新增复制按钮（`navigator.clipboard.writeText`，失败降级 `ElMessage.warning('复制失败，请手动选中')`）。

- [ ] **Step 1: 写失败测试**

```ts
// src/utils/__tests__/errors.spec.ts
import { describe, expect, it } from 'vitest'
import { ApiRequestError } from '@/api/client'
import { describeError } from '@/utils/errors'

it('ApiRequestError 透出 code/status/requestId', () => {
  const r = describeError(new ApiRequestError('无权限', { code: 'forbidden', status: 403, requestId: 'req-9' }))
  expect(r).toEqual({ message: '无权限', code: 'forbidden', status: 403, requestId: 'req-9' })
})

it('普通 Error 归一到 unknown_error', () => {
  expect(describeError(new Error('boom')).code).toBe('unknown_error')
})
```

```ts
// ErrorState.spec.ts
it('有 requestId 时渲染并支持复制', async () => { /* mount + stub clipboard + click 按钮 + 断言 writeText('req-9') */ })
it('无 requestId 时不渲染复制按钮', () => { /* ... */ })
```

- [ ] **Step 2: 跑测试确认失败**：`pnpm vitest run src/utils/__tests__/errors.spec.ts src/components/common/__tests__/ErrorState.spec.ts` → FAIL。

- [ ] **Step 3: 实现**

`describeError` 复用 `ApiRequestError` 判别（`instanceof`），其余归 `unknown_error`、`status: 0`、`requestId: ''`。`ErrorState` 用 `<code>` 展示 `request_id: xxx` + 「复制」按钮，`aria-label="复制 request_id"`。`ChatView` 的错误条传 `:request-id="describeError(chat.error).requestId"`（`chat.error` 是 `{ code, message }` 形状时直接读 `code`）。

- [ ] **Step 4: 跑测试确认通过** + `pnpm type-check`。

- [ ] **Step 5: 提交**

```bash
git add src/utils/errors.ts src/components/common/ErrorState.vue src/views/chat/ChatView.vue src/utils/__tests__/errors.spec.ts src/components/common/__tests__/ErrorState.spec.ts
git commit -m "feat(observability): 错误态展示并复制 request_id"
```

---

### Task 4: Web Vitals 采集 + 诊断抽屉

**Files:**
- Create: `src/utils/web-vitals.ts`
- Create: `src/components/common/DiagnosticsDrawer.vue`
- Modify: `src/components/layout/AccountMenu.vue`（菜单项「诊断信息」）
- Modify: `src/components/layout/SideNav.vue`（透传 emit）
- Modify: `src/layouts/AppLayout.vue`（挂抽屉）
- Test: `src/utils/__tests__/web-vitals.spec.ts`、`src/components/common/__tests__/DiagnosticsDrawer.spec.ts`

**Interfaces:**
- Produces:
  - `interface VitalRecord { name: 'LCP' | 'CLS' | 'INP' | 'TTFB'; value: number; at: number }`
  - `startWebVitals(): () => void`（返回 stop；`VITE_PERF_LOG === 'true'` 时 console.table）
  - `getWebVitals(limit?: number): VitalRecord[]`（新→旧，容量 20）
  - `DiagnosticsDrawer` props `{ open: boolean }`，emits `{ close: [] }`

- [ ] **Step 1: 写失败测试**

`web-vitals.spec.ts`：stub `globalThis.PerformanceObserver`（记录 callback 后手动触发 `entry`），断言 `startWebVitals()` 后 `getWebVitals()[0].name === 'LCP'`；CLS 用 `layout-shift` 且 `hadRecentInput === false`。

`DiagnosticsDrawer.spec.ts`：mount 后断言出现版本、构建时间、`request_id` 列表行；`recordRequest` 一条后重新打开能看到；点击复制调用 clipboard。

- [ ] **Step 2: 跑测试确认失败**。

- [ ] **Step 3: 实现**

`web-vitals.ts`：`PerformanceObserver` 分别 observe `largest-contentful-paint`、`layout-shift`、`event`（INP 近似：取 `duration` 最大值）、`navigation`（TTFB = `responseStart - startTime`）；各 observe 用 `try/catch` 包裹（不支持的环境静默）；统一 `recordVital()` 写进 `diagnostics.ts` 的环形缓冲（Task 1 已建，若没有 `vitals` 数组则在本任务给 `diagnostics.ts` 补 `recordVital/getWebVitals` 并复用同一 CAPACITY）。

`DiagnosticsDrawer.vue`：`el-drawer` + 四个区块（构建信息、运行时、最近请求、最近错误 + Vital），全部只读文本 + 复制按钮；不渲染 token / 消息内容 / payload。

`AccountMenu`：菜单加 `<button type="button" class="menu-item" @click="openDiagnostics">诊断信息</button>`，emit `diagnostics`；`SideNav` 透传；`AppLayout` 维护 `diagnosticsOpen` 并挂 `<DiagnosticsDrawer :open="diagnosticsOpen" @close="diagnosticsOpen = false" />`，`startWebVitals()` 在 `onMounted` 调用、`onUnmounted` 调 stop。

- [ ] **Step 4: 跑测试确认通过** + `pnpm type-check`。

- [ ] **Step 5: 提交**

```bash
git add src/utils/web-vitals.ts src/utils/diagnostics.ts src/components/common/DiagnosticsDrawer.vue src/components/layout/AccountMenu.vue src/components/layout/SideNav.vue src/layouts/AppLayout.vue src/utils/__tests__/web-vitals.spec.ts src/components/common/__tests__/DiagnosticsDrawer.spec.ts
git commit -m "feat(observability): Web Vitals 采集与诊断抽屉"
```

---

### Task 5: 断线重连状态机

**Files:**
- Create: `src/utils/retry.ts`
- Modify: `src/api/chat.ts`（`onClose` 回调）
- Modify: `src/stores/chat.ts`（connection 状态、重连调度、去重）
- Test: `src/utils/__tests__/retry.spec.ts`、`src/stores/__tests__/chat-reconnect.spec.ts`

**Interfaces:**
- Produces:
  - `MAX_RECONNECT_ATTEMPTS = 5`、`RECONNECT_WINDOW_MS = 60_000`
  - `nextReconnectDelay(attempt: number, random?: () => number): number`（base 1000 × 2^attempt，上限 16000，±20% 抖动）
  - `ChatConnection = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'degraded'`
  - `chat.connection: Ref<ChatConnection>`、`chat.reconnectAttempt: Ref<number>`、`chat.stopReconnect(): void`
  - `StreamHandlers.onClose?: () => void`

**关键实现约束（审查结论）：**

- 重连**不得**走 `startStream`（它会重置 `lastSeq/process/runId`）。新增内部 `reconnectStream(attempt: ChatAttempt)`。
- `onOpen` 需要参数 `resetSeq: boolean`：首次连接 `true`（重置 `lastSeq=0`），重连 `false`。
- 重连前必须 `const run = await runsApi.get(runId)`，并：
  - `state.conversationId = run.conversation_id`（回填；这是正确性关键）；
  - `run.id !== state.runId` → 放弃，`connection='degraded'`；
  - `isTerminal(run.status)` → `refreshHistory()` + 审批对账，`connection='idle'`；
  - `run.status === 'interrupted'` → 审批横幅 + 轮询，`connection='degraded'`；
  - 否则 `await openChatStream(..., { onOpen: () => onOpen(false), onEvent, onError, onClose })`。
- 正常 EOF：`onClose` 里若 `state.finishReason === null` 且 run 非终态 → `scheduleReconnect()`；`openChatStream` resolve 后的 `finally` 不得直接置 `streaming=false` 覆盖重连中的状态。
- 退避定时器与 `AbortController` 在 `stop()` / 组件卸载时清理；`offline` 事件暂停计时，`online` 事件立即重试一次并重置计数。
- 重连失败达到上限 → `connection='degraded'` + 复用现有 `RunRecoveryBanner` 路径（不新增第二套恢复 UI）。

- [ ] **Step 1: 写失败测试**

`retry.spec.ts`：`nextReconnectDelay(0) === 1000`（random 固定 0.5）、`nextReconnectDelay(4) === 16000`、`nextReconnectDelay(9)` 仍 ≤ 16000。

`chat-reconnect.spec.ts`（vi.mock `@/api/chat`、`@/api/runs`、`@/api/conversations`、`@/api/approvals`，用 `vi.useFakeTimers()`）：

```ts
it('断线后重连：先 GET run 回填 conversation_id，再用同 client_message_id 重连', async () => {
  // 第一次 openChatStream 抛 Error('network')；runsApi.get 返回 running + conversation_id:'conv-9'
  // 触发 send() -> 断言 runsApi.get 被调用、第二次 openChatStream 的 conversation_id === 'conv-9'
})
it('重连保留 lastSeq，不重复处理回放事件', async () => { /* 第一次收到 seq=3 的 tool.result，重连回放 seq=3，断言 process 只有一条 */ })
it('run 已终态时不重连，直接刷新历史', async () => { /* runsApi.get 返回 succeeded，断言未再次调用 openChatStream */ })
it('正常 EOF 且无 message.done 时触发重连（onClose）', async () => { /* ... */ })
it('连续失败 5 次后进入 degraded', async () => { /* ... */ })
```

- [ ] **Step 2: 跑测试确认失败**。

- [ ] **Step 3: 实现**（按 Interfaces 与关键约束）。

`src/api/chat.ts` 的 `connectOnce` 增加 `onclose: () => handlers.onClose?.()`（`fetch-event-source` 的 `onclose` 回调），并在 `openChatStream` 的 `StreamHandlers` 类型里加 `onClose?: () => void`。

- [ ] **Step 4: 跑测试确认通过** + 全量 `pnpm test`（确认未回归现有 180 例）。

- [ ] **Step 5: 提交**

```bash
git add src/utils/retry.ts src/api/chat.ts src/stores/chat.ts src/utils/__tests__/retry.spec.ts src/stores/__tests__/chat-reconnect.spec.ts
git commit -m "feat(chat): SSE 断线自动重连与事件去重"
```

---

### Task 6: 重连 UI（顶部连接条）

**Files:**
- Create: `src/components/chat/ConnectionBanner.vue`
- Modify: `src/views/chat/ChatView.vue` / `src/components/chat/MessageList.vue`（渲染位置）
- Test: `src/components/chat/__tests__/ConnectionBanner.spec.ts`

**Interfaces:**
- `ConnectionBanner` props `{ connection: ChatConnection; attempt: number; maxAttempts: number }`，emits `{ stop: [], retry: [] }`。
- 文案：`reconnecting` → `连接中断，正在重新连接（第 {attempt}/{maxAttempts} 次）`；`degraded` → `连接已断开，正在通过轮询恢复`；`offline`（由 store 用 `connection==='reconnecting'` + 在线状态表达时降级为同一条）→ `网络已断开，恢复后自动重连`。

- [ ] **Step 1: 写失败测试**：mount 后断言三种文案；点击「停止重连」emit stop；`degraded` 时出现「重新连接」emit retry。
- [ ] **Step 2: 跑测试确认失败**。
- [ ] **Step 3: 实现组件与 ChatView 接线**（在消息列表上方渲染，不遮挡输入区；`reconnecting` 时发送按钮保持禁用沿用 `streaming` 状态）。
- [ ] **Step 4: 跑测试确认通过**。
- [ ] **Step 5: 提交**：`git commit -m "feat(chat): 重连状态条与可中断重连"`。

---

### Task 7: Playwright E2E 基础设施

**Files:**
- Create: `.env.e2e`（`VITE_USE_MOCK=true`）
- Create: `playwright.config.ts`
- Create: `e2e/fixtures.ts`（登录辅助函数）
- Create: `e2e/auth.spec.ts`（冒烟）
- Modify: `package.json`（`e2e`、`e2e:server`）
- Modify: `.gitignore`（`dist-e2e/`、`test-results/`、`playwright-report/`）

**Interfaces:**
- Produces: `pnpm e2e`（构建 + preview + 跑 chromium）；`e2e:server` = `vite build --mode e2e --outDir dist-e2e && vite preview --outDir dist-e2e --port 4173 --strictPort`。

- [ ] **Step 1: 安装依赖（需网络）**

```bash
pnpm add -D @playwright/test
pnpm exec playwright install chromium
```

- [ ] **Step 2: 写配置与冒烟用例**

`playwright.config.ts`：`testDir: 'e2e'`、`fullyParallel: true`、`retries: process.env.CI ? 1 : 0`、`use: { baseURL: 'http://127.0.0.1:4173', trace: 'retain-on-failure', launchOptions: { args: ['--no-proxy-server'] } }`、`projects: [{ name: 'chromium', use: devices['Desktop Chrome'] }]`、`webServer: { command: 'pnpm e2e:server', url: 'http://127.0.0.1:4173', reuseExistingServer: !process.env.CI, timeout: 120_000 }`。

`e2e/fixtures.ts`：`login(page)` — 访问 `/login`，填 `admin@example.com` / `12345678`，点登录，等 `/chat`。

`e2e/auth.spec.ts`：登录成功进入对话页；错误密码有提示；登出回登录页。

- [ ] **Step 3: 跑通冒烟**

Run: `pnpm e2e -- e2e/auth.spec.ts`
Expected: 3 passed。

- [ ] **Step 4: 提交**

```bash
git add .env.e2e playwright.config.ts e2e/fixtures.ts e2e/auth.spec.ts package.json .gitignore
git commit -m "test(e2e): 引入 Playwright 与 mock 预览启动链"
```

---

### Task 8: E2E 四条主链路

**Files:**
- Create: `e2e/chat.spec.ts`、`e2e/approval.spec.ts`、`e2e/knowledge.spec.ts`
- Modify: 需要稳定选择器的组件（只加 `data-testid`，不改行为）

**Interfaces:**
- 选择器约定：登录表单用 `getByPlaceholder`；消息容器 `[data-testid="message-item"]`；审批卡 `[data-testid="approval-card"]`；知识库行 `[data-testid="knowledge-doc-row"]`。

- [ ] **Step 1: 写用例**

- `chat.spec.ts`：发送「你好」→ 出现用户消息 → 助手流式回复 → 输入框清空；发送后「停止」按钮出现并可中断。
- `approval.spec.ts`：发送含「发布」的消息（mock 触发审批）→ `approval.required` 卡片出现 → 点「批准」→ 卡片变为已批准 / 流继续。
- `knowledge.spec.ts`：进入知识库 → mock 文档行可见 → 打开检索调试 → 检索返回命中项 → 空结果提示。

- [ ] **Step 2: 跑全部 E2E**

Run: `pnpm e2e`
Expected: 全部 passed（≥ 9 用例）。

- [ ] **Step 3: 修选择器/等待策略**（超时用 `expect(...).toBeVisible({ timeout: 10_000 })`，禁止 `waitForTimeout` 超过 500ms 的硬等待）。

- [ ] **Step 4: 提交**

```bash
git add e2e/ src/
git commit -m "test(e2e): 覆盖登录/对话/审批/知识库主链路"
```

---

### Task 9: 部署产物与 Nginx SSE 验证

**Files:**
- Create: `deploy/nginx.conf`
- Create: `deploy/README.md`
- Create: `scripts/verify-nginx-sse.mjs`
- Modify: `package.json`（`verify:nginx`）

**Interfaces:**
- `deploy/nginx.conf`：`upstream agent-hub-backend`、SPA fallback、`/assets/` immutable 缓存、`/api/v1/chat/stream` 专用 SSE location（`proxy_buffering off; proxy_cache off; gzip off; proxy_http_version 1.1; proxy_set_header Connection ""; proxy_read_timeout 3600s`）、`/healthz` `/readyz` 透传。
- `verify-nginx-sse.mjs`：实现已实测方案（见 spec §4.5 E2），支持 `NGINX_CONTAINER`（默认 `dev_nginx`）与 `--check-deploy`；输出逐帧时间线；退出码 0/1；`finally` 清理容器内 `/tmp/agent-hub-sse-verify/` 与临时进程。

- [ ] **Step 1: 写 nginx.conf + README**（README 写部署步骤、环境变量、缓存与回滚、验证命令）。
- [ ] **Step 2: 写验证脚本**（容器内写 `serve.sh`（先读请求头再逐帧发 5 帧）、`sse.conf`（临时实例 `listen 80`）、起 `nc -lk -p 18999 -e`、起 `nginx -c`、宿主 Node 客户端 `NO_PROXY=*` 读 `http://127.0.0.1:18088/sse` 与 `/sse-buffered` 计时、断言、清理）。
- [ ] **Step 3: 跑通**

Run: `pnpm verify:nginx`
Expected: exit 0，`/sse` 帧间隔 ≥ 500ms，`/sse-buffered` 5 帧在 ≤ 1s 内集中到达。

- [ ] **Step 4: 跑 deploy conf 语法检查**

Run: `pnpm verify:nginx --check-deploy`
Expected: `nginx -t` 通过。

- [ ] **Step 5: 提交**

```bash
git add deploy/ scripts/verify-nginx-sse.mjs package.json
git commit -m "build(deploy): Nginx SSE 配置与反向代理实测脚本"
```

---

### Task 10: CI、文档收尾与全量验证

**Files:**
- Create: `.github/workflows/ci.yml`
- Modify: `docs/roadmap.md`（M6 状态与证据）
- Create: `docs/handoff/2026-11-11-m6-frontend-report.md`

- [ ] **Step 1: CI**：两 job —— `quality`（install → lint → type-check → test → build → size）与 `e2e`（install → playwright install chromium → `pnpm e2e`，失败上传 `test-results/`）；`pnpm/action-setup` + `actions/setup-node` 缓存。
- [ ] **Step 2: roadmap 更新**：M6 行状态改为「已完成（2026-11-11）」，补验收证据与未取证项；F1 保持未完成。
- [ ] **Step 3: 交付报告**：写清做了什么、验证命令与输出摘要、未取证项（真实后端长流、真实 E2E）、遗留建议（后端补回放事件名）。
- [ ] **Step 4: 全量验证**

```bash
pnpm lint && pnpm type-check && pnpm test && pnpm build && pnpm size && pnpm e2e && pnpm verify:nginx
```

- [ ] **Step 5: 提交**

```bash
git add .github/workflows/ci.yml docs/roadmap.md docs/handoff/2026-11-11-m6-frontend-report.md
git commit -m "docs(m6): 收口生产化交付报告与 CI"
```

---

## Self-Review 记录

- **Spec 覆盖**：A（Task 2/9）✅、B（Task 5/6）✅、C（Task 1/3/4）✅、D（Task 7/8）✅、E（Task 9）✅；非目标未建任务 ✅。
- **类型一致性**：`ChatConnection` 在 Task 5 定义、Task 6 消费；`RequestRecord`/`BuildInfo` 在 Task 1 定义、Task 4 消费；`describeError` 在 Task 3 定义、Task 4 抽屉复用。
- **Review Focus 对应**：均已在 Task 2/5/9 的测试步骤中钉住。
