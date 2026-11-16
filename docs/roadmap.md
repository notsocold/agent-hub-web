# 前端路线图（与后端 agent-hub 对齐）

> 对齐基线：后端 [`agent-hub/docs/roadmap.md`](../../../PythonProjects/agent-hub/docs/roadmap.md) 的 M0–M9（2026-11-11）。
>
> **2026-11-11 后端新增立项**：M7 契约补齐与安全收口、M8 管理台后端、M9 工作流后端。前端按同名同义原则新增 **M7 前端适配**、**M8 前端管理台（v8 七页）**、**M9 前端工作流**；原 X1/X2 不再作为「未立项」保留。
>
> **2026-11-11 更新**：后端 M7 已交付，前端 M7 已完成接入并真实联调（续流、事件回放、写操作 RBAC、审批字段、授权链接容错、401/503 文案、Nginx 续流 location）。
> **2026-11-12 更新（历史记录，统计时点为 2026-11-12）**：后端 M8 已交付（15 个 `/admin/*` 端点），前端 M8 管理台七页已实现（当时 398 单测；后续统一为 2026-11-16 的 561 单测口径）；管理台 E2E 7 passed + 1 skipped 已于当日跑通；`smoke:m8` 当时未取证，2026-11-16 已补 69/69 项（[留档](handoff/2026-11-16-m8-smoke.md)）。**M9 后端 T1–T9 已交付（含 T6–T9），前端 M9 工作流已全部实现并过 mock E2E；`smoke:m9` 67 项已在真实后端通过（2026-11-12）。**
>
> **2026-11-16 更新（现行口径）**：后端 **M0–M9 已交付**（M3 取消），OpenAPI 78 路径 / 109 操作；前端 **M0–M9 已完成**。**M8 管理台七页在位，角色/菜单/字典三页只读，系统设置为能力配置 + 平台信息（只读）形态；M9 工作流五类步骤已交付。** 门禁口径统一为 **当前 561 单测 / 88 files（2026-11-16 23:52 本机实测）**、**E2E 44 passed + 1 skipped**（2026-11-12 基线 42）、axe 10 个扫描面 0 critical/serious、`pnpm build` 通过；`smoke:m8` 69/69 真实后端通过并留档（2026-11-16），`smoke:m9` 67 项通过（2026-11-12）。治理路径已按 2026-11-16 决策选 **B（缩范围 + 补真实数据 + 修前端交互）**，执行记录见[整改报告](handoff/2026-11-16-gap-remediation-report.md)，决策见[治理决策 ADR](superpowers/specs/2026-11-16-governance-decision.md)与[接受清单](handoff/2026-11-13-accepted-deviations.md)。
>
> 本版（2026-11-11）同时修正了 M6 后端状态（已完成）、F1 收尾状态与测试口径，并把原计划的 F2 纯前端收尾并入 M7 前端。规划详情见[对齐设计](superpowers/specs/2026-11-11-m7-m9-frontend-alignment-design.md)。
>
> 历史说明：旧版前端 M3「审批」、M5「体验与可访问性」已作废；M3「A2A 入站」因 2026-11-10 需求变更取消（服务仅出站），保留编号空位。

## 0. 对齐规则

1. **M 编号同名同义**：前端 M 编号与后端一一对应，只描述同一里程碑下的前端交付；不再单独定义一套里程碑。
2. **纯前端横切工作进 F 系列**：体验、可访问性、性能、视觉还原不占用 M 编号；F1 已完成，原 F2 收尾项并入 M7，未来纯前端项按需新立 F3+。
3. **后端已立项的工作升级为 M 编号**：X1 → M9、X2 → M8；历史文档保留 X 编号作为追溯，新文档一律用 M8/M9。
4. **契约先行，联调完成才算交付**：状态口径固定为 `未开始` → `契约先行` → `前端完成` → `联调完成`；mock / E2E(mock) 通过只算「前端完成」，真实后端 smoke + 一条真实 HTTP/浏览器证据 + 文档勾选才算「联调完成」。
5. **状态以证据为准**：后端状态看 `agent-hub/docs/feedback/` 与 OpenAPI；后端 roadmap 的勾选可能滞后，本仓库不替后端维护完成标记。
6. **不伪造后端能力**：无契约页面只做只读/内置数据呈现并显式提示「后端未提供接口」，不做本地假 CRUD、不显示假成功。

## 1. 里程碑总览

