# M1 对话闭环 + 全站骨架 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 `agent-hub-web` 从 M0 空脚手架变成可独立演示、后端就绪后可一键切换真实接口的 M1 前端：登录/注册、应用布局、对话工作台（会话、SSE 流、过程卡片、审批、停止、历史），并搭好工作流/智能体/任务/知识库/设置页骨架。

**Architecture:** Vue 3 `<script setup>` + Pinia Setup Store + Vue Router 懒加载；Element Plus 负责表单、弹层、表格等通用交互，v7 原型的 “Dispatch Desk” 设计 token 与对话时间线等特征组件自研；所有请求走 `src/api/client.ts`（Axios），开发期通过同构 mock adapter 与 SSE 回放提供数据，`VITE_USE_MOCK=false` 即切换真实后端。

**Tech Stack:** Vue 3.5 / TypeScript 6 / Vite 8 / Pinia 4 / Vue Router 5 / Element Plus 2.14 / Axios 1.21 / @microsoft/fetch-event-source 2.0 / marked 18 + DOMPurify 3 + highlight.js 11 / dayjs 1.11 / Vitest 5 + @vue/test-utils 2.5 + jsdom 31。

**Spec:** [docs/handoff/README.md](../../handoff/README.md)、[contract-delta.md](../../handoff/contract-delta.md)、[fixtures.md](../../handoff/fixtures.md)、[pages.md](../../pages.md)、[architecture.md](../../architecture.md)、原型 `docs/prototypes/ui-v7.html` / `ui-v7-pages.html`。

## Global Constraints

- 所有用户可见文案为中文；代码注释解释“为什么”，不复述代码。
- TypeScript 严格模式；禁止 `any`，未知数据用 `unknown` 收窄；`noUncheckedIndexedAccess` 已开启。
- 契约字段一律 `snake_case`；时间 ISO 8601 UTC，展示用 dayjs 本地化（`zh-cn`）。
- 页面不直接使用 Axios/fetch；所有请求经 `src/api/`；展示组件不 import store（全局主题/用户除外）。
- SSE 事件按 `seq` 递增处理，未知事件忽略并记录 debug，不中断流；`message.done` / `error` 后主动关闭。
- 同一会话同时只允许一个运行：`chat.streaming` 期间发送按钮为停止，禁止再次发送。
- 危险操作（删除会话、取消运行、删除文档）必须二次确认。
- Element Plus 组件与 API 按需自动导入；禁止整库 `app.use(ElementPlus)`。
- 组件单文件 ≤300 行；超出拆子组件或 composable。
- mock 仅用于开发：`.env.development` 默认 `VITE_USE_MOCK=true`，`.env.production` 为 `false`；任何“待后端”按钮用 toast 明示，不伪造成功。
- 每个任务结束执行 `pnpm type-check`，结束时 `pnpm lint && pnpm build && pnpm test`。

## Review Focus

- **SSE 乱序/重复/未知事件**：网络抖动或后端补发时，前端不得重复追加正文、不得崩溃；以 `seq` 去重并按事件类型幂等处理。
- **审批中断后再恢复**：批准后同一连接继续输出，已渲染内容不丢失、不重排；重复点击批准只生效一次。
- **401 并发刷新**：多个请求同时收到 401 时只发一次 refresh，失败后统一登出，不产生请求风暴。
- **长会话与高频 delta**：逐 token 重渲染会卡顿；delta 需按帧合并，滚动在用户上滑时暂停。
- **mock/真实后端切换**：关闭 mock 后不得残留 mock 依赖；错误信封、分页、枚举与 fixtures 一致。
- **附件/知识库/智能体等未实现控件**：按钮可点但必须明确“未接入”，不能出现假成功或静默失败。

---

### Task 1: 工程基座、依赖与设计 token

**Files:**
- Modify: `package.json`、`vite.config.ts`、`index.html`、`src/main.ts`、`src/App.vue`、`.env.example`、`tsconfig.json`、`tsconfig.app.json`
- Create: `.env.development`、`.env.production`、`vitest.config.ts`、`tsconfig.vitest.json`、`src/styles/tokens.css`、`src/styles/base.css`、`src/styles/element.css`、`src/styles/index.css`、`src/components/common/__tests__/smoke.spec.ts`
- Delete: `src/components/.gitkeep` 等占位（保留目录时删除对应 `.gitkeep`）

