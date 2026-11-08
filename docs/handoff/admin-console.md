# 管理控制台契约（v8）

- 对应原型：[`ui-v8-admin.html`](../prototypes/ui-v8-admin.html)
- 状态：**M5+ 目标形态**；后端目前只有平台指令、系统 MCP、系统技能三类管理接口
- 决策：D2，见 [`README.md`](README.md) 第 5 节
- 结论先行：不要按「一次做完管理后台」排期；拆成 M5.0 / M5.1 / M5.2 三段，先让概览、审计、用户只读、已有系统设置跑起来

---

## 1. 范围分层

### 1.1 原型页面与当前能力

| 页面 | 原型内容 | 当前后端 | 建议里程碑 |
|---|---|---|---|
| 概览 | 用户/运行/审批/Agent/知识库 KPI，7 日运行量，系统健康，最近审计，待处理 | 无聚合接口；`/system/info`、`/healthz` 可凑部分 | **M5.0** |
| 用户管理 | 列表、搜索、角色/状态筛选、邀请、导出、分页 | 无管理端用户 API | **M5.1**（先只读，再邀请/禁用） |
| 角色与权限 | 5 个角色、权限矩阵、保存 | 只有 `users.role=user/admin` | **M5.1** |
| 菜单管理 | 树、路径、类型、权限标识、排序、可见、启停 | 无 menus 表/API | **M5.2** |
| 字典管理 | 6 类字典、项标签/值/颜色/排序/启停 | 无 dictionaries 表/API | **M5.2** |
| 审计日志 | 列表、筛选、详情、导出 | `audit_logs` 表已设计，无查询 API | **M5.0** |
| 系统设置 | 基础/认证/A2A/模型配额/数据保留/开关/危险操作 | 只有平台指令、系统 MCP、系统技能 | **M5.0 部分** |

### 1.2 三段式范围

#### M5.0 最小可用（推荐先做）

- `GET /admin/overview`：聚合 KPI + 最近审计 + 待处理；
- `GET /admin/audit`、`GET /admin/audit/{id}`：审计查询与详情；
- `GET /admin/users`：只读列表（含角色、状态、最近登录、会话数）；
- 系统设置：只读展示 + 现有三类接口（平台指令、系统 MCP、系统技能）的写操作；
- 页面顶部「原型演示」提示改为「部分能力已接通」。

#### M5.1 RBAC 与用户管理

- `roles` / `permissions` / `role_permissions` / `user_roles`；
- 用户邀请、启停、角色变更；
- 权限矩阵读写；
- 管理端接口统一权限校验。

#### M5.2 菜单与字典

- `menus` 树、排序、可见性；
- `dictionaries` / `dictionary_items`；
- 前端导航与状态标签改为读菜单/字典（可选，不强制）。

#### M6 之后

- 认证策略、配额、数据保留、危险操作等平台级配置；
- 多租户、SSO、MFA、审计导出归档。

### 1.3 明确不做

- 不在 M1–M4 做管理端；
- 不做「管理员读取用户记忆正文」（后端已定 v1 不提供）；
- 不做计费/账单；
- 不做可视化 SQL 或任意配置编辑。

---

## 2. v8 页面数据需求

### 2.1 概览

| 区块 | 字段 | 来源 |
|---|---|---|
| KPI | 用户数、本周新增、今日运行数、较昨日、待审批数、远程智能体数/降级数、知识文档数/失败数 | `GET /admin/overview` |
| 运行量 | 近 7 天每日 runs 数、总量 | 同上或 `GET /admin/stats/runs?days=7` |
| 系统状态 | API/PostgreSQL/pgvector/A2A 注册表/模型 p95 | `GET /admin/system/health` |
| 最近管理操作 | 时间、操作者、动作、资源、结果 | `GET /admin/audit?limit=5` |
| 待处理 | 待审批、降级 Agent、失败文档 | `GET /admin/overview` 的 `pending_items` |

### 2.2 用户管理

