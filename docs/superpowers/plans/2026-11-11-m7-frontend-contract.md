# M7 前端契约适配 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让前端消费后端已落地的 M7 契约：运行事件 SSE 续流、事件回放 `event` 字段、agents/tasks 写操作 RBAC、审批事件 5 字段、A2A 授权链接白名单，并修掉 B-1/B-2/B-3 三个纯前端缺陷、补齐 Nginx 续流 location。

**Architecture:** 契约层先行（`types` → `api` → `mock`），再改 `chat` store 的重连状态机为「续流优先、失败回退轮询」，最后做视图层权限显隐与错误文案收口。续流沿用 `@microsoft/fetch-event-source`（GET + Bearer），用 `lastSeq` 单调去重，400 `replay_too_large` 回退轮询，终态关闭后 `refreshHistory()`。

**Tech Stack:** Vue 3.5 / TypeScript 6 / Vite 8 / Pinia 4 / @microsoft/fetch-event-source / Vitest 5 / Playwright / Nginx 1.31（容器内 dev_nginx）。

**Spec:** `docs/superpowers/specs/2026-11-11-m7-m9-frontend-alignment-design.md` §3、§6

## Global Constraints

- 后端契约以 `agent-hub` 实际实现为准（2026-11-11 已落地 Task 1–4）：`GET /runs/{id}/stream?after_seq=`、`RunEventOut.event`、`AdminUser` 门禁、`approval.required` 5 字段。
- 续流必须用 `fetch`/`fetch-event-source`（`EventSource` 不支持 `Authorization`）；`id: seq`、`event: 名称`、`data: JSON`、15s `: ping` 注释帧。
- `seq` 单调去重，`lastSeq` 只前进；回放事件与实时事件走同一个 `reduceChat`。
- `message.delta` 不落库：断线窗口内逐字补齐**不承诺**，终态必须 `refreshHistory()`。
- 400 `replay_too_large` → 回退轮询，**不**用同一 `after_seq` 重试；404/连接失败同样回退轮询。
- 403 `forbidden` 统一文案「当前账号无管理员权限」，不当作登录失效、不触发 refresh。
- 登录 401 不进入 refresh 流程（排除 `/auth/login`、`/auth/register`），直接展示后端 `error.message`。
- 503 `database_unavailable` / `service_unavailable` 统一文案「服务暂不可用，请稍后重试」；知识库检索面板保留自己的专用文案。
- 不伪造后端能力：无接口页面不做假 CRUD；mock 与真实路径必须走同一 store 代码。
- 不新增依赖、不改 `package.json` 依赖版本；不启动新容器。
- 提交信息 `feat|fix|test|docs|build(scope): 中文摘要`，每个 Task 一个提交，**只本地提交不推送**。

## Review Focus

以下六类输入/失败模式最容易在验收时才暴露，每条都在对应 Task 有测试：

1. **断线发生在 run 建立之前**（还没有 `runId`）：不能续流，必须保持原有重试/降级路径 → Task 3 单测。
2. **续流 400 `replay_too_large`**：必须降级轮询且不弹致命错误、不重复用同 `after_seq` → Task 3 单测。
3. **run 已终态时续流**：立即关闭并 `refreshHistory()`，不得反复重连 → Task 3 单测。
4. **回放事件 `event` 为空/未知**：忽略并记录，不猜测事件名、不污染 `lastSeq` 之外的 state → Task 2 单测。
5. **普通用户直接调用写接口 403**：展示统一权限文案，不能当成「登录过期」或静默 → Task 5/6 单测。
6. **登录密码错误 401**：显示「邮箱或密码错误」且不触发 refresh/登出 → Task 6 单测。

---

## 执行顺序

- **Phase 1（串行，root）**：Task 1 → Task 2 → Task 3。三者共享 `src/types/run.ts`、`src/api/runs.ts`、`src/api/mock/stream.ts`、`src/stores/chat.ts`，必须串行。
- **Phase 2（并行，子代理）**：Task 4（RBAC 视图）、Task 5（审批/授权 UI）、Task 6（client 错误文案）、Task 7（Nginx）。文件互不重叠。
- **Phase 3（串行，root）**：Task 8 文档同步 + 全量门禁 + 独立审查。
- 分支：`feat/m7-frontend-contract`（从当前 `master` 切出）。

---