| 编号 | 后端目标 | 前端目标 | 后端状态（截至 2026-11-16） | 前端状态（截至 2026-11-16） | 前端验收/门禁 |
|---|---|---|---|---|---|
| M0 | 项目骨架 | 工程骨架 | 已完成 | 已完成 | 构建通过 |
| M1 | 对话最小闭环 | 登录 + 对话闭环 | 已完成 | 已联调 | `smoke:real` 97 项 |
| M1.5 | 个人能力层 | 个人能力层前端 | 已完成 | 已联调 | `smoke:m15` 68 项 |
| M2 | A2A 出站 | 智能体 + 任务 | 已完成 | 已联调 | 假 Agent + `test:real` |
| M3 | A2A 入站 | —（已取消） | 取消（需求变更：仅出站） | 取消（设置页入站分区已移除） | 不适用 |
| M4 | 知识库 RAG | 知识库页 + 引用 | 已完成（2026-11-10） | 已联调（2026-11-10） | `smoke:m4` 41/40 项 + `test:real` M4 3 例 |
| M5 | 审批与安全加固 | 对话内审批 + 权限/安全 UX | 已完成（2026-11-10） | 已联调（2026-11-11） | `smoke:m5` 163 项 + `test:real` M5 3 例 |
| M6 | 生产化与可观测 | 生产化 + E2E + 断线续传 | 已完成（2026-11-11，582 测试） | 已完成（2026-11-11） | `pnpm size` / `pnpm e2e` / `pnpm verify:nginx` |
| **M7** | **契约补齐与安全收口** | **续流 + 权限边界 + 安全 UX** | **已完成（2026-11-11）** | **已联调（2026-11-11）** | `smoke:m7` 48 项 + `test:real` M7 5 例 + 续流/回放单测 |
| **M8** | **管理台后端（原 X2）** | **管理控制台七页（角色/菜单/字典只读）** | **已完成（2026-11-11）** | **已联调（管理台 E2E 2026-11-12；`smoke:m8` 69/69 2026-11-16；当前 561 单测 / 88 files）** | `smoke:m8` 69/69（2026-11-16）+ 管理台 E2E/axe 7 passed + 1 skipped（2026-11-12 随 M9 收口修复 mock 会话身份持久化后） |
| **M9** | **工作流后端（原 X1）** | **工作流管理 + 运行** | **已交付（T1–T9，2026-11-12）** | **已完成（2026-11-12；当前 561 单测 / 88 files，2026-11-16）** | E2E 42 例（2026-11-12 基线；全量当前 44+1）+ `smoke:m9` 67 项 + 3 步模板联调 + `workflow.step` |
| F1 | —（横切） | 体验与可访问性 | — | 已完成（2026-11-11，本地未推送） | `pnpm test` / `pnpm e2e` / axe |
| **PA-1** | —（横切） | **第一次向 v7/v8 原型靠拢** | — | **已完成（2026-11-11）** | 单测 / E2E / axe / 四档截图 |
| ~~X1~~ | — | ~~工作流~~ | 已升级为 **M9** | — | 见 M9 |
| ~~X2~~ | — | ~~完整管理台~~ | 已升级为 **M8** | — | 见 M8 |

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

### M1.5 个人能力层（已完成，真实联调）

- [x] 输入栏「+」上下文：附件 / 技能 / MCP；本轮上限与发送后清空
- [x] 附件上传（multipart、进度、去重提示）、受控下载、消息内附件 chips
- [x] 设置页：指令、长期记忆、技能、MCP 四区块
- [x] `skill.activated` / `memory.saved` / `tool.*` / `notice` 事件卡
- [x] `@` 文件选择（与「+」技能/MCP 选择分离）
- [x] 审批卡与同一 SSE 流恢复（**提前交付，正式归属 M5**）

验收证据：`smoke:m15` 68 项、`pnpm test` 全绿。

### M2 智能体 + 任务（已完成，真实联调）

- [x] 智能体列表、注册向导、Agent Card 预览
- [x] 健康检查、启用/禁用、刷新 Card、删除
- [x] 对话时间线中的工具卡片与 A2A 任务卡片（可跳转任务详情）
- [x] 任务列表页、筛选、分页、轮询、详情、取消、补充信息、授权、拒绝
- [x] SSE `tool.*` / `a2a.*` 事件处理
- [x] 真实后端 + 本地假 A2A Agent 联调

验收证据：`test:real` 4 个用例（含 M2 远程 Agent 调用与任务详情）、后端 101 个测试通过。

### M3 A2A 入站（已取消，需求变更）

> **2026-11-10 决策：本服务只做出站 A2A Client，不提供入站 A2A Server。**
>
> - 不发布 Agent Card、不暴露 `.well-known` / JSON-RPC 入站端点；
> - 不做入站鉴权（API Key / OAuth2）、`contextId ↔ conversationId` 映射、入站任务与入站会话；
> - 设置页的「A2A 端点」分区已整块移除；远程智能体统一在「智能体」页注册与管理（出站方向）；
> - 保留 M3 编号空位，避免与后端里程碑错位；后端仓库的 M3 清理由后端单独处理。

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

### M5 审批与安全加固（已完成，真实联调）