**Interfaces:**
- Produces: 全局 CSS 变量（`--paper`、`--surface`、`--ink`、`--prussian`、`--amber`、`--red`、`--green`、`--kind-*`、`--sidebar-w`、`--trace-w` 等，取自 `ui-v7.html` 的 `:root` 与 `html[data-theme="dark"]`）；`@` 别名指向 `src/`；`pnpm test` 可运行。

- [ ] **Step 1: 安装依赖**

```bash
pnpm add element-plus @element-plus/icons-vue axios @microsoft/fetch-event-source marked dompurify highlight.js dayjs
pnpm add -D vitest @vue/test-utils jsdom unplugin-auto-import unplugin-vue-components
```

- [ ] **Step 2: 配置 Vite（代理、自动导入、别名）与 Vitest**

`vite.config.ts` 增加：`/api` 与 `/a2a` 代理到 `http://127.0.0.1:8000`；`unplugin-auto-import`（imports: vue, vue-router, pinia；resolvers: ElementPlusResolver）与 `unplugin-vue-components`（resolvers: ElementPlusResolver({ importStyle: 'css' })）；生成 `auto-imports.d.ts`、`components.d.ts` 并加入 `tsconfig.app.json` include。`vitest.config.ts` 复用 `@` 别名，`environment: 'jsdom'`，`globals: true`，include `src/**/__tests__/**/*.spec.ts`。

- [ ] **Step 3: 写设计 token 与基础样式**

把 `ui-v7.html` 的 light/dark 两套 `:root` 变量迁到 `tokens.css`，并补 Element Plus 映射（`--el-color-primary: var(--prussian)`、`--el-border-radius-base: 8px` 等）；`base.css` 做 reset、字体、滚动条、`#app` 高度；`element.css` 覆盖按钮/输入/表格在纸感背景上的边框与圆角。

- [ ] **Step 4: 配置环境变量与入口**

`.env.development`：`VITE_USE_MOCK=true`；`.env.production`：`VITE_USE_MOCK=false`；`.env.example` 增补 `VITE_USE_MOCK`。`main.ts` 引入 `styles/index.css`、`element-plus/theme-chalk/dark/css-vars.css`，创建 Pinia 与 Router。`App.vue` 改为 `<RouterView />`。

- [ ] **Step 5: 冒烟测试与验证**

测试断言 `true` 能通过，证明 `pnpm test` 链路可用。然后运行：

```bash
pnpm type-check   # 期望 0 error
pnpm test         # 期望 1 passed
pnpm build        # 期望 dist/ 生成
```

- [ ] **Step 6: Commit**

```bash
git add -A ':!.dsh'
git commit -m "chore(web): 搭建 M1 工程基座与设计 token"
```

---

### Task 2: 契约类型与枚举

**Files:**
- Create: `src/types/api.ts`、`src/types/auth.ts`、`src/types/conversation.ts`、`src/types/chat.ts`、`src/types/run.ts`、`src/types/approval.ts`、`src/types/agent.ts`、`src/types/task.ts`、`src/types/knowledge.ts`、`src/types/workflow.ts`、`src/types/system.ts`、`src/types/index.ts`

