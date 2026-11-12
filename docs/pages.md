# 页面规划

- 状态：M0–M7 前端已实现（默认 mock；主要能力与真实后端联调），F1 体验与可访问性已收口。**2026-11-11 第一次向 v7 原型靠拢（阶段 1）已完成**：单侧栏（导航 + 会话）、对话内审批、宽屏运行轨迹常驻右栏、设置页长滚动。对话页、设置页（个人能力 + 安全与审计）、智能体页、任务页、知识库页为完整交互；M7 已完成续流/事件回放/写操作 RBAC/审批字段/授权链接容错；**M8 管理台七页已实现（2026-11-12，398 单测，真实联调待后端）**；工作流为 M9 骨架 + mock。
- 布局：`AppLayout` 提供单侧栏（品牌 / 新建会话 / 导航 / 会话列表 / 账号菜单，可折叠为图标栏、≤900px 为抽屉）；对话页在 >1180px 为「对话 + 运行轨迹」两栏，窄屏轨迹改为抽屉；管理台使用独立 `AdminLayout`（深墨侧栏 + 七页，已实现）。
- 实现文件：`src/views/`；对话页组件在 `src/components/chat/`；通用三态组件在 `src/components/common/`
- 里程碑归属：以 [路线图](roadmap.md) 为准（M3「A2A 入站」已取消，服务仅出站；M5=审批与安全加固；M7=续流/权限边界/安全 UX；M8=管理台 v8 全量；M9=工作流；F1 已完成）

## 0. 当前原型（2026-11-08）

> 第 1–8.2 节是功能目标规格，里程碑归属以 [路线图](roadmap.md) 为准；当前评审以 HTML 原型为准，原型已比目标规格多出工作流、输入栏「+」上下文、模型/推理等级、运行轨迹与个人能力设置。
>
> 2026-11-11 起分两阶段靠拢：**阶段 1**（已完成）只把已实现功能的结构与主交互拉回 v7 原型，不新增依赖 M7–M9 后端的功能；**阶段 2**（M7–M9 交付后）再做管理台 v8、工作流与像素级定稿。规划见 [第一次靠拢规划](superpowers/plans/2026-11-11-prototype-alignment-phase1.md)。

| 原型 | 覆盖 | 与目标规格的差异 |
|---|---|---|
| [`ui-v7.html`](prototypes/ui-v7.html) | 对话、会话、过程时间线、审批、运行轨迹、Agent 输出抽屉 | 一级导航为 对话/工作流/智能体/任务/知识库；设置收进账号菜单；新增「+」上下文菜单与模型/推理等级 |
| [`ui-v7-pages.html`](prototypes/ui-v7-pages.html) | 工作流、智能体、任务、知识库、设置 | 设置新增「个人能力」四区块；任务补齐 A2A 的 input-required/auth-required |
| [`ui-v8-admin.html`](prototypes/ui-v8-admin.html) | 概览、用户、角色权限、菜单、字典、审计、系统设置 | M8 目标形态（完整管理台）；角色权限/菜单/字典尚无后端契约，前端只读呈现 |

入口与契约缺口见 [原型索引](prototypes/README.md) 与 [自检报告](prototypes/review-2026-11-08.md)。

## 1. 全局布局

```text
┌────────────┬──────────────────────────────────────────────┐
│ Agent Hub  │ 页面标题                        状态/操作     │
│ + 新建会话  ├──────────────────────────────────────────────┤
│ ▸ 对话     │                                              │
│ ▸ 工作流   │              页面内容                        │
│ ▸ 智能体   │                                              │
│ ▸ 任务     │                                              │
│ ▸ 知识库   │                                              │
│ ─────────  │                                              │
│ 会话列表    │                                              │
│ · 今天     │                                              │
│ · 昨天     │                                              │
│ 账号/设置  │                                              │
└────────────┴──────────────────────────────────────────────┘
```

- 单侧栏宽 288px，含品牌 / 新建会话 / 导航 / 会话搜索与列表 / 账号菜单；折叠为 56px 图标栏（会话区隐藏）；≤900px 收为抽屉（抽屉内同样可切换会话）；
- 对话页在 >1180px 为「对话 + 运行轨迹」两栏（侧栏由布局提供），≤1180px 轨迹改为右侧抽屉；
- 设置通过底部账号菜单进入；第 4 节会话列表已内嵌侧栏，不单独成页。

## 2. 登录 / 注册（M1）

