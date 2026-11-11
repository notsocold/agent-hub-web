# 前端路线图（与后端 agent-hub 对齐）

> 对齐基线：后端 [`agent-hub/docs/roadmap.md`](../../../PythonProjects/agent-hub/docs/roadmap.md) 的 M0–M9（2026-11-11）。
>
> **2026-11-11 后端新增立项**：M7 契约补齐与安全收口、M8 管理台后端、M9 工作流后端。前端按同名同义原则新增 **M7 前端适配**、**M8 前端管理台（v8 全量）**、**M9 前端工作流**；原 X1/X2 不再作为「未立项」保留。
>
> 本版（2026-11-11）同时修正了 M6 后端状态（已完成）、F1 收尾状态与测试口径，并把原计划的 F2 纯前端收尾并入 M7 前端。规划详情见[对齐设计](superpowers/specs/2026-11-11-m7-m9-frontend-alignment-design.md)。
>
> 历史说明：旧版前端 M3「审批」、M5「体验与可访问性」已作废；M3「A2A 入站」因 2026-11-10 需求变更取消（服务仅出站），保留编号空位。

## 0. 对齐规则

1. **M 编号同名同义**：前端 M 编号与后端一一对应，只描述同一里程碑下的前端交付；不再单独定义一套里程碑。
2. **纯前端横切工作进 F 系列**：体验、可访问性、性能、视觉还原不占用 M 编号；F1 已完成，原 F2 收尾项并入 M7，未来纯前端项按需新立 F3+。
3. **后端已立项的工作升级为 M 编号**：X1 → M9、X2 → M8；历史文档保留 X 编号作为追溯，新文档一律用 M8/M9。
4. **契约先行，真实联调才算完成**：状态口径为 `未开始` → `契约先行` → `实现中` → `已联调`；mock 通过只算「实现中」。
5. **状态以证据为准**：后端状态看 `agent-hub/docs/feedback/` 与 OpenAPI；后端 roadmap 的勾选可能滞后，本仓库不替后端维护完成标记。
6. **不伪造后端能力**：无契约页面只做只读/内置数据呈现并显式提示「后端未提供接口」，不做本地假 CRUD、不显示假成功。

## 1. 里程碑总览

| 编号 | 后端目标 | 前端目标 | 后端状态（2026-11-11） | 前端状态（2026-11-11） | 前端验收/门禁 |
|---|---|---|---|---|---|
| M0 | 项目骨架 | 工程骨架 | 已完成 | 已完成 | 构建通过 |
| M1 | 对话最小闭环 | 登录 + 对话闭环 | 已完成 | 已联调 | `smoke:real` 97 项 |
| M1.5 | 个人能力层 | 个人能力层前端 | 已完成 | 已联调 | `smoke:m15` 68 项 |
| M2 | A2A 出站 | 智能体 + 任务 | 已完成 | 已联调 | 假 Agent + `test:real` |
| M3 | A2A 入站 | —（已取消） | 取消（需求变更：仅出站） | 取消（设置页入站分区已移除） | 不适用 |
| M4 | 知识库 RAG | 知识库页 + 引用 | 已完成（2026-11-10） | 已联调（2026-11-10） | `smoke:m4` 41/40 项 + `test:real` M4 3 例 |
| M5 | 审批与安全加固 | 审批中心 + 权限/安全 UX | 已完成（2026-11-10） | 已联调（2026-11-11） | `smoke:m5` 163 项 + `test:real` M5 3 例 |
| M6 | 生产化与可观测 | 生产化 + E2E + 断线续传 | 已完成（2026-11-11，582 测试） | 已完成（2026-11-11） | `pnpm size` / `pnpm e2e` / `pnpm verify:nginx` |
| **M7** | **契约补齐与安全收口** | **续流 + 权限边界 + 安全 UX** | **已立项（2026-11-11），未开始** | **未开始**（可先做契约类型/mock/纯前端收尾） | 单测 + mock 续流 + `test:real` M7 用例 |
| **M8** | **管理台后端（原 X2）** | **管理控制台 v8 全量** | **已立项（2026-11-11），未开始** | **未开始**（依赖 M8 后端） | 七页 E2E + `smoke` 管理端用例 |
| **M9** | **工作流后端（原 X1）** | **工作流管理 + 运行** | **已立项（2026-11-11），未开始（先 spike）** | **未开始**（依赖 M9 spike 与契约） | 3 步模板联调 + `workflow.step` |
| F1 | —（横切） | 体验与可访问性 | — | 已完成（2026-11-11，本地未推送） | `pnpm test` / `pnpm e2e` / axe |
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