**Interfaces:**
- Produces（后续任务只依赖这些名字）：
  - `PageResult<T> { items: T[]; next_cursor: string | null; has_more: boolean; stats?: Record<string, number> }`
  - `ApiErrorBody { error: { code: string; message: string; request_id: string } }`
  - `User { id; email; display_name; status: 'active'|'disabled'; role: 'user'|'admin'; created_at; last_login_at }`
  - `AuthTokens { access_token; refresh_token; token_type: 'bearer'; expires_in: number }`
  - `Conversation { id; title; status: 'active'|'archived'; message_count; last_message_preview; last_message_at; pending_approval_count; created_at; updated_at }`
  - `MessageRole = 'user'|'assistant'|'tool'|'system'`
  - `ChatMessage { id; role; content; content_type; run_id; client_message_id; status: 'completed'|'failed'|'canceled'; citations; attachments; capabilities; artifacts; usage; error; created_at }`
  - `ChatEventName` 为契约第 4.4 节全部事件名的字面量联合
  - `ChatStreamRequest { conversation_id?; message; client_message_id?; attachments?; skills?; mcp_servers?; mcp_tools?; model?; reasoning_effort?; knowledge_categories?; workflow_id?; workflow_version? }`
  - `Run`、`RunEvent`、`Approval`、`Agent`、`A2aTask`、`KnowledgeDocument`、`Workflow`、`SystemInfo` 按契约字段定义
  - 枚举常量集中在 `src/types/index.ts` 导出（`TASK_STATES`、`APPROVAL_STATUSES`、`HEALTH_STATUSES`）

- [ ] **Step 1: 按 contract-delta 第 1、2、3、4、5、6、11 节写类型**

字段可多不可少：后端可能返回未知字段，类型只声明前端消费的字段；枚举用字面量联合 + 常量数组，未知值通过 `normalizeEnum` 回退。

- [ ] **Step 2: 写类型约束测试**

`src/types/__tests__/contract.spec.ts` 用 `satisfies` 校验 fixtures 形状（内联 3 条样例：会话列表项、run.started、approval.required），确保字段名拼写与契约一致。

- [ ] **Step 3: 验证**

```bash
pnpm type-check
pnpm test src/types/__tests__/contract.spec.ts
```

- [ ] **Step 4: Commit**

```bash
git add src/types
git commit -m "feat(types): 定义会话/聊天/审批等契约类型"
```

---

### Task 3: HTTP 客户端、错误信封与认证 API

**Files:**
- Create: `src/utils/storage.ts`、`src/api/client.ts`、`src/api/auth.ts`、`src/api/__tests__/client.spec.ts`

**Interfaces:**
- Produces:
  - `class ApiRequestError extends Error { code: string; status: number; requestId: string }`
  - `apiClient: AxiosInstance`（baseURL = `VITE_API_BASE_URL || '/api/v1'`，自动带 Bearer，统一解包错误）
  - `setUnauthorizedHandler(fn: () => void): void`
  - `authApi.login(body: { email; password }): Promise<AuthTokens>`、`register(body: { email; password; display_name }): Promise<AuthTokens>`、`refresh(refresh_token): Promise<AuthTokens>`、`logout(): Promise<void>`、`me(): Promise<User>`、`updateMe(body): Promise<User>`
  - `storage.getAccessToken()/getRefreshToken()/setTokens()/clearTokens()`

- [ ] **Step 1: 写失败测试**

`client.spec.ts` 断言：错误信封被转换为 `ApiRequestError` 且 `code/requestId` 正确；并发两个 401 只触发一次 refresh；refresh 失败调用 `setUnauthorizedHandler` 注册的回调并清空 token。用 `axios-mock-adapter` 或注入 adapter（不新增依赖：给 `apiClient.defaults.adapter` 赋测试函数）。

- [ ] **Step 2: 实现 client 与 storage**

请求拦截器从 storage 注入 `Authorization`；响应拦截器解析 `{ error: { code, message, request_id } }`；401 且非 `/auth/refresh` 时进入单飞 `refreshTokens()`，成功后重放一次，失败清 token 并回调；网络错误转 `status=0`。

- [ ] **Step 3: 实现 authApi**

按契约 2.1–2.3 定义 URL 与请求/响应类型；logout 失败不阻塞本地清理。

- [ ] **Step 4: 验证并提交**

```bash
pnpm test src/api/__tests__/client.spec.ts
pnpm type-check
git add src/api src/utils
git commit -m "feat(api): 实现 HTTP 客户端、401 单飞刷新与认证接口"
```

---

### Task 4: Mock REST 数据层

**Files:**
- Create: `src/api/mock/fixtures.ts`、`src/api/mock/db.ts`、`src/api/mock/routers.ts`、`src/api/mock/adapter.ts`、`src/api/mock/index.ts`、`src/api/mock/__tests__/routers.spec.ts`
- Modify: `src/api/client.ts`（mock 模式挂 adapter）