列表字段：用户（姓名/邮箱/头像首字母）、角色、状态、最近登录、会话数、操作。
筛选：关键字、角色、状态（全部/启用/禁用/待激活）、分页。
操作：邀请、编辑角色、启用/禁用、导出。
状态：`active` / `disabled` / `pending`（待激活）。

### 2.3 角色与权限

- 角色列表：key、名称、描述、是否内置；
- 权限矩阵：模块/权限、查看、操作；
- 保存后立即对新会话生效；
- 超级管理员内置不可修改。

### 2.4 菜单管理

- 树形结构：目录 / 页面 / 按钮；
- 字段：名称、路径、类型、权限标识、排序、可见、状态；
- 操作：新建、编辑、删除、全部折叠、刷新；
- 变更后需重新登录生效。

### 2.5 字典管理

- 字典类型：编码、名称、描述、项数；
- 字典项：标签、值、颜色、排序、状态；
- 变更立即影响前端状态展示与筛选（原型文案）。

> 原型字典数据有两处与后端枚举不一致，落库前需先对齐：
> 1. `task_status` 只有 7 项，缺后端已有的 `auth_required`（任务页需要「需要授权」）；
> 2. `agent_health` 使用 `degraded/offline`，后端现有 `unknown/healthy/unhealthy`。建议统一为 `unknown/healthy/degraded/unhealthy`，`offline` 不单独入库，前端把 `unhealthy` 显示为「异常/离线」；
> 3. `approval_decision` 只有 `pending/approved/rejected`，缺 `expired/canceled`，需补两项。

### 2.6 审计日志

- 列表：时间、操作者、操作、对象、IP、结果、详情；
- 筛选：关键字、操作类别、结果、时间范围；
- 导出 CSV；
- 只读，保留 365 天。

### 2.7 系统设置

- 基础信息：系统名称、环境、时区、支持邮箱、站点 URL、默认语言；
- 认证与安全：Access/Refresh 有效期、密码最小长度、登录失败锁定、管理员 MFA、允许公开注册；
- A2A 与智能体：基础 URL、调用超时、最大并发、健康检查间隔、streaming 开关、注册需审批；
- 模型与配额：默认模型、默认推理等级、最大输出 tokens、温度、速率限制、单日 token 上限；
- 数据保留：会话、审计、附件保留期，日志级别；
- 功能开关：工作流、MCP、知识库、附件上传；
- 危险操作：维护模式；清空审计/重置配置只做说明，不提供入口。

---

## 3. 权限模型

### 3.1 粗粒度与细粒度并存

- 现有 `users.role`（`user` / `admin`）保留，作为**快速门禁**；
- 新增 RBAC 表作为**细粒度权限**；
- 授权判断分两阶段：**M5.0 沿用** `users.role='admin'`；**M5.1 起**改为「管理员基础门禁 + 对应 `permission_key`」；这是一项需要同步修改 `docs/api.md` 的契约变更，不能悄悄替换；
- 超级管理员角色内置，拥有全部权限且不可删除。

### 3.2 表结构

#### `roles`

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | uuid | PK | |
| `key` | varchar(64) | unique, not null | `superadmin` / `ops` / `support` / `editor` / `auditor` |
| `name` | varchar(64) | not null | 展示名 |
| `description` | varchar(255) | not null default '' | |
| `builtin` | boolean | not null default false | 内置不可删 |
| `created_at` / `updated_at` | timestamptz | not null | |

#### `permissions`

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `key` | varchar(128) | PK | 如 `admin:user:read` |
| `group` | varchar(64) | not null | 工作台 / 管理控制台 / 操作权限 |
| `label` | varchar(128) | not null | 展示名 |
| `type` | varchar(16) | not null | `view` / `write` / `action` |
| `description` | varchar(255) | not null default '' | |

#### `role_permissions`

| 字段 | 类型 | 约束 |
|---|---|---|
| `role_id` | uuid | FK roles, cascade |
| `permission_key` | varchar(128) | FK permissions, cascade |

主键 `(role_id, permission_key)`。