- [x] 对话内审批卡升级：多审批、实时过期倒计时、payload 预览与敏感字段遮罩、逐卡批准/拒绝。
- [x] M5 事件契约：`approval.required` → `run.interrupted`（非终态，SSE 保持）→ 决定 → `run.resumed` → 后续 delta → `message.done`；兼容旧 `finish_reason=interrupted`。
- [x] 审批决定语义：`resumed=true` / `本轮还有其他审批待处理` / `运行已结束` / 409 `approval_expired`、`approval_already_decided` 分别提示，不再把正常语义当失败。
- [x] 审批超时：`message.done(finish_reason=canceled, reason=approval_timeout)` 明确提示「审批超时，本轮已取消」，过期审批不可再操作。
- [x] 审批中心 `/approvals`：5 键统计、待处理/历史 Tab、状态筛选、会话/运行 query 过滤、详情抽屉、批准/拒绝（备注 ≤500）、游标分页、过期禁用。
- [x] 审计查询（设置页「安全与审计」）：普通用户 `GET /audit-logs` 自查；管理员可切 `GET /admin/audit-logs` 全局并额外按 actor/resource_id 筛选。
- [x] 平台密钥（仅管理员）：`/admin/secrets` 列表、创建、轮换、启停、删除；503 `secret_store_unavailable` 与 403 分开提示；永不回显明文。
- [x] 安全 UX：聊天/登录/注册 429 `retry_after_seconds` 倒计时；审批 payload 与审计 detail 敏感键默认遮罩；Markdown 外链域名确认；401 会话过期提示。
- [x] 断线恢复：轮询 run 状态 + 进入会话时用 pending 审批补卡 + 终态刷新历史；**不**做增量续流（M7 补已落库事件回放；`message.delta` 不落库，断线窗口文本仍靠终态刷新）。

验收证据：`smoke:m5` 163 项、`test:real` M5 3 例、`pnpm test` 180（当轮）、`docs/handoff/2026-11-11-m5-frontend-alignment.md`。

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

### M7 契约补齐与安全收口（后端已立项，前端未开始）

后端目标（M7）：`GET /runs/{id}/events` 补 `event` 字段；新增 `GET /runs/{id}/stream?after_seq=` SSE 续流端点；agents/tasks 写接口收紧到管理员（403）；`approval.required` 补 5 个展示字段；A2A `authorization_url` 白名单；契约文档/OpenAPI/handoff 同步。无迁移。

前端范围（详见[对齐设计](superpowers/specs/2026-11-11-m7-m9-frontend-alignment-design.md) §3）：

- [ ] M7-F1 续流：`src/api/runs.ts` 新增 `openRunStream`（fetch + Bearer + `after_seq`）；`chat` store 重连改为「续流优先、失败回退轮询」；`400 replay_too_large` 回退分页。
- [ ] M7-F2 事件回放：`RunEvent.event` 进入类型与 reducer；支持按事件名重放补卡；按 `seq` 去重。
- [ ] M7-F3 权限边界：agents/tasks 写入口按 `role=admin` 显隐/禁用；403 `forbidden` 统一文案；管理员入口按角色。
- [ ] M7-F4 审批字段：`approval.required` 的 `tool_display_name/executor/target/side_effect/payload_preview` 直接渲染；详情请求保留兜底。
- [ ] M7-F5 授权链接：跟随后端白名单，非法/缺失链接显示「授权链接不可用」；补容错用例。
- [ ] M7-F6 纯前端收尾：登录 401 文案（不触发 refresh）、全局 503 统一文案、管理员入口（与 F3 合并验收）。
- [ ] M7-F7 契约与门禁：类型/mock/fixtures/OpenAPI 手写类型同步；单测 + mock 续流 E2E；后端落地后 `test:real` M7 用例。
- [ ] M7-F8 部署配置：`deploy/nginx.conf` 为 `/api/v1/runs/{id}/stream` 增加 SSE location（`proxy_buffering off` / `proxy_cache off` / `gzip off` / 长读超时），`deploy/README.md` 与 `pnpm verify:nginx` 同步；否则生产续流会被缓冲或 60s 截断。

