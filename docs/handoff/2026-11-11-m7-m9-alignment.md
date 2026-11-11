# M7–M9 前端对齐交接（2026-11-11）

- 性质：**前端视角的对齐记录**，不是后端契约规范；字段以后端 handoff 与 OpenAPI 为准
- 后端依据：
  - [后端路线图](../../../../PythonProjects/agent-hub/docs/roadmap.md)（M7/M8/M9 已立项）
  - [M7–M9 立项设计](../../../../PythonProjects/agent-hub/docs/superpowers/specs/2026-11-11-m7-m9-backend-roadmap-design.md)
  - [M7 实施计划](../../../../PythonProjects/agent-hub/docs/superpowers/plans/2026-11-11-m7-contract-security.md)
  - [项目整理报告](../../../../PythonProjects/agent-hub/docs/feedback/2026-11-11-project-status-review.md)
- 前端对照：[路线图](../roadmap.md)、[M7–M9 对齐设计](../superpowers/specs/2026-11-11-m7-m9-frontend-alignment-design.md)、[API 对接 §13](../api.md)

## 1. 一句话结论

后端在 M0–M6 完成后新增 M7（契约补齐与安全收口）、M8（管理台）、M9（工作流）三个立项；前端对应新增 **M7 前端适配、M8 管理台（v8 全量，无契约三页只读）、M9 工作流**，原 X1/X2 升级为 M9/M8，原 F2 纯前端收尾并入 M7。本轮只做规划与文档对齐，不改业务代码。

## 2. 后端新立项摘要

| 编号 | 名称 | 优先级 | 依赖 | 关键范围 |
|---|---|---|---|---|
| M7 | 契约补齐与安全收口 | 高 | M6 | 事件回放 `event`、`GET /runs/{id}/stream?after_seq=`、agents/tasks 写操作 RBAC、`approval.required` 5 字段、A2A `authorization_url` 白名单、文档/OpenAPI 同步；无迁移 |
| M8 | 管理台后端（原 X2） | 中 | M7-2 | 用户/角色与状态、平台指令/系统技能/系统 MCP/全局 Agent、`GET /admin/overview`、管理端审计与 403；预计无迁移 |
| M9 | 工作流后端（原 X1） | 中低 | M7-1 | `workflows` / `workflow_runs`、五类步骤、CRUD/启停/运行、`chat/stream.workflow_id`、`workflow.step`；先 spike，不做 DAG/外部引擎 |

## 3. 前端里程碑映射

| 后端 | 前端 | 前端状态 | 启动条件 | 主要交付 |
|---|---|---|---|---|
| M7 | M7 前端适配 | 未开始 | 契约冻结；类型/mock/纯前端收尾可先做 | 增量续流（已落库回放 + 实时）、事件回放、403/角色显隐、审批 5 字段、登录 401/全局 503 文案 |
| M8 | M8 前端管理台（v8 全量） | 未开始 | M8 后端契约（依赖 M7-2） | 概览/用户/角色权限/菜单/字典/审计/系统设置七页；无契约三页只读 |
| M9 | M9 前端工作流 | 未开始 | M9 spike 通过 + 契约冻结（含五类 schema）+ 后端显式置 `capabilities.workflows=true` | 列表、线性编辑器、启停、运行历史、对话 `workflow_id` + `workflow.step` |

## 4. M7 契约与前端消费

### 4.1 事件回放 `event`

`GET /runs/{id}/events` 元素新增 `event: string`（原始 SSE 事件名），`type` 保留分类，`payload` 仍剔除 `_event`。前端读取 `event` 驱动 reducer；`event` 为空/缺失时按未知事件忽略并记录 `type`/`seq`，不猜测事件名。

### 4.2 SSE 续流

`GET /runs/{id}/stream?after_seq=N`：Bearer + `text/event-stream`；`id: seq`、`event: 名称`、`data: JSON`、15s ping；先回放再实时；终态关闭；`interrupted` 保持连接；401/404/400 `replay_too_large`；单实例；用 `fetch-event-source`（GET + Bearer）。

前端消费：断线 → `GET /runs/{id}` 校验 → 续流（`lastSeq` 去重）→ 失败或 400 回退轮询 → 终态 `refreshHistory()`。详见 [API §13.2](../api.md)。

### 4.3 写操作 RBAC

agents 写接口与 tasks 动作接口改为 `AdminUser`；普通用户 403 `forbidden` + `details.required_role="admin"`；读接口与 `POST /agents/preview` 保持登录用户可用。前端按 `role` 显隐写入口，403 文案「当前账号无管理员权限」，不当作登录失效。

**行为变更（必须标注）**：M7 前普通用户本可调用这些写接口，前端只是隐藏入口；M7 后统一 403。需准备普通用户第二账号，补「入口不可见 + 直接调用 403」两层回归。

### 4.4 审批事件字段

`approval.required.data` 新增 `tool_display_name`、`executor`、`target`、`side_effect`、`payload_preview`。前端直接渲染；`GET /approvals?run_id=` 保留为字段缺失兜底。

### 4.5 A2A 授权 URL

后端只允许 https（dev/test 允许 localhost http）；非法协议/内网/回环/超长置 `authorization_url=null` 并审计。前端无链接时显示「授权链接不可用，请联系管理员」。

### 4.6 纯前端收尾（原 F2，并入 M7）

- 登录 401 不进入 refresh 流程，直接展示后端 `error.message`；
- `database_unavailable` / `service_unavailable` 统一 503 文案；
- 管理员入口/写按钮按角色显示，补普通用户 403 文本证据。

## 5. M8 页面与契约映射