#### `user_roles`

| 字段 | 类型 | 约束 |
|---|---|---|
| `user_id` | uuid | FK users, cascade |
| `role_id` | uuid | FK roles, cascade |
| `created_at` | timestamptz | not null |

主键 `(user_id, role_id)`。一个用户可有多个角色，权限取并集。

#### 兼容策略

1. 迁移时把所有 `users.role='admin'` 的用户加入 `superadmin` 角色；
2. 普通用户加入内置 `user` 角色（默认角色，不参与管理端）；
3. 读权限时先查 `user_roles`，为空则回退到 `users.role`；
4. 新注册用户默认 `users.role='user'` + `user` 角色；
5. 保留 `users.role` 的写入口（运维脚本），但管理端改角色只写 `user_roles`，并同步 `users.role`（admin ↔ superadmin）。

### 3.3 权限键建议

| 分组 | 权限键 |
|---|---|
| 工作台 | `chat:read`、`chat:write`、`workflow:read`、`workflow:write`、`workflow:publish`、`agent:read`、`agent:write`、`agent:register`、`task:read`、`task:write`、`knowledge:read`、`knowledge:write`、`knowledge:delete`、`approval:decide` |
| 管理控制台 | `admin:overview:read`、`admin:user:read`、`admin:user:create`、`admin:user:update`、`admin:user:disable`、`admin:role:read`、`admin:role:write`、`admin:menu:read`、`admin:menu:write`、`admin:dict:read`、`admin:dict:write`、`admin:audit:read`、`admin:system:read`、`admin:system:write` |

默认角色建议：

| 角色 | 权限 |
|---|---|
| `superadmin` | 全部（内置） |
| `user` | `chat:read/write`、`agent:read`、`task:read`、`knowledge:read`、`approval:decide` |
| `ops` | 工作台全部 + `admin:overview:read`、`admin:user:read`、`admin:role:read`、`admin:menu:read`、`admin:dict:read`、`admin:audit:read`、`workflow:publish`、`agent:register` |
| `support` | `chat:*`、`workflow:read`、`agent:read`、`task:read/write`、`knowledge:read`、`approval:decide` |
| `editor` | `chat:read`、`workflow:read/write`、`knowledge:read/write/delete`、`task:read` |
| `auditor` | `admin:overview:read`、`admin:user:read`、`admin:audit:read` |

> 这些只是建议种子；后端可以按实际组织调整，但**权限键一旦上线就作为契约**，不要随意改名。

---

## 4. 其他数据模型

### 4.1 `menus`

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | uuid | PK | |
| `parent_id` | uuid | FK menus, cascade, null | 根为空 |
| `name` | varchar(64) | not null | |
| `path` | varchar(255) | not null default '' | 目录可为空 |
| `type` | varchar(16) | not null | `directory` / `page` / `button` |
| `icon` | varchar(64) | not null default '' | 图标名（受控枚举，前端映射到本地图标集） |
| `permission_key` | varchar(128) | null | 对应 permissions |
| `sort` | int | not null default 0 | 同级排序 |
| `visible` | boolean | not null default true | |
| `enabled` | boolean | not null default true | |
| `scope` | varchar(16) | not null | `workspace` / `admin` |
| `created_at` / `updated_at` | timestamptz | not null | |

索引：`(scope, parent_id, sort)`。保存菜单时校验 `permission_key` 必须存在于 `permissions`，否则该菜单无法被授权。

### 4.2 `dictionaries` / `dictionary_items`

`dictionaries`：

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | uuid | PK |
| `code` | varchar(64) | unique，如 `task_status` |
| `name` | varchar(64) | 展示名 |
| `description` | varchar(255) | |
| `created_at` / `updated_at` | timestamptz | |

`dictionary_items`：

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | uuid | PK |
| `dictionary_id` | uuid | FK dictionaries, cascade |
| `label` | varchar(64) | 展示文案 |
| `value` | varchar(64) | 参与 API 契约的值 |
| `color` | varchar(16) | `gray/blue/green/amber/red/purple` |
| `sort` | int | |
| `enabled` | boolean | |
| `metadata` | jsonb | 扩展 |