**Interfaces:**
- Produces:
  - `isMockEnabled(): boolean`（`import.meta.env.VITE_USE_MOCK === 'true'`）
  - `installMockAdapter(client: AxiosInstance): void`
  - `mockDb` 单例：`conversations`、`messages`、`approvals`、`agents`、`tasks`、`knowledgeDocuments`、`workflows`、`systemInfo`；方法 `reset()`、`createConversation()`、`listMessages(id)`、`resolveApproval(id, decision)`、`cancelRun(id)`、`snapshot()`
  - REST 路由覆盖：`POST /auth/login|register|refresh|logout`、`GET /auth/me`、`GET/POST /conversations`、`GET/PATCH/DELETE /conversations/:id`、`GET /conversations/:id/messages`、`GET /system/info`、`GET /runs/:id`、`GET /runs/:id/events`、`POST /runs/:id/cancel`、`GET /approvals`、`POST /approvals/:id/decision`、`GET /agents`、`GET /tasks`、`GET /knowledge/documents`、`GET /workflows`

- [ ] **Step 1: 写失败测试**

断言：`GET /conversations?q=周报` 只返回标题含“周报”的项且大小写不敏感；分页 `limit=2` 时 `has_more=true` 且 `next_cursor` 可用；未知路径返回 404 信封；`DELETE /conversations/:id` 后默认列表不再包含。

- [ ] **Step 2: 写 fixtures 与内存 db**

固定实体采用 `fixtures.md` 第 1 节的 UUID（会话 `11111111-...`、标题「Q3 客服工单周报」等），其余会话补充到 7 条，覆盖 active/archived、待审批、不同日期分组；消息数据至少包含一条带引用/用量的助手消息。

- [ ] **Step 3: 实现路由与 adapter**

adapter 解析 `config.method` 与 `config.url`（去 baseURL 前缀、拆 query），延迟 120–320ms，返回 `{ data, status, statusText, headers: {}, config }`；错误用 `AxiosError` 形态 `{ response: { status, data: ApiErrorBody } }`，让拦截器统一转换。

- [ ] **Step 4: 验证并提交**

```bash
pnpm test src/api/mock/__tests__/routers.spec.ts
git add src/api
git commit -m "feat(mock): 按 fixtures 实现 REST mock 与内存数据层"
```

---

### Task 5: Mock SSE 回放引擎

**Files:**
- Create: `src/api/mock/stream.ts`、`src/api/mock/__tests__/stream.spec.ts`
- Modify: `src/api/mock/db.ts`（审批决定事件）

**Interfaces:**
- Produces:
  - `type StreamHandlers = { onOpen?: (runId: string) => void; onEvent: (event: ChatEventName, data: unknown) => void; onError: (error: Error) => void; signal: AbortSignal }`
  - `mockChatStream(payload: ChatStreamRequest, handlers: StreamHandlers): Promise<void>`
  - `mockDb.waitApproval(approvalId: string): Promise<'approved'|'rejected'>`（内部用）
  - 行为：回放 fixtures 第 2 节事件序列（`conversation.created` → … → `approval.required` → 等待决定 → `message.delta` → `message.done`）；每帧间隔 40–120ms；`signal.abort()` 后停止并保留已发事件；拒绝审批时以 `error` + `message.done(finish_reason='canceled')` 结束；输入含“错误”时走错误脚本。

- [ ] **Step 1: 写失败测试**

收集事件名数组，断言顺序满足 `run.started` 在 `message.delta` 前、`message.started` 在首个 delta 前、`message.done` 最后；`abort` 后不再有事件；批准后第二段包含 `message.delta` 且 `message.done` 的 `finish_reason='stop'`。

- [ ] **Step 2: 实现事件脚本与回放**

用 `async function` + `sleep(ms, signal)`（abort 时 reject `AbortError`，外层吞掉）；`onEvent` 前检查 `signal.aborted`；审批等待用 `mockDb.waitApproval`（EventTarget 实现，`resolveApproval` 派发）。

- [ ] **Step 3: 验证并提交**