| 页面 | 契约 | 前端处理 |
|---|---|---|
| 概览 | `GET /admin/overview` | 真实计数卡片 |
| 用户 | `GET /admin/users`、`GET /admin/users/{id}`、`PATCH /admin/users/{id}` | 真实分页/搜索/角色/状态；不能修改自己的 role、不能禁用/降级最后一个 admin（自己能否改 status 以 M8 handoff 为准） |
| 角色权限 | **无**（v1 仅 user/admin） | 只读两角色说明 + 角色分布 + 内置能力矩阵 |
| 菜单 | **无** | 只读前端路由菜单树 + 提示 |
| 字典 | **无** | 只读前端内置枚举 + 提示 |
| 审计 | `GET /admin/audit-logs`（已有，M8 可能扩展过滤） | 复用管理员审计面板；handoff 新增字段则补 UI/参数 |
| 系统设置 | `/admin/settings/instruction`、`/admin/skills*`、`/admin/mcp/servers*`、`/admin/agents*`、`/admin/secrets`（已有） | 分区 Tab；写操作二次确认 + 审计 |

无契约三页统一顶部提示「后端暂未提供该配置接口，本页为只读展示」，禁用写按钮并说明原因，不伪造 CRUD。

## 6. M9 页面与契约映射

| 能力 | 契约 | 前端处理 |
|---|---|---|
| 列表 | `GET/POST /workflows` | 名称/描述/步骤数/状态/归属/更新时间 |
| 编辑 | `GET/PATCH/DELETE /workflows/{id}` | 线性步骤列表 + 五类步骤参数表单（**草案，待 M9 冻结 `steps` schema**）；不做拖拽画布 |
| 启停 | `PUT /workflows/{id}/enabled` | 开关 + 二次确认 |
| 运行历史 | `GET /workflows/{id}/runs` | 列表 + 关联 run 详情 |
| 对话运行 | `POST /chat/stream` 带 `workflow_id` | 输入栏「+ → 工作流」；`capabilities.workflows=true` |
| 步骤事件 | SSE `workflow.step` | 时间线步骤卡（开始/完成/失败/等待审批） |

## 7. 前端文件影响（规划）

| 文件/目录 | M7 | M8 | M9 |
|---|---|---|---|
| `src/types/` | `run.ts` 加 `event`；`chat.ts` 审批 5 字段 | 新增 `admin.ts` | `workflow.ts` 升级真实契约 |
| `src/api/` | `runs.ts` 新增 `openRunStream`；`client.ts` 401/503/403 | 新增 `admin.ts` | `workflows.ts` 接真实端点 |
| `src/stores/` | `chat.ts` 续流状态机；`auth.ts` `isAdmin` | 新增 `admin` store | `workflows` store |
| `src/views/` | `AgentsView`/`TasksView` 写入口 | 新增 `admin/` 七页 | `WorkflowsView` + 编辑器 |
| `src/components/` | `ApprovalCard` 5 字段 | `AdminLayout`、管理组件 | `WorkflowStepEditor`、步骤卡 |
| `src/router/` | 管理员入口显隐 | `/admin` + `requiresAdmin` | `/workflows` 门控更新 |
| `src/api/mock/` | 续流、403、审批字段 | 管理端 fixtures | 工作流 fixtures |
| `deploy/nginx.conf` / `deploy/README.md` | 新增 `/api/v1/runs/{id}/stream` SSE location + 验证脚本路径 | — | — |

## 8. 启动条件与验收

| 里程碑 | 启动条件 | 最小验收 |
|---|---|---|
| M7 | 后端 M7 handoff/OpenAPI 冻结；类型/mock/纯前端收尾可先做 | 续流不重复（已落库回放 + 实时增量；断线窗口未落库的 `message.delta` 不承诺补齐，终态 `refreshHistory()` 补齐）；400 降级；403 文案；审批 5 字段；`pnpm test`/`type-check`/`lint`/`build`/`e2e` |
| M8 | M8 后端契约冻结（依赖 M7-2） | 七页可用；三页只读提示；普通用户 403；axe 0 critical/serious |
| M9 | M9 spike 通过 + 契约冻结（含五类步骤 schema）+ 后端显式置 `capabilities.workflows=true` | 3 步模板保存运行；`workflow.step` 可见；取消/失败/审批超时语义一致 |

## 9. 未覆盖项与待决策

- M8 角色权限/菜单/字典无后端契约：当前只读；若要求可编辑，需后端另立项（候选 M10+）。
- M9 编辑器只做线性列表；拖拽画布列 F3 候选。
- 服务端偏好同步：M8 后端未包含，继续本地存储。
- 真实 LLM key 占位：M7 续流的真实 HTTP 证据需 key 就位后补。
- 多实例：后端单实例；跨实例续流候选 M10+，前端不做跨实例假设。

## 10. 与既有文档的关系

| 文档 | 关系 |
|---|---|
| [路线图](../roadmap.md) | 里程碑状态、门禁与排期的唯一入口 |
| [M7–M9 对齐设计](../superpowers/specs/2026-11-11-m7-m9-frontend-alignment-design.md) | 详细设计、文件影响、验收与风险 |
| [API 对接 §13](../api.md) | 前端消费的契约草案与续流示例 |
| [页面规划](../pages.md) | M8 七页、M9 工作流页规格 |
| [架构](../architecture.md) | 续流状态机、管理台/工作流模块 |
| [合同增量](contract-delta.md) | 2026-11-08 提案；M7–M9 以其为基础增量，冲突以新文档为准 |

## 变更记录

| 日期 | 变更 |
|---|---|
| 2026-11-11 | 首版：对齐后端 M7/M8/M9 立项；X1→M9、X2→M8；F2 并入 M7；M8 v8 全量、无契约三页只读 |