启动条件：后端 M7 契约冻结（以 handoff/OpenAPI 为准）。**前端可先做**：类型、mock、续流状态机单测、B-1/B-2/B-3 纯前端修复。

验收：

- 断线后从 `lastSeq` 续流：已落库事件回放 + 实时事件不重复；断线窗口内未落库的 `message.delta` 不承诺补齐，终态 `refreshHistory()` 仍是必需步骤；
- `400 replay_too_large` 正确降级；终态关闭并 `refreshHistory()`；
- 普通用户写 agents/tasks 入口不可见、直接调用 403 文案正确；管理员成功；
- 审批卡直接用事件字段渲染（兜底请求不触发）；
- `pnpm test` / `type-check` / `lint` / `build` / `e2e`（mock）通过；真实联调待后端 M7 落地。

风险：续流端点单实例；排水不拦截新流；生产 Nginx 未给续流端点配 SSE location 会导致逐帧失效或 60s 截断（M7-F8 必须与功能同批交付）；真实 LLM key 占位导致真实增量续流证据受限；续流与旧轮询需状态机互斥。

### M8 管理台后端 / 前端管理台（后端已立项，前端未开始）

后端目标（M8，原 X2）：用户列表/详情/角色与状态调整（不能修改自己的 role、不能禁用/降级最后一个 admin（自己能否改 status 以 M8 handoff 为准））；平台指令、系统技能、系统 MCP、全局 Agent 的查询与管理；`GET /admin/overview` 只读统计；管理端审计与 403 契约。预计无迁移。

前端范围（v8 原型全量，详见对齐设计 §4）：

- [ ] M8-F1 路由与外壳：`/admin` 独立布局 `AdminLayout`（深墨侧栏 + 七页），`meta.requiresAdmin`，非 admin 无权限页。
- [ ] M8-F2 概览：`GET /admin/overview` 计数卡片。
- [ ] M8-F3 用户：`GET /admin/users`、`GET /admin/users/{id}`、`PATCH /admin/users/{id}`，分页/搜索/角色/状态；前端禁用「修改自己的 role」「禁用/降级最后一个 admin」，后端校验兜底。
- [ ] M8-F4 角色权限：**只读**两角色说明 + 用户角色分布 + 内置能力矩阵；不做新建角色/权限编辑。
- [ ] M8-F5 菜单：**只读**前端路由菜单树；标注「后端无菜单配置接口」。
- [ ] M8-F6 字典：**只读**前端内置枚举（任务状态/审批风险/知识库状态等）；标注「后端无字典管理接口」。
- [ ] M8-F7 审计：复用管理员审计面板（M5 已有）；若 M8 handoff 的 `GET /admin/audit-logs` 扩展了过滤字段，补对应 UI 与参数。
- [ ] M8-F8 系统设置：平台指令、系统技能、系统 MCP、全局 Agent、平台密钥；写操作二次确认 + 审计。
- [ ] M8-F9 契约/类型/mock：`src/api/admin.ts`、`src/types/admin.ts`、mock 与 fixtures。

依赖：M7-2 RBAC 先落地；V8 全量中角色权限/菜单/字典三页**无后端契约**，按只读 + 明确提示交付，不做假 CRUD。若要求可编辑，需后端另立项（候选 M10+）。

验收：管理员可完成用户/系统项操作且关键写操作有审计；普通用户访问 `/admin/*` 403/无权限页；七页 axe 无 critical/serious；`smoke` 管理端用例通过（M8 后端后）。