后端目标：审批完整链路、审计日志查询、登录/注册/聊天限流、提示词注入防护、输出过滤、密钥引用管理。
2026-11-11 后端 M5 已交付（approval_gate interrupt 迁移、审计查询、平台密钥、限流与安全模块），前端完成对接。

已交付：

- [x] M5 事件契约：`approval.required` → `run.interrupted`（非终态，SSE 保持）→ 决定 → `run.resumed` → 后续 delta → `message.done`；兼容旧 `finish_reason=interrupted`。
- [x] 审批决定语义：`resumed=true` / `本轮还有其他审批待处理` / `运行已结束` / 409 `approval_expired`、`approval_already_decided` 分别提示，不再把正常语义当失败。
- [x] 审批超时：`message.done(finish_reason=canceled, reason=approval_timeout)` 明确提示「审批超时，本轮已取消」，过期审批不可再操作。
- [x] 对话内审批卡（2026-11-11 原型靠拢后为唯一入口）：一轮多卡、实时倒计时、payload 遮罩、逐卡「批准并执行/拒绝」、409/超时语义；原独立审批页 `/approvals` 与路由已删除，审批列表接口仅作断线补卡兜底。
- [x] 审计查询（设置页「安全与审计」）：普通用户 `GET /audit-logs` 自查；管理员可切 `GET /admin/audit-logs` 全局并额外按 actor/resource_id 筛选。
- [x] 平台密钥（仅管理员）：`/admin/secrets` 列表、创建、轮换、启停、删除；503 `secret_store_unavailable` 与 403 分开提示；永不回显明文。
- [x] 安全 UX：聊天/登录/注册 429 `retry_after_seconds` 倒计时；审批 payload 与审计 detail 敏感键默认遮罩；Markdown 外链域名确认；401 会话过期提示。
- [x] 断线恢复：轮询 run 状态 + 进入会话时用 pending 审批补卡 + 终态刷新历史；**不**做增量续流（M7 补已落库事件回放；`message.delta` 不落库，断线窗口文本仍靠终态刷新）。

验收证据：`smoke:m5` 163 项、`test:real` M5 3 例、`docs/handoff/2026-11-11-m5-frontend-alignment.md`；2026-11-11 原型靠拢后对话内审批由 `e2e/approval.spec.ts` 覆盖。

### M6 生产化与可观测（前后端均已完成，2026-11-11）

后端目标：结构化日志 + OpenTelemetry、Prometheus 指标、`/readyz`、Docker/Compose、清理任务、压测、CI。后端 M6 已交付 582 测试；**本轮无破坏性业务契约变更**。

前端按「上线前置条件」收口：

- [x] 构建产物拆分与体积门禁：`manualChunks` 拆出 `markdown` / `vue-vendor` / `http`；`pnpm size` 逐文件 gzip 门禁（单 chunk ≤ 110 KB、JS 总 ≤ 420 KB、CSS ≤ 60 KB）。
- [x] 生产强制关闭 mock：构建期（`vite build --mode production` 且 `VITE_USE_MOCK=true` 直接失败）与运行期双层。
- [x] Nginx 配置与 SSE 代理验证：`deploy/nginx.conf` 的 SSE location（`proxy_buffering off` / `proxy_cache off` / `gzip off` / 长读超时 / `Connection ""`）；`pnpm verify:nginx` 对照实测。
- [x] 断线续传（自动重连部分）：1/2/4/8/16s ±20%，最多 5 次、总窗口 60s；重连前 `GET /runs/{id}` 回填 `conversation_id` 并校验 run，保留 `lastSeq` 去重；正常 EOF 也触发重连；失败降级轮询。
- [x] 可观测：`X-Request-ID` / `X-Trace-ID` 与耗时环形缓冲；错误态展示并复制 `request_id`；诊断信息抽屉；Web Vitals；上报钩子默认关闭。
- [x] E2E（Playwright + chromium，mock 构建）：`pnpm e2e` 10 例通过；`.github/workflows/ci.yml` 提供 quality + e2e 两个 job。
- [x] 部署文档：`deploy/README.md`。
- [x] F1 收口（虚拟滚动、a11y 审计、移动端回归）：已由 F1 完成（2026-11-11）。

验收：`pnpm build` + `pnpm size` 通过；`VITE_USE_MOCK=true pnpm build` 失败；`pnpm e2e` 10 例通过；`pnpm verify:nginx` exit 0。

> 未取证与限制：① 不做逐字续流（后端 M7 非目标：`message.delta` 不落库；M7 只补已落库事件回放）；② E2E 只跑 mock 构建；③ Nginx 验证是指令语义证据；④ CI 仅为配置交付。
>
> **2026-11-11 全量证据**：`pnpm test` 44 文件 / 232 用例通过；`pnpm type-check`、`pnpm build`、`pnpm size`、`pnpm e2e` 10 passed、`pnpm verify:nginx` 与 `--check-deploy` exit 0。