### Task 1: 契约类型与 `openRunStream`

**Files:**
- Modify: `src/types/run.ts`
- Modify: `src/api/runs.ts`
- Test: `src/api/__tests__/runs-stream.spec.ts`（新建）

**Interfaces:**
- Produces:
  - `RunEvent.event: string`（原始 SSE 事件名，缺失为空串）；
  - `interface RunStreamHandlers { onOpen?: (runId: string | null) => void; onEvent: (event: ChatEventName, data: unknown) => void; onError: (error: Error) => void; onClose?: () => void; signal: AbortSignal }`（复用 `ChatStreamHandlers`，从 `@/api/chat` 导出或抽到 `src/types`）；
  - `runsApi.stream(runId: string, afterSeq: number, handlers: ChatStreamHandlers): Promise<void>`：mock 走 `mockRunStream`，真实走 `fetchEventSource(`${resolveBaseUrl()}/runs/${runId}/stream?after_seq=${afterSeq}`, { method: 'GET', headers: { Authorization, Accept }, signal, openWhenHidden: true })`；
  - 非 2xx：`apiErrorFromResponse(status, body)`，401 用 `refreshSession()` 单飞重试一次（与 `openChatStream` 同语义）。
- 事件白名单复用 `isChatEvent`；`ping` 忽略；未知事件 `console.debug` 后丢弃。

- [ ] **Step 1: 写失败测试**（`runs-stream.spec.ts`）：mock `@microsoft/fetch-event-source`，断言 URL 含 `after_seq=7`、method GET、带 Bearer；`onopen` 500 时抛 `ApiRequestError`；401 后 refresh 成功重连一次；`event: approval.required` 的帧被 `onEvent` 收到，`ping` 与未知事件被忽略。
- [ ] **Step 2: 运行确认失败**：`pnpm vitest run src/api/__tests__/runs-stream.spec.ts` → 失败（`runsApi.stream` 不存在）。
- [ ] **Step 3: 实现**：`RunEvent.event` 加字段；`runsApi.stream` 按上面的签名实现；将 `CHAT_EVENT_NAMES`/`isChatEvent` 从 `chat.ts` 导出复用。
- [ ] **Step 4: 运行通过**：同上命令 → PASS。
- [ ] **Step 5: 提交**：`git commit -m "feat(m7): 运行事件续流 API 与 event 字段类型"`。

### Task 2: 事件回放驱动 reducer

**Files:**
- Modify: `src/stores/chat-reducer.ts`（导出 `eventNameOfRunEvent(event: RunEvent): ChatEventName | null`）
- Modify: `src/stores/chat.ts`（新增 `replayPersistedEvents(runId: string, afterSeq: number): Promise<void>`，在 `adoptRun` 与续流降级前调用）
- Modify: `src/components/chat/RunTracePanel.vue`（轨迹事件行显示 `event` 名或未知标记）
- Test: `src/stores/__tests__/chat-replay.spec.ts`（新建）、`src/components/chat/__tests__/RunTracePanel.spec.ts`（追加）

**Interfaces:**
- Consumes: `RunEvent.event`、`runsApi.events(runId, { after_seq, limit: 200 })`。
- Produces: `replayPersistedEvents` 按 `event` 调 `reduceChat`；`event` 为空/非白名单时跳过并 `console.debug`；用 `payload.seq`（后端 payload 内含 `seq`）做去重，缺失时用外层 `seq` 注入。
- `RunTracePanel`：`event` 非空时显示等宽小字事件名；为空时显示 `type` + 「未知事件」标记。

- [ ] **Step 1: 写失败测试**：reducer 事件名映射（`'tool.result'`/`'approval.required'`/空串/未知）；store 回放把 2 条工具事件写入 `process`、`event` 为空的事件被跳过；去重（回放 seq 小于 `lastSeq` 不重复应用）。
- [ ] **Step 2: 运行确认失败**。
- [ ] **Step 3: 实现**：`eventNameOfRunEvent` 用 `isChatEvent` 校验；`replayPersistedEvents` 分页 `while (has_more)`，每页应用；在 `adoptRun` 拿到非终态 run 后、`syncPendingApprovals` 之前调用（终态 run 直接 `refreshHistory`，无需回放）。
- [ ] **Step 4: 运行通过**：`pnpm vitest run src/stores/__tests__/chat-replay.spec.ts src/components/chat/__tests__/RunTracePanel.spec.ts`。
- [ ] **Step 5: 提交**：`git commit -m "feat(m7): 事件回放 event 字段驱动 reducer 补卡"`。