### M9 工作流后端 / 前端工作流（后端已立项，前端未开始）

后端目标（M9，原 X1）：`workflows` / `workflow_runs` 表；五类步骤（`knowledge_search` / `tool` / `a2a` / `approval` / `answer`）；CRUD/启停/运行入口（`chat/stream.workflow_id`）/运行历史；`workflow.step` 事件；先做 1 天 spike，不引入外部引擎，不做 DAG/并行。

前端范围（详见对齐设计 §5）：

- [ ] M9-F1 列表页：名称、描述、步骤数、启用状态、归属、更新时间；启停/删除/运行。
- [ ] M9-F2 线性编辑器：步骤增删/排序（上移下移），五类步骤参数表单；保存前校验；**不做拖拽画布**。
- [ ] M9-F3 运行历史：`GET /workflows/{id}/runs` + 关联 run 详情。
- [ ] M9-F4 对话接入：`capabilities.workflows=true` 时输入栏「+ → 工作流」开放；请求带 `workflow_id`；时间线渲染 `workflow.step` 步骤卡。
- [ ] M9-F5 契约/类型/mock：`src/types/workflow.ts`、`src/api/workflows.ts` 由骨架升级为真实契约；mock 同步。

启动条件：M9 spike 通过 + 契约冻结（`workflows` CRUD、`workflow_id`、`workflow.step`、五类步骤参数 schema），且后端显式把 `capabilities.workflows` 置 `true`（当前恒 `false`）。spike 不通过或上述任一项未冻结，不启动实现。

验收：3 步模板（检索 → A2A → 审批）可保存并运行；`workflow.step` 可见；取消/失败/审批超时语义与现有 run 一致；`workflows=false` 时入口置灰。

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

> 原计划的 F2 纯前端收尾（登录 401 文案、全局 503 文案、管理员入口按角色）已并入 M7 前端（M7-F6），不单独占用 F 编号。v7 像素级视觉还原与服务端偏好同步仍待后续（后者需后端接口）。

## 4. 原 X 系列：已升级为 M8 / M9

| 原编号 | 原内容 | 现状 |
|---|---|---|
| X1 | 工作流（后端未立项） | **升级为 M9**：后端 2026-11-11 立项轻量步骤模板 MVP，前端 `/workflows` 骨架 + mock 升级为真实页面 |
| X2 | 完整管理控制台（`/api/v1/admin/*` 404） | **升级为 M8**：后端立项用户/角色、系统项、概览；前端 v8 全量七页（无契约三页只读） |

历史交接文档（`docs/handoff/workflows.md`、`docs/handoff/admin-console.md`）中的建议切片仍然有效，但编号与范围以本文 M8/M9 为准。

## 5. 契约前置与联调门禁

| 里程碑 | 开工前必须冻结的契约 | 当前事实 | 前端动作 |
|---|---|---|---|
| M3 | 不适用（已取消） | 仅出站 A2A Client | 无 |
| M4 | 知识库端点；citations；`knowledge_categories`；能力开关 | 已实现并联调 | 按实际契约消费 |
| M5 | 审批列表/详情/决定；审计；平台密钥；429；`run.interrupted`/`run.resumed` | 已交付并联调 | 已消费；RBAC 403 移入 M7 |
| M6 | 无新增业务契约；`/readyz`、Trace ID、503 | 后端已完成；单实例 | 已收口；增量续流移入 M7 |
| **M7** | `RunEventOut.event`；`GET /runs/{id}/stream?after_seq=`；agents/tasks 写接口 403；`approval.required` 5 字段；`authorization_url` 白名单 | 已立项，契约草案见后端立项 §3 | 先冻结类型/mock；后端 handoff 后联调 |
| **M8** | `/admin/users*`、`/admin/overview`、`/admin/settings/instruction`、`/admin/skills*`、`/admin/mcp/servers*`、`/admin/agents*` | 已立项，未开始；依赖 M7-2 | 无契约页只读；有契约页等 M8 后端 |
| **M9** | `workflows` CRUD/启停、`workflow_runs`、`chat/stream.workflow_id`、`workflow.step`、`capabilities.workflows=true` | 已立项，未开始；先 spike | 骨架 + mock 保持；契约冻结后再实现 |

