# 前端路线图（与后端 agent-hub 对齐）

> 对齐基线：后端 [`agent-hub/docs/roadmap.md`](../../../PythonProjects/agent-hub/docs/roadmap.md) 的 M0–M6。
>
> 本版（2026-11-10）修正了此前前端 M3/M5 与后端**同名不同义**的问题：旧版前端 M3「审批」、M5「体验与可访问性」不再使用。审批归属 M5，体验项移入 F 系列，工作流与完整管理台移入 X 系列（后端未立项）。
>
> **2026-11-10 需求变更**：本服务只做出站 A2A Client，不提供入站 A2A Server。原 M3「A2A 入站」取消（保留编号空位，避免与后端错位），设置页入站端点分区同步移除。

## 0. 对齐规则

1. **M 编号同名同义**：前端 M 编号与后端一一对应，只描述同一里程碑下的前端交付；不再单独定义一套里程碑。
2. **纯前端横切工作进 F 系列**：体验、可访问性、性能、视觉还原不占用 M 编号；可与 M4–M6 并行，但必须在 M6 验收前收口。
3. **后端未立项的工作进 X 系列**：不再写「M5+」。只有后端给出表、API、里程碑后，才升级为对应的 M 编号。
4. **契约先行，真实联调才算完成**：状态口径为 `未开始` → `契约先行` → `实现中` → `已联调`；mock 通过只算「实现中」。
5. **状态以证据为准**：后端状态看 `agent-hub/docs/feedback/` 与 OpenAPI；后端 roadmap 的勾选可能滞后，本仓库不替后端维护完成标记。

## 1. 里程碑总览

| 编号 | 后端目标 | 前端目标 | 后端状态（2026-11-11） | 前端状态（2026-11-11） | 前端验收/门禁 |
|---|---|---|---|---|---|
| M0 | 项目骨架 | 工程骨架 | 已完成 | 已完成 | 构建通过 |
| M1 | 对话最小闭环 | 登录 + 对话闭环 | 已完成 | 已联调 | `smoke:real` 97 项 |
| M1.5 | 个人能力层 | 个人能力层前端 | 已完成 | 已联调 | `smoke:m15` 68 项 |
| M2 | A2A 出站 | 智能体 + 任务 | 已完成 | 已联调 | 假 Agent + `test:real` |
| M3 | A2A 入站 | —（已取消） | 取消（需求变更：仅出站） | 取消（设置页入站分区已移除） | 不适用 |
| M4 | 知识库 RAG | 知识库页 + 引用 | 已完成（2026-11-10） | 已联调（2026-11-10） | `smoke:m4` 41/40 项 + `test:real` M4 3 例 |
| M5 | 审批与安全加固 | 审批中心 + 权限/安全 UX | 已完成（2026-11-11） | 已联调（2026-11-11） | `smoke:m5` 163 项 + `test:real` M5 3 例 |
| M6 | 生产化与可观测 | 生产化 + E2E + 断线续传 | 进行中（2026-11-11 设计/计划已出） | 已完成（2026-11-11） | `pnpm size` / `pnpm e2e` / `pnpm verify:nginx` |
| F1 | —（横切） | 体验与可访问性 | — | 部分（下一轮收口） | 排在 M6 之后 |
| X1 | 未立项 | 工作流 | 仅「M5 后评估」 | 仅页面骨架 + mock | 后端立项后升级为 M 编号 |
| X2 | 未立项 | 完整管理控制台 | `/api/v1/admin/*` 实测 404 | 仅 v8 原型 | 后端提供 admin 契约后升级 |

## 2. 各里程碑

### M0 工程骨架（已完成）

- [x] create-vue（`--bare`）生成 Vue 3 + TS + Vite + Pinia + Router 工程
- [x] ESLint / Oxlint / Prettier / type-check 配置
- [x] 目录规划（api / components / composables / layouts / stores / styles / types / views）
- [x] 架构 / 页面 / API / 开发 / 路线图文档
- [x] 依赖安装与首次构建验证（M1 开始时完成）

验收：工程配置与文档一致；`pnpm build` 通过。

### M1 登录 + 对话闭环（已完成，真实联调）