索引：`UNIQUE (dictionary_id, value)`、`(dictionary_id, sort)`。

### 4.3 `audit_logs` 扩展

现有字段：`id`、`actor_type`、`actor_id`、`action`、`resource_type`、`resource_id`、`detail`、`request_id`、`ip`、`created_at`。

补充：

| 字段 | 类型 | 说明 |
|---|---|---|
| `result` | varchar(16) not null default 'success' | `success` / `failure` |
| `error_code` | varchar(64) null | 失败原因 |
| `category` | varchar(32) not null default '' | `login/user/role/menu/dict/workflow/approval/agent/knowledge/system` |

索引：`(created_at desc)`、`(category, created_at desc)`、`(actor_id, created_at desc)`、`(action, created_at desc)`。

### 4.4 `invitations`（M5.1）

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | uuid | PK | |
| `email` | varchar(255) | not null | 被邀请邮箱 |
| `display_name` | varchar(64) | not null default '' | 预填展示名 |
| `role_id` | uuid | FK roles, set null | 预分配角色 |
| `token_hash` | varchar(128) | not null | 只存哈希，不存明文 |
| `invited_by` | uuid | FK users, set null | |
| `expires_at` | timestamptz | not null | 默认 7 天 |
| `accepted_at` | timestamptz | null | 接受时间 |
| `created_at` | timestamptz | not null | |

索引：`(email)`、`(token_hash)` 唯一、`(expires_at)`。

> 用户状态 `users.status` 需新增 `pending`（待激活），与 `active` / `disabled` 并列；接受邀请后置 `active`。

### 4.5 `system_settings`

沿用现有 `key/value/updated_by/updated_at`，管理端设置按 key 分组：

| 分组 | key 示例 |
|---|---|
| 基础 | `site.name`、`site.environment`、`site.timezone`、`site.support_email`、`site.url`、`site.locale` |
| 认证 | `auth.access_ttl`、`auth.refresh_ttl`、`auth.password_min`、`auth.lockout`、`auth.admin_mfa`、`auth.allow_register` |
| A2A | `a2a.base_url`、`a2a.timeout`、`a2a.max_concurrency`、`a2a.health_interval`、`a2a.streaming`、`a2a.register_approval` |
| 模型 | `model.default`、`model.reasoning_effort`、`model.max_output_tokens`、`model.temperature`、`model.rate_limit`、`model.daily_token_limit` |
| 数据 | `data.conversation_retention_days`、`data.audit_retention_days`、`data.attachment_retention_days`、`data.log_level` |
| 开关 | `feature.workflows`、`feature.mcp`、`feature.knowledge`、`feature.attachments`、`feature.maintenance` |

> 密钥、数据库连接、JWT secret 只来自环境变量，管理端只读或不可见。

---

## 5. API

### 5.1 概览与统计

| 端点 | 说明 |
|---|---|
| `GET /api/v1/admin/overview` | KPI、7 日运行量、待处理 |
| `GET /api/v1/admin/system/health` | 组件健康、模型 p95 |
| `GET /api/v1/admin/stats/runs?days=7` | 单独取运行量（可选） |

`GET /admin/overview` 响应：

```json
{
  "kpis": {
    "users": {"total": 6, "new_this_week": 2},
    "runs_today": {"total": 42, "delta_pct": 18},
    "approvals": {"pending": 1},
    "agents": {"total": 3, "degraded": 1, "healthy": 2},
    "knowledge": {"documents": 128, "failed": 2, "ready": 126}
  },
  "run_volume": [
    {"date": "2026-10-30", "runs": 128},
    {"date": "2026-10-31", "runs": 164}
  ],
  "pending_items": [
    {"kind": "approval", "count": 1, "link": "/admin/audit?..."},
    {"kind": "agent_degraded", "count": 1, "link": "/agents"},
    {"kind": "knowledge_failed", "count": 2, "link": "/knowledge"}
  ],
  "recent_audit": []
}
```