### M7 契约补齐与安全收口（前后端均已完成，2026-11-11）

后端目标（M7）：`GET /runs/{id}/events` 补 `event` 字段；新增 `GET /runs/{id}/stream?after_seq=` SSE 续流端点；agents/tasks 写接口收紧到管理员（403）；`approval.required` 补 5 个展示字段；A2A `authorization_url` 白名单；契约文档/OpenAPI/handoff 同步。无迁移。

前端范围（详见[对齐设计](superpowers/specs/2026-11-11-m7-m9-frontend-alignment-design.md) §3）：

- [x] M7-F1 续流：`src/api/runs.ts` 新增 `runsApi.stream`（fetch + Bearer + `after_seq`）；`chat` store 重连改为「续流优先、失败回退轮询」；`400 replay_too_large`/404 回退轮询，不重试同一 `after_seq`。
- [x] M7-F2 事件回放：`RunEvent.event` 进入类型；`replayPersistedEvents` 按事件名重放补卡；`seq` 单调去重；轨迹面板展示事件名。
- [x] M7-F3 权限边界：`auth.isAdmin` 驱动 agents/tasks 写入口（含两个详情抽屉）显隐；403 `forbidden` 统一文案「当前账号无管理员权限」。
- [x] M7-F4 审批字段：`approval.required` 的 5 字段直接渲染；`payload_preview` 缺 payload 时作为脱敏预览展示，两者皆无时明确提示。
- [x] M7-F5 授权链接：共享 `isSafeAuthorizationUrl`，非法/缺失链接显示「授权链接不可用，请联系管理员」且不渲染可点击按钮。
- [x] M7-F6 纯前端收尾：登录/注册 401 不进入 refresh、直接展示后端文案；`database_unavailable`/`service_unavailable` 统一 503 文案；管理员入口按角色。
- [x] M7-F7 契约与门禁：类型/mock/fixtures 同步（含 mock 续流端点与 run 事件落库）；续流/回放/RBAC/文案单测；`test:real` M7 用例；`pnpm test` 325 例全绿。
- [x] M7-F8 部署配置：`deploy/nginx.conf` 为正则 location 续流端点增加 SSE 参数；`--check-deploy` 增加 7 项静态断言（含 `/api/` 不得 `^~` 抢占）；`deploy/README.md` 同步。

启动条件：后端 M7 契约冻结（以 handoff/OpenAPI 为准）。**前端可先做**：类型、mock、续流状态机单测、B-1/B-2/B-3 纯前端修复。

验收（2026-11-11 已完成）：

- 断线后从 `lastSeq` 续流：已落库事件回放 + 实时事件不重复；断线窗口内未落库的 `message.delta` 不承诺补齐，终态 `refreshHistory()` 仍是必需步骤；
- `400 replay_too_large` 降级轮询；404 结束恢复并刷新历史；终态关闭并 `refreshHistory()`；
- 普通用户写 agents/tasks 入口不可见（含详情抽屉）、直接调用 403 文案正确；
- 审批卡直接用事件字段渲染，`payload_preview` 脱敏展示；
- 门禁：`pnpm test` 325 例、`type-check`、`lint`、`build`、`size`、`e2e` 28 例、`verify:nginx --check-deploy` 全绿；
- 真实联调：`smoke:m7` 48 项、`test:real` 中 M7 5 例全绿（M4 入库/LLM 相关用例受本地 embedding/key 限制，见交付报告）。

风险：续流端点单实例；排水不拦截新流；生产 Nginx 未给续流端点配 SSE location 会导致逐帧失效或 60s 截断（M7-F8 必须与功能同批交付）；真实 LLM key 占位导致真实增量续流证据受限；续流与旧轮询需状态机互斥。

### M8 管理台后端 / 前端管理台（后端已完成 2026-11-11；前端已交付 2026-11-12，2026-11-16 补真实后端冒烟）

后端目标（M8，原 X2）：用户列表/详情/角色与状态调整（不能修改自己的 role、不能禁用/降级最后一个 admin（自己能否改 status 以 M8 handoff 为准））；平台指令、系统技能、系统 MCP、全局 Agent 的查询与管理；`GET /admin/overview` 只读统计；管理端审计与 403 契约。预计无迁移。

前端范围（v8 原型七页，详见对齐设计 §4；角色/菜单/字典只读，系统设置为能力配置 + 平台信息（只读）形态）：