- [x] 登录/注册页、表单校验、路由守卫
- [x] 刷新令牌与 401 单飞重试
- [x] 对话页布局：会话侧栏 + 消息时间线 + 输入框
- [x] SSE 接入：`message.delta` / `message.created` / `message.done` / `reasoning.delta` / `reasoning.done`（真实 + mock 回放）
- [x] 模型/推理选择随 `chat/stream` 发送（`model` / `reasoning_effort`；推理等级在 `/system/info.reasoning_efforts` 为空时不下发）
- [x] Markdown 渲染 + DOMPurify + 代码高亮
- [x] 停止生成、错误提示、run 状态、运行事件回放
- [x] 会话列表/历史消息/重命名/归档
- [x] 真实后端契约修正：错误 `details`、幂等回放、409 运行恢复、能力开关置灰、历史倒序

验收证据：`smoke:real` 97 项、`test:real` M1 用例、`docs/handoff/2026-11-09-m15-m2-alignment.md`。

> **M1 收尾已完成（2026-11-10）**：模型/推理选择已并入 `ChatContextSelection` 并随请求发送；`/system/info` 的 `models`/`reasoning_efforts` 为空时前端隐藏选择器，不下发对应字段，也不回退到假参数。reasoning 事件继续按原 reducer 渲染。

### M1.5 个人能力层（已完成，真实联调）

- [x] 输入栏「+」上下文：附件 / 技能 / MCP；本轮上限与发送后清空
- [x] 附件上传（multipart、进度、去重提示）、受控下载、消息内附件 chips
- [x] 设置页：指令、长期记忆、技能、MCP 四区块
- [x] `skill.activated` / `memory.saved` / `tool.*` / `notice` 事件卡
- [x] `@` 文件选择（与「+」技能/MCP 选择分离）
- [x] 审批卡与同一 SSE 流恢复（**提前交付，正式归属 M5**）

验收证据：`smoke:m15` 68 项、`pnpm test` 全绿。

> 提前交付说明：M1.5 只承诺「对话内审批最小闭环」；审批列表、审计、RBAC 与安全加固仍在 M5，不因为审批卡已存在而把 M5 记为完成。

### M2 智能体 + 任务（已完成，真实联调）

- [x] 智能体列表、注册向导、Agent Card 预览
- [x] 健康检查、启用/禁用、刷新 Card、删除
- [x] 对话时间线中的工具卡片与 A2A 任务卡片（可跳转任务详情）
- [x] 任务列表页、筛选、分页、轮询、详情、取消、补充信息、授权、拒绝
- [x] SSE `tool.*` / `a2a.*` 事件处理
- [x] 真实后端 + 本地假 A2A Agent 联调

验收证据：`test:real` 4 个用例（含 M2 远程 Agent 调用与任务详情）、后端 101 个测试通过。

> 遗留项按里程碑归位，不再笼统写成「M5+」：
>
> - 入站 A2A Server、入站任务与会话映射 → **不实施（2026-11-10 需求变更：仅出站）**；
> - 智能体/任务的写操作 RBAC、审计 → **M5**；
> - 多实例 HITL/SSE（进程内 waiter 的跨实例问题）→ **M6**；
> - 工作流、完整管理台 → **X1 / X2（待立项）**。

### M3 A2A 入站（已取消，需求变更）

> **2026-11-10 决策：本服务只做出站 A2A Client，不提供入站 A2A Server。**
>
> - 不发布 Agent Card、不暴露 `.well-known` / JSON-RPC 入站端点；
> - 不做入站鉴权（API Key / OAuth2）、`contextId ↔ conversationId` 映射、入站任务与入站会话；
> - 设置页的「A2A 端点」分区已整块移除；远程智能体统一在「智能体」页注册与管理（出站方向）；
> - 保留 M3 编号空位，避免与后端里程碑错位；后端仓库的 M3 清理由后端单独处理。
>
> 若未来恢复入站能力，需重新立项并重新冻结契约，不沿用原 M3 清单。原清单（Agent Card 发布、入站鉴权、入站任务/会话来源、`a2a-inspector` 验收）全部作废。

### M4 知识库 RAG（已完成，真实联调）

后端目标：文档入库（Markdown/TXT/PDF）、切分、Embedding、`search_knowledge` 工具、`POST /knowledge/search` 调试接口；回答带来源。