### Task 3: chat store 续流状态机

**Files:**
- Modify: `src/stores/chat.ts`（`performReconnect` 改为续流优先）
- Modify: `src/api/mock/stream.ts`（新增 `mockRunStream`）
- Modify: `src/api/mock/routers.ts`（`GET /runs/{id}/stream` 路由；`/runs/{id}/events` 元素补 `event`）
- Modify: `src/api/mock/db.ts`（`appendRunEvent` / `subscribeRunEvents` / `upsertRun`，记录 mock 聊天产生的 run 与非 delta 事件）
- Test: `src/stores/__tests__/chat-reconnect.spec.ts`（追加）、`src/api/__tests__/runs-stream.spec.ts`（追加 mock 用例）

**Interfaces:**
- `mockRunStream(runId: string, afterSeq: number, handlers: MockStreamHandlers): Promise<void>`：run 不存在 → 404 `not_found`；先回放 `mockDb.listRunEvents(runId, { after_seq })` 中 `event` 非空的项；run 非终态时订阅 mock 实时事件直到终态或 abort。
- `performReconnect` 新流程：
  1. `GET /runs/{id}` 校验（不变）；
  2. 终态 → `refreshHistory()`（不变）；
  3. `interrupted` → `adoptRun`（不变，含 Task 2 回放）；
  4. `running/queued` → `await runsApi.stream(runId, state.lastSeq, { onOpen: () => onOpen(runId, false), onEvent, onError, onClose: onStreamClose })`；
  5. 续流抛 400 `replay_too_large` / 404 / 任意错误 → `enterDegraded(...)` 走轮询（`schedulePolling`），不再 `openChatStream` 重发消息；
  6. 续流正常结束时若未终态 → `scheduleReconnect()`（沿用退避）。

- [ ] **Step 1: 写失败测试**：mock `runsApi.stream` 后断言重连调用它且 `after_seq === lastSeq`；400 `replay_too_large` 时进入 `degraded` 并启动轮询；终态 run 不调用 `stream`；没有 `runId` 时不调用 `stream`；`lastSeq` 去重（回放 seq 小于等于 lastSeq 不重复）。
- [ ] **Step 2: 运行确认失败**。
- [ ] **Step 3: 实现**：`performReconnect` 替换第 5 步；`mockChatStream` 在 `emit` 时把非 `message.delta`/`reasoning.delta` 事件写入 `mockDb.appendRunEvent`，开始时 `upsertRun(running)`、终态时更新 run 状态；mock 路由新增续流端点（401 未带 Bearer）。
- [ ] **Step 4: 运行通过**：`pnpm vitest run src/stores/__tests__/chat-reconnect.spec.ts src/api/__tests__/runs-stream.spec.ts`。
- [ ] **Step 5: 提交**：`git commit -m "feat(m7): 断线重连改为续流优先并回退轮询"`。

### Task 4: 写操作 RBAC 显隐

**Files:**
- Modify: `src/stores/auth.ts`（`isAdmin` computed）
- Modify: `src/views/AgentsView.vue`（注册/健康检查/删除/启停按钮仅管理员）
- Modify: `src/views/TasksView.vue`（取消/补充/授权/拒绝按钮仅管理员；抽屉入口保留只读）
- Modify: `src/components/tasks/TaskDetailDrawer.vue`（动作按钮同样按 `isAdmin` 禁用/隐藏）
- Modify: `src/views/SettingsView.vue`（改用 `auth.isAdmin`，去重复判断）
- Test: `src/stores/__tests__/auth.spec.ts`（追加）、`src/views/__tests__/agents-rbac.spec.ts` 与 `tasks-rbac.spec.ts`（新建，挂载即断言按钮数量）

**Interfaces:**
- `useAuthStore().isAdmin: ComputedRef<boolean>`（`user?.role === 'admin'`）。
- 普通用户：写按钮不渲染（不是禁用）；页头说明「写操作需要管理员权限」。
- 403（直接调用/竞态）：`errorMessage()` 显示后端统一文案（Task 6 保证）；不登出。