| 项 | 说明 |
|---|---|
| 路由 | `/login`、`/register`（独立布局，不套 AppLayout） |
| 表单 | 邮箱、密码、展示名（注册） |
| 校验 | 邮箱格式、密码长度 ≥ 8、两次密码一致 |
| 交互 | 提交 loading、错误行内提示、成功后跳 `redirect` 或 `/chat` |
| 接口 | `POST /auth/login`、`POST /auth/register`、`GET /auth/me` |
| 守卫 | 未认证访问业务路由 → `/login?redirect=...`；已认证访问登录页 → `/chat` |

## 3. 对话页 `/chat`（核心）

### 布局

```text
┌──────────────────────────────────┬──────────────┐
│  消息时间线                        │  运行轨迹     │
│   ├ 用户消息                       │  （>1180px   │
│   ├ 助手消息（流式）                │   常驻右栏）  │
│   ├ 工具 / 检索 / MCP 卡片          │  状态 / 事件  │
│   ├ A2A 任务卡片（可查看输出）       │  本轮过程     │
│   └ 审批卡片（对话内直接批准/拒绝）   │              │
│                                    │              │
│  ┌──────────────────────────────┐  │              │
│  │ 输入框（Enter 发送 / Shift+Enter）│  │              │
│  └──────────────────────────────┘  │              │
└──────────────────────────────────┴──────────────┘
```

### 组件拆分

| 组件 | 职责 |
|---|---|
| `ConversationSidebar` | 会话列表、搜索、重命名/归档/删除菜单（内嵌 `AppLayout` 单侧栏，所有页面常驻） |
| `MessageList` | 消息时间线、自动滚动、加载更多历史 |
| `MessageBubble` | 用户/助手气泡；Markdown 渲染、复制、思考卡 |
| `ToolCard` | 工具名、参数摘要、状态、耗时、可展开结果；检索（vector）/ MCP 用独立色板 |
| `A2ACard` | 远程 Agent、任务状态、进度、产出、任务链接与「查看输出」 |
| `AgentOutputDrawer` | 对话内 Agent 输出抽屉：请求 / 最终结果 / 产出 / 错误 / 任务跳转 |
| `ApprovalCard` | 对话内唯一审批入口：多审批、风险/来源/目标/副作用、倒计时、payload 遮罩、逐卡批准并执行/拒绝 |
| `RunTracePanel` / `RunTraceDrawer` | 运行轨迹面板：宽屏常驻右栏，窄屏抽屉 |
| `ChatComposer` | 输入、附件、发送/停止、快捷键 |

### 状态

| 状态 | 表现 |
|---|---|
| 空会话 | 欢迎语 + 能力标签（知识库/远程 Agent/审批） |
| 流式中 | 助手气泡显示光标；发送按钮变为「停止」 |
| 工具执行 | 时间线插入工具卡片，状态 running → ok/error |
| A2A 任务 | 卡片显示状态机与进度；失败可展开错误 |
| 审批 | 时间线内插入审批卡（一轮可多张）；`run.interrupted` 后等待决定，倒计时归零不可操作；超时后明确提示「本轮已取消」。**审批只在对话内完成，没有独立审批页**；顶部状态胶囊在有待审批时可点击定位审批卡 |
| 断线 | 顶部提示 + 续流优先（`GET /runs/{id}/stream?after_seq=`）；回放已落库事件并补卡，400/404/失败回退轮询；终态后刷新历史（断线窗口文本仍靠终态刷新） |
| 错误 | 气泡内错误卡片 + 重试按钮 |

### 交互细节

- 发送后立即插入用户消息（乐观更新），服务端返回 `message.created` 后替换临时 ID；
- `message.delta` 合并渲染（每帧最多一次）；
- 滚动：用户上滑时暂停自动滚动，显示「回到底部」按钮；
- 停止：调用 `POST /runs/{run_id}/cancel`，已生成内容保留；
- 审批：批准/拒绝在对话内完成，调用 `POST /approvals/{id}/decision`；审批列表接口仅用于断线恢复补卡与兜底，不再提供页面入口；
- 模型/推理等级：后端支持 `model` / `reasoning_effort`；前端选择值已随请求发送，`reasoning_efforts=[]` 时不下发推理等级；
- 重新生成：对最后一条助手消息提供「重新生成」（待后端契约，未排期；不在 M4 范围）；
- Markdown：代码块高亮、表格、复制按钮；禁止原始 HTML。

### 接口