- [x] M8-F1 路由与外壳：`/admin` 独立布局 `AdminLayout`（深墨侧栏 + 七页），`meta.requiresAdmin`，非 admin 无权限页。
- [x] M8-F2 概览：`GET /admin/overview` 计数卡片。
- [x] M8-F3 用户：`GET /admin/users`、`GET /admin/users/{id}`、`PATCH /admin/users/{id}`，分页/搜索/角色/状态；前端禁用「修改自己的 role」「禁用/停用自己」，后端校验兜底（422/409 按 `error.code` 映射）。
- [x] M8-F4 角色权限：**只读**两角色说明 + 用户角色分布 + 内置能力矩阵；不做新建角色/权限编辑。
- [x] M8-F5 菜单：**只读**前端路由菜单树（由 `routes` 静态推导）；标注「后端无菜单配置接口」。
- [x] M8-F6 字典：**只读**前端内置枚举（任务状态/审批风险/知识库状态等）；标注「后端无字典管理接口」。
- [x] M8-F7 审计：复用管理员审计面板（M5 已有，`can-view-all`）。
- [x] M8-F8 系统设置：平台指令（保存/恢复默认）、系统技能（双开关）、系统 MCP（新建/编辑/删除/健康提示）、全局 Agent（筛选/翻页/编辑白名单字段）、平台密钥（复用 SecretPanel）；写操作二次确认 + 审计。**2026-11-16 增补只读「平台信息」「能力开关」两分区，形成能力配置 + 平台信息（只读）形态。**
- [x] M8-F9 契约/类型/mock：`src/api/admin.ts`、`src/types/admin.ts`、mock 与 fixtures（15 端点全覆盖）。

依赖：M7-2 RBAC 先落地；v8 七页中角色权限/菜单/字典三页**无后端契约**，按只读 + 明确提示交付，不做假 CRUD。若要求可编辑，需后端另立项（候选 M10+，见[治理决策 ADR](superpowers/specs/2026-11-16-governance-decision.md)）。

验收：管理员可完成用户/系统项操作且关键写操作有审计；普通用户访问 `/admin/*` 403/无权限页；七页 axe 无 critical/serious；`smoke:m8` 69/69 真实后端通过（2026-11-16）。

前端 M8 完成情况（2026-11-12；单测口径见 §1 表，当前 561 / 88 files 于 2026-11-16 23:52 复跑）：M8 交付时 402 单测全绿（管理台 55+ 用例），type-check / eslint / oxlint 干净；`e2e/admin.spec.ts` 8 例 + a11y 管理台 4 例已就位，**2026-11-12 随 M9 收口在真实浏览器环境跑通**（当时因缺 chromium 系统库未执行；首跑暴露 mock 会话身份不持久问题，已随 M9 Task 7 修复）；`scripts/smoke-m8-backend.mjs` 已就位，**2026-11-16 真实后端 69/69 通过**（[留档](handoff/2026-11-16-m8-smoke.md)），关闭审计报告 §8 V1 缺口。已知限制：全局 Agent 的 `headers` 不提供编辑 UI（响应不回显明文，避免覆盖风险）；系统 MCP 的 `headers` 可编辑——响应不回显、留空=不修改、填写则整体覆盖为本次输入（仅引用形态）；`requires_approval` 展示按字段存在性守卫。

### M9 工作流后端 / 前端工作流（已交付，2026-11-12 收口）

后端目标（M9，原 X1）：`workflows` / `workflow_runs` 表；五类步骤（`knowledge_search` / `tool` / `a2a` / `approval` / `answer`）；CRUD/启停/运行入口（`chat/stream.workflow_id`）/运行历史；`workflow.step` 事件；先做 1 天 spike，不引入外部引擎，不做 DAG/并行。**后端 T1–T9 已交付（`55d8020` CRUD、`1dc2f10` 运行历史、`85cb5c3` chat 接入、`4687c8b` workflow.step、`cb5d014` 能力开关及后续收口），`capabilities.workflows=true`。**

前端范围（详见对齐设计 §5）：

- [x] M9-F1 列表页：名称、描述、步骤数、启用状态、归属、更新时间；启停/删除/运行。
- [x] M9-F2 线性编辑器：步骤增删/排序（上移下移），五类步骤参数表单；保存前校验；**不做拖拽画布**。
- [x] M9-F3 运行历史：`GET /workflows/{id}/runs` + 关联 run 详情。
- [x] M9-F4 对话接入：`capabilities.workflows=true` 时输入栏「+ → 工作流」开放；请求带 `workflow_id`；时间线渲染 `workflow.step` 步骤卡。
- [x] M9-F5 契约/类型/mock：`src/types/workflow.ts`、`src/api/workflows.ts` 由骨架升级为真实契约；mock 同步。

前端完成情况（2026-11-12）：F1–F5 全量交付，当时全量单测 475 例（2026-11-12；当前 561 / 88 files，2026-11-16 23:52 复跑）、type-check/lint 干净；E2E `e2e/workflows.spec.ts` 2 例（主链路 + `workflows=false` 门控）随全量 42 例通过；`scripts/smoke-m9-backend.mjs` 在真实后端 67 项全绿（CRUD 七端点、422/404/409 语义、运行 `workflow.step` 帧五键、`workflow_runs` 终态同步）。已知限制见[交付报告](handoff/2026-11-12-m9-workflow-frontend-report.md)。顺带修复 mock 沙盒会话身份不持久导致 M8 管理台 E2E 7 例首次真实运行即失败的历史债务（当年缺 chromium 系统库未跑过）。