- [ ] **Step 1: 写失败测试**：`auth.isAdmin` 对 admin/user/null 三态；AgentsView 普通用户不渲染「注册智能体」「健康检查」「删除」；TasksView 普通用户不渲染四个动作按钮，管理员渲染。
- [ ] **Step 2: 运行确认失败**。
- [ ] **Step 3: 实现**：视图内 `const auth = useAuthStore()` + `v-if="auth.isAdmin"`；`TaskDetailDrawer` 增加 `canManage` prop（由父视图传 `auth.isAdmin`）。
- [ ] **Step 4: 运行通过**：`pnpm vitest run src/stores/__tests__/auth.spec.ts src/views/__tests__/`。
- [ ] **Step 5: 提交**：`git commit -m "feat(m7): agents/tasks 写入口按管理员角色显隐"`。

### Task 5: 审批 5 字段与授权链接容错

**Files:**
- Modify: `src/components/chat/cards/ApprovalCard.vue`（`payloadPreview` 作为默认参数展示；有 `payload` 时不请求详情）
- Modify: `src/stores/chat.ts`（`hydrateApprovals` 只在事件缺 `payload`/字段时调用 `/approvals?run_id=` 兜底，已有则跳过）
- Modify: `src/components/tasks/TaskDetailDrawer.vue`（`authorization_url` 为 null 时显示「授权链接不可用，请联系管理员」；非 https/localhost 链接不渲染为可点击）
- Test: `src/components/chat/__tests__/ApprovalCard.spec.ts`（新建）、`src/components/tasks/__tests__/TaskDetailDrawer.spec.ts`（新建或追加）

**Interfaces:**
- `ApprovalCard`：无 `payload` 但有 `payloadPreview` 时展示脱敏预览文本；两者都没有时展示「参数预览不可用」。
- `TaskDetailDrawer`：`authorizationUrl` 判断抽成 `isSafeAuthorizationUrl(url: string | null): boolean`（`https:` 或 dev 下 `http://localhost`/`http://127.0.0.1`），null/非法 → 提示文案 + 隐藏「打开授权链接」。

- [ ] **Step 1: 写失败测试**：只有 `payloadPreview` 时渲染预览且不出现「查看参数」；null 链接显示提示、拒绝 `javascript:`；https 链接可点击。
- [ ] **Step 2: 运行确认失败**。
- [ ] **Step 3: 实现**。
- [ ] **Step 4: 运行通过**：`pnpm vitest run src/components/chat/__tests__/ApprovalCard.spec.ts src/components/tasks/`。
- [ ] **Step 5: 提交**：`git commit -m "feat(m7): 审批预览字段与授权链接容错"`。

### Task 6: 错误文案收口（B-1/B-2/403）

**Files:**
- Modify: `src/api/client.ts`（`apiErrorFromResponse` 统一 403/503 文案；拦截器排除 `/auth/login`、`/auth/register`）
- Test: `src/api/__tests__/client.spec.ts`（追加）

**Interfaces:**
- `apiErrorFromResponse(403, {error:{code:'forbidden'}})` → message `当前账号无管理员权限`；`code` 仍为 `forbidden`，`details.required_role` 保留。
- `apiErrorFromResponse(503, {error:{code:'database_unavailable'|'service_unavailable'}})` → message `服务暂不可用，请稍后重试`。
- 登录/注册 401：不调用 refresh，直接抛 `ApiRequestError`（message 取后端 `error.message`），不触发 `unauthorizedHandler`。

- [ ] **Step 1: 写失败测试**：三种 403/503 文案；登录 401 断言 `refresh` 未被调用且 message 为「邮箱或密码错误」；普通接口 401 仍触发 refresh。
- [ ] **Step 2: 运行确认失败**。
- [ ] **Step 3: 实现**：`isAuthEndpoint(url)` 判断 `/auth/login|register`；命中时 `throw failed` 包装为 `ApiRequestError`（message 用后端 message）。
- [ ] **Step 4: 运行通过**：`pnpm vitest run src/api/__tests__/client.spec.ts`。
- [ ] **Step 5: 提交**：`git commit -m "fix(m7): 登录 401 不再吞文案并统一 403/503 提示"`。

### Task 7: Nginx 续流 location 与验证