- [x] 知识库页：文档列表（服务端 `q/category/status/owner_scope` + 游标分页 + 6 键统计）、上传（拖拽/选择/粘贴文本）、入库状态轮询、失败重试、删除、管理员全量/按范围重建。
- [x] 检索调试：命中片段、分数、来源、复制；空结果、403 能力关闭与 503 Embedding 不可用分别提示。
- [x] 对话：「+」菜单在 `capabilities.knowledge=true` 时开放知识库分类（候选来自可见文档 + 手输，≤5 个）；请求字段沿用 `knowledge_categories`；发送后清空。
- [x] 引用展示：`message.done.citations`/`tool.result.citations` 渲染来源；点击按 `document_id` 打开详情抽屉，文档已删除时回退标题搜索。
- [x] 工具卡支持 `source=knowledge` 并展示引用；用户消息展示本轮知识库分类。
- [x] 契约先行：知识库端点、citations 形状、分类语义、`knowledge` 能力开关；mock 与 fixtures 同步。

验收：上传文档后能检索到正确片段；助手回答的来源可点击；`knowledge=false` 时入口置灰/路由退回对话页。

> 2026-11-10 联调证据：`pnpm smoke:m4` 41 项（管理员）/40 项（普通用户）断言通过（上传 201/幂等 200/413/422、列表统计、检索 10 字段、重试、管理员 rebuild、删除 404）；`scripts/real-m4.spec.ts` 3 例通过。
>
> 落地差异（以后端 M4 实际契约为准）：① 上传是**同步入库**并返回终态，没有异步进度，轮询只针对脚本导入/重建产生的 `pending/indexing`；② 后端没有「单文档重建」端点，页面用 `POST /knowledge/documents/{id}/retry` 承载；③ 后端没有分类目录端点，输入栏候选由可见文档聚合 + 手输；④ 管理员 `rebuild(scope=own)` 指**所有用户的私有文档**。
>
> 未取得证据：真实 LLM 驱动的「对话 → search_knowledge → citations」SSE 全链路。本机 `LLM API key` 为占位符（DeepSeek 401），后端 M4 报告用替换 `build_chat_model` 的测试接缝验证；前端侧已用 mock 流与真实检索接口分别覆盖。

### M5 审批与安全加固（已完成，真实联调）

后端目标：审批完整链路、审计日志查询、登录/注册/聊天限流、提示词注入防护、输出过滤、密钥引用管理。
2026-11-11 后端 M5 已交付（approval_gate interrupt 迁移、审计查询、平台密钥、限流与安全模块），前端完成对接。

已交付：

- [x] 对话内审批卡升级：多审批、实时过期倒计时、payload 预览与敏感字段遮罩、逐卡批准/拒绝。
- [x] M5 事件契约：`approval.required` → `run.interrupted`（非终态，SSE 保持）→ 决定 → `run.resumed` → 后续 delta → `message.done`；兼容旧 `finish_reason=interrupted`。
- [x] 审批决定语义：`resumed=true` / `本轮还有其他审批待处理` / `运行已结束` / 409 `approval_expired`、`approval_already_decided` 分别提示，不再把正常语义当失败。
- [x] 审批超时：`message.done(finish_reason=canceled, reason=approval_timeout)` 明确提示「审批超时，本轮已取消」，过期审批不可再操作。
- [x] 审批中心 `/approvals`：5 键统计、待处理/历史 Tab、状态筛选、会话/运行 query 过滤、详情抽屉、批准/拒绝（备注 ≤500）、游标分页、过期禁用。
- [x] 审计查询（设置页「安全与审计」）：普通用户 `GET /audit-logs` 自查；管理员可切 `GET /admin/audit-logs` 全局并额外按 actor/resource_id 筛选；动作/资源/时间范围、详情与 request_id 复制。
- [x] 平台密钥（仅管理员）：`/admin/secrets` 列表、创建、轮换、启停、删除；503 `secret_store_unavailable` 与 403 分开提示；永不回显明文。
- [x] 安全 UX：聊天/登录/注册 429 `retry_after_seconds` 倒计时；审批 payload 与审计 detail 敏感键默认遮罩；Markdown 外链域名确认；401 会话过期提示。
- [x] 断线恢复：轮询 run 状态 + 进入会话时用 pending 审批补卡 + 终态刷新历史；**不**做逐字续流（见缺口）。
- [x] mock：新审批流事件、审计/密钥端点与数据、`admin@example.com` 管理员沙盒账号。
- [x] 单测：reducer/多审批/超时/决定语义、SSE 事件白名单与分发、终态审批对账/超时合成、审批中心、审计/密钥面板、敏感遮罩、聊天 429、Markdown 外链；全量 180 通过。
- [x] 真实联调：`smoke:m5` 163 项（审批列表/详情/stats、审计用户+管理员+过滤、密钥 CRUD、聊天 429）；`test:real` M5 3 例。
- [x] 后端 M5 迁移 `9c1d4e7a2b60`/`2d8f6a1c3e70` 已在开发库执行；`CAPABILITY_SECRET_KEY` 已配置；dev 账号临时提为 admin 联调。