启动条件（已满足）：M9 spike 通过 + 契约冻结（`workflows` CRUD、`workflow_id`、`workflow.step`、五类步骤参数 schema），且后端显式把 `capabilities.workflows` 置 `true`。

验收：3 步模板（检索 → A2A → 审批）可保存并运行 ✅（`smoke:m9` 真实后端 + mock E2E）；`workflow.step` 可见 ✅；取消/失败/审批超时语义与现有 run 一致 ✅（T2 演示态 + smoke 409 语义）；`workflows=false` 时入口置灰 ✅（E2E 门控用例）。

## 3. F1 体验与可访问性（横切，已完成）

> 2026-11-11 已完成（两批，本地提交未推送）；设计与计划见 `docs/superpowers/specs/2026-11-11-f1-experience-a11y-design.md` 与 `docs/superpowers/plans/2026-11-11-f1-experience-a11y.md`。

- [x] 长会话虚拟滚动：`virtua` 的 `VList`，1000 条消息 E2E 验证 DOM 行数 < 60、前置插入不跳视口、上滑「回到底部」。
- [x] 移动端抽屉布局（390×844 E2E）。
- [x] Enter 发送 / Shift+Enter 换行、Esc 关闭账号菜单。
- [x] ⌘K 全局搜索：页面跳转 + 会话标题（`GET /conversations?q=`）+ 当前会话已加载消息定位。
- [x] 基础三态组件 + 规格统一：`EmptyState` 增 `size`/`icon`，新增 `LoadingSkeleton`，16 处首屏加载接入。
- [x] 可访问性：对比度、focus ring、流式 `aria-live`、跳过链接、axe 扫描 7 页面/状态 0 critical/serious。
- [x] 主题持久化、消息密度偏好（localStorage）；语言只读展示。
- [x] 性能预算：Markdown 渲染 LRU 缓存、SSE 按帧合并、构建体积门禁更新。

> 原计划的 F2 纯前端收尾（登录 401 文案、全局 503 文案、管理员入口按角色）已并入 M7 前端（M7-F6），不单独占用 F 编号。v7/v8 像素级视觉还原已于 2026-11-12 完成（[报告](handoff/2026-11-12-pixel-alignment-report.md)）；服务端偏好同步仍待后续（需后端接口）。

## 3.1 PA-1 第一次向原型靠拢（横切，已完成 2026-11-11）

> 目标：在 M7–M9 后端未交付的前提下，只把已实现功能的**结构与主交互**拉回 v7/v8 定稿原型；不新增依赖新后端的功能。规划见 [第一次靠拢规划](superpowers/plans/2026-11-11-prototype-alignment-phase1.md)。

- [x] **单侧栏**：`AppLayout` 一套 288px 侧栏（品牌 / 新建会话 / 导航 / 会话搜索与列表 / 账号），所有页面常驻；折叠为 56px 图标栏；≤900px 抽屉内同样可切换会话（修复原移动端会话不可达）。
- [x] **对话内审批**：侧栏「审批」与 `/approvals` 路由、页面、命令面板项全部删除；对话内审批卡是唯一决策入口；待审批横幅/状态胶囊/恢复横幅改为「定位审批卡」。
- [x] **运行轨迹常驻**：>1180px 右侧常驻 280px 面板；≤1180px 抽屉；内容拆为 `RunTracePanel` 复用。
- [x] **设置页长滚动**：账号 / 个人能力 / 模型 / 界面 / 安全与审计 / 关于，锚点平滑滚动 + 滚动高亮；修改密码接通 `POST /auth/change-password`。
- [x] **对话内还原**：过程摘要（思考/步数/远程智能体/审批）、检索与 MCP 独立色卡、状态胶囊定位、对话内 Agent 输出抽屉；审批卡文案改「批准并执行」。
- [x] 文档与文案同步：pages/README/prototypes 与本路线图；工作流 stage `M5+`→`M9`。

验收：`pnpm test`（新增 ProcessTimeline/ToolCard 用例）、`pnpm type-check`、`pnpm e2e`（含移动端会话可达、常驻轨迹 axe）、1440/1280/1100/390 截图对照。

> 阶段 2 已于 2026-11-12 完成：管理台 v8 七页、工作流编辑器/CRUD/运行历史、续流/事件回放/RBAC/审批 5 字段、v7/v8 像素级视觉定稿均已落地。

## 4. 原 X 系列：已升级为 M8 / M9