`GET /admin/system/health` 响应：

```json
{
  "status": "ok",
  "components": [
    {"key": "api", "label": "API 服务", "status": "healthy", "latency_ms": 42},
    {"key": "postgres", "label": "PostgreSQL", "status": "healthy", "latency_ms": 8},
    {"key": "pgvector", "label": "pgvector · HNSW", "status": "healthy", "latency_ms": 6},
    {"key": "a2a", "label": "A2A 注册表", "status": "degraded", "detail": "2 / 3 健康"},
    {"key": "model", "label": "模型 · deepseek-chat", "status": "healthy", "p95_ms": 1800}
  ],
  "checked_at": "2026-11-08T09:42:00Z"
}
```

> 没有 Prometheus 时，`p95_ms` 可为 null，前端显示 `—`；不要让接口 500。

### 5.2 用户管理

| 端点 | 说明 |
|---|---|
| `GET /api/v1/admin/users` | 列表：`q`、`role`、`status`、`limit`、`cursor` |
| `GET /api/v1/admin/users/{id}` | 详情 |
| `POST /api/v1/admin/users/invite` | 邀请：`{email, role_id, display_name?}`；M5.1 |
| `PATCH /api/v1/admin/users/{id}` | `{display_name?, email?, status?, role_ids?}`；M5.1；改邮箱需唯一校验并写审计，必要时要求重新登录 |
| `POST /api/v1/admin/users/{id}/disable` | 禁用；M5.1 |
| `POST /api/v1/admin/users/{id}/enable` | 启用；M5.1 |
| `GET /api/v1/admin/users/export` | CSV 导出；M5.1 |

列表项：

```json
{
  "id": "uuid",
  "display_name": "周丹",
  "email": "you@example.com",
  "roles": [{"id": "uuid", "key": "superadmin", "name": "超级管理员"}],
  "status": "active",
  "last_login_at": "2026-11-08T01:42:00Z",
  "session_count": 12,
  "created_at": "2026-10-01T08:00:00Z"
}
```

`stats`：`{"total":6,"active":4,"disabled":1,"pending":1}`。

### 5.3 角色与权限

| 端点 | 说明 |
|---|---|
| `GET /api/v1/admin/roles` | 角色列表（含 `builtin`、`permission_count`、`user_count`） |
| `POST /api/v1/admin/roles` | 新建角色 `{key,name,description}` |
| `PATCH /api/v1/admin/roles/{id}` | 改名/描述；内置角色不可改 `key` |
| `DELETE /api/v1/admin/roles/{id}` | 内置角色返回 409；有用户引用时 409 |
| `GET /api/v1/admin/permissions` | 权限目录（分组） |
| `GET /api/v1/admin/roles/{id}/permissions` | 角色权限键数组 |
| `PUT /api/v1/admin/roles/{id}/permissions` | `{permissions:["..."]}`；全量覆盖；内置 `superadmin` 返回 409 |

### 5.4 菜单

| 端点 | 说明 |
|---|---|
| `GET /api/v1/admin/menus/tree?scope=` | 树形结构 |
| `POST /api/v1/admin/menus` | 新建 |
| `PATCH /api/v1/admin/menus/{id}` | 修改 |
| `DELETE /api/v1/admin/menus/{id}` | 有子节点返回 409 |
| `PUT /api/v1/admin/menus/order` | `{items:[{id,sort,parent_id}]}` 批量排序 |

菜单项：

```json
{
  "id": "uuid",
  "parent_id": null,
  "name": "管理控制台",
  "path": "/admin",
  "type": "directory",
  "icon": "workspace",
  "permission_key": null,
  "sort": 2,
  "visible": true,
  "enabled": true,
  "scope": "admin",
  "children": []
}
```

### 5.5 字典