`POST /chat/stream`（SSE）、`GET /conversations`、`GET /conversations/{id}/messages`、`POST /runs/{run_id}/cancel`、`GET /approvals`、`GET /approvals/{id}`、`POST /approvals/{id}/decision`。

M5 事件顺序：`approval.required` → `run.interrupted`（非终态，SSE 保持）→ 决定 → `run.resumed` → `message.delta…` → `message.done`；超时终态为 `message.done(canceled, reason=approval_timeout)`。

## 4. 会话列表（内嵌 `AppLayout` 单侧栏）

| 项 | 说明 |
|---|---|
| 位置 | 侧栏导航下方，所有页面常驻；折叠为图标栏时隐藏；≤900px 收进抽屉 |
| 列表 | 标题、最近消息时间、消息数、状态点、待审批点；按今天/昨天/更早分组 |
| 筛选 | 按标题搜索（后端 `q`，300ms 防抖） |
| 操作 | 新建、打开（跳 `/chat?c=...`）、重命名、归档/恢复、删除 |
| 说明 | 不单独设 `/conversations` 路由；运行记录在对话页运行轨迹中查看 |
| 接口 | `GET/PATCH/DELETE /conversations[...]`、`POST /conversations` |

## 5. 智能体页 `/agents`（M2 已实现；M7 写操作 RBAC 已接入）

| 项 | 说明 |
|---|---|
| 列表 | 名称、URL、协议版本、技能数、健康状态、启用开关；关键字/健康/启停筛选与统计卡 |
| 注册 | 两段式：URL + slug + 鉴权引用 → `POST /agents/preview` 拉取 Agent Card → 预览（名称/描述/技能/能力/warnings）→ `POST /agents` 确认落库 |
| 详情抽屉 | 原始 Agent Card、技能列表、最近任务、鉴权提示、最近检查/延迟/错误 |
| 操作 | 刷新 Card、健康检查、启用/禁用、删除（二次确认）；**写入口仅管理员（M7 后按 `role` 渲染，普通用户只读）** |
| 状态 | 注册中/失败（展示校验错误）、unhealthy/disabled 标记 |
| 接口 | `GET/POST/PATCH/DELETE /agents`、`/preview`、`/refresh`、`/health`；写接口 M7 后仅管理员，403 `forbidden` |

## 6. 任务页 `/tasks`（M2 已实现，仅出站任务；M7 写动作 RBAC 已接入）

| 项 | 说明 |
|---|---|
| 列表 | 任务 ID、远程 Agent、状态、请求摘要、耗时、所属会话、创建时间；cursor 分页 |
| 筛选 | 状态、Agent、关键字（400ms 防抖）、时间范围；统计卡 |
| 详情 | 请求/参数、Artifact/结果数据、错误、补充信息、授权 scope、状态时间线、到期时间 |
| 实时 | 有运行中任务时 15s 静默轮询；页面隐藏时暂停 |
| 操作 | 取消（submitted/working/input_required/auth_required）、补充信息（resume）、前往授权（仅 https/本地）、已授权、拒绝、打开会话；**写动作仅管理员（M7 后按 `role` 渲染，普通用户只读）** |
| 接口 | `GET /tasks`、`GET /tasks/{id}`、`POST /tasks/{id}/{cancel,resume,authorize,reject}`；写动作 M7 后仅管理员，403 `forbidden` |
| 深链 | 对话 A2A 卡片 → `/tasks?task=<local-id>` 直接打开详情 |

## 7. 知识库页 `/knowledge`（M4，已联调）

| 项 | 说明 |
|---|---|
| 文档列表 | 标题、来源路径、分类、状态、块数、大小、归属、更新时间；服务端 `q/category/status/owner_scope` 筛选 + 游标「加载更多」；6 键统计 |
| 上传 | 拖拽/选择文件，或粘贴文本转 `.md`；可选标题、分类；管理员可选「系统文档」；超限 413、类型 422、无权限 403 分开提示 |
| 入库状态 | 后端同步入库返回终态；仅 `pending/indexing` 文档每 5s 轮询（页面隐藏暂停），不伪造进度 |
| 检索调试 | 查询 + `top_k`(1–20) + 分类；展示章节标题、文档名/文件名、分数、日期、片段；可复制；空结果与 503 区分 |
| 操作 | 详情抽屉、失败重试/重建此文档（`/retry`）、删除、管理员按 `all/system/own` 重建 |
| 状态 | pending/indexing/ready/failed，失败可重试；`category` 空串显示「未分类」 |
| 接口 | `POST/GET /knowledge/documents`、`GET/DELETE /knowledge/documents/{id}`、`POST /knowledge/documents/{id}/retry`、`POST /knowledge/search`、`POST /knowledge/rebuild` |
| 深链 | 引用点击带 `?document_id=` 打开详情抽屉；文档已删除时回退 `?q=` 标题搜索 |

