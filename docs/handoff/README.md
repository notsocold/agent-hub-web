# Agent Hub 原型 → 后端交接包

- 交接版本：v1.0
- 日期：2026-11-08
- 原型基线：`ui-v7.html`、`ui-v7-pages.html`、`ui-v8-admin.html`（2026-11-08 自检后版本）
- 后端基线：[agent-hub 文档](../../../../PythonProjects/agent-hub/docs/api.md)（M0，接口均为设计稿）
- 前端代码基线：M0 结构初始化，`src/` 尚无页面与请求层
- 文档性质：**设计交接，不是实现**；本包只描述契约、任务和验收，不包含后端或前端业务代码

> **2026-11-10 编号对齐说明**：本包是 2026-11-08 的提案，文中的「M5+」不是后端路线图的 M5。当前里程碑以 [../roadmap.md](../roadmap.md) 为准：M3=A2A 入站、M5=审批与安全加固；工作流/完整管理端为 X1/X2 待立项。包内契约、fixtures 与工作包仍然有效，字段级方案以 [`contract-delta.md`](contract-delta.md) 为准；文中的能力缺口以 2026-11-08 为基线，M1.5/M2 已补齐附件、审批、推理等，现状见路线图。

---

## 0. 一分钟版本

原型已经把产品形态定到可评审的程度，后端仍处于 M0。本次交接只解决一件事：**把原型界面隐含的数据、状态和动作，翻译成后端可以直接排期实现的契约增量与验收样例**。

先记住八条结论：

1. **M1 主链路基本有契约，但聊天流缺一个关键事件**：前端在流式开始时就拿到 `run_id`，否则「停止」按钮无法工作。需要新增 `run.started`（或响应头 `X-Run-ID`）。
2. **模型 / 推理等级、思考摘要、引用来源、附件上传**是原型里最显眼的四类「能点但无后端」控件，需要字段与事件扩展；后端若暂不支持，前端按 [`contract-delta.md`](contract-delta.md) 第 14 节降级，不要删除控件。
3. **智能体页需要「先预览 Agent Card、再确认注册」两段式**，现有 `POST /agents` 一步完成，建议增加 `POST /agents/preview`。
4. **任务页需要 `input_required` 与 `auth_required` 两个状态的后续动作**：补充信息、前往授权、拒绝。现有契约只有取消。
5. **工作流是原型新增概念，后端没有表/API，且架构明确不做通用 BPMN 编排器**。建议按「轻量步骤模板」落地，先决策再实现；不建议直接删除，因为这是用户明确要求保留的能力。
6. **v8 管理控制台大部分页面无契约**。建议拆成 X2 的分阶段目标，先做「概览 + 审计查询 + 用户只读 + 已有系统设置」，角色/菜单/字典后置。
7. **审批/补充信息中断时，SSE 是否保持连接没有定义**。如果中断即关流，批准后的输出没有承载连接；建议保持流 + 15 分钟超时，或补充续流端点（D8）。
8. **附录样例可直接当 mock 与契约测试种子**：`fixtures.md` 里的 SSE 序列、列表响应、任务状态样例，前后端可以各自跑起来对齐。

> 如果你只读一份文档：先读本文件第 4、5 节，再读 [`work-packages.md`](work-packages.md)；写接口时查 [`contract-delta.md`](contract-delta.md)。

---

## 1. 交接范围

### 1.1 原型资产

| 文件 | 覆盖 | 本包中的定位 |
|---|---|---|
| [`ui-v7.html`](../prototypes/ui-v7.html) | 对话工作台：会话侧栏、过程时间线、思考卡、工具/技能/MCP/A2A 卡、审批卡、运行轨迹、Agent 抽屉、输入栏「+」、模型/推理等级、`@` 文件选择 | M1–M2 的主要验收对象 |
| [`ui-v7-pages.html`](../prototypes/ui-v7-pages.html) | 工作流、智能体、任务、知识库、设置（含个人能力四区块） | M2–M4 的页面规格（工作流部分属 X1） |
| [`ui-v8-admin.html`](../prototypes/ui-v8-admin.html) | 概览、用户、角色权限、菜单、字典、审计、系统设置 | X2 目标形态（完整管理台），不是 M5 |