## 6. 待决策

| 议题 | 选项 | 当前结论/倾向 | 影响 |
|---|---|---|---|
| M8 无契约页（角色权限/菜单/字典） | 只读内置数据 / 等后端补契约 / 前端 mock 可编辑 | **只读 + 明确提示**（v8 全量页面，但拒绝假 CRUD） | 若要求可编辑，需后端另立项 |
| M9 编辑器形态 | 线性步骤列表 / 拖拽画布 | **线性列表**（后端 MVP 非目标） | 画布列 F3 候选 |
| 服务端偏好同步 | 并入 M8 / 等后端接口 / 不做 | 等后端接口；M8 后端未包含 | 设置页偏好仍本地存储 |
| 真实 LLM key 取证 | 等 key / fake 模型 | 等用户配置；不伪造真实长流证据 | M7 续流真实 HTTP 证据 |
| 多实例 SSE | 粘性会话 / Redis 事件总线 / 前端轮询 | 后端单实例；候选 M10+，需求触发 | 扩容前不启动 |
| 真实后端 E2E | mock 构建 / 双后端模式 | 维持 mock 构建（不提供「只改 baseURL」的假模式） | 真实链路靠 `smoke:real`/`test:real` |
| UI 库 | Element Plus / Naive UI | **Element Plus（已定）** | 不再重复评估 |
| 工作流定位 | 轻量步骤模板 / 不落地 | **M9 轻量步骤模板**（后端已立项） | 按 M9 实现 |

## 7. 变更记录

- **2026-11-11（M7–M9 对齐）**：后端新增 M7 契约补齐与安全收口、M8 管理台、M9 工作流立项；前端新增 M7 前端适配、M8 管理台（v8 全量，无契约三页只读）、M9 工作流；X1/X2 升级为 M9/M8；原 F2 纯前端收尾并入 M7；M6 后端状态改已完成；文档同步 README/api/pages/architecture/development/handoff；设计见[对齐设计](superpowers/specs/2026-11-11-m7-m9-frontend-alignment-design.md)。
- **2026-11-11（F1 前端）**：F1 体验与可访问性完成：虚拟滚动、Markdown LRU 缓存、三态统一、⌘K 命令面板、可访问性、消息密度偏好与设置页「界面」分区。本地提交未推送；服务端偏好同步与 v7 像素级视觉还原仍待后续。
- **2026-11-11（M6 前端）**：前端 M6 生产化完成：分包与体积门禁、生产 mock 双层门禁、SSE 断线自动重连（回填 conversation_id + lastSeq 去重）、诊断抽屉与 Web Vitals、Playwright E2E 10 例 + CI、Nginx SSE 配置与容器内对照实测。
- **2026-11-11**：M5 前端完成并对接后端交付：审批中心、多审批与超时语义、审计查询、平台密钥、429/遮罩/外链等安全 UX；记录事件回放无事件名、写操作 RBAC 未落地、LLM 占位导致审批恢复无真实 HTTP 证据三项缺口（M7 承接）。
- **2026-11-10（需求变更）**：A2A 能力边界收缩为**仅出站**。M3「A2A 入站」取消（保留编号空位），设置页「A2A 端点」分区整块移除，F1 并行范围收窄为 M4–M6。
- **2026-11-10**：与后端 M0–M6 语义对齐。M3 由「审批」改为「A2A 入站前端配套」；M5 由「体验与可访问性」改为「审批与安全加固」；体验项移入 F1；工作流/完整管理台移入 X1/X2。
- **2026-11-10（代码收尾）**：模型/推理选择随 `chat/stream` 发送；设置页 A2A 按 `a2a.enabled` 门控；新增 4 个单测。
- 旧版 M3「审批」中的已完成项（审批卡、同一流恢复）归入 M5 的「提前交付」；旧版 M5「体验」中的未完成项移入 F1。