| 端点 | 说明 |
|---|---|
| `GET /api/v1/admin/dictionaries` | 字典类型列表（含 `item_count`） |
| `POST /api/v1/admin/dictionaries` | 新建类型 |
| `PATCH /api/v1/admin/dictionaries/{id}` | 修改 |
| `DELETE /api/v1/admin/dictionaries/{id}` | 有字典项时 409 |
| `GET /api/v1/admin/dictionaries/{id}/items` | 字典项 |
| `POST /api/v1/admin/dictionaries/{id}/items` | 新增项 |
| `PATCH /api/v1/admin/dictionaries/{id}/items/{item_id}` | 修改项 |
| `DELETE /api/v1/admin/dictionaries/{id}/items/{item_id}` | 删除项 |
| `PUT /api/v1/admin/dictionaries/{id}/items/order` | 排序 |

> 字典值参与 API 契约（如 `task_status`），修改 `value` 前应提示「可能影响调用方」；建议禁止修改已上线的 `value`，只允许改 `label/color/sort/enabled`。

### 5.6 审计

| 端点 | 说明 |
|---|---|
| `GET /api/v1/admin/audit` | 列表：`q`、`category`、`action`、`result`、`actor_id`、`from`、`to`、`limit`、`cursor` |
| `GET /api/v1/admin/audit/{id}` | 详情（含 `detail` JSON） |
| `GET /api/v1/admin/audit/export` | CSV 导出（异步任务或流式下载） |

列表项：

```json
{
  "id": 12345,
  "created_at": "2026-11-08T09:42:00Z",
  "actor": {"id": "uuid", "name": "周丹", "type": "user"},
  "category": "menu",
  "action": "menu.update",
  "action_label": "更新菜单",
  "resource": {"type": "menu", "id": "...", "label": "管理控制台 / 菜单管理"},
  "ip": "10.0.12.4",
  "result": "success",
  "error_code": null,
  "request_id": "..."
}
```

`stats` 可省略；筛选结果计数用 `has_more` 足够。

### 5.7 系统设置

| 端点 | 说明 |
|---|---|
| `GET /api/v1/admin/settings` | 所有分组（secret 类字段只返回 `configured:true`） |
| `GET /api/v1/admin/settings/export` | 导出可审阅的配置 JSON（不含密钥/连接串） |
| `PUT /api/v1/admin/settings/{section}` | 分组更新：`basic/auth/a2a/model/data/features` |
| `POST /api/v1/admin/settings/a2a/test` | 测试 A2A 连接 `{url?}` |
| `PUT /api/v1/admin/settings/maintenance` | `{enabled:true}` 维护模式 |

约定：

- 更新前校验类型/范围；未知 key 返回 422；
- 环境变量控制的字段（DB、JWT secret、加密 key）只读，返回 `source:"env"`；
- 每次更新写审计 `settings.update`，`detail` 记录 `section/field/from/to`（脱敏）；
- 维护模式开启后，普通用户新建 run 返回 `503 maintenance`（新增错误码）。

---

## 6. 安全要求

1. 所有 `/admin/*` 接口在 M5.0 要求 `users.role='admin'`；M5.1 起按第 3 节叠加细粒度权限，并同步更新 `docs/api.md` 与越权用例；
2. 管理端写操作全部写审计，包含操作者、IP、request_id、变更前后摘要；
3. 响应不返回密码哈希、JWT、MCP 明文凭据、数据库连接串；
4. 邀请 token 只存哈希，一次性使用，默认 7 天过期；
5. 用户禁用后立即失效 refresh token，并进行中的 run 允许完成或取消（策略需定）；
6. 角色/权限变更后，已登录用户的权限下一次请求生效（不要缓存过久）；
7. 审计导出限流，避免拖库；
8. 管理端建议强制 MFA（M6）。

---

## 7. 降级与上线策略

### 7.1 页面级降级