配套设计文档：

- [页面规划](../pages.md)：M1–M6 目标规格与交互；
- [API 对接指南](../api.md)：前端消费方式、SSE 接入、错误处理；
- [原型自检报告](../prototypes/review-2026-11-08.md)：本轮已修复问题与契约缺口；
- [原型索引](../prototypes/README.md)：入口与使用方式。

### 1.2 不在本次交接范围

- Vue 页面、请求层、Pinia store、组件库选型等前端实现；
- 视觉像素级还原、设计系统 token、响应式细节；
- 后端代码、数据库迁移、部署与运维；
- v1–v6 历史原型（只用于追溯，不再迭代）。

### 1.3 交接原则

1. **原型是需求证据，不是接口规范**。原型中的演示数据、短 ID、相对时间不能直接当契约。
2. **后端已有设计优先**。本包只写「相对 `agent-hub/docs/api.md` 的增量」，不重复抄写已有端点。
3. **不可实现项保留为设计目标**。后端暂不支持的控件不删，按降级矩阵隐藏或置灰，并标注风险。
4. **契约源最终收敛到 OpenAPI**。本包是 OpenAPI 更新前的过渡说明；实现时以 OpenAPI 为准，并回写本包。

---

## 2. 阅读路径

| 角色 | 建议顺序 | 关注点 |
|---|---|---|
| 后端负责人 / 排期 | 本文件 → [`work-packages.md`](work-packages.md) → [`contract-delta.md`](contract-delta.md) | 先做哪几个包、依赖关系、哪些要拍板 |
| 接口开发 | [`contract-delta.md`](contract-delta.md) → [`fixtures.md`](fixtures.md) → [`work-packages.md`](work-packages.md) | 字段、状态机、错误码、样例响应 |
| 工作流开发 | [`workflows.md`](workflows.md) → [`contract-delta.md`](contract-delta.md) 第 4 节 | 轻量步骤模板的边界与执行语义 |
| 管理端开发 | [`admin-console.md`](admin-console.md) → [`work-packages.md`](work-packages.md) 的 BE-13 | 分阶段范围、RBAC 模型 |
| 前端联调 | [`fixtures.md`](fixtures.md) → [`contract-delta.md`](contract-delta.md) 第 14 节 | mock 数据、降级策略、事件顺序 |
| 评审 / 产品 | 本文件第 4–5 节 → [`workflows.md`](workflows.md) 第 2 节 → 原型走查 | 范围与关键决策 |

---

## 3. 交付物

| 文档 | 内容 | 什么时候用 |
|---|---|---|
| [`contract-delta.md`](contract-delta.md) | 核心工作台与页面所需的字段级契约增量：会话、聊天、运行、审批、智能体、任务、知识库、个人能力、系统信息、数据模型、错误码、降级矩阵 | 写 Pydantic schema / OpenAPI 时 |
| [`workflows.md`](workflows.md) | 工作流的定位选项、轻量步骤模板契约、执行语义、表结构与 API、验收 | 工作流是否立项的决策与实现 |
| [`admin-console.md`](admin-console.md) | v8 管理端的范围分层、RBAC/菜单/字典/审计模型、端点与字段、安全要求 | X2 管理端立项前排期 |
| [`work-packages.md`](work-packages.md) | BE-00–BE-14 工作包、依赖图、优先级、验收标准、Definition of Done | 建 issue、排里程碑、联调验收 |
| [`fixtures.md`](fixtures.md) | 演示数据、SSE 完整序列、关键响应样例、契约测试用例、原型字段映射 | mock、种子数据、契约测试 |

---

## 4. 后端优先做什么

> 详细拆解见 [`work-packages.md`](work-packages.md)。这里只给排序结论。

### 4.1 P0：M1 对话闭环（必须先做）