```bash
pnpm test src/api/mock/__tests__/stream.spec.ts
git add src/api/mock
git commit -m "feat(mock): 实现 SSE 事件回放与审批中断恢复"
```

---

### Task 6: 认证 store、登录/注册页与路由守卫

**Files:**
- Create: `src/stores/auth.ts`、`src/layouts/AuthLayout.vue`、`src/views/auth/LoginView.vue`、`src/views/auth/RegisterView.vue`、`src/router/guards.ts`、`src/stores/__tests__/auth.spec.ts`
- Modify: `src/router/index.ts`、`src/main.ts`

**Interfaces:**
- Produces:
  - `useAuthStore()`：`user`、`accessToken`、`isAuthenticated`（computed）、`initialized`、`login(email,password)`、`register(body)`、`logout()`、`restore()`（有 token 时拉 `/auth/me`）、`setUser()`
  - 路由守卫：`requiresAuth` 且未登录 → `/login?redirect=<fullPath>`；`guestOnly` 且已登录 → `/chat`
  - `AuthLayout` 插槽 + 品牌区

- [ ] **Step 1: 写失败测试**

store 测试：login 写入 token 与 user；logout 清空并跳转由调用方处理；restore 在 token 无效时清空。用 `vi.mock('@/api/auth')`。

- [ ] **Step 2: 实现 auth store 与守卫**

`main.ts` 在 `router.isReady()` 前 `await auth.restore()`（或守卫内惰性 restore，避免重复）；`setUnauthorizedHandler` 注册为清 store + `router.push('/login')`。

- [ ] **Step 3: 实现登录/注册页**

Element Plus Form + 规则（邮箱格式、密码 ≥8、注册两次一致）；提交 loading、行内错误、成功后跳 `redirect`；页面沿用纸感背景与品牌标题。

- [ ] **Step 4: 验证并提交**

```bash
pnpm test src/stores/__tests__/auth.spec.ts
pnpm type-check
git add src/stores src/router src/layouts src/views/auth src/main.ts
git commit -m "feat(auth): 登录注册、会话恢复与路由守卫"
```

---

### Task 7: 应用布局、主题与导航

**Files:**
- Create: `src/layouts/AppLayout.vue`、`src/components/layout/SideNav.vue`、`src/components/layout/AccountMenu.vue`、`src/composables/useTheme.ts`、`src/composables/useMediaQuery.ts`、`src/components/layout/__tests__/SideNav.spec.ts`

**Interfaces:**
- Produces:
  - `useTheme()`：`theme: Ref<'light'|'dark'>`、`toggle()`、持久化 key `agent-hub.theme`，同步 `html[data-theme]` 与 `html.dark`
  - `AppLayout`：侧栏（品牌、导航：对话/工作流/智能体/任务/知识库、底部账号）、主内容 `<RouterView />`；≤900px 侧栏抽屉、可折叠图标模式
  - `SideNav` 使用 `router-link` 与 `meta.title`，激活态样式与原型一致

- [ ] **Step 1: 写失败测试**

挂载 `SideNav`（stub router-link），断言 5 个导航项文案与目标路径、当前路由高亮 `aria-current="page"`。

- [ ] **Step 2: 实现布局与主题**

侧栏 288px（折叠 56px），主区 `--paper` 背景；账号菜单：设置、主题切换、退出登录；退出二次确认。移动端抽屉带遮罩与 Esc 关闭。

- [ ] **Step 3: 注册路由骨架**

`/chat`（ChatView）、`/workflows`、`/agents`、`/tasks`、`/knowledge`、`/settings` 全部懒加载，`meta.title` 中文；`/` 重定向 `/chat`；404 页；`document.title` 随路由更新。

- [ ] **Step 4: 验证并提交**

```bash
pnpm test src/components/layout/__tests__/SideNav.spec.ts
pnpm build
git add src/layouts src/components/layout src/composables src/router src/views
git commit -m "feat(layout): 应用侧栏、主题切换与路由骨架"
```

---

### Task 8: 会话 store 与会话侧栏

**Files:**
- Create: `src/api/conversations.ts`、`src/stores/conversations.ts`、`src/components/chat/ConversationSidebar.vue`、`src/components/chat/ConversationItem.vue`、`src/stores/__tests__/conversations.spec.ts`