**Files:**
- Modify: `deploy/nginx.conf`（新增 `location ~ ^/api/v1/runs/[^/]+/stream$` 的 SSE 段）
- Modify: `scripts/verify-nginx-sse.mjs`（`--check-deploy` 增加续流 location 断言；可选 `--stream` 实测路径）
- Modify: `deploy/README.md`（部署变量/端点表补续流）
- Test: `pnpm verify:nginx`、`pnpm verify:nginx -- --check-deploy`

**Interfaces:**
- 续流 location 必须包含：`proxy_http_version 1.1`、`proxy_buffering off`、`proxy_cache off`、`gzip off`、`proxy_read_timeout 3600s`、`proxy_send_timeout 3600s`、`proxy_set_header Connection ""`。
- 精确匹配 `/api/v1/chat/stream` 保持不变；续流用正则 location（run_id 是 UUID），优先级高于 `location /api/`。

- [ ] **Step 1: 写/改断言**（`--check-deploy`）：解析 `deploy/nginx.conf`，断言存在 `runs/.../stream` location 且 6 项参数齐全；缺失则 exit 1。
- [ ] **Step 2: 运行确认失败**（当前配置无续流段）。
- [ ] **Step 3: 实现** nginx location + 文档。
- [ ] **Step 4: 运行通过**：`pnpm verify:nginx -- --check-deploy` exit 0；如容器可用再跑完整 `pnpm verify:nginx`。
- [ ] **Step 5: 提交**：`git commit -m "build(m7): Nginx 增加运行事件续流 SSE location"`。

### Task 8: 真实联调（后端 M7 已落地）

**Files:**
- Create: `scripts/smoke-m7-backend.mjs`
- Modify: `src/__tests__/real`（如存在；否则用 smoke 脚本）
- Test: `node scripts/smoke-m7-backend.mjs`

**Interfaces:**
- 需要后端 `http://127.0.0.1:8000` 与 dev 账号（`dev@example.com`）可用；若 8000 不可用，本 Task 记为「未取证」并在报告写明。

- [ ] **Step 1: 写 smoke**：登录 → `GET /runs/{id}/events` 断言 `event` 字段存在 → `GET /runs/{id}/stream?after_seq=0` 断言 `text/event-stream`、`id:`/`event:` 帧、终态后 EOF → 普通用户调 `POST /agents` 断言 403 + `details.required_role=admin`。
- [ ] **Step 2: 启动后端**（managed background job，不新增容器）并运行。
- [ ] **Step 3: 记录证据到 `docs/handoff/2026-11-11-m7-frontend-report.md`**。
- [ ] **Step 4: 提交**：`git commit -m "test(m7): 新增后端 M7 契约 smoke 脚本"`。

### Task 9: 文档同步与全量门禁

**Files:**
- Modify: `docs/roadmap.md`（M7 前端状态、证据）
- Modify: `README.md`（状态段、测试数、命令）
- Modify: `docs/api.md`（§13 续流/event/RBAC 标为已联调或契约先行）
- Modify: `docs/pages.md`、`docs/architecture.md`（续流状态机、RBAC）
- Modify: `docs/handoff/2026-11-11-m7-m9-alignment.md`（状态更新）
- Create: `docs/handoff/2026-11-11-m7-frontend-report.md`

- [ ] **Step 1: 更新文档**（状态、证据、未做项）。
- [ ] **Step 2: 全量门禁**：`pnpm test`、`pnpm type-check`、`pnpm lint`、`pnpm build`、`pnpm size`、`pnpm e2e`。
- [ ] **Step 3: 独立子代理审查**（对照 spec 与本计划；Critical/Important 修完复跑）。
- [ ] **Step 4: 提交**：`git commit -m "docs(m7): 收口 M7 前端交付报告与路线图"`。

---

## 风险与未覆盖

| 风险 | 应对 |
|---|---|
| 续流端点单实例，排水期不拦截新流 | 前端不做跨实例假设；文档记录 |
| 回放上限 1000 条 | 400 时回退轮询，不重试同 `after_seq` |
| 真实 LLM key 占位 | 真实增量续流证据受限，用 mock + 单测 + 后端事件回放取证 |
| 第二账号缺失 | 普通用户 403 需 seed 或注册第二账号；没有则标注未取证 |
| mock 新产生 run 的事件落库 | 只落非 delta 事件，与后端一致；delta 补齐依赖终态 `refreshHistory()` |