> 与后端的落地差异：无「单文档重建」端点（用 `retry`）；无分类目录端点（输入栏候选取可见文档聚合 + 手输）；`rebuild(scope=own)` = 所有用户的私有文档。

## 7.1 审批（对话内，M5 已联调）

> **2026-11-11 第一次靠拢：独立审批页与 `/approvals` 路由已删除。** 对话内审批卡是唯一决策入口；审批列表接口仅用于断线恢复补卡与兜底，不再有页面入口。

| 项 | 说明 |
|---|---|
| 入口 | 对话时间线内的审批卡；顶部状态胶囊在有 pending 审批时可点击定位；恢复横幅的「定位审批卡」同样回到对话内 |
| 卡片字段 | 工具/风险/来源/执行方/目标/副作用/原因/payload（`RedactedJson` 敏感遮罩）/过期倒计时/决策状态 |
| 决策 | 「批准并执行」/「拒绝」（当前不含备注输入）；破坏性操作额外提示；按 `resumed`/`resume_error` 语义提示；409 `approval_expired`/`approval_already_decided` 提示并刷新 |
| 过期 | 每秒倒计时；归零禁用操作并提示「审批已过期」；后端巡检会把 approval 置 expired、run 置 canceled |
| 多审批 | 一轮可多张；逐卡决定；其余待处理时提示「本轮还有其他审批待处理」 |
| 断线恢复 | 进入会话/运行中断时用 `GET /approvals?run_id=` 补卡；审批列表接口保留为兜底，不再呈现为独立页面 |
| 字段兜底 | M7 后 `approval.required` 直接带 `tool_display_name/executor/target/side_effect/payload_preview`；缺失时仍由 `GET /approvals?run_id=` 补齐 |

数据范围：后端审批列表只返回当前用户会话内的审批（无管理员全量变体）。

## 8. 设置页 `/settings`

形态：左侧分区锚点 + 右侧单页长滚动（点击导航平滑滚动并随滚动高亮）；分区顺序为 **账号 / 个人能力 / 模型 / 界面 / 安全与审计 / 关于**（A2A 分区按 2026-11-10 决策移除）。

| 区块 | 内容 |
|---|---|
| 账号 | 展示名、邮箱、角色、注册时间、最近登录；修改密码（对话框：旧密码/新密码/确认，接 `POST /auth/change-password`）；退出登录 |
| 个人能力 | 指令、长期记忆、技能、MCP 四块；按 capabilities 门控；系统项只读/仅启停 |
| 模型 | 当前模型、温度、超时（只读，来自 `/system/info`）；`reasoning_efforts=[]` 时不渲染推理等级选择器，仅显示默认等级 |
| 界面 | 主题（浅色/深色，localStorage）；消息密度（紧凑/标准/宽松，localStorage）；语言只读展示「简体中文（zh-CN）」。偏好仅保存在本浏览器，不随账号同步（服务端同步待后端接口） |
| 安全与审计 | 审计日志（普通用户自查；管理员可切全局并额外按 actor/resource_id 筛选）、平台密钥（仅管理员 CRUD/轮换/启停）；详见 M5。**管理员分区按 `role` 显示（M7 后由真实角色与 403 证明）** |
| 关于 | 版本、构建时间、文档链接 |

> 平台指令、系统技能、系统 MCP、全局 Agent 等**平台级配置不混入个人设置**，统一放 M8 管理控制台。

## 8.1 管理控制台 `/admin`（M8，已实现 2026-11-12）