**Interfaces:**
- Produces:
  - `conversationsApi.list(params: { q?; status?; limit?; cursor? }): Promise<PageResult<Conversation>>`、`create()`、`get(id)`、`update(id, body)`、`remove(id)`、`messages(id, params)`
  - `useConversationsStore()`：`items`、`stats`、`loading`、`q`、`status`、`hasMore`、`load(reset?)`、`search(q)`、`create()`、`rename(id,title)`、`archive(id)`、`remove(id)`、`byDateGroups`（computed：今天/昨天/更早）
  - 事件：`refreshAfterRun(conversationId)` 仅局部更新，不整表刷新

- [ ] **Step 1: 写失败测试**

断言：`load()` 合并分页且按 `last_message_at` 降序；`search('周报')` 只保留匹配项；`archive` 后本地状态变更；空列表 `byDateGroups` 返回空数组。

- [ ] **Step 2: 实现 store 与侧栏**

侧栏：新建会话按钮、搜索框（300ms 防抖）、按日期分组、每项标题/时间/消息数/待审批点/选中态；悬停“更多”菜单：重命名（内联或对话框）、归档、删除（二次确认）。

- [ ] **Step 3: 验证并提交**

```bash
pnpm test src/stores/__tests__/conversations.spec.ts
git add src/api/conversations.ts src/stores/conversations.ts src/components/chat
git commit -m "feat(conversations): 会话列表、搜索、分组与侧栏交互"
```

---

### Task 9: 聊天 SSE 接入与事件归约

**Files:**
- Create: `src/api/chat.ts`、`src/api/approvals.ts`、`src/api/runs.ts`、`src/stores/chat-reducer.ts`、`src/stores/chat.ts`、`src/composables/useChatStream.ts`、`src/stores/__tests__/chat-reducer.spec.ts`

**Interfaces:**
- Produces:
  - `openChatStream(payload: ChatStreamRequest, handlers: StreamHandlers): Promise<void>`（mock 时走 `mockChatStream`，否则 `fetchEventSource`，`onopen` 读取 `X-Run-ID`）
  - `approvalsApi.list(params)`、`decide(id, { decision: 'approve'|'reject', note? })`
  - `runsApi.get(id)`、`events(id, params)`、`cancel(id)`
  - `ChatState`、`createInitialChatState()`、`reduceChat(state, event, data): ChatState`（纯函数）
  - `useChatStore()`：`conversationId`、`messages`、`streaming`、`runId`、`pendingApproval`、`processItems`、`notice`、`error`、`send(text, context)`、`stop()`、`resolveApproval(approve)`、`loadConversation(id)`
  - `useChatStream()`：`start(payload)`、`stop()`、`onEvent`，delta 由 `requestAnimationFrame` 合并后提交

- [ ] **Step 1: 写 reducer 失败测试**

覆盖：乐观 user 消息被 `message.created` 按 `client_message_id` 替换；`message.started` 创建 assistant 占位；`message.delta` 追加；`reasoning.delta` 累积；`tool.start`/`tool.result` 合并同一 `tool_call_id`；`a2a.task` 合并同一 `task_id`；`approval.required` 设置 pending；`message.done` 收尾并带 usage；未知事件返回原 state；重复 `seq` 忽略。

- [ ] **Step 2: 实现 reducer、store 与浏览器 SSE**

`fetchEventSource`：POST、Bearer、`Accept: text/event-stream`、`openWhenHidden: true`、`onerror` 抛错终止；JSON 解析失败仅告警跳过；`message.done`/`error` 后 abort。mock 分支复用同一 handlers。

- [ ] **Step 3: 写 `send` 流程**

生成 `client_message_id`（`crypto.randomUUID()`）；无会话时先 `POST /conversations` 或由流内 `conversation.created` 建立；乐观插入 user 消息；`streaming=true`；完成后刷新会话列表项；错误保留已生成内容并显示错误卡。

- [ ] **Step 4: 验证并提交**