验收：高风险工具调用必须审批，拒绝后不执行且 UI 明确；审批超时后不可再批准；非管理员看不到管理员专属写操作；审计可按用户/动作/时间检索。

> 2026-11-11 联调证据：`pnpm smoke:m5` 163 项断言通过；`pnpm test:real` 中 M5 3 例通过；`pnpm test` 180、`pnpm build`、`pnpm type-check`、`pnpm lint` 通过。
>
> 落地差异与缺口：
> 1. `GET /runs/{id}/events` 回放响应剔除了 `payload._event`，前端无法逐事件重放，断线只能「轮询状态 + 终态补历史 + 补审批卡」；建议后端 M6 增加 `event` 字段或流式续接端点。
> 2. 智能体/任务写操作 RBAC 后端未实现（仍为 `CurrentUser`）；前端只隐藏管理员专属入口并保留系统 MCP 写工具置灰，不伪造角色禁用。
> 3. 本机 `LLM_API_KEY` 为占位符（DeepSeek 401），无法真实触发「批准 → 恢复 → 继续输出」；该链路由 mock 流、reducer 单测与后端 395 项测试证据覆盖，`smoke:real` 的 M1 聊天用例因此失败，属环境限制。
> 4. 审批成功恢复后的 SSE 续接未取得真实 HTTP 证据（同上）。

### M6 生产化与可观测（前端已完成，2026-11-11）

后端目标：结构化日志 + OpenTelemetry、Prometheus 指标、`/readyz`、Docker/Compose、清理任务、压测、CI。
后端 M6 设计明确「只做后端与运维产物、不改业务契约、前端无需适配」，前端因此按「上线前置条件」独立收口。

已交付：

- [x] 构建产物拆分与体积门禁：`manualChunks` 拆出 `markdown` / `vue-vendor` / `http`；`pnpm size` 逐文件 gzip 门禁（单 chunk ≤ 110 KB、JS 总 ≤ 420 KB、CSS ≤ 60 KB）。ChatView 由 118.7 KB → 43.0 KB gzip，Markdown 三件套独立成块按需加载。
- [x] 生产强制关闭 mock：构建期（`vite build --mode production` 且 `VITE_USE_MOCK=true` 直接失败，实测 exit 1）与运行期（`import.meta.env.MODE === 'production'`）双层；`vite preview` 不被误伤。
- [x] Nginx 配置与 SSE 代理验证：`deploy/nginx.conf` 的 SSE location（`proxy_buffering off` / `proxy_cache off` / `gzip off` / 长读超时 / `Connection ""`）；`pnpm verify:nginx` 在已有 `dev_nginx` 容器内起临时实例对照实测：`/sse` 5 帧逐秒到达（间隔 999–1002 ms），`/sse-buffered` 首帧 5030 ms 后集中到达 5 帧。`--check-deploy` 对交付配置做 `nginx -t` 语法校验。
- [x] 断线续传：SSE 断线自动重连（1/2/4/8/16s ±20%，最多 5 次、总窗口 60s），重连前 `GET /runs/{id}` 回填 `conversation_id` 并校验 run，重连保留 `lastSeq` 去重，正常 EOF（未收到 `message.done`）也触发重连；重连中显示可中断的连接条，失败降级复用 M5 恢复横幅 + 轮询。
- [x] 可观测：`X-Request-ID` / `X-Trace-ID` 与请求耗时进环形缓冲；错误态展示并复制 `request_id`（聊天错误透传 SSE `error.request_id`）；账号菜单「诊断信息」抽屉（版本 / 构建时间 / git sha / API base / mock / run_id / conversation_id / 最近请求 / 最近错误 / Web Vitals）；Web Vitals 自研采集 LCP/CLS/INP/TTFB；`VITE_ERROR_REPORT_ENDPOINT` / `VITE_PERF_ENDPOINT` 上报钩子默认关闭。
- [x] E2E（Playwright + chromium，mock 构建）：`pnpm e2e` 10 例通过（登录 3 / 对话 2 / 审批 2 / 知识库 3）；`.github/workflows/ci.yml` 提供 quality + e2e 两个 job。
- [x] 部署文档：`deploy/README.md`（部署、缓存、回滚、验证记录与证据边界）。
- [ ] F1 收口（虚拟滚动、a11y 审计、移动端回归）：按用户决策拆到下一轮，不阻塞 M6。