| 项 | 说明 |
|---|---|
| 布局 | 独立 `AdminLayout`：深墨管理侧栏 + 内容区，与 v8 原型一致；仅 `role=admin` 可见 |
| 路由 | `/admin` 概览、`/admin/users` 用户、`/admin/roles` 角色权限、`/admin/menus` 菜单、`/admin/dictionaries` 字典、`/admin/audit` 审计、`/admin/settings` 系统设置；`meta.requiresAdmin` |
| 概览 | `GET /admin/overview` 计数卡片（用户/会话/run/任务/知识库/存储） |
| 用户 | `GET /admin/users`、`GET /admin/users/{id}`、`PATCH /admin/users/{id}`；分页/搜索/角色/状态；不能修改自己的 role（422 `cannot_change_own_role`）、不能停用自己（422 `cannot_disable_self`）、最后活跃管理员保护（409 `last_admin_protected`），前端先行禁用控件、后端校验兜底 |
| 角色权限 | **只读**：两角色说明 + 用户角色分布 + 内置能力矩阵；不做新建角色/权限编辑（后端 v1 仅 user/admin） |
| 菜单 | **只读**：前端路由菜单树；标注「后端无菜单配置接口」 |
| 字典 | **只读**：前端内置枚举（任务状态/审批风险/知识库状态等）；标注「后端无字典管理接口」 |
| 审计 | 复用管理员审计面板（`GET /admin/audit-logs`） |
| 系统设置 | 平台指令、系统技能、系统 MCP、全局 Agent、平台密钥；写操作二次确认 + 审计 |
| 降级 | 无契约三页顶部标注「后端无对应管理接口，本页为只读呈现」（READ-ONLY 标签 + 原因说明），不提供写控件；不伪造 CRUD |

## 8.2 工作流页 `/workflows`（M9，已立项）

| 项 | 说明 |
|---|---|
| 列表 | 名称、描述、步骤数、启用状态、归属（系统/用户）、更新时间；新建/编辑/启停/删除/运行 |
| 编辑器 | 线性步骤列表（增删/上移下移）；五类步骤参数表单（**草案，待 M9 handoff 冻结 `steps` schema**）：`knowledge_search`（查询模板/分类/top_k）、`tool`（工具/技能/MCP + 参数）、`a2a`（Agent + 消息模板）、`approval`（说明/风险）、`answer`（回答提示）；保存前校验；**不做拖拽画布** |
| 运行历史 | `GET /workflows/{id}/runs` + 关联 run 详情 |
| 对话入口 | 输入栏「+ → 工作流」在 `capabilities.workflows=true` 时开放；请求带 `workflow_id`；时间线渲染 `workflow.step` 步骤卡（开始/完成/失败/等待审批） |
| 门控 | `capabilities.workflows=false` 时导航置灰、路由退回对话页；M9 契约未冻结前保持骨架 + mock 并标注 |
| 接口 | `GET/POST /workflows`、`GET/PATCH/DELETE /workflows/{id}`、`PUT /workflows/{id}/enabled`、`GET /workflows/{id}/runs`、`POST /chat/stream` 带 `workflow_id` |

## 9. 响应式与可访问性（F1 横切，2026-11-11 收口）

- >1180px：单侧栏（品牌/导航/会话，288px）+ 对话 + 运行轨迹（280px）三栏；900–1180px：单侧栏 + 对话，运行轨迹改为右侧抽屉；<900px：侧栏与轨迹均变为抽屉，移动端顶栏固定「全局搜索」入口；
- 键盘可达：所有可聚焦控件有焦点环（移除全部 `outline: none`，统一 `:focus-visible`）；发送 `Enter`、换行 `Shift+Enter`、关闭弹层 `Esc`、全局搜索 `Ctrl/Cmd+K`；`AppLayout` 提供「跳到主内容」skip link；
- 颜色对比度 ≥ WCAG AA：`--ink-3` 由 `#606b72` 调整为 `#5a656c`（侧栏 `--paper-2` 上由 4.4 提升到 4.82），工具卡 10px 徽标改用 `--amber-text`；Element Plus 变量用 `html:root` 提高特异性，避免按需 CSS 覆盖主色；
- 状态不只靠颜色表达（配文字/图标）；流式内容不逐字播报，`aria-live="polite"` 区域只播报「开始回复 / 回复完成 / 生成失败 / 等待审批」等状态节点；
- 对话长列表用 `virtua` 的 `VList` 虚拟滚动（动态高度、前置插入锚定、贴底/回到底部），1000 条消息 E2E 验证 DOM 行数 < 60；
- Playwright E2E 内置 axe 扫描（登录、对话空态/消息态、命令面板、审批、知识库、设置、智能体、任务），`critical` / `serious` 违规为 0。

### 命令面板（⌘K）