```bash
pnpm test src/stores/__tests__/chat-reducer.spec.ts
pnpm type-check
git add src/api src/stores src/composables
git commit -m "feat(chat): SSE 接入、事件归约与发送/停止流程"
```

---

### Task 10: 对话页组件（时间线、过程卡片、输入栏、运行详情）

**Files:**
- Create: `src/views/chat/ChatView.vue`、`src/components/chat/MessageList.vue`、`src/components/chat/MessageBubble.vue`、`src/components/chat/ProcessTimeline.vue`、`src/components/chat/cards/ThinkingCard.vue`、`SkillCard.vue`、`ToolCard.vue`、`A2ACard.vue`、`ApprovalCard.vue`、`WorkflowStepCard.vue`、`NoticeCard.vue`、`src/components/chat/ChatComposer.vue`、`src/components/chat/ModelPicker.vue`、`src/components/chat/ContextMenu.vue`、`src/components/chat/RunTraceDrawer.vue`、`src/components/common/MarkdownView.vue`、`src/utils/markdown.ts`、`src/utils/format.ts`、`src/composables/useAutoScroll.ts`、`src/components/chat/__tests__/ChatComposer.spec.ts`

**Interfaces:**
- Produces:
  - `MarkdownView`：`props: { content: string }`，marked + DOMPurify + highlight.js，外链 `rel="noopener noreferrer" target="_blank"`
  - `formatRelative(iso)`、`formatTime(iso)`、`formatDuration(ms)`、`formatTokens(n)`
  - `ChatComposer`：`props: { streaming; disabled; model; reasoningEffort }`；`emits: send(payload)`、`stop()`；Enter 发送、Shift+Enter 换行、`+` 菜单（附件/技能/工作流/知识库，未接入项 toast）、`@` 文件提示、模型/推理选择
  - `ChatView`：三栏——`ConversationSidebar` + 主区（顶栏、`MessageList`、`ChatComposer`）+ `RunTraceDrawer`；空会话欢迎态
  - 过程卡片按 `kind` 渲染：skill / tool / a2a / approval / workflow / notice / reasoning

- [ ] **Step 1: 写组件失败测试**

`ChatComposer`：Enter 触发 `send`，Shift+Enter 不触发，`streaming` 时按钮显示“停止”并触发 `stop`，空内容不触发。`MarkdownView`：渲染 `**粗体**` 且 `<script>` 被清洗。

- [ ] **Step 2: 实现 Markdown 与格式化工具**

`markdown.ts` 导出 `renderMarkdown(content: string): string`；配置 `marked` 的 `gfm/breaks`，代码块走 highlight.js；DOMPurify 白名单保留 `class` 与 `data-*`（代码高亮需要）。

- [ ] **Step 3: 实现消息时间线**

用户气泡右对齐（普鲁士蓝）；助手正文 Markdown；过程区默认展开、可收起；思考卡显示时长/token；工具/技能/A2A 卡显示状态、耗时、可展开详情；审批卡显示 source/executor/target/side_effect/risk，批准/拒绝带 loading 与二次确认；引用角标与来源列表；产物下载/复制。

- [ ] **Step 4: 实现输入栏与运行详情**

输入栏：自适应高度、附件 chips（mock 仅选择文件名）、发送/停止同位、模型/推理下拉（来自 `system` store，空数组时只读）、上下文选择 chips 发送后清空；运行详情抽屉：run 元信息、事件列表（seq/type/status/时间）、筛选。

- [ ] **Step 5: 验证并提交**

```bash
pnpm test src/components/chat/__tests__/ChatComposer.spec.ts
pnpm type-check
pnpm build
git add src/views/chat src/components/chat src/components/common src/utils src/composables
git commit -m "feat(chat-ui): 对话时间线、过程卡片、输入栏与运行详情"
```

---

### Task 11: 系统信息 store 与其余页面骨架

**Files:**
- Create: `src/api/system.ts`、`src/api/agents.ts`、`src/api/tasks.ts`、`src/api/knowledge.ts`、`src/api/workflows.ts`、`src/stores/system.ts`、`src/views/WorkflowsView.vue`、`src/views/AgentsView.vue`、`src/views/TasksView.vue`、`src/views/KnowledgeView.vue`、`src/views/SettingsView.vue`、`src/views/NotFoundView.vue`、`src/components/common/PageHeader.vue`、`EmptyState.vue`、`ErrorState.vue`、`LoadingBlock.vue`、`StatusDot.vue`
- Modify: `src/router/index.ts`