验收：`pnpm build` + `pnpm size` 通过；`VITE_USE_MOCK=true pnpm build` 失败；`pnpm e2e` 10 例通过；`pnpm verify:nginx` exit 0 且给出缓冲对照时间线；断线重连单测覆盖回填/去重/终态/EOF/上限。

> 2026-11-11 联调证据：`pnpm test` 44 文件 / 232 用例通过；`pnpm type-check` 通过；`pnpm build` 通过；`pnpm size` 通过；`pnpm e2e` 10 passed；`pnpm verify:nginx` 与 `--check-deploy` exit 0。
>
> 未取证与限制：
> 1. **不做逐字续流**：后端 `GET /runs/{id}/events` 剔除 `payload._event`、无 `Last-Event-ID`、单实例不引入 Redis 广播，断线期间的文本增量只能等 run 结束后 `refreshHistory()` 补齐；建议后端后续给回放加 `event` 字段或提供 `GET /runs/{id}/stream?after_seq=`。
> 2. **E2E 只跑 mock 构建**：本机 `LLM_API_KEY` 为占位符（聊天 401），真实后端链路仍由 `smoke:real` / `test:real` 覆盖；不提供「只改 baseURL 就切真实后端」的假模式。
> 3. **Nginx 验证是「指令语义」证据**：临时实例 + 容器内假 SSE 源证明 `proxy_buffering off` 生效，不等于真实后端 LLM 长流/断线场景；`--check-deploy` 只验语法。
> 4. **CI 仅为配置交付**：仓库尚无远端 workflow 历史，是否有 runner 由用户决定。

## 3. F1 体验与可访问性（横切，不占 M 编号）

可与 M4–M6 并行，必须在 M6 验收前收口；不因后端里程碑延期而改写编号。

- [ ] 长会话虚拟滚动（1000 条消息流畅）；当前先原生列表 + 分页。
- [x] 移动端抽屉布局（已有，持续回归）。
- [x] Enter 发送 / Shift+Enter 换行、Esc 关闭账号菜单（已实现）。
- [ ] ⌘K 全局搜索与其他键盘导航。
- [x] 基础三态组件已存在（`EmptyState` / `ErrorState` / `LoadingBlock`）。
- [ ] 全站空态/错误态/骨架屏文案与布局统一。
- [ ] 可访问性：对比度、focus ring、`aria-live`、状态不只靠颜色。
- [x] 主题持久化（浅色/深色 + localStorage，已实现）。
- [ ] 其他偏好（语言、消息密度）与服务端同步待定。
- [ ] 性能预算：首屏体积、Markdown 渲染缓存、SSE 按帧合并。

> 原型视觉的像素级还原属于「呈现型欠账」，单独排期，不在本路线图中占用 M/F 编号；新页面按 v7 设计 token 实现。

## 4. X 系列：后端未立项

### X1 工作流（待立项）

- 后端现状：无 `workflows` / `workflow_runs` 表或 API；架构明确不做通用 BPMN 编排器；roadmap 仅写「M5 后按实际任务复杂度评估」。
- 前端现状：`/workflows` 页面骨架 + mock；路由受 `capabilities.workflows` 门控（当前恒为 `false`）；交接包 `docs/handoff/workflows.md`、BE-12 保留为方案证据。
- 规则：后端未立项前不建表、不做编辑器、不做执行，不显示「即将上线」式假承诺，也不做本地假成功。
- 升级条件：后端给出轻量步骤模板的表/API 与里程碑后，前端新增与之同名的 M 编号（例如 M7），并补契约与 fixtures。

### X2 完整管理控制台（待立项）

- 后端现状：`/api/v1/admin/*` 实测 404；`api.md` 2.12 的平台指令/系统 MCP/系统技能仍为设计稿；用户、角色权限、菜单、字典、审计查询均无 API。
- 前端现状：仅 `ui-v8-admin.html` 原型；`docs/handoff/admin-console.md` 的 M5.0/M5.1/M5.2 是**建议切片，不是后端路线图的 M5**。
- 拆分：若后端 M5 提供审计查询，只把「审计查询 + 审批相关」纳入 M5；概览、用户、RBAC、菜单、字典全部留在 X2。
- 升级条件：后端实现 admin 契约并给出里程碑后，再建前端 M 编号；在此之前不加 `/admin` 路由，不伪造管理数据。

## 5. 契约前置与联调门禁