| 原编号 | 原内容 | 现状 |
|---|---|---|
| X1 | 工作流（后端未立项） | **升级为 M9**：后端 2026-11-11 立项轻量步骤模板 MVP，前端 `/workflows` 骨架 + mock 升级为真实页面 |
| X2 | 完整管理控制台（`/api/v1/admin/*` 404） | **升级为 M8**：后端立项用户/角色、系统项、概览；前端七页在位，角色/菜单/字典只读 |

历史交接文档（`docs/handoff/workflows.md`、`docs/handoff/admin-console.md`）中的建议切片仍然有效，但编号与范围以本文 M8/M9 为准。

## 5. 契约前置与联调门禁

| 里程碑 | 开工前必须冻结的契约 | 当前事实 | 前端动作 |
|---|---|---|---|
| M3 | 不适用（已取消） | 仅出站 A2A Client | 无 |
| M4 | 知识库端点；citations；`knowledge_categories`；能力开关 | 已实现并联调 | 按实际契约消费 |
| M5 | 审批列表/详情/决定；审计；平台密钥；429；`run.interrupted`/`run.resumed` | 已交付并联调 | 已消费；RBAC 403 移入 M7 |
| M6 | 无新增业务契约；`/readyz`、Trace ID、503 | 后端已完成；单实例 | 已收口；增量续流移入 M7 |
| **M7** | `RunEventOut.event`；`GET /runs/{id}/stream?after_seq=`；agents/tasks 写接口 403；`approval.required` 5 字段；`authorization_url` 白名单 | 已完成（2026-11-11） | 已消费并真实联调；`smoke:m7` 48 项 + `test:real` M7 5 例 |
| **M8** | `/admin/users*`、`/admin/overview`、`/admin/settings/instruction`、`/admin/skills*`、`/admin/mcp/servers*`、`/admin/agents*` | 已交付（2026-11-11）；`smoke:m8` 69/69 通过（2026-11-16） | 七页已消费；角色/菜单/字典三页只读（无契约） |
| **M9** | `workflows` CRUD/启停、`workflow_runs`、`chat/stream.workflow_id`、`workflow.step`、`capabilities.workflows=true` | 已交付（2026-11-12）；以 [`docs/api.md`](api.md) §13.7 已实装契约为准 | 已消费：`workflowsApi` 七方法 + E2E/smoke 全绿 |

## 6. 待决策

> **2026-11-16 治理决策**：已选 **路径 B（缩范围 + 补真实数据 + 修前端交互）**，有效期 3 个月（2027-02-16 复核）；原「M8 无契约页」等议题按缩范围结论关闭，正式接受项见[接受清单](handoff/2026-11-13-accepted-deviations.md)，A 路径触发条件见[治理决策 ADR](superpowers/specs/2026-11-16-governance-decision.md)。下表保留仍待决策的议题。

| 议题 | 选项 | 当前结论/倾向 | 影响 |
|---|---|---|---|
| M8 无契约页（角色权限/菜单/字典） | 只读内置数据 / 等后端补契约 / 前端 mock 可编辑 | **只读 + 明确提示**（七页在位，但拒绝假 CRUD；2026-11-16 已按 B 路径正式标注目标形态） | 若要求可编辑，需后端另立项（A 路径，见 ADR） |
| M9 编辑器形态 | 线性步骤列表 / 拖拽画布 | **线性列表**（后端 MVP 非目标） | 画布列 F3 候选 |
| 服务端偏好同步 | 并入 M8 / 等后端接口 / 不做 | 等后端接口；M8 后端未包含 | 设置页偏好仍本地存储 |
| 真实 LLM key 取证 | 等 key / fake 模型 | 等用户配置；不伪造真实长流证据 | M7 续流真实 HTTP 证据 |
| 多实例 SSE | 粘性会话 / Redis 事件总线 / 前端轮询 | 后端单实例；候选 M10+，需求触发 | 扩容前不启动 |
| 真实后端 E2E | mock 构建 / 双后端模式 | 维持 mock 构建（不提供「只改 baseURL」的假模式） | 真实链路靠 `smoke:real`/`test:real` |
| UI 库 | Element Plus / Naive UI | **Element Plus（已定）** | 不再重复评估 |
| 工作流定位 | 轻量步骤模板 / 不落地 | **M9 轻量步骤模板**（后端已立项） | 按 M9 实现 |

## 7. 变更记录