**Interfaces:**
- Produces:
  - `useSystemStore()`：`info: SystemInfo | null`、`load()`、`models`、`reasoningEfforts`、`capabilities`
  - 页面统一结构：`PageHeader`（标题/描述/主操作）+ 统计卡 + 筛选栏 + `el-table`/空态
  - 未接入操作统一 `ElMessage.info('该能力将在 M2/M4 接入')`，不写本地成功态

- [ ] **Step 1: 实现 API 与 system store**

`GET /system/info` 映射契约第 11 节；缺字段时用安全默认值（空模型、空推理等级、能力全 false）。

- [ ] **Step 2: 实现四个业务页骨架**

- 工作流：列表（名称/状态/步骤数/更新时间）、启用开关（只读提示）、新建按钮（未接入）
- 智能体：列表（名称/URL/健康状态/技能数/最近检查）、健康检查按钮（mock 可刷新时间）
- 任务：8 状态筛选 + 列表（短 ID/Agent/状态/耗时/会话）、详情抽屉（请求/结果/时间线只读）
- 知识库：统计卡 + 文档列表（标题/分类/状态/块数/更新时间）+ 上传/检索按钮（未接入）

- [ ] **Step 3: 实现设置页**

账号（me 信息、修改密码入口未接入）、模型（system 信息只读）、A2A（地址/复制）、关于（版本）；个人能力四区块（指令/记忆/技能/MCP）占位说明“M1.5”。

- [ ] **Step 4: 验证并提交**

```bash
pnpm type-check
pnpm build
git add src/api src/stores/system.ts src/views src/components/common src/router
git commit -m "feat(pages): 系统信息与工作流/智能体/任务/知识库/设置骨架"
```

---

### Task 12: 整体验证、测试补齐与文档回写

**Files:**
- Create: `src/__tests__/app.spec.ts`
- Modify: `README.md`、`docs/development.md`、`docs/roadmap.md`、`docs/pages.md`、`.env.example`

**Interfaces:**
- Produces: 可复现的验收命令与状态文档；`pnpm test` 全绿；`pnpm build` 成功。

- [ ] **Step 1: 补集成测试**

`app.spec.ts`：挂载 App + router + pinia，`/login` 渲染登录表单；未登录访问 `/chat` 重定向到 `/login`；登录后访问 `/chat` 渲染会话侧栏占位。mock api。

- [ ] **Step 2: 全量验证**

```bash
pnpm lint
pnpm type-check
pnpm test
pnpm build
```

修复所有错误；记录 `pnpm dev` 手动验收清单（登录 → 新建会话 → 发送 → 流式 → 审批 → 停止 → 刷新历史）。

- [ ] **Step 3: 更新文档状态**

README 把“M0 未安装依赖”改为“M1 前端已实现，默认 mock”；development 补 mock 开关与联调步骤；roadmap 勾选已完成项；pages 标注实现差异。

- [ ] **Step 4: Commit**

```bash
git add README.md docs .env.example src/__tests__
git commit -m "docs: 更新 M1 前端状态与 mock 联调说明"
```

---

## 验收清单（人工）

1. `pnpm dev` 打开 `http://localhost:5173`，未登录跳 `/login`；
2. 注册/登录后进入 `/chat`，侧栏显示 mock 会话分组与待审批标记；
3. 新建会话发送“你好”，看到思考卡、知识检索工具卡、流式正文、用量；
4. 发送含“审批”的消息，出现审批卡；批准后同一流继续输出并结束；
5. 流式中按钮变为“停止”，点击后保留已生成内容并以 `canceled` 结束；
6. 刷新页面后会话历史与 token 恢复；
7. 依次打开工作流/智能体/任务/知识库/设置，页面有 mock 数据与空态，不报错；
8. `VITE_USE_MOCK=false` 且后端启动时，请求打到 `http://127.0.0.1:8000`。