| 里程碑 | 开工前必须冻结的契约 | 当前事实 | 前端动作 |
|---|---|---|---|
| M3 | 不适用（已取消） | 2026-11-10 决策：仅出站 A2A Client，入站不实施 | 无；设置页入站分区已移除，智能体页继续承载出站能力 |
| M4 | 知识库文档/检索端点；citations；`knowledge_categories`；能力开关 | 7 个端点已实现，`capabilities.knowledge=true`；前端已联调 | 按实际契约消费；单文档重建复用 retry；分类候选由文档聚合 |
| M5 | 审批列表/详情/决定；审计查询；平台密钥；429；`run.interrupted`/`run.resumed` | 后端已交付并在开发库迁移 | 已联调；RBAC 403 仍缺，待后端补 |
| M6 | 无新增业务契约；`/readyz` 加字段、DB 503 兼容 | 后端 M6 设计已明确前端无需适配；单实例、无 Redis 广播 | 前端生产化已收口：构建门禁、重连、可观测、E2E、Nginx SSE；逐字续流待后端补回放事件名 |
| X1/X2 | 无 | 未立项 | 保留原型/交接包，不进入排期 |

## 6. 待决策

| 议题 | 选项 | 当前结论/倾向 | 影响 |
|---|---|---|---|
| Token 存储 | localStorage / httpOnly cookie | 先 localStorage；M6 评估 cookie（需后端配合） | 安全与刷新链路 |
| UI 库 | Element Plus / Naive UI | **Element Plus（已定）** | 不再重复评估 |
| Markdown 高亮 | highlight.js / Shiki | **highlight.js（已实现）** | 构建期高亮不再等待 |
| 虚拟滚动 | Element Plus 虚拟列表 / 自研 | 先原生 + 分页，F1（M6 前）优化 | 长会话性能 |
| 工作流定位 | 轻量步骤模板 / 不落地 | 待后端 D1；未立项前不建表 | X1 是否升级 |
| 完整管理台 | 全量 / 最小集 / 后置 | 最小集也需 admin 契约；当前 X2 | M5 范围 |
| 多实例 SSE | 粘性会话 / Redis 事件总线 / 前端轮询 | 后端 M6 决策；前端保留 `after_seq` 恢复 | 断线与扩容 |
| 交接包 D1–D8 | 见 `contract-delta.md` | 推荐项仍有效；与本文冲突的编号以本文为准 | 字段与表结构 |

## 7. 变更记录

- **2026-11-11（M6 前端）**：前端 M6 生产化完成：分包与体积门禁（ChatView 118.7→43.0 KB gzip）、生产 mock 双层门禁、SSE 断线自动重连（回填 conversation_id + lastSeq 去重，不做逐字续流）、诊断抽屉与 Web Vitals、Playwright E2E 10 例 + CI、Nginx SSE 配置与容器内对照实测（`/sse` 逐秒 999–1002 ms vs `/sse-buffered` 集中到达）。F1 收口与视觉欠账按用户决策排到下一轮。
- **2026-11-11**：M5 前端完成并对接后端交付：审批中心、多审批与超时语义、审计查询、平台密钥、429/遮罩/外链等安全 UX；`smoke:m5` 163 项与 `test:real` M5 3 例通过。记录事件回放无事件名、写操作 RBAC 未落地、LLM 占位导致审批恢复无真实 HTTP 证据三项缺口。
- **2026-11-10（需求变更）**：A2A 能力边界收缩为**仅出站**。M3「A2A 入站」取消（保留编号空位），设置页「A2A 端点」分区整块移除，`system/info.a2a` 前端不再读取；F1 并行范围收窄为 M4–M6。后端仓库的 M3 清理由后端单独处理。
- **2026-11-10**：与后端 M0–M6 语义对齐。M3 由「审批」改为「A2A 入站前端配套」；M5 由「体验与可访问性」改为「审批与安全加固」；体验项移入 F1；工作流/完整管理台移入 X1/X2；M1/M1.5/M2 状态更新为真实联调通过；补充契约前置、门禁与待决策。
- **2026-11-10（代码收尾）**：模型/推理选择随 `chat/stream` 发送；设置页 A2A 按 `a2a.enabled` 门控；新增 4 个单测（`withModelSelection` 2 个、A2A 门控 2 个）。
- 旧版 M3「审批」中的已完成项（审批卡、同一流恢复）归入 M5 的「提前交付」；旧版 M5「体验」中的未完成项移入 F1。