- **2026-11-16（文档口径修正 + 治理决策落地）**：用户拍板路径 B（前端 + 文档全量，后端只读核对）。统一「完成」口径为契约先行 / 前端完成 / 联调完成三档；修正 Doc1–Doc5（README、原型索引、路线图单测口径、交接包、MessageBubble 文案）；统一 v8 表述为「七页在位；角色/菜单/字典只读；系统设置为能力配置 + 平台信息（只读）形态」；新增[治理决策 ADR](superpowers/specs/2026-11-16-governance-decision.md)、[接受清单](handoff/2026-11-13-accepted-deviations.md)、[文档修订记录](handoff/2026-11-16-doc-sync.md)、[整改报告](handoff/2026-11-16-gap-remediation-report.md)与[30 项关闭台账](handoff/assets/2026-11-16-gap-closure.csv)；`smoke:m8` 69/69 真实后端留档（[记录](handoff/2026-11-16-m8-smoke.md)）。最终门禁：**561 passed / 88 files（2026-11-16 23:52）**、E2E **44 passed + 1 skipped**、axe 10 个扫描面 0、`pnpm build` 通过。
- **2026-11-12（M9 前端）**：M9 前端工作流完成：列表卡片化、线性步骤编辑器（五类参数表单 + 校验）、运行历史页、对话接入（chip 预选 + `workflow_id` 请求 + `workflow.step` 步骤卡）、契约/类型/mock 收口；后端 T1–T9 已交付，`smoke:m9` 67 项真实后端全绿，E2E 主链路与 `workflows=false` 门控 2 例随全量 42 例通过；顺带修复 mock 会话身份不持久导致 M8 管理台 E2E 7 例失败的历史债务。详见[M9 前端交付报告](handoff/2026-11-12-m9-workflow-frontend-report.md)。

- **2026-11-11（M7 前端）**：M7 前端适配完成并真实联调：`runsApi.stream` 续流优先重连、事件回放 `event` 补卡、agents/tasks 写入口按管理员显隐、审批 5 字段/预览、授权链接白名单容错、登录 401 与 503 文案、Nginx 续流 location 与静态断言。门禁 `pnpm test` 325 例、`e2e` 28 例、`size`、`verify:nginx` 全绿；真实证据 `smoke:m7` 48 项 + `test:real` M7 5 例；详见[M7 前端交付报告](handoff/2026-11-11-m7-frontend-report.md)。
- **2026-11-11（PA-1 原型靠拢）**：第一次向 v7/v8 原型靠拢：单侧栏、删除审批页改为对话内审批、运行轨迹常驻右栏、设置页长滚动 + 修改密码、过程摘要/色卡/Agent 输出抽屉；详见 §3.1。
- **2026-11-11（M7–M9 对齐）**：后端新增 M7 契约补齐与安全收口、M8 管理台、M9 工作流立项；前端新增 M7 前端适配、M8 管理台（七页，角色/菜单/字典只读）、M9 工作流；X1/X2 升级为 M9/M8；原 F2 纯前端收尾并入 M7；M6 后端状态改已完成；文档同步 README/api/pages/architecture/development/handoff；设计见[对齐设计](superpowers/specs/2026-11-11-m7-m9-frontend-alignment-design.md)。
- **2026-11-11（F1 前端）**：F1 体验与可访问性完成：虚拟滚动、Markdown LRU 缓存、三态统一、⌘K 命令面板、可访问性、消息密度偏好与设置页「界面」分区。服务端偏好同步仍待后续。
- **2026-11-12（像素级对齐）**：v7 六页 + v8 管理台七页按定稿原型重做呈现层，业务逻辑不变；475 单测、42 E2E、axe 0 违规。报告见 [2026-11-12-pixel-alignment-report](handoff/2026-11-12-pixel-alignment-report.md)。
- **2026-11-11（M6 前端）**：前端 M6 生产化完成：分包与体积门禁、生产 mock 双层门禁、SSE 断线自动重连（回填 conversation_id + lastSeq 去重）、诊断抽屉与 Web Vitals、Playwright E2E 10 例 + CI、Nginx SSE 配置与容器内对照实测。
- **2026-11-11**：M5 前端完成并对接后端交付：审批中心（PA-1 后改为对话内审批并删除页面）、多审批与超时语义、审计查询、平台密钥、429/遮罩/外链等安全 UX；记录事件回放无事件名、写操作 RBAC 未落地、LLM 占位导致审批恢复无真实 HTTP 证据三项缺口（M7 承接）。
- **2026-11-10（需求变更）**：A2A 能力边界收缩为**仅出站**。M3「A2A 入站」取消（保留编号空位），设置页「A2A 端点」分区整块移除，F1 并行范围收窄为 M4–M6。
- **2026-11-10**：与后端 M0–M6 语义对齐。M3 由「审批」改为「A2A 入站前端配套」；M5 由「体验与可访问性」改为「审批与安全加固」；体验项移入 F1；工作流/完整管理台移入 X1/X2。
- **2026-11-10（代码收尾）**：模型/推理选择随 `chat/stream` 发送；设置页 A2A 按 `a2a.enabled` 门控；新增 4 个单测。
- 旧版 M3「审批」中的已完成项（审批卡、同一流恢复）归入 M5 的「提前交付」；旧版 M5「体验」中的未完成项移入 F1。