| 顺序 | 工作包 | 为什么现在做 |
|---|---|---|
| 1 | **BE-00 契约基线** | 统一错误信封、分页、枚举、OpenAPI、fixtures；后面所有包复用 |
| 2 | **BE-01 认证** | 注册/登录/刷新/`me`；管理端与审计也依赖 `role` |
| 3 | **BE-02 会话** | 列表、消息历史、搜索、消息数、待审批标记 |
| 4 | **BE-03 聊天 SSE** | `run.started`、`message.started`、模型/推理字段、用量；工具/引用事件随 M2/M4 |
| 5 | **BE-04 运行与事件** | 取消、`GET /runs/{id}`、`GET /runs/{id}/events`（轨迹页依赖） |
| 6 | **BE-06 系统信息** | 模型菜单、能力开关、关于页都读它 |
| 7 | **BE-05 审批最小切片** | 对话内审批卡与恢复运行；列表页可后置 |

### 4.2 P1：M1.5 个人能力层

- **BE-07 附件上传**：对话附件是高频入口，且独立于知识库上传；
- **BE-08 能力层字段补齐**：现有设计已覆盖接口与 `effective_enabled`/`catalog`，主要补 `write_tools_allowed`、统计、错误信息与响应形状；
- 设置页四区块可以按「指令 → 记忆 → 技能 → MCP」顺序接通。

### 4.3 P2：M2–M4 页面

- **BE-09 智能体**：预览、健康状态、最近检查、最近任务；
- **BE-10 任务**：8 状态、补充信息/授权/拒绝、时间线与统计；
- **BE-11 知识库**：统计、上传状态、重试、重建、检索结果元数据。

### 4.4 P3：X 系列（后端未立项）

- **BE-12 工作流**：X1 待立项，先决策「轻量步骤模板」是否立项；
- **BE-13 管理控制台**：X2 待立项；若后端 M5 提供审计查询，只做审计/审批相关最小集，不按全量管理台排期；
- **BE-14 契约测试与回归**：伴随所有包持续进行。

---

## 5. 需要拍板的八个决策

> 这些决策会影响表结构或接口形状；截至 2026-11-10，D3/D4/D8 已按推荐项落地，其余仍按推荐项保留在类型/降级处，后续以 [../roadmap.md](../roadmap.md) 的待决策表为准。

| ID | 决策 | 选项 | 推荐 | 影响 |
|---|---|---|---|---|
| D1 | 工作流是否作为正式目标形态 | A. 轻量步骤模板；B. 确定性线性执行器；C. 不做 | **A** | 决定 `workflows` 表与执行语义；C 与用户明确要求冲突，不建议 |
| D2 | v8 管理端排期 | A. 全量；B. 最小集（概览/审计/用户只读/系统设置）；C. 后置到 X2 | **C（2026-11-10 对齐）** | 决定 RBAC/菜单/字典是否现在建表 |
| D3 | 模型与推理等级由谁决定 | A. 用户可选，服务端白名单；B. 服务端固定，前端只读 | **A** | 决定 `chat/stream` 字段与 `/system/info.models`；B 时前端隐藏菜单 |
| D4 | 知识库选择用什么字段 | A. `knowledge_categories`；B. 新增 `knowledge_bases` 表；C. 不传，仅提示 | **A** | 决定请求字段与 UI chip 语义；B 成本最高 |
| D5 | 附件存哪里、保留多久 | A. 对象存储 + 30 天；B. 本地磁盘 + 30 天 | **A（本地开发可退 B）** | 决定 `attachments` 表与清理任务 |
| D6 | 任务后续动作用任务级还是运行级 | A. 任务级 `resume/authorize/reject`；B. 全部走 `runs/{id}/resume` | **A**，运行级保留兼容 | 决定任务页按钮与 API；B 丢失任务语义 |
| D7 | 知识库是全局还是按用户 | A. 全局，写操作仅管理员；B. 增加 `owner_user_id`，用户管自己的文档；C. 多知识库 | **B**（若保留普通用户上传）；否则 A | 决定 `knowledge_documents` 是否加 owner 与权限；当前表无 owner |
| D8 | 审批/补充信息中断时 SSE 是否保持 | A. 保持连接 + 超时；B. 中断即关流，新增续流端点 | **A**（单实例最省事） | 决定 BE-03C/BE-04 的连接生命周期；B 需新增 `POST /runs/{id}/stream` 或事件流续传 |

补充说明：