- 入口：桌面侧栏「搜索」按钮、移动端顶栏搜索图标、`Ctrl/Cmd+K`；
- 三组结果（固定顺序）：页面（按能力开关过滤）、会话（`GET /conversations?q=`，250ms 防抖）、当前会话已加载消息（前端匹配，最多 8 条）；
- 键盘：`↑/↓` 选择、`Enter` 打开、`Esc` 关闭；`aria-activedescendant` 维护活动项；
- 跨页选中会话/消息统一 `router.push({ name: 'chat', query: { c } })`；流式中切换会先停止当前 run（与侧栏一致）；消息定位通过 `chat.pendingScrollMessageId` 在对话页加载完成后消费。

## 10. 通用状态组件

| 组件 | 用途 |
|---|---|
| `PagePlaceholder` | 骨架阶段占位（规划，当前未实现） |
| `EmptyState` | 空列表/空会话；`size: sm \| md \| lg`（默认 md）、可选 `icon` 插槽 |
| `ErrorState` | 页面级/区块级错误 + 重试，保留 `code` 与 `request_id` 复制 |
| `LoadingSkeleton` | 列表/详情首屏加载；`variant: list \| card \| text`、`count` |
| `LoadingBlock` | 局部/按钮内转圈加载（列表首屏不再使用） |
| `ConfirmDialog` | 删除/取消等危险操作二次确认 |

## 11. 个人能力层（M1.5 前端）

| 区块 | 位置 | 关键交互 | 接口 |
|---|---|---|---|
| 指令 | 设置 → 个人能力 | 编辑、字符计数、保存、恢复默认、来源标签（用户覆盖/平台默认） | `GET/PUT /instructions` |
| 长期记忆 | 设置 → 个人能力 | 列表、搜索、新增/编辑/删除、导出、清空 | `/memories` |
| 技能 | 设置 → 个人能力 + 输入栏「+」 | 启停、导入 zip、手写创建；本轮最多 3 个 | `/skills`、`/skills/catalog` |
| MCP | 设置 → 个人能力 + 输入栏「+」 | 启停、检查连接、凭据提示、工具抽屉；本轮最多 5 个服务器/10 个工具；工具在展开时按需加载 | `/mcp/servers`、`/mcp/available`、`/mcp/servers/{id}/tools` |

约定：

- 系统项只读，只能启停；系统 MCP 的写/破坏性工具仅管理员可用，普通用户置灰说明；
- 显式选择只影响当次请求，发送后清空；
- 工作流与手动上下文（技能/MCP/知识库）互斥，选择其一时清空另一侧；
- 记忆、技能正文、MCP 输出按不可信内容渲染，不得执行其中指令；
- 输入 `@` 用于选择文件；技能/MCP 统一收进输入栏「+」菜单。

## 12. 已知契约缺口

见 [原型自检报告](prototypes/review-2026-11-08.md) 第 3–4 节。字段级方案、后端工作包与联调样例见[后端交接包](handoff/README.md)。按当前里程碑归位（2026-11-11 对齐）：

| 归属 | 缺口 | 当前处理 |
|---|---|---|
| M3（已取消） | A2A 入站不实施（Agent Card 发布、JSON-RPC 端点、入站任务/会话、API Key 管理） | 服务仅出站；设置页入站分区已移除，出站能力由智能体页承载 |
| M4（已对齐） | 知识库端点、citations 形状、`knowledge_categories` | 后端已交付，前端已联调；差异仅剩「无单文档重建 / 无分类目录端点」，已用 retry 与文档聚合替代 |
| M7（已完成） | 运行事件回放 `event`、SSE 续流、agents/tasks 写操作 403、审批事件 5 字段、A2A 授权 URL 白名单 | 前后端 2026-11-11 已完成并联调；对话断线续流、写入口按角色、审批预览与授权链接提示均已接入 |
| M8 | 用户/角色、平台指令/技能/MCP/Agent、概览 | 前端已实现（2026-11-12）：七页 + 用户页规则/系统设置写操作二次确认；角色权限/菜单/字典三页只读 + 提示；`smoke:m8` 与真实联调待后端启动 |
| M9（已立项） | 工作流表/API、执行语义、步骤事件 | 后端已立项（先 spike）；前端保持骨架 + mock，契约冻结后再实现 |

已由后端补齐、不再列为缺口：附件上传/受控下载（M1.5）、审批列表/详情/决定端点（M1.5）、审计用户/管理员查询、平台密钥 CRUD、聊天 429、会话搜索 `q` 与 `message_count`（M1 热修后）、`model`/`reasoning_effort` 与 reasoning SSE 事件（已接入）。