| 页面 | 契约未就绪时 |
|---|---|
| 概览 | 用现有 `/system/info`、各列表 `stats` 拼装；缺失显示 `—` |
| 用户 | 只读列表；邀请/禁用按钮置灰 |
| 角色权限 | 显示「M5.1 目标」；不提供编辑 |
| 菜单 | 显示「M5.2 目标」；导航仍用前端静态配置 |
| 字典 | 显示「M5.2 目标」；状态标签用前端常量 |
| 审计 | 显示「契约未就绪」；不展示假数据 |
| 系统设置 | 只展示已有三类（平台指令、系统 MCP、系统技能）与只读环境信息 |

### 7.2 上线顺序

1. 后端先上 `GET /admin/overview`、`GET /admin/audit`、`GET /admin/users`（只读）；
2. 前端把 v8 从「原型演示」切到「只读真实数据」；
3. 再上 RBAC 表与角色编辑；
4. 最后上菜单/字典；
5. 每次只放开一个页面的写操作，保留功能开关。

---

## 8. 验收清单

### 8.1 M5.0

- [ ] 概览 KPI 与各列表统计口径一致；
- [ ] 7 日运行量按自然日聚合，时区正确；
- [ ] 系统健康在依赖故障时返回 `degraded` 而不是 500；
- [ ] 审计列表支持时间/类别/结果筛选与分页；
- [ ] 审计详情能看到 `detail` 与 `request_id`；
- [ ] 用户只读列表支持搜索、角色/状态筛选；
- [ ] 非管理员访问 `/admin/*` 返回 403；
- [ ] 现有系统设置三类接口在管理端可用。

### 8.2 M5.1

- [ ] 邀请流程可用，token 一次性；原型文案承诺「发送邀请邮件」，M5.1 要么补邮件发送，要么统一改为「复制邀请链接」；
- [ ] 角色权限矩阵保存后，下一次请求生效；
- [ ] 内置 `superadmin` 不可删除、不可改权限；
- [ ] 删除有用户引用的角色返回 409；
- [ ] 禁用用户后 refresh token 失效；
- [ ] 所有写操作有审计。

### 8.3 M5.2

- [ ] 菜单树增删改排序正确，删除有子节点返回 409；
- [ ] 菜单变更后重新登录生效；
- [ ] 字典项 `value` 修改有二次确认/禁止；
- [ ] 字典颜色/排序/启停影响前端展示；
- [ ] 导出 CSV 字段与列表一致。

---

## 9. 开放问题

| ID | 问题 | 建议 |
|---|---|---|
| A1 | RBAC 是否取代 `users.role='admin'` 门禁？ | M5.0 保留；M5.1 叠加权限键，同步改 `api.md`，不要两套门禁并存 |
| A2 | `users.role` 是否保留？ | 保留，作为快速门禁与兼容字段 |
| A3 | 菜单是数据库驱动还是前端静态？ | v1 前端静态 + 管理端只读展示；v2 数据库驱动 |
| A4 | 字典值是否允许修改？ | 禁止修改已上线 `value`，只改展示属性 |
| A5 | 邀请流程走邮件还是管理员复制链接？ | 先复制链接，邮件后续 |
| A6 | 审计保留 365 天如何清理？ | 按月分区/归档，M6 |
| A7 | 系统设置存 DB 还是 env？ | 业务配置 DB，密钥/连接串 env |
| A8 | 维护模式下进行中的 run 如何处理？ | 允许完成，禁止新建 |
| A9 | 管理员能否读取用户会话内容？ | v1 不提供，仅审计元数据 |
| A10 | 管理端是否需要独立登录入口？ | 同一账号，`/admin` 路由守卫按权限 |

---

## 10. 对现有文档的影响

| 文档 | 变更 |
|---|---|
| 后端 `docs/api.md` | 新增 `/admin/*` 端点、错误码、字段 |
| 后端 `docs/database.md` | 新增 RBAC/菜单/字典表，扩展 `audit_logs` |
| 后端 `docs/roadmap.md` | M5 拆成 M5.0/M5.1/M5.2，或新增 M5+ 管理端 |
| 前端 `docs/pages.md` | v8 标注「M5+ 目标」，不按 M1 承诺 |
| 本包 `README.md` | D2 决策落定后更新推荐范围 |