- **D1** 的推荐 A 不是「不做工作流」，而是把它收敛为「有序步骤模板 + 计划提示 + 轨迹记录」，不引入 BPMN 画布或新的图执行引擎；详见 [`workflows.md`](workflows.md)。
- **D2** 的推荐 B 可以让 v8 的大部分页面先有真实数据来源，同时避免在 RBAC 模型未定时返工。
- **D3** 的 A 需要 `/system/info` 返回可选模型与推理等级；后端不支持时返回单元素数组，前端自然退化为只读。
- **D4** 的原型 chip 文案是 `support-kb`（知识库名），但后端只有 `category`；选 A 时 UI 要改成分类名（如「客服」），不要把它当知识库 ID 传。
- **D7** 与原型冲突最大：当前后端 `knowledge_documents` 没有 `owner_user_id`，而原型是普通用户可见的上传/重建入口。必须二选一，不能默认「谁都能重建」。
- **D6** 的 `authorize` 是新增产品能力：现有 A2A 设计只要求「通知管理员更新凭据」；若不做用户级授权，前端隐藏「前往授权」，不要伪造成功。
- **D8** 推荐 A 的原因是前端审批卡与恢复后的输出在同一条时间线上；若选 B，必须同时定义「批准后从哪条连接继续收 token」，不能只返回 `resumed=true`。

---

## 6. 契约变更总览

> 字段级细节见 [`contract-delta.md`](contract-delta.md)；这里只列「变了什么」。

### 6.1 新增端点（核心，不含工作流与管理端）

| 端点 | 用途 | 优先级 |
|---|---|---|
| `POST /api/v1/attachments` | 上传对话附件（multipart），返回附件 ID 与状态 | P1 |
| `GET /api/v1/attachments?conversation_id=` | 「@」选择器复用历史附件（可选） | P2 |
| `POST /api/v1/agents/preview` | 拉取并校验 Agent Card，不落库 | P2 |
| `POST /api/v1/tasks/{id}/resume` | `input_required` 补充信息后继续 | P2 |
| `POST /api/v1/tasks/{id}/authorize` | `auth_required` 完成授权后重试 | P2 |
| `POST /api/v1/tasks/{id}/reject` | 拒绝远程任务 | P2 |
| `GET /api/v1/runs/{id}/events` | 运行事件回放（后端已标「规划」，本次明确字段） | P0 |
| `POST /api/v1/knowledge/documents/{id}/retry` | 失败文档重试 | P3 |
| `PATCH /api/v1/auth/me` | 修改展示名（原型已标注待补） | P2（可并入 M1 末） |
| `POST /api/v1/auth/change-password` | 修改密码（原型已标注待补） | P2（可并入 M1 末） |

工作流与管理端的新端点分别见 [`workflows.md`](workflows.md)、[`admin-console.md`](admin-console.md)。

### 6.2 扩展已有端点（核心）

| 模块 | 增量 |
|---|---|
| `POST /chat/stream` | `model`、`reasoning_effort`、`knowledge_categories`、`workflow_id`、`workflow_version`；上下文互斥校验 |
| SSE | 新增 `run.started`、`message.started`、`reasoning.delta`、`reasoning.done`、`workflow.step`；扩展现有事件字段 |
| `GET /conversations` | `q`、`message_count`、`last_message_preview`、`pending_approval_count`、`stats` |
| `GET /conversations/{id}/messages` | `client_message_id`、`citations`、`attachments`、`artifacts`、`usage`、`error` |
| `GET /runs/{id}` | 模型、推理、用量、首 token、时长、待处理原因、工作流、消息 ID |
| `GET /approvals` | 展示字段（执行方/目标/副作用/风险）、筛选、统计、过期语义 |
| `GET /agents` | 健康延迟、最近检查、最近错误、鉴权提示、最近任务、统计；健康枚举补 `degraded` |
| `GET /tasks` | 8 状态筛选、统计、会话/运行/Agent 关联、时长、可用动作 |
| `GET /knowledge/documents` | 分类/状态/关键字筛选、统计、失败原因、分页 |
| `POST /knowledge/search` | 命中结果补文档标题、分类、块序号、更新时间 |
| `GET /system/info` | 模型目录、推理等级、Embedding、生成参数、A2A 地址、能力开关、限额 |
| 能力层 | `effective_enabled`、`write_tools_allowed`、catalog、估算 token、来源标题、统计 |

### 6.3 新增 SSE 事件（5 个必选）

| 事件 | 作用 | 不做的后果 |
|---|---|---|
| `run.started` | 流开始时给出 `run_id`、`conversation_id`、`user_message_id` | 停止按钮只能等 `message.done`，无法取消 |
| `message.started` | 助手消息 ID 与开始时间 | 增量渲染无法关联消息，思考卡无法定位 |
| `reasoning.delta` | 思考摘要增量 | 只能整段等待，或前端隐藏思考卡 |
| `reasoning.done` | 思考时长、token、摘要 | 思考卡无法显示「12s / 642 tokens」 |
| `workflow.step` | 工作流步骤状态 | 工作流轨迹只能事后查，无法实时 |

可选项：`approval.resolved`（多端同步审批状态）、`conversation.updated`（标题/消息数更新）。

### 6.4 数据模型增量（摘要）

| 类型 | 表 | 说明 |
|---|---|---|
| 新增 | `attachments` | 附件元数据、归属、状态、存储键、过期时间；生成产物也复用该表（`purpose=artifact`） |
| 新增 | `run_events` / `a2a_task_events` | 运行事件回放与任务状态时间线 |
| 新增 | `workflows` / `workflow_versions` / `workflow_run_steps` | 仅在 D1 选 A/B 时 |
| 新增 | `roles` / `permissions` / `role_permissions` / `user_roles` | D2 选择包含 RBAC 的阶段时 |
| 新增 | `menus` / `dictionaries` / `dictionary_items` | 仅在 D2 选 A 时 |
| 扩展 | `conversations` | 消息数、最后消息摘要、待审批数（可计算或冗余） |
| 扩展 | `messages` | `client_message_id`、上下文快照、引用、附件、产物、用量、错误 |
| 扩展 | `runs` | `reasoning_effort`、`workflow_id/version`、`reasoning_tokens`、`first_token_ms`、`duration_ms`、`active_duration_ms` |
| 扩展 | `approvals` | `source`、`executor`、`target`、`side_effect`、`risk` |
| 扩展 | `a2a_tasks` | `input_request`、`auth_request`、`last_event_at`、`duration_ms` |
| 扩展 | `remote_agents` | `last_latency_ms`、`last_error`、`consecutive_failures` |
| 扩展 | `knowledge_documents` | `owner_user_id`（D7 选 B）、`error`、`size_bytes` |

### 6.5 错误码增量（摘要）

`run_in_progress`、`run_not_cancelable`、`approval_expired`、`approval_already_decided`、`task_not_cancelable`、`task_not_resumable`、`task_not_authorizable`、`workflow_context_conflict`、`workflow_invalid`、`workflow_disabled`、`model_not_allowed`、`reasoning_effort_invalid`、`attachment_too_large`、`attachment_type_not_allowed`、`attachment_not_ready`。

完整表见 [`contract-delta.md`](contract-delta.md) 第 13 节。

---

## 7. 原型走查路径（联调前先对齐）

建议后端开发按下面顺序打开原型，每步对照一个接口：

| 步骤 | 打开 | 操作 | 对应接口 |
|---|---|---|---|
| 1 | `ui-v7.html` | 看会话侧栏：分组、消息数、待审批标记、搜索 | `GET /conversations?q=` |
| 2 | 同上 | 看消息时间线：思考卡、技能卡、检索卡、A2A 卡、MCP 卡 | `POST /chat/stream` 的 SSE 序列 |
| 3 | 同上 | 点「停止」（运行中） | `POST /runs/{id}/cancel`（需先有 `run_id`） |
| 4 | 同上 | 点「处理审批」→ 批准 | `POST /approvals/{id}/decision` |
| 5 | 同上 | 点「查看运行事件」→ 筛选、搜索、展开行 | `GET /runs/{id}/events` |
| 6 | 同上 | 输入 `@`、打开「+」菜单、切换模型/推理等级 | `/attachments`、`/skills/catalog`、`/mcp/available`、`/system/info` |
| 7 | `ui-v7-pages.html` | 智能体：注册预览、健康检查、启停、原始 Card | `/agents`、`/agents/preview`、`/health` |
| 8 | 同上 | 任务：8 状态、补充信息、前往授权、拒绝 | `/tasks`、`/tasks/{id}/resume`、`/tasks/{id}/authorize`、`/tasks/{id}/reject` |
| 9 | 同上 | 知识库：上传、重试、重建、检索调试 | `/knowledge/*` |
| 10 | 同上 | 设置：指令、记忆、技能、MCP | `/instructions`、`/memories`、`/skills`、`/mcp/servers` |
| 11 | `ui-v8-admin.html` | 概览、审计、用户、角色、菜单、字典 | 见 [`admin-console.md`](admin-console.md) |

> 原型里的写操作大多是 toast 或本地 DOM 模拟；走查时只看「界面需要什么」，不要期待真实数据。

---

## 8. 验收方式

### 8.1 每个工作包的 Definition of Done

1. OpenAPI 已更新，字段、枚举、错误码、示例齐全；
2. 本包列出的验收用例全部通过（见 [`fixtures.md`](fixtures.md) 第 5 节）；
3. 响应与 fixtures 的形状一致（字段可多不可少，未知枚举可容忍）；
4. 权限、幂等、并发、超时行为符合契约；
5. 变更回写到本交接包（或标注已被 OpenAPI 取代）。

### 8.2 联调前的最小检查

- [ ] `GET /system/info` 能返回模型、能力开关、限额；
- [ ] `POST /chat/stream` 首个事件或响应头能拿到 `run_id`；
- [ ] SSE 事件顺序符合 [`fixtures.md`](fixtures.md) 的序列；
- [ ] 取消后流以 `message.done.finish_reason=canceled` 结束，且已生成内容保留；
- [ ] `GET /runs/{id}/events` 的 `type/status/payload` 能覆盖轨迹页的 request/message/skill/tool/a2a/mcp/approval 行；
- [ ] 审批决定后 `resumed=true`，重复决定返回 409；
- [ ] 任务 `input_required` 能用同一 `task_id` 继续；
- [ ] 列表分页 `next_cursor/has_more` 与 `stats` 正常；
- [ ] 所有列表对未知枚举值不报错。

### 8.3 契约测试

建议后端用 `pytest + httpx.ASGITransport` 对 fixtures 做快照式断言；前端用同一批 JSON 做 mock。最少覆盖：

- SSE 顺序、取消、断线重连；
- 审批并发与过期；
- 任务 8 状态与动作可用性；
- 附件大小/类型/归属校验；
- 管理员越权 403；
- 列表分页与未知枚举容忍。

---

## 9. 术语

| 术语 | 含义 | 原型中的表现 |
|---|---|---|
| **run** | 一次 LangGraph 图执行，有 `run_id` | 运行条、运行轨迹 |
| **turn** | 一轮用户输入到助手最终输出 | 轨迹里的 `Turn 1` |
| **task** | 一次 A2A 远程任务，本地有 `id`，远程有 `a2a_task_id` | 任务页、A2A 卡 |
| **workflow** | 有序步骤模板，不是 BPMN 引擎 | 工作流页、输入栏「+ → 工作流」 |
| **capability** | 账号级能力：指令、记忆、技能、MCP | 设置页「个人能力」 |
| **approval** | HITL 审批单，批准后恢复运行 | 审批卡、待审批入口 |
| **artifact** | 远程任务产出片段 | Agent 抽屉、任务详情 |

---

## 10. 维护约定

- 本包是**过渡契约**：OpenAPI 落地后，以 OpenAPI 为唯一契约源，本包保留决策与验收部分；
- 任何字段/枚举变更，先改本包对应章节，再改实现；
- 原型新增交互时，同步更新「能力矩阵」与「降级矩阵」；
- 决策落定后，把第 5 节的状态改为「已定」，并记录日期与结论；
- 历史版本不覆盖，按 `v1.1`、`v1.2` 追加变更记录。

### 变更记录

| 版本 | 日期 | 变更 |
|---|---|---|
| v1.0 | 2026-11-08 | 首版：基于 v7/v8 原型与后端 M0 文档，输出契约增量、工作包、fixtures |
