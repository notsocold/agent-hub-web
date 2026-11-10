# 核心契约增量

- 适用：`ui-v7.html`、`ui-v7-pages.html` 所覆盖的工作台与业务页面
- 基线：[agent-hub `docs/api.md`](../../../../PythonProjects/agent-hub/docs/api.md)（已有端点不重复描述）
- 读法：只写「相对现有契约的增量」；标 ✅ 的是现有设计已覆盖、只需确认；标 ➕ 的是新增字段；标 🆕 的是新增端点；标 ⚠️ 的是需要拍板
- 约定：字段 `snake_case`；时间 ISO 8601 UTC；ID 为 UUID v4；时长统一 `*_ms` 整数；分页统一 cursor

---

## 1. 通用约定

### 1.1 列表响应

所有新增或扩展的列表接口统一为：

```json
{
  "items": [],
  "next_cursor": null,
  "has_more": false,
  "stats": {}
}
```

- `stats` 为可选扩展，用于页面顶部计数；没有时前端从当前页或全量接口降级计算；
- `stats` 的具体键在各接口章节定义；
- `next_cursor` 为不透明字符串，前端不得解析；
- 列表默认按业务排序（会话按 `last_message_at desc`，任务按 `created_at desc`，审计按 `created_at desc`）。

### 1.2 标识与展示

| 约定 | 说明 |
|---|---|
| API 主键 | 一律 UUID；原型里的 `task_9b2a`、`run_9a8b7c`、`chunk_7a2e` 只是展示用短 ID |
| A2A 远程 ID | `a2a_task_id` 保留远程原值，仅用于展示与排障；所有 API 路径使用本地 `id` |
| 事件 ID | 运行事件的 `id` 是不透明字符串（建议 `<run_id>:<seq>`），不要求 UUID |
| 审计 ID | `audit_logs.id` 是 `bigserial`，是「主键 UUID」的显式例外；前端按字符串/数字原样使用 |
| 记忆 ID | 长期记忆 key 为 `mem_<uuid4hex>`（LangGraph Store 约定），不是标准 UUID 字符串 |
| 会话标题 | 允许前端截断展示，后端返回完整 `title`（≤200 字符） |
| 枚举 | 一律 `snake_case`；新增枚举值前端必须容忍，不得因未知值报错 |
| 时长 | `duration_ms`、`first_token_ms`、`last_latency_ms` 均为整数毫秒 |
| 时间 | `created_at`、`updated_at`、`started_at`、`finished_at`、`expires_at` 均为 UTC ISO 8601 |
| 文本截断 | `*_preview`、`args_preview`、`summary` 由后端截断；前端不再二次截断 |
| 示例 ID | 文档中为可读性使用 `9a8b...` 这类缩略写法；实际响应必须是完整 UUID v4 |

### 1.3 SSE 通用

- 每帧格式：`id: <run 内递增序号>`、`event: <事件名>`、`data: <单行 JSON>`；
- 每个业务事件的 `data` 至少包含 `run_id`、`ts`；新增事件必须带 `seq`（与 SSE `id` 一致）；
- 心跳：服务端每 15 秒发送注释 `: ping`；
- 事件顺序由后端保证；前端只按 `seq` 递增处理，不依赖到达顺序；
- 支持 `Last-Event-ID` 时，断线重连从该序号之后续传（可选，M1 可先不做）；
- 未知事件前端忽略并记录，不中断流。

### 1.4 幂等与并发

| 场景 | 约定 |
|---|---|
| 聊天重试 | `client_message_id` 映射到 `runs.idempotency_key`；唯一性由现有 `UNIQUE (conversation_id, idempotency_key)` 保证；重复请求建议返回已有 run 的事件回放，最低要求返回 `409 conflict` 并带 `run_id` |
| 附件上传 | 支持 `Idempotency-Key`；相同 checksum 在同一用户下返回已有附件（`duplicate=true`） |
| 同一会话并发 | 已有 run 未结束时返回 `409 run_in_progress`，响应体带当前 `run_id` |
| 审批决定 | 乐观更新；重复决定返回 `409 approval_already_decided` |
| 任务动作 | 状态不匹配返回 `409 task_not_*` |

### 1.5 权限与可见性

- 用户侧资源不属于当前用户时返回 `404 not_found`，不返回 403，避免探测；
- 管理端接口要求 `role=admin`，越权返回 `403 forbidden`；
- 系统项（系统技能、系统 MCP、全局知识文档）对普通用户只读；
- 所有写操作写入 `audit_logs`（M1.5 起）。

---

## 2. 认证与账号

### 2.1 `GET /api/v1/auth/me` ➕

现有设计未列响应字段。建议：

```json
{
  "id": "uuid",
  "email": "you@example.com",
  "display_name": "周丹",
  "status": "active",
  "role": "user",
  "created_at": "2026-10-01T08:00:00Z",
  "last_login_at": "2026-11-08T01:42:00Z"
}
```

- `role`：`user` / `admin`，前端只用于显示与入口判断，权限仍由服务端校验；
- 不返回密码哈希、令牌、内部权限列表。

### 2.2 🆕 `PATCH /api/v1/auth/me`

请求：

```json
{"display_name": "老赵"}
```

响应：同 `GET /auth/me`。校验：1–64 字符，去首尾空格；空字符串返回 `422 validation_error`。

### 2.3 🆕 `POST /api/v1/auth/change-password`

请求：

```json
{"current_password": "old", "new_password": "new"}
```

响应 `204`。错误：

| HTTP | code | 场景 |
|---|---|---|
| 400 | `invalid_password` | 当前密码错误 |
| 422 | `validation_error` | 新密码长度不足或与旧密码相同 |
| 429 | `rate_limited` | 频繁尝试 |

> 原型设置页已标注「账号资料修改与密码接口待后端补（M1）」；这两项可作为 M1 末或 M2 的补充，不阻塞对话闭环。

---

## 3. 会话与消息

### 3.1 `GET /api/v1/conversations` ➕

新增查询参数：

| 参数 | 类型 | 说明 |
|---|---|---|
| `q` | string | 标题模糊搜索，1–100 字符；不区分大小写 |
| `status` | string | `active` / `archived` / `all`；默认 `all`（不含 `deleted`） |
| `limit` | int | 默认 20，最大 100 |
| `cursor` | string | 不透明游标 |

列表项在现有 `id/title/status/last_message_at/created_at` 基础上新增：

| 字段 | 类型 | 说明 |
|---|---|---|
| `message_count` | int | 消息总数（含 user/assistant，不含 tool/system）；用于「37 条消息」 |
| `last_message_preview` | string | 最后一条消息前 80 字符；无消息时为空串 |
| `pending_approval_count` | int | 待审批数；>0 时侧栏显示「待审批」 |
| `updated_at` | string | 最后更新时间 |

`stats` 建议：

```json
{"total": 7, "active": 6, "archived": 1, "pending_approval": 1}
```

示例：

```json
{
  "items": [
    {
      "id": "0f1e7a2c-...",
      "title": "Q3 客服工单周报",
      "status": "active",
      "message_count": 24,
      "last_message_preview": "周报已经定稿，发布前需要你确认。",
      "last_message_at": "2026-11-08T14:43:00Z",
      "pending_approval_count": 1,
      "created_at": "2026-11-08T14:41:00Z",
      "updated_at": "2026-11-08T14:43:00Z"
    }
  ],
  "next_cursor": "cursor_conv_2",
  "has_more": true,
  "stats": {"total": 7, "active": 6, "archived": 1, "pending_approval": 1}
}
```

实现建议：

- `message_count` 可用子查询计算；会话量级大时再加冗余列（见第 12 节）；
- `last_message_preview` 从最后一条 `messages` 取，注意不要把 `tool` 角色内容当预览；
- `pending_approval_count` 只统计 `approvals.status='pending'` 且未过期的记录。

### 3.2 `GET /api/v1/conversations/{id}` ✅

建议响应与列表项一致，另加：

| 字段 | 类型 | 说明 |
|---|---|---|
| `archived_at` | string/null | 归档时间 |
| `last_run` | object/null | `{id,status,model,finished_at}`，用于会话详情页 |

### 3.3 `PATCH /api/v1/conversations/{id}` ✅

请求字段明确为：

```json
{"title": "新标题", "status": "archived"}
```

- `title` 1–200 字符；
- `status` 只允许 `active` / `archived`；`deleted` 只能通过 `DELETE`；
- 两个字段都可选，至少传一个。

### 3.4 `GET /api/v1/conversations/{id}/messages` ➕

新增查询参数：`limit`、`cursor`、`before`（可选，按时间倒序翻页）。

消息项在现有字段上补充：

| 字段 | 类型 | 说明 |
|---|---|---|
| `client_message_id` | string/null | 前端幂等键，写入 `runs.idempotency_key`；消息表保留该值用于乐观替换 |
| `status` | string | `completed` / `failed` / `canceled`；历史消息不返回 `streaming` |
| `citations` | array | 引用来源，见下 |
| `attachments` | array | `[{id,filename,mime_type,size_bytes}]` |
| `artifacts` | array | 助手生成的产物：`[{id,name,mime_type,size_bytes,kind,content?,download_url?,metadata?}]`；`metadata` 可放 `sections`/`source_count`；无产物时为 `[]` |
| `capabilities` | object | 该消息发送时的上下文快照：`{skills,mcp_servers,mcp_tools,knowledge_categories,workflow_id?}`；历史消息据此显示 chip，不必再查 run |
| `usage` | object/null | `{input_tokens,output_tokens,reasoning_tokens}` |
| `error` | object/null | `{code,message}`，失败消息才有 |
| `metadata` | object | 现有字段保留，前端不解析未知键 |

引用项：

```json
{
  "index": 1,
  "document_id": "uuid",
  "chunk_id": "uuid",
  "title": "Q3 客服复盘 v2",
  "category": "客服",
  "score": 0.94,
  "updated_at": "2026-09-30T00:00:00Z"
}
```

- `index` 从 1 开始，对应正文角标 `[1]`；
- `score` 为 0–1 的余弦相似度，前端显示两位小数；
- 没有引用时返回 `[]`，不要返回 `null`；
- 生成产物复用 `attachments` 表存储（`purpose=artifact`），`messages.artifacts` 只是快照；下载仍走 `GET /attachments/{id}`，保留策略与附件一致。

示例消息：

```json
{
  "id": "e5f6...",
  "role": "assistant",
  "content": "Q3 共收到 128 条工单……",
  "content_type": "markdown",
  "run_id": "9a8b...",
  "client_message_id": null,
  "status": "completed",
  "citations": [
    {
      "index": 1,
      "document_id": "d1...",
      "chunk_id": "c1...",
      "title": "Q3 客服复盘 v2",
      "category": "客服",
      "score": 0.94,
      "updated_at": "2026-09-30T00:00:00Z"
    }
  ],
  "attachments": [],
  "capabilities": {"skills": [], "mcp_servers": [], "mcp_tools": [], "knowledge_categories": ["客服"], "workflow_id": null},
  "artifacts": [
    {"id": "a1...", "name": "Q3 客服工单周报.md", "mime_type": "text/markdown", "size_bytes": 2457, "kind": "markdown", "content": "# Q3 客服工单周报\n\n本季度共收到 128 条工单……", "download_url": null}
  ],
  "usage": {"input_tokens": 6842, "output_tokens": 1236, "reasoning_tokens": 642},
  "error": null,
  "created_at": "2026-11-08T14:42:00Z"
}
```

---

### 3.5 附件（独立资源） 🆕

附件是对话输入的一部分，**不是知识库文档**；两者不要复用同一个上传接口。

#### 上传

`POST /api/v1/attachments`，`multipart/form-data`：

| 字段 | 必填 | 说明 |
|---|---|---|
| `file` | 是 | 单文件，默认 ≤20 MB |
| `conversation_id` | 否 | 先上传后可发消息；为空时仅归属用户 |
| `purpose` | 否 | 默认 `chat`；不要用来伪装知识库入库 |

响应 `201`：

```json
{
  "id": "uuid",
  "filename": "q3-support-tickets.csv",
  "mime_type": "text/csv",
  "size_bytes": 24576,
  "checksum": "sha256:...",
  "status": "ready",
  "created_at": "2026-11-08T14:40:00Z",
  "expires_at": "2026-12-08T14:40:00Z"
}
```

- 小文件同步扫描后直接 `ready`；大文件可先返回 `processing`，由 `GET /attachments/{id}` 轮询；
- `chat/stream` 只接受 `status=ready` 的附件；
- 相同用户 + 相同 checksum 可返回已有附件（`duplicate=true`），避免重复存储；
- 类型白名单建议：`text/plain`、`text/markdown`、`text/csv`、`application/json`、`application/pdf`；可配置；
- 超限 `413 attachment_too_large`；类型不允许 `422 attachment_type_not_allowed`；未就绪 `422 attachment_not_ready`。

#### 查询与删除

| 端点 | 说明 |
|---|---|
| `GET /api/v1/attachments?conversation_id=` | 「@」选择器复用历史附件；按 `created_at desc`，cursor 分页 |
| `GET /api/v1/attachments/{id}` | 详情/轮询状态；非所有者返回 404 |
| `DELETE /api/v1/attachments/{id}` | `204`；已被消息引用时建议软删或返回 `409 conflict` |

#### 存储与保留

- 对象存储（S3 兼容）优先，本地开发可落磁盘；
- `storage_key` 不返回给前端；下载走签名 URL 或受控下载端点；
- 默认保留 30 天；清理任务不得删除仍被消息引用的附件；
- 附件元数据进入消息 `attachments` 快照，消息历史不依赖附件表仍可展示文件名/大小。

---

## 4. 聊天与 SSE

### 4.1 `POST /api/v1/chat/stream` 请求扩展

| 字段 | 类型 | 必填 | 变更 | 说明 |
|---|---|---|---|---|
| `conversation_id` | uuid | 否 | ✅ | 为空时创建新会话 |
| `message` | string | 是 | ✅ | 1–8000 字符 |
| `client_message_id` | string | 否 | ✅ | 同一会话内幂等，建议 ≤64 字符 |
| `attachments` | uuid[] | 否 | ✅ | 已上传且 `status=ready` 的附件 ID，≤5 |
| `skills` | uuid[] | 否 | ✅ | 本轮显式激活，≤3 |
| `mcp_servers` | uuid[] | 否 | ✅ | 本轮强制纳入，≤5 |
| `mcp_tools` | uuid[] | 否 | ✅ | 本轮强制纳入，≤10 |
| `model` | string | 否 | ➕ | 模型 ID，必须在 `/system/info.models` 白名单内 |
| `reasoning_effort` | string | 否 | ➕ | `low` / `medium` / `high`，映射 UI 的「标准/深度/最大」 |
| `knowledge_categories` | string[] | 否 | ➕⚠️ | 知识库检索范围，≤5；对应现有 `knowledge_documents.category` |
| `workflow_id` | uuid | 否 | ➕⚠️ | 本轮使用的工作流；与手动上下文互斥 |
| `workflow_version` | int | 否 | ➕⚠️ | 不传则使用已发布版本 |

校验规则：

1. `workflow_id` 非空时，`skills` / `mcp_servers` / `mcp_tools` / `knowledge_categories` 必须为空，否则 `422 workflow_context_conflict`；
2. `model` 不在白名单 → `422 model_not_allowed`；
3. `reasoning_effort` 不在枚举 → `422 reasoning_effort_invalid`；
4. 附件不属于当前用户 / 未就绪 → `422 attachment_not_ready`；
5. 已有运行未结束 → `409 run_in_progress`，响应体带当前 `run_id`；
6. 会话已归档/删除 → `409 conflict`。

### 4.2 SSE 响应头 ➕

```http
Content-Type: text/event-stream
Cache-Control: no-cache
X-Accel-Buffering: no
X-Request-ID: ...
X-Run-ID: 9a8b...
```

- `X-Run-ID` 是新增的关键字段：`fetchEventSource` 在 `onopen` 即可读到，用于「停止」按钮；
- 如果网关会吞掉响应头，则必须保证首个 SSE 事件为 `run.started`；
- 两者都提供最稳妥；跨域直连时响应头需带 `Access-Control-Expose-Headers: X-Run-ID, X-Request-ID`。

### 4.3 事件顺序

正常一轮：

```text
conversation.created?   （仅新会话）
run.started
message.created         （user）
message.started         （assistant）
reasoning.delta*        （模型支持时）
reasoning.done?
message.delta*
skill.activated*
tool.start / tool.result*
a2a.task / a2a.artifact*
a2a.input_required / a2a.auth_required?
approval.required?
workflow.step*
memory.saved*
notice*
message.done
```

规则：

- `run.started` 必须在任何需要 `run_id` 的事件之前；
- `message.started` 必须在第一个 `message.delta` / `reasoning.delta` 之前；
- `workflow.step` 出现在对应步骤执行前后，位置不固定，上图中的位置只是示例；
- `message.done` 是正常结束的最后一个事件；
- 致命错误：发送 `error` 后关闭流；若已有部分输出，前端保留已渲染内容；
- HITL 中断：见 4.5，不立即关闭流。

### 4.4 事件目录（含新增）

| 事件 | 状态 | 时机 | `data` 关键字段 |
|---|---|---|---|
| `conversation.created` | ✅ | 新会话创建 | `conversation_id`、`title` |
| `run.started` | 🆕 | 流开始、run 落库后 | `run_id`、`conversation_id`、`user_message_id`、`client_message_id`、`model`、`reasoning_effort`、`workflow_id?`、`workflow_version?` |
| `message.created` | ✅➕ | 用户消息落库 | `message_id`、`role:"user"`、`client_message_id`、`created_at` |
| `message.started` | 🆕 | 助手消息开始 | `message_id`、`role:"assistant"`、`run_id`、`started_at` |
| `message.delta` | ✅ | 助手增量 token | `message_id`、`delta` |
| `reasoning.delta` | 🆕 | 思考摘要增量 | `message_id`、`delta` |
| `reasoning.done` | 🆕 | 思考结束 | `message_id`、`duration_ms`、`tokens`、`summary` |
| `skill.activated` | ✅➕ | 本轮技能激活 | `skill_id`、`slug`、`name`、`scope`、`source`、`version`、`description`、`estimated_tokens`、`duration_ms`、`trigger?`、`template?`、`constraints?` |
| `tool.start` | ✅➕ | 工具开始 | `tool_call_id`、`tool`、`display_name`、`args`、`args_preview`、`source`、`source_id`、`server?`、`risk?`、`requires_approval?`、`metadata?` |
| `tool.result` | ✅➕ | 工具结束 | `tool_call_id`、`status`、`summary`、`result_preview`、`duration_ms`、`source`、`error?`、`citations?`、`metadata?` |
| `a2a.task` | ✅➕ | 远程任务状态变化 | `task_id`（本地）、`a2a_task_id`、`agent`（slug 字符串，兼容现有）、`agent_detail?`（对象）、`state`、`progress`、`request_summary?`、`result_summary?`、`duration_ms?`、`error?` |
| `a2a.artifact` | ✅➕ | 远程产出片段 | `task_id`、`a2a_task_id`、`artifact`（`type/summary/parts/data`） |
| `a2a.input_required` | ✅➕ | 远程要求补充信息 | `task_id`、`a2a_task_id`、`agent`、`agent_detail?`、`question`、`input_schema?`、`expires_at?` |
| `a2a.auth_required` | ✅➕ | 远程要求授权 | `task_id`、`a2a_task_id`、`agent`、`agent_detail?`、`scopes`、`authorization_url?`、`expires_at?` |
| `approval.required` | ✅➕ | 需要人工确认 | `approval_id`、`tool`、`reason`、`payload`、`source`、`executor`、`target`、`side_effect`、`risk`、`expires_at` |
| `workflow.step` | 🆕 | 工作流步骤状态 | `workflow_id`、`workflow_version`、`step_index`、`step_type`、`name`、`status`、`duration_ms?` |
| `memory.saved` | ✅ | 记忆保存 | `memory_id`、`kind`、`action`、`preview` |
| `notice` | ✅➕ | 能力降级/提示 | `level`、`code`、`message`、`retryable?` |
| `message.done` | ✅➕ | 本轮结束 | `run_id`、`message_id`、`usage`、`finish_reason`、`model`、`first_token_ms`、`duration_ms`、`active_duration_ms`、`citations?`、`reasoning?`、`artifacts?` |
| `error` | ✅➕ | 流内致命错误 | `code`、`message`、`request_id`、`run_id`、`retryable` |
| `ping` | ✅ | 心跳 | 空或 `{}` |

`tool.start/result.metadata` 是可选扩展，用于承载原型工具卡里的详情行，避免把这些字段硬编码进 `args`：

| `source` | 建议键 |
|---|---|
| `knowledge` | `index`（如 `pgvector_hnsw`）、`metric`（`cosine`）、`embedding_model`、`embedding_dim`、`top_k`、`category` |
| `native` | `rows_read`、`rows_total`、`group_by`、`groups`、`sandbox` |
| `mcp` | `server_version`、`transport`、`channel`、`members`、`scopes` |

> 前端只展示白名单键；未知键忽略，不要渲染任意 HTML。

### 4.5 HITL 期间的流生命周期 ⚠️（建议拍板）

审批与 A2A 等待输入会中断图执行。原始 SSE 流不能直接结束，否则前端看不到恢复后的输出。建议：

1. 发送 `approval.required` / `a2a.input_required` / `a2a.auth_required` 后，**保持 SSE 连接**，每 15 秒心跳；
2. 用户在另一个请求里批准/补充信息/授权（`POST /approvals/{id}/decision`、`POST /tasks/{id}/resume` 等）；
3. 后端恢复图执行，继续在同一流里发送 `message.delta` / `tool.*` / `message.done`；
4. 等待上限建议 `HITL_STREAM_TIMEOUT=15m`；超时发送 `message.done.finish_reason="interrupted"` 并关闭；
5. 客户端断开不代表取消：run 保持 `interrupted`，审批决定后仍可恢复；前端可通过 `GET /runs/{id}` 与 `GET /runs/{id}/events` 补状态；
6. 如果后端选择「中断即关流」，必须新增 `POST /runs/{id}/stream`（或 `GET /runs/{id}/events?follow=true`）用于恢复后的续流，并在契约中写清。

> 这是本次交接发现的**第二大缺口**：现有文档只写了「批准后恢复运行」，没有定义恢复后的输出从哪条连接返回。

### 4.6 取消与断线

- `POST /runs/{id}/cancel` 后，流应在 `message.done` 中返回 `finish_reason="canceled"`，已生成内容保留；
- 取消是幂等的：已结束的 run 返回 `409 run_not_cancelable` 或 `200 {status}`（二选一，建议前者并带当前状态）；
- 客户端断开 SSE 不自动取消后端运行；
- 断线重连优先用 `GET /runs/{id}/events?after_seq=` 补齐事件，再决定是否继续展示；
- `message.done` 后服务端关闭流。

---

## 5. 运行与事件

### 5.1 `GET /api/v1/runs/{id}` ➕

建议响应：

```json
{
  "id": "9a8b...",
  "conversation_id": "0f1e...",
  "status": "interrupted",
  "source": "user",
  "model": "deepseek-chat",
  "reasoning_effort": "low",
  "workflow": {"id": "wf...", "name": "客服周报", "version": 2},
  "capabilities": {
    "skills": [],
    "mcp_servers": [],
    "mcp_tools": [],
    "knowledge_categories": []
  },
  "usage": {
    "input_tokens": 6842,
    "output_tokens": 1236,
    "reasoning_tokens": 642,
    "total_tokens": 8078
  },
  "started_at": "2026-11-08T14:41:18Z",
  "finished_at": null,
  "duration_ms": 102000,
  "active_duration_ms": 42000,
  "first_token_ms": 120,
  "pending": {
    "kind": "approval",
    "approval_id": "ap_...",
    "task_id": null
  },
  "message_ids": {
    "user": "u-msg...",
    "assistant": "a-msg..."
  },
  "agents": [
    {"kind": "local", "id": "main-agent", "name": "main-agent", "model": "deepseek-chat", "state": "online"},
    {"kind": "a2a", "id": "agent-uuid", "slug": "data-analyst", "name": "Data Analyst", "skill_id": "verify_numbers", "state": "idle"}
  ],
  "error": null
}
```

字段说明：

| 字段 | 说明 |
|---|---|
| `status` | 现有枚举 `queued/running/succeeded/failed/canceled/interrupted` |
| `pending.kind` | `approval` / `input_required` / `auth_required` / null；前端据此显示「待审批/等待输入/需要授权」 |
| `pending.approval_id` | 有审批时必填 |
| `pending.task_id` | A2A 等待时必填 |
| `workflow` | 未使用工作流时为 null |
| `usage.total_tokens` | 建议由后端计算，避免前端加总口径不一致 |
| `usage.reasoning_tokens` | 建议为 `output_tokens` 的子集（多数 OpenAI 兼容接口如此）；`total_tokens = input_tokens + output_tokens`，不要重复加 reasoning |
| `first_token_ms` | 首 token 延迟；非流式或失败时为 null |
| `duration_ms` | 墙钟时长：从 `started_at` 到 `finished_at`（运行中则为当前时刻） |
| `active_duration_ms` | 活跃时长：排除审批/补充信息/授权等待后的执行时间；用于「活跃 8.5s / 墙钟 42s」 |
| `agents` | 本轮参与的本地/远程智能体，用于运行详情「本轮智能体」；可从事件推导，但建议直接返回 |

> `capabilities` 只记录请求里的**显式选择**；工作流内部的技能/MCP/检索步骤不写入该对象，而是体现在 `workflow` 与 `workflow.step` 事件中。

### 5.2 `GET /api/v1/runs/{id}/events` 🆕（后端标注「规划」，本次定义字段）

查询参数：

| 参数 | 说明 |
|---|---|
| `limit` | 默认 100，最大 500 |
| `after_seq` | 只返回 `seq > after_seq` 的事件 |
| `types` | 逗号分隔，如 `message,tool,a2a` |
| `q` | 事件标题/摘要搜索（可选） |

响应：

```json
{
  "items": [
    {
      "id": "evt_01",
      "seq": 1,
      "ts": "2026-11-08T14:41:18Z",
      "type": "request",
      "status": "ok",
      "title": "用户消息",
      "subtitle": "Q3 客服工单周报",
      "duration_ms": null,
      "tokens": {"input": 6842},
      "payload": {},
      "error": null
    }
  ],
  "next_cursor": "cursor_evt_1",
  "has_more": true
}
```

`type` 枚举与轨迹页的行类型对应：

| `type` | UI 分组 | 典型来源 |
|---|---|---|
| `request` | 消息 | 本轮请求参数（模型、附件、技能、MCP、工作流） |
| `message` | 消息 | 用户消息、助手草稿/最终输出 |
| `skill` | 工具 | `skill.activated` |
| `tool` | 工具 | 原生工具、知识检索、技能工具 |
| `a2a` | A2A | `a2a.task` / `a2a.artifact` |
| `mcp` | MCP | `tool.start/result` 且 `source=mcp` |
| `approval` | 审批 | `approval.required` + 决定结果 |
| `workflow` | 轨迹轨道 | `workflow.step` 的步骤状态（前端可折叠进对应步骤） |
| `notice` | 其他 | 降级提示 |
| `error` | 其他 | 流内错误 |

`status`：`ok` / `running` / `waiting` / `error` / `canceled` / `skipped`。

原型筛选与 `types` 参数的映射：

| UI 筛选 | `types` |
|---|---|
| 全部 | 不传 |
| 消息 | `request,message`（原型把「请求」计入消息） |
| 工具 | `skill,tool`（原型把技能计入工具） |
| A2A | `a2a` |
| MCP | `mcp` |
| 审批 | `approval` |

`payload` 按类型：

| `type` | `payload` 字段 |
|---|---|
| `request` | `method`、`path`、`conversation_id`、`message_id`、`client_message_id`、`model`、`reasoning_effort`、`attachments`、`skills`、`mcp_servers`、`knowledge_categories`、`workflow_id`、`workflow_version` |
| `message` | `message_id`、`role`、`content_preview`、`content_type`、`citations?`、`citations_count?`、`usage?`、`ttft_ms?` |
| `skill` | `skill_id`、`slug`、`name`、`scope`、`source`、`version`、`description`、`estimated_tokens`、`duration_ms`、`trigger?`、`template?`、`constraints?` |
| `tool` | `tool_call_id`、`tool`、`display_name`、`source`、`source_id`、`args`、`result`、`error?`、`metadata?` |
| `a2a` | `task_id`、`a2a_task_id`、`agent`（slug）、`agent_detail?`、`state`、`progress`、`request_summary?`、`result_summary?`、`artifact?`、`error?` |
| `mcp` | `server_id`、`server_slug`、`tool`、`tool_call_id`、`args`、`result`、`metadata?` |
| `approval` | `approval_id`、`tool_name`、`source`、`executor`、`target`、`side_effect`、`risk`、`reason`、`decision`、`decided_at` |
| `workflow` | `workflow_id`、`workflow_version`、`step_index`、`step_type`、`name`、`status`、`duration_ms?` |
| `notice` / `error` | `code`、`message`、`retryable` |

> 事件表是轨迹页的唯一数据源；`tool_invocations` 与 `a2a_tasks` 用于补齐详情，不应要求前端再拼多次请求。

### 5.3 `POST /api/v1/runs/{id}/cancel` ✅

- 请求体为空；
- 响应：`{"id":"...","status":"canceled","canceled_at":"..."}`；
- 已结束返回 `409 run_not_cancelable`，响应体带当前 `status`；
- 级联取消未完成的 A2A 任务（尽力而为）；
- 待审批的 approval 置为 `canceled`，等待输入的 task 置为 `canceled`，并写审计；
- 流以 `message.done.finish_reason=canceled` 结束（若连接仍在）。

### 5.4 `POST /api/v1/runs/{id}/resume` ✅

- 仅 `interrupted` 且 `pending.kind=input_required` 时可用；
- 请求：`{"input": "按创建时间统计"}`；
- 响应：`{"run_id":"...","status":"running","resumed":true}`；
- 与任务级 `POST /tasks/{id}/resume` 的关系：任务级接口是用户从任务页触发，内部复用 run 恢复；两个入口都保留，避免页面之间跳转。

---

## 6. 审批

### 6.1 `GET /api/v1/approvals` ➕

查询参数：

| 参数 | 说明 |
|---|---|
| `status` | `pending` / `approved` / `rejected` / `expired` / `canceled` / `all`，默认 `pending` |
| `conversation_id` | 可选 |
| `run_id` | 可选 |
| `limit` / `cursor` | 分页 |

列表项：

```json
{
  "id": "ap_7f21...",
  "run_id": "9a8b...",
  "conversation_id": "0f1e...",
  "conversation_title": "Q3 客服工单周报",
  "status": "pending",
  "tool_name": "mcp__slack_mcp__post_message",
  "tool_display_name": "Slack · 发送消息",
  "source": "mcp",
  "executor": "slack-mcp",
  "target": "#support-weekly · 12 名成员",
  "side_effect": "外部写操作；发布后可在 Slack 中删除",
  "risk": "write",
  "reason": "外部写操作触发 HITL，等待人工确认",
  "payload": {"channel": "C08F3K2", "text": "..."},
  "payload_preview": "{\"channel\":\"C08F3K2\",...}",
  "expires_at": "2026-11-08T15:10:00Z",
  "created_at": "2026-11-08T14:43:00Z",
  "decided_at": null,
  "decided_by": null,
  "decision_note": ""
}
```

`stats`：`{"pending":1,"approved":2,"rejected":0,"expired":0,"canceled":0}`。

字段来源建议：

| 字段 | 来源 |
|---|---|
| `source` | `tool_invocations.source` 或 `mcp/ native` |
| `executor` | MCP 服务器名 / 本地工具显示名 / A2A Agent 名 |
| `target` | 工具参数中的人类可读目标；由工具声明或后端生成 |
| `side_effect` | 工具风险声明中的副作用描述 |
| `risk` | `read/write/destructive/unknown` |

> 原型审批卡显示「执行工具/执行方/目标/副作用/超时」。现有 `approvals` 表已有 `run_id/a2a_task_id/status/decided_by/decision_note/expires_at/created_at/decided_at`，但缺 `source/executor/target/side_effect/risk/tool_display_name` 这六个展示字段；需补齐，否则前端只能从 `payload` 猜。

### 6.2 `POST /api/v1/approvals/{id}/decision` ✅

请求：

```json
{"decision": "approve", "note": "确认执行"}
```

响应：

```json
{"id": "ap_...", "status": "approved", "run_id": "9a8b...", "resumed": true, "resume_error": null}
```

- `decision`：`approve` / `reject`；
- `resumed=false` 时 `resume_error` 说明原因（如 run 已取消、图状态丢失）；
- 重复决定 → `409 approval_already_decided`；
- 已过期 → `409 approval_expired`，status 置 `expired`；
- 决定后写审计 `approval.decide`。

### 6.3 过期与超时

- `expires_at` 到期后，后台任务把 `status` 置 `expired`，并取消对应 run；
- run 被用户取消时，pending approval 置 `canceled`（不是 `expired`），避免把「用户主动取消」误记为「过期」；
- 前端在 `expires_at` 到达时把按钮置灰并显示「审批已过期」；
- 过期时间建议由系统设置 `approval.timeout_seconds` 控制，默认 30 分钟。

---

## 7. 智能体

### 7.1 `GET /api/v1/agents` ➕

新增查询参数：`health_status`、`enabled`、`q`、`limit`、`cursor`。

列表项在现有字段上补充：

| 字段 | 类型 | 说明 |
|---|---|---|
| `description` | string | Agent 描述 |
| `auth_type` | string | `none` / `api_key` / `oauth2` |
| `auth_scheme` | string | 展示用：`bearer` / `header` / `oauth2` / `none`；`auth_type=api_key` + `auth_scheme=bearer` 对应原型「bearer」 |
| `capabilities` | object | `{streaming: bool, push_notifications: bool}`，来自 Agent Card |
| `auth_hint` | string | 如 `env:DATA_AGENT_KEY`，不返回密钥 |
| `skill_count` | int | 技能数 |
| `last_checked_at` | string/null | 最近健康检查时间 |
| `last_latency_ms` | int/null | 最近检查延迟 |
| `last_error` | string/null | 最近错误摘要；健康时为空 |
| `recent_task` | object/null | `{id, a2a_task_id, state, duration_ms, finished_at}` |
| `health_status` | string | `unknown` / `healthy` / `degraded` / `unhealthy`（新增 `degraded`） |

`stats`：

```json
{"total": 3, "healthy": 2, "degraded": 1, "unhealthy": 0, "disabled": 0, "enabled": 3}
```

> 现有表枚举是 `unknown/healthy/unhealthy`；原型需要「降级」这个中间态。建议扩展为四态，`unhealthy` 表示完全不可用，`degraded` 表示超时/部分技能失败。前端映射见第 14 节。

建议判定规则（可配置）：

| 状态 | 条件 |
|---|---|
| `unknown` | 尚未检查，或从未成功拉取 Card |
| `healthy` | 最近一次检查成功，延迟 < 2s，且技能数 > 0 |
| `degraded` | 检查成功但延迟 ≥ 2s，或部分技能不可用，或连续失败 1–2 次 |
| `unhealthy` | 连续失败 ≥ 3 次，或 Card 拉取失败 |
| UI「已禁用」 | `enabled=false`，不占用 `health_status` 枚举 |

恢复：一次成功检查后回到 `healthy`；`consecutive_failures` 清零。阈值与检查间隔由系统设置控制。

> 现有 `remote_agents` 没有 `owner_user_id` / `scope`，v1 建议按**全局注册表**处理：所有登录用户可读与使用，写操作（注册/删除）受角色或权限控制。若产品要求「个人 Agent」，再补 `owner_user_id` 与可见性，不要默认按 owner 过滤。

### 7.2 🆕 `POST /api/v1/agents/preview`

用于「拉取 Agent Card → 预览 → 确认注册」两段式。

请求：

```json
{"url": "https://data.example.com/a2a", "slug": "data-analyst", "auth": {"type": "api_key", "secret_ref": "env:DATA_AGENT_KEY"}}
```

响应：

```json
{
  "valid": true,
  "card": {"protocolVersion": "1.0", "name": "Data Analyst", "...": "..."},
  "normalized": {
    "name": "Data Analyst",
    "description": "数据分析与数字核对",
    "url": "https://data.example.com/a2a",
    "protocol_version": "1.0",
    "skills": [{"id": "verify_numbers", "name": "数字核对", "description": "..."}],
    "capabilities": {"streaming": true, "push_notifications": false}
  },
  "warnings": []
}
```

- 不落库、不生成工具；
- SSRF 校验、Card 同源校验、技能数/描述长度校验与 `POST /agents` 一致；
- 失败：`422 agent_card_invalid` / `422 agent_url_not_allowed`；预览不写库，失败不产生副作用。

### 7.3 其他智能体端点 ➕

| 端点 | 增量 |
|---|---|
| `POST /agents` | 请求沿用 `{url,slug,auth}`；响应同详情；建议支持 `Idempotency-Key` |
| `GET /agents/{id}` | 返回完整 `card`、`skills`、`auth_hint`、`last_*`、`recent_tasks`（最近 3 条） |
| `PATCH /agents/{id}` | 请求 `{enabled?, auth?, name?}`；`auth` 只接受 `secret_ref`；响应同详情 |
| `POST /agents/{id}/refresh` | 响应 `{agent, changed, changed_fields}`；拉取失败保留旧 Card 并标记 `unhealthy` |
| `POST /agents/{id}/health` | 响应 `{health_status, latency_ms, checked_at, error}` |
| `DELETE /agents/{id}` | `204`；软删除（写 `deleted_at`，列表默认过滤），历史任务保留；有运行中任务时 `409 conflict` |

---

## 8. 任务

### 8.1 `GET /api/v1/tasks` ➕

查询参数：`state`（可重复）、`agent_id`、`run_id`、`conversation_id`、`q`、`from`、`to`、`limit`、`cursor`。

列表项：

```json
{
  "id": "local-uuid",
  "a2a_task_id": "task_2e91",
  "agent": {"id": "agent-uuid", "slug": "editorial-reviewer", "name": "Editorial Reviewer"},
  "run_id": "run-uuid",
  "conversation": {"id": "conv-uuid", "title": "退款政策变更的影响面"},
  "state": "working",
  "progress": 0.3,
  "duration_ms": 12000,
  "request_summary": "审阅「退款政策变更说明」的措辞",
  "error_summary": null,
  "available_actions": ["cancel"],
  "created_at": "2026-11-08T15:44:02Z",
  "updated_at": "2026-11-08T15:44:15Z"
}
```

`stats`：

```json
{"total": 8, "submitted": 1, "working": 1, "input_required": 1, "auth_required": 1, "completed": 1, "failed": 1, "canceled": 1, "rejected": 1}
```

### 8.2 `GET /api/v1/tasks/{id}` ➕

```json
{
  "id": "local-uuid",
  "a2a_task_id": "task_4d18",
  "agent": {"id": "...", "slug": "data-analyst", "name": "Data Analyst"},
  "run_id": "run_4c1d",
  "conversation": {"id": "...", "title": "退款政策变更的影响面"},
  "tool_call_id": "call_1",
  "state": "input_required",
  "progress": null,
  "request": {
    "tool": "send_message",
    "args": {"task": "核对 9 月退款工单统计口径"},
    "summary": "核对 9 月退款工单统计口径"
  },
  "result": null,
  "error": null,
  "input_request": {
    "question": "请补充 9 月退款工单的统计口径：按创建时间还是完成时间？",
    "input_schema": {"type": "string", "maxLength": 2000},
    "expires_at": "2026-11-08T16:30:00Z"
  },
  "auth_request": null,
  "timeline": [
    {"state": "submitted", "at": "2026-11-08T15:43:20Z", "duration_ms": 1000, "note": ""},
    {"state": "working", "at": "2026-11-08T15:43:21Z", "duration_ms": 60000, "note": ""},
    {"state": "input_required", "at": "2026-11-08T15:44:21Z", "duration_ms": null, "note": "等待你的补充"}
  ],
  "available_actions": ["resume", "cancel"],
  "created_at": "2026-11-08T15:43:20Z",
  "updated_at": "2026-11-08T15:44:21Z",
  "started_at": "2026-11-08T15:43:20Z",
  "finished_at": null,
  "duration_ms": 61000
}
```

完成态补充：

```json
{
  "state": "completed",
  "result": {
    "artifact": {"type": "text", "summary": "12/12 项数字核对通过，2 处引用待补。", "parts": [], "data": {"checks_passed": 12, "checks_total": 12, "missing_citations": 2, "errors": 0}},
    "summary": "12/12 项数字核对通过"
  },
  "finished_at": "2026-11-08T15:44:22Z",
  "duration_ms": 1200
}
```

失败态补充：

```json
{
  "state": "failed",
  "error": {"code": "a2a_unavailable", "message": "远程 Agent 在 60s 内未响应。", "retryable": true, "at": "2026-11-08T15:38:17Z"}
}
```

### 8.3 任务动作

| 端点 | 状态要求 | 请求 | 响应 | 错误 |
|---|---|---|---|---|
| `POST /tasks/{id}/cancel` ✅ | `submitted` / `working` / `input_required` / `auth_required` | 空 | 更新后的任务 | `409 task_not_cancelable` |
| `POST /tasks/{id}/resume` 🆕 | `input_required` | `{"input":"按创建时间统计"}` | `{task, run}` | `409 task_not_resumable`、`422 validation_error` |
| `POST /tasks/{id}/authorize` 🆕 | `auth_required` | `{"scopes":["repo:read"],"note":""}` | 更新后的任务 | `409 task_not_authorizable` |
| `POST /tasks/{id}/reject` 🆕 | `auth_required`（建议也允许 `input_required`） | `{"reason":"不授权"}` | 更新后的任务，`state=rejected` | `409 task_not_rejectable` |

语义：

- `resume`：沿用同一 `a2a_task_id` 继续，不创建新任务；内部复用 `POST /runs/{run_id}/resume`；
- `authorize`：告诉后端「用户已完成外部授权，可以重试」；若 `auth_request.authorization_url` 存在，前端先打开该 URL，再调用此接口；URL 必须是 https（本地开发可 http）且在后端白名单内，前端不得直接打开任意字符串；
- `reject`：终止远程任务，`state=rejected`，后续不再重试；
- 所有动作写审计。

> `available_actions` 只返回后端可执行动作（`cancel` / `resume` / `authorize` / `reject`）；「打开会话」「查看结果」由前端根据 `conversation` / `result` 是否存在自行渲染，不进入该数组。

> **授权模型兼容说明**：后端现有 A2A 设计在 `auth_required` 时通知管理员更新凭据，不自动重试。`POST /tasks/{id}/authorize` 与 `authorization_url` 是**新增的用户级授权能力**；若 v1 不做，前端应隐藏「前往授权」，改为「通知管理员」，后端返回 `403 auth_flow_unavailable` 时也按此降级。

### 8.4 状态映射

| 后端 `state` | UI 文案 | 可用动作 |
|---|---|---|
| `submitted` | 已提交 | 取消 |
| `working` | 运行中 | 取消 |
| `input_required` | 等待输入 | 补充信息、取消 |
| `auth_required` | 需要授权 | 前往授权、拒绝、取消 |
| `completed` | 已完成 | 查看结果、打开会话 |
| `failed` | 失败 | 查看错误、打开会话 |
| `canceled` | 已取消 | 打开会话 |
| `rejected` | 已拒绝 | 打开会话 |

> 原型用连字符 `input-required` / `auth-required`，API 必须用下划线；前端负责文案映射，后端不要返回带连字符的枚举。

### 8.5 超时与状态转移

- `input_request.expires_at` / `auth_request.expires_at` 到期后，后台任务把任务置为 `canceled`，并取消对应 run；
- 写审计 `task.expired`，`timeline` 追加 `{state:"canceled", note:"等待超时"}`；
- 前端在 `expires_at` 到达后隐藏「补充信息/前往授权」，显示「已超时」，只保留「打开会话」；
- 超时时间由系统设置 `a2a.input_timeout_seconds` 控制，建议默认 30 分钟；
- 若远程 Agent 先返回 `canceled`，以后端收到的状态为准，不重复写超时。

---

## 9. 知识库

### 9.1 范围与权限 ⚠️（D7）

后端 `knowledge_documents` 当前没有 `owner_user_id`，而原型是普通用户可见的上传/重建入口。两种落法：

| 方案 | 表变更 | 权限 | 适用 |
|---|---|---|---|
| A. 全局知识库 | 不加列 | 所有用户可读/检索；上传、删除、重建仅管理员 | 团队共享知识库，最省事 |
| B. 个人知识库 | 加 `owner_user_id nullable`（null=系统/全局） | 用户管理自己的文档；检索范围 = 系统 + 自己 | 保留原型普通用户上传/重建 |

推荐 **B**：`owner_user_id IS NULL` 表示系统文档，所有用户可读；非空表示个人文档，仅所有者与管理员可写。检索时默认合并「系统 + 自己」，管理员可选全部。若产品确认知识库只由管理员维护，则选 A，并在前端按 `role` 隐藏写操作。

> 若选 B，现有 `knowledge_documents.checksum` 的**全局唯一约束**必须改为按 owner 的部分唯一索引（系统文档 `UNIQUE (checksum) WHERE owner_user_id IS NULL`；个人文档 `UNIQUE (owner_user_id, checksum) WHERE owner_user_id IS NOT NULL`），否则两个用户无法上传同一份文件。

### 9.2 `GET /api/v1/knowledge/documents` ➕

查询参数：`q`、`category`、`status`、`limit`、`cursor`。

列表项：

```json
{
  "id": "doc-uuid",
  "title": "Q3 客服复盘 v2",
  "category": "客服",
  "status": "ready",
  "chunk_count": 24,
  "size_bytes": 184320,
  "source_uri": "data/q3-review.md",
  "owner": {"id": "user-uuid", "display_name": "周丹"},
  "error": null,
  "created_at": "2026-09-30T00:00:00Z",
  "updated_at": "2026-09-30T00:00:00Z"
}
```

`stats`：`{"documents":128,"chunks":1842,"ready":124,"indexing":2,"pending":1,"failed":1}`。

### 9.3 上传、详情、重试、删除

| 端点 | 变更 | 说明 |
|---|---|---|
| `POST /knowledge/documents` | ➕ | `multipart/form-data`：`file`、`title?`、`category?`；202 返回 `{document, duplicate:false}`；重复 checksum 返回 `409 conflict` + `existing_document_id` |
| `GET /knowledge/documents/{id}` | ➕ | 返回列表项字段 + `metadata`；用于轮询入库状态 |
| `POST /knowledge/documents/{id}/retry` | 🆕 | `failed` 状态重试；202 返回 `{document}`；非 failed 返回 `409 conflict` |
| `DELETE /knowledge/documents/{id}` | ✅ | 204；级联删除 chunks；写审计 |

上传限制建议：单文件 20 MB；允许 Markdown / TXT / PDF / CSV / JSON（DOCX 需先补解析器）；超限 `413 payload_too_large`；类型不支持 `422 unsupported_file_type`。

### 9.4 `POST /api/v1/knowledge/rebuild` ➕

请求：

```json
{"document_id": "doc-uuid"}
```

- `document_id` 省略表示全量重建；
- 响应 202：`{"accepted":true,"scope":"document","document_ids":["..."]}`；
- 权限：方案 A 仅管理员；方案 B 所有者或管理员；
- 全量重建建议要求 `confirm=true` 或二次确认，避免误触。

### 9.5 `POST /api/v1/knowledge/search` ➕

请求沿用：

```json
{"query":"退款需要保留吊牌吗","top_k":5,"filters":{"category":"售后"}}
```

命中项补充：

```json
{
  "chunk_id": "uuid",
  "document_id": "uuid",
  "title": "退款政策",
  "document_title": "退款政策",
  "document_filename": "退款政策.md",
  "category": "售后",
  "chunk_index": 3,
  "content": "退货需要保留吊牌与包装……",
  "score": 0.83,
  "updated_at": "2026-09-18T00:00:00Z"
}
```

响应保留 `elapsed_ms`。`title` 保留现有字段；`document_title` 为兼容别名，`document_filename` 取 `source_uri` 的 basename（可选）；`updated_at` 取 `knowledge_documents.updated_at`（chunk 表没有该列）。前端显示「标题 + 文件名 + 分数 + 分类 + 日期 + 片段」。

---

## 10. 个人能力层

> 现有设计已覆盖端点；本节只列前端需要的**字段增量**。若字段暂时没有，按第 14 节隐藏对应文案，不要返回假值。

### 10.1 指令 `GET/PUT /instructions` ✅

现有响应已够用：`effective`、`source`、`user_value`、`default_value`、`max_chars`、`updated_at`。

前端约定：

- `source` 为 `user` 时显示「用户覆盖」，`system_default` 时显示「平台默认」；
- 字符计数用 `max_chars`；
- 保存后下一轮生效，不回溯历史会话。

### 10.2 记忆 `/memories` ➕

列表项在现有字段上补充：

| 字段 | 说明 |
|---|---|
| `source.kind` | `conversation` / `workflow_run` / `approval` / `manual` |
| `source.label` | 人类可读来源，如「Q3 客服工单周报」「weekly-report 运行」「审批记录」 |
| `source.conversation_title` | 来源会话标题，用于「来源：Q3 客服工单周报」 |
| `source.workflow_id` | 来自工作流运行时的关联 ID |
| `source.approval_id` | 来自审批记录时的关联 ID |
| `source.message_excerpt` | 来源消息摘要（可选） |
| `updated_at` | 已有 |

`stats`：`{"total":3,"profile":0,"preference":2,"fact":1,"active":3,"archived":0}`。

`kind` 枚举：`profile` / `preference` / `fact`；`status`：`active` / `archived`。

### 10.3 技能 `/skills` ✅➕

列表项补充：

| 字段 | 说明 |
|---|---|
| `effective_enabled` | 已有；系统项被用户覆盖后的实际状态 |
| `editable` | 系统技能为 false，用户技能为 true |
| `estimated_tokens` | 技能正文估算 token，用于输入栏提示 |
| `file_count` / `size_bytes` | 已有 |

`stats`：`{"total":3,"system":2,"user":1,"enabled":3}`。

`GET /skills/catalog` 建议返回：

```json
{
  "items": [
    {"id":"uuid","slug":"weekly-report","name":"周报生成","description":"固定章节与口径规则","scope":"system","estimated_tokens":820,"enabled":true}
  ]
}
```

`POST /skills/import` 响应补充 `{skill, warnings:[]}`；`POST /skills` 手写创建同样返回完整技能。

### 10.4 MCP `/mcp/servers` ✅➕

列表项补充：

| 字段 | 说明 |
|---|---|
| `effective_enabled` | 已有；系统项实际生效状态 |
| `write_tools_allowed` | 当前用户是否可使用该系统 MCP 的写工具；普通用户为 false |
| `admin_only_write_tools` | 是否因系统策略仅管理员可用 |
| `last_error` | 最近检查错误（脱敏） |
| `tool_count` | 已有 |

`GET /mcp/available` 建议：

```json
{
  "servers": [
    {"id":"uuid","slug":"slack-mcp","name":"Slack","scope":"system","tool_count":12,"enabled":true,"health_status":"healthy"}
  ],
  "tools": [
    {"id":"uuid","server_id":"uuid","name":"conversations.info","exposed_name":"mcp__slack_mcp__conversations_info","risk":"read","requires_approval":false}
  ]
}
```

`POST /mcp/servers/{id}/check` 响应：

```json
{"health_status":"healthy","latency_ms":142,"tool_count":12,"checked_at":"...","error":null}
```

`GET /mcp/servers/{id}/tools` 每项保留 `user_allowed`，并对写/破坏性工具返回 `requires_approval=true`、`admin_only=true`（如适用）。

---

## 11. 系统信息

### 11.1 `GET /api/v1/system/info` ➕

这是前端能力开关、模型菜单、设置页、关于页的共同数据源，建议一次返回：

```json
{
  "version": "0.1.0",
  "build": "2026-11-05",
  "environment": "dev",
  "models": [
    {
      "id": "deepseek-chat",
      "name": "DeepSeek Chat",
      "description": "通用对话",
      "capabilities": {"streaming": true, "reasoning": false, "tools": true}
    },
    {
      "id": "deepseek-reasoner",
      "name": "DeepSeek Reasoner",
      "description": "深度推理 · 展示思考",
      "capabilities": {"streaming": true, "reasoning": true, "tools": true}
    }
  ],
  "default_model": "deepseek-chat",
  "reasoning_efforts": [
    {"id": "low", "name": "标准", "description": "更快，适合日常"},
    {"id": "medium", "name": "深度", "description": "平衡速度与推理"},
    {"id": "high", "name": "最大", "description": "更深入，耗时更长"}
  ],
  "default_reasoning_effort": "low",
  "embedding": {"model": "text-embedding-3-small", "dim": 1536},
  "generation": {"temperature": 0.3, "timeout_seconds": 60, "max_output_tokens": 4096},
  "capabilities": {
    "instructions": true,
    "memories": true,
    "skills": true,
    "mcp": true,
    "knowledge": true,
    "attachments": true,
    "workflows": false,
    "approvals": true
  },
  "limits": {
    "skills_per_message": 3,
    "mcp_servers_per_message": 5,
    "mcp_tools_per_message": 10,
    "knowledge_categories_per_message": 5,
    "attachments_per_message": 5,
    "attachment_max_bytes": 20971520,
    "message_max_chars": 8000
  }
}
```

> **2026-11-10 需求变更**：服务只做出站 A2A Client，不提供入站 A2A Server，`system/info.a2a`（`enabled` / `card_url` / `jsonrpc_url` / `auth_type` / `card_security`）不再需要。前端已删除该字段的类型与读取；建议后端在 M3 清理由此产生的配置与占位响应。原 `auth_type` 与 `card_security` 的语义区分不再适用。

前端用法：

- `models` 为空或只有一项 → 模型菜单只读/隐藏；
- `reasoning_efforts` 为空 → 推理等级隐藏；
- `capabilities.workflows=false` → 工作流导航置灰并提示；
- `capabilities.attachments=false` → 「+」菜单附件禁用；
- `limits` 用于前端计数与提前校验，后端仍需二次校验。

---

## 12. 数据模型增量

> 只列新增/变更；已有表结构见后端 `docs/database.md`。迁移时遵循「先加列/双写 → 切读 → 删旧列」。

### 12.1 新增表：`attachments`

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | uuid | PK | |
| `user_id` | uuid | FK users, cascade | 所有者 |
| `conversation_id` | uuid | FK conversations, set null | 可为空（先上传后发消息） |
| `message_id` | uuid | FK messages, set null | 关联消息 |
| `purpose` | varchar(16) | not null default 'chat' | `chat` / `artifact`；产物由后端写入 |
| `filename` | varchar(255) | not null | 原始文件名 |
| `mime_type` | varchar(128) | not null | |
| `size_bytes` | bigint | not null | |
| `checksum` | varchar(64) | not null | SHA-256，用于去重 |
| `storage_key` | text | not null | 对象存储键/本地路径 |
| `status` | varchar(16) | not null default 'processing' | `processing` / `ready` / `failed` |
| `error` | text | null | 脱敏错误 |
| `expires_at` | timestamptz | null | 默认 30 天 |
| `created_at` | timestamptz | not null | |

索引：`(user_id, created_at desc)`、`(conversation_id)`、`UNIQUE (user_id, checksum)`（去重与并发兜底）、`(expires_at)`（清理任务）。

### 12.2 新增表：`run_events` 与 `a2a_task_events`

`run_events`（运行事件，轨迹页数据源）：

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | bigserial | PK | 高写入，自增 |
| `run_id` | uuid | FK runs, cascade | |
| `seq` | int | not null | run 内递增，SSE `id` 同源 |
| `type` | varchar(16) | not null | `request/message/skill/tool/a2a/mcp/approval/workflow/notice/error` |
| `status` | varchar(16) | not null | `ok/running/waiting/error/canceled/skipped` |
| `title` / `subtitle` | varchar(200) | not null default '' | 列表展示 |
| `duration_ms` | int | null | |
| `tokens` | jsonb | not null default '{}' | `{input,output,reasoning}` |
| `payload` | jsonb | not null default '{}' | 类型相关字段 |
| `error` | jsonb | null | |
| `ts` | timestamptz | not null | 事件发生时间 |
| `created_at` | timestamptz | not null | 落库时间 |

索引：`UNIQUE (run_id, seq)`、`(run_id, ts)`、`(type, ts)`。保留期跟随 `runs`（默认 180 天）。

`a2a_task_events`（任务状态时间线）：

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | bigserial | PK | |
| `task_id` | uuid | FK a2a_tasks, cascade | 本地任务 ID |
| `state` | varchar(24) | not null | 与任务状态一致 |
| `note` | varchar(500) | not null default '' | 人类可读说明 |
| `payload` | jsonb | not null default '{}' | 远程事件摘要 |
| `at` | timestamptz | not null | 状态发生时间 |
| `duration_ms` | int | null | 该状态持续时长（结束时可回填） |

索引：`(task_id, at)`。

> `GET /runs/{id}/events` 从 `run_events` 读；`GET /tasks/{id}` 的 `timeline` 从 `a2a_task_events` 读。两者不要互相替代：run events 是用户可见轨迹，task events 是 A2A 状态机历史。

### 12.3 扩展既有表

| 表 | 新增字段 | 说明 |
|---|---|---|
| `conversations` | `message_count int not null default 0`、`last_message_preview varchar(200) not null default ''`、`archived_at timestamptz` | 可先计算，量大再冗余；`pending_approval_count` 建议查询时计算 |
| `messages` | `client_message_id varchar(64)`、`capabilities jsonb not null default '{}'`、`citations jsonb not null default '[]'`、`attachments jsonb not null default '[]'`、`artifacts jsonb not null default '[]'`、`usage jsonb not null default '{}'`、`status varchar(16) not null default 'completed'`、`error jsonb` | `client_message_id` 仅用于展示/乐观替换；幂等仍由 `runs.idempotency_key` 的现有唯一约束保证 |
| `runs` | `reasoning_effort varchar(16)`、`workflow_id uuid`、`workflow_version int`、`reasoning_tokens int not null default 0`、`first_token_ms int`、`duration_ms int`、`active_duration_ms int`、`canceled_at timestamptz` | `workflow_id` 可空；工作流表落地后再加 FK |
| `approvals` | `source varchar(16)`、`executor varchar(128)`、`target text`、`side_effect text`、`risk varchar(16)`、`tool_display_name varchar(128)` | 展示字段；`payload` 保留原始参数 |
| `a2a_tasks` | `input_request jsonb`、`auth_request jsonb`、`progress numeric(4,3)`、`last_event_at timestamptz`、`duration_ms int` | 支撑任务详情与时间线；`progress` 为 0–1，未知为 null |
| `remote_agents` | `last_latency_ms int`、`last_checked_at timestamptz`、`last_error text`、`consecutive_failures int not null default 0`、`deleted_at timestamptz` | 支撑健康状态、软删除与降级；`last_seen_at` 保留为最近成功拉取/调用 |
| `knowledge_documents` | `owner_user_id uuid null`（D7=B）、`error text`、`size_bytes bigint not null default 0` | 全局文档 owner 为空 |
| `messages` 索引 | `(conversation_id, client_message_id)` 普通索引 | 只用于查找与乐观替换，不承担幂等；不要与 `runs` 的唯一键重复 |

### 12.4 工作流 / 管理端

- 工作流表见 [`workflows.md`](workflows.md) 第 4 节；
- RBAC / 菜单 / 字典表见 [`admin-console.md`](admin-console.md) 第 4 节。

### 12.5 迁移注意事项

1. 新增列先允许 null 或带默认值，避免锁表；
2. `message_count` 回填用批量 SQL，不要逐条 ORM；
3. `owner_user_id` 回填：历史文档置 null（系统/全局）；
4. 大表索引用 `CREATE INDEX CONCURRENTLY`；
5. 枚举用 `varchar + CHECK`，新增值走新迁移；本包涉及的枚举变更：`remote_agents.health_status` 加 `degraded`、`approvals.status` 加 `canceled`、`messages.status` 新增、`users.status` 加 `pending`（管理端）、`runs.status` 不变；
6. 附件表上线前先确定对象存储与清理任务，避免孤儿文件。

---

## 13. 错误码增量

| HTTP | code | 触发 | 前端处理 |
|---|---|---|---|
| 400 | `invalid_password` | 修改密码时当前密码错误 | 行内提示 |
| 403 | `forbidden` | 非管理员访问管理端 / 非所有者写系统资源 | 隐藏入口 + 提示 |
| 403 | `capability_disabled` | 能力开关关闭 | 置灰入口 |
| 404 | `not_found` | 资源不存在或不属于当前用户 | 空态/返回 |
| 404 | `workflow_not_found` | 工作流不存在或不属于当前用户 | 返回列表 |
| 409 | `run_in_progress` | 同一会话已有运行 | 恢复该 run 的展示，禁用发送 |
| 409 | `run_not_cancelable` | 取消已结束的 run | 刷新状态 |
| 409 | `approval_expired` | 审批已过期 | 置灰按钮，提示过期 |
| 409 | `approval_already_decided` | 重复审批 | 刷新审批状态 |
| 409 | `task_not_cancelable` | 任务已终态 | 刷新任务 |
| 409 | `task_not_resumable` | 任务不是 `input_required` | 刷新任务 |
| 409 | `task_not_authorizable` | 任务不是 `auth_required` | 刷新任务 |
| 409 | `task_not_rejectable` | 任务状态不允许拒绝 | 刷新任务 |
| 409 | `workflow_disabled` | 工作流未发布/已停用 | 提示并清空选择 |
| 409 | `workflow_publish_conflict` | 并发发布/版本冲突 | 刷新后重试 |
| 422 | `workflow_context_conflict` | 工作流与手动上下文同时传 | 前端已互斥，兜底提示 |
| 413 | `attachment_too_large` | 附件超限 | 提示大小限制 |
| 413 | `payload_too_large` | 技能包/文档超限 | 提示 |
| 422 | `attachment_type_not_allowed` | MIME 不在白名单 | 提示支持类型 |
| 422 | `attachment_not_ready` | 附件仍在处理/失败 | 等待或重试 |
| 422 | `model_not_allowed` | 模型不在白名单 | 重置为默认模型 |
| 422 | `agent_card_invalid` | Agent Card 校验失败 | 预览表单行提示 |
| 422 | `agent_url_not_allowed` | Agent URL 被 SSRF/协议策略拒绝 | 提示地址不可用 |
| 422 | `reasoning_effort_invalid` | 推理等级非法 | 重置为默认 |
| 422 | `workflow_invalid` | 工作流步骤/引用非法 | 编辑器行内提示 |
| 422 | `workflow_step_invalid` | 单个步骤非法 | 定位到步骤 |
| 403 | `auth_flow_unavailable` | 当前部署不支持用户级 A2A 授权 | 改为「联系管理员」提示 |
| 422 | `unsupported_file_type` | 知识文档类型不支持 | 提示支持类型 |
| 429 | `rate_limited` | 限流 | 显示重试倒计时 |
| 502 | `a2a_unavailable` | 远程不可用 | 任务失败态 + 重试 |
| 502 | `mcp_unreachable` | MCP 不可达 | 降级提示，不阻断对话 |
| 503 | `maintenance` | 维护模式，普通用户新建 run | 显示维护公告 |
| 504 | `a2a_timeout` | 远程超时 | 任务失败态 |

> 现有错误码（`bad_request`、`unauthorized`、`conflict`、`validation_error`、`skill_invalid`、`instruction_too_long`、`mcp_transport_not_allowed`、`internal_error`）继续有效，不重复。

**兼容说明**

- `approval_expired` / `approval_already_decided` / `run_in_progress` / `task_not_*` 是对现有 `409 conflict` 的**细化**：后端需要同步更新 `docs/api.md`，前端先按具体 `code` 处理，再按 HTTP 状态兜底；
- `attachment_too_large` 用于附件，`payload_too_large` 保留给技能包/知识文档；两者都是 413，前端按 `code` 显示不同文案；
- `auth_flow_unavailable` 只在后端不支持用户级 A2A 授权时返回，避免前端展示无法完成的「前往授权」。

---

## 14. 降级矩阵

> 后端暂时做不到时，前端按此降级；**不要删除控件**，只隐藏/置灰并标注原因。

| 原型元素 | 依赖契约 | 缺失时前端行为 | 风险 |
|---|---|---|---|
| 模型 / 推理等级菜单 | `/system/info.models`、`reasoning_efforts`、`chat/stream.model` | 只显示默认模型，菜单只读 | 用户以为可选，实际无效 |
| 思考卡 / 推理摘要 | `reasoning.delta/done` | 隐藏思考卡，仅显示普通流式 | 失去「深度推理」卖点 |
| 引用来源 / 角标 | `message.done.citations`、消息 `citations` | 隐藏来源区与角标 | 回答可信度下降 |
| 生成产物卡片（预览/下载） | 消息 `artifacts` | 只显示正文，隐藏产物卡 | 用户拿不到 Markdown/文件 |
| 会话消息数 | `message_count` | 隐藏「37 条消息」 | 信息密度降低 |
| 会话搜索 | `q` | 本地过滤当前已加载列表 | 只能搜到已加载项 |
| 待审批标记 | `pending_approval_count` | 不显示侧栏徽标，仅靠对话内审批卡 | 容易漏审批 |
| 附件上传 | `POST /attachments` | 「+」附件置灰，`@` 提示不可用 | 无法传文件 |
| 知识库选择 chip | `knowledge_categories` | 隐藏 chip，仅保留知识检索默认范围 | 无法限定范围 |
| 工作流导航 | `capabilities.workflows`、工作流 API | 导航置灰 + 「能力未启用」提示 | 原型功能不可用 |
| 智能体「拉取预览」 | `POST /agents/preview` | 退化为直接 `POST /agents`，失败再提示 | 无法注册前预览 |
| 智能体健康「降级」 | `health_status=degraded` | 把 `unhealthy` 显示为「异常」，不显示中间态 | 状态粒度变粗 |
| 任务补充信息 | `POST /tasks/{id}/resume` | 隐藏「补充信息」，只保留取消/打开会话 | `input_required` 任务无法继续 |
| 任务授权/拒绝 | `POST /tasks/{id}/authorize`、`/reject` | 隐藏按钮，提示「请到远程平台处理」 | `auth_required` 任务卡住 |
| 知识库统计 | 列表 `stats` | 用当前页数量显示，标注「当前页」 | 计数不准 |
| 知识库重试/重建 | retry/rebuild 端点 | 隐藏按钮，失败行只展示状态 | 失败文档无法恢复 |
| 审批展示字段 | `approvals.source/executor/target/...` | 只显示 `tool_name` + `reason` | 审批信息不足，风险上升 |
| 审计查询 | `GET /admin/audit` | 审计页显示「契约未就绪」 | 管理端不可用 |
| 用户/角色/菜单/字典 | 对应管理端 API | 页面显示空态 + 「X2 待立项」提示 | 管理端不可用 |
| 概览统计 | `GET /admin/overview` | 用各列表 `stats` 拼装，缺失项显示 `—` | 概览不完整 |

---

## 15. 开放问题

| ID | 问题 | 影响 | 建议 |
|---|---|---|---|
| Q1 | 审批卡的「执行方/目标/副作用」由谁生成？ | 工具/MCP/A2A 三类的展示字段不同 | 工具声明 + 后端兜底；`payload` 保留原始参数 |
| Q2 | HITL 期间 SSE 是否保持（D8） | 恢复后的输出没有承载连接 | 建议保持 + 超时；否则新增续流端点 |
| Q3 | 知识库全局还是个人（D7） | 表结构、权限、检索范围 | 建议加 `owner_user_id`，null=系统 |
| Q4 | 智能体健康是否加 `degraded` | 原型「1 降级」无法表达 | 建议四态 |
| Q5 | 任务展示用本地 ID 还是远程 ID | 用户排障与 API 路径 | API 用本地 `id`，展示优先 `a2a_task_id` |
| Q6 | 会话搜索只搜标题还是正文 | 实现成本与索引 | v1 只搜标题（pg_trgm 可选） |
| Q7 | reasoning 事件是否所有模型都发 | 前端思考卡显隐 | 仅支持时发；`/system/info.models[].capabilities.reasoning` 声明 |
| Q8 | 附件支持哪些类型 | 解析与安全 | 先 Markdown/TXT/PDF/CSV/JSON |
| Q9 | 管理端角色模型用 `users.role` 还是 RBAC 表 | 迁移成本 | 保留 `users.role` 做粗粒度门禁，RBAC 表做细粒度 |
| Q10 | 工作流步骤执行由主图还是独立执行器 | 架构与工期 | 轻量模板 + 主图执行，见 `workflows.md` |

---

## 16. 与现有文档的差异记录

| 现有文档 | 差异 | 处理 |
|---|---|---|
| 后端 `docs/api.md` SSE 事件表 | 缺 `run.started`、`message.started`、`reasoning.*`、`workflow.step`；`approval.required` 字段不足 | 本文件第 4 节为增量，后端更新 OpenAPI 后合并 |
| 后端 `docs/api.md` 任务端点 | 只有 cancel，缺 resume/authorize/reject | 本文件第 8 节 |
| 后端 `docs/api.md` 智能体端点 | 缺 preview，健康枚举缺 degraded | 本文件第 7 节 |
| 后端 `docs/api.md` 系统信息 | 只有一句描述 | 本文件第 11 节给出完整 schema |
| 后端 `docs/database.md` | 无 attachments/workflows/RBAC；messages/runs/approvals 字段不足 | 本文件第 12 节 + `workflows.md` + `admin-console.md` |
| 前端 `docs/api.md` | 已列缺口但无字段级方案 | 本文件作为落地版；前端文档保留索引 |

---

## 17. 变更记录：后端 M1 落地对齐（2026-11-09）

触发材料：`agent-hub/docs/feedback/2026-11-09-frontend-contract-feedback.md`、后端 `docs/openapi.json`、真实后端联调结果；前端结论同步在 `agent-hub/docs/feedback/2026-11-09-frontend-integration-response.md`。

### 17.1 前端已按后端 M1 调整

| # | 变更 | 前端落点 |
|---|---|---|
| 1 | 错误信封支持可选 `error.details`；`run_in_progress` 读取 `details.run_id` | `src/types/api.ts`、`src/api/client.ts`、`src/api/chat.ts`、`src/stores/chat.ts` |
| 2 | 幂等重试复用 `client_message_id`；回放流重置 `seq` 基线，避免旧 `lastSeq` 丢弃回放事件 | `src/stores/chat.ts`（`lastAttempt`/`onOpen`） |
| 3 | `reasoning_efforts=[]` 时隐藏推理等级菜单 | `src/components/chat/ChatComposer.vue`、`src/stores/system.ts` |
| 4 | `capabilities.agents` / `capabilities.tasks` 可选，缺省 false；导航与路由按能力置灰/退回 | `src/types/system.ts`、`src/components/layout/SideNav.vue`、`src/router/*`、`src/layouts/AppLayout.vue` |
| 5 | 运行事件 `id` 为不透明字符串；`tokens` 可空、`error` 为字符串/null；抽屉接入真实事件回放 | `src/types/run.ts`、`src/components/chat/RunTraceDrawer.vue` |
| 6 | 历史消息按 `created_at DESC, id DESC` 返回，前端反转为时间线顺序；支持 `cursor` 加载更早 | `src/stores/chat.ts`、`src/components/chat/MessageList.vue`、mock `db.ts` |
| 7 | 能力关闭错误码 `capability_disabled` / `workflow_disabled` / `model_not_allowed` 作为可展示错误处理，发送前按能力开关隐藏入口 | `src/api/chat.ts`、`src/stores/chat.ts`、`SideNav`/`router` |
| 8 | 附件 `download_url` 为空时下载按钮置灰，等待 M1.5 受控下载端点 | `src/components/chat/MessageBubble.vue` |
| 9 | 审批 M1 不会出现真实事件；审批弹窗走 `GET /approvals`，`resumed=false` + `resume_error` 不当失败 | `src/views/chat/ChatView.vue`、`src/stores/chat.ts`、`src/types/approval.ts` |
| 10 | 同会话 `interrupted` 占锁：恢复提示条 + 停止/放弃 + 处理审批 + 轮询运行状态 | `src/components/chat/RunRecoveryBanner.vue`、`src/stores/chat.ts`、`ChatView.vue` |
| 11 | 字段命名保持 `knowledge_categories`；M1 无知识库选择/chip 渲染，M4 接入时用分类名；`pages.md` 修正推理等级降级规则 | `src/types/chat.ts`、`docs/pages.md` |
| 12 | 时间按 UTC ISO 解析展示；`stats` 使用全量计数；`next_cursor` 不解析、不拼接 | `src/stores/conversations.ts`、`src/stores/chat.ts`、`src/utils/format.ts` |

### 17.2 后端实现与本文件旧约定的差异（以实测为准）

- 幂等重试返回同一 run 的 SSE 事件回放（200），不是 409；重放可能再次发送 `conversation.created`，`seq` 从 1 开始。
- `409 run_in_progress` 的 `details.run_id`、`409 run_not_cancelable` 的 `details.status` 是新增扩展，旧前端忽略 `details` 不会崩。
- `system/info.capabilities` 新增 `agents`/`tasks`，后端 schema 中为可选、默认 false。
- `reasoning_efforts` 可为空；当前本机实例因 `LLM_REASONING_EFFORT_SUPPORTED=true` 返回 3 个等级，默认模型为 `deepseek-flash`（与反馈文案的 `deepseek-chat` 不同），前端不硬编码。
- `message.done` 额外携带 `conversation_id`；前端按可选字段处理。
- 运行事件 `payload` 已去掉内部 `_event`；`seq` 允许跳号（delta 不落库）。
- 历史消息 `created_at` 同一轮 user/assistant 相差 1 微秒；前端按 ISO 字符串稳定排序，不用 `Date.parse` 截断到毫秒后重排。
- 附件下载计划新增 `GET /api/v1/attachments/{id}/download`，M1 前端保持按钮置灰。

### 17.3 首轮联调缺陷与热修状态（2026-11-09 已复验）

- **P0 分页 500（已修复）**：`has_more=true` 时 `encode_cursor({"id": UUID})` 直接 `json.dumps` 抛 `TypeError`；后端已在编码层做 JSON-safe 归一化（UUID/datetime/date），并补会话/消息/审批分页回归测试。前端真实 HTTP 复验：`limit=1` 两页 200、无重复、第二页更旧；`before`+`cursor` 同时传时 cursor 优先；非法 cursor → 422。
- **P1 OpenAPI 缺口（已补齐）**：`POST /chat/stream` 已声明 `text/event-stream`、400/401/403/404/409/413/422/429/500、`X-Run-ID`/`X-Request-ID` 与事件说明；新增 `ErrorEnvelopeOut`/`ErrorBodyOut`；`RunEventOut.tokens/error`、`ApprovalDecisionResult.resume_error` 改为 required + nullable，前端类型已同步收紧。
- **P1 文档差异（已修正）**：后端 `docs/api.md` 已补分页、运行事件、`message.done`、`resume` 错误码、推理等级开关；实时值以 `/system/info` 为准。
- **P2 错误追踪（已修复）**：404/422 的 `request_id` 与 `X-Request-ID` 一致；500 注入测试通过。
- **P2 注册限流（已处理）**：限流参数化，新增 `scripts/seed_dev_account.py`；本轮用 `dev@example.com` 复验，未再注册。

### 17.4 验证记录

- `pnpm type-check`、`pnpm test`（55 个单测）、`pnpm build`、`pnpm lint` 通过。
- `pnpm smoke:real` 通过 **97 项断言**（Vite 5173 同源代理 → 后端 8000）：认证、系统信息、SSE 顺序、幂等回放、并发 409、取消、历史倒序、会话/消息 cursor 翻页、运行事件、能力错误、审批空态、resume 409、登出。
- `pnpm test:real` 通过 2 个真实后端用例：前端 chat store 完成流式/历史收敛；`fetch-event-source` 正确解析 409 `details.run_id`。
- 后端 `pytest -q` 通过 **27 个测试**（含分页、cursor 单元、500 request_id）。
- 复验结论：首轮 P0/P1/P2 均已收口，未发现新增契约差异；可进入 M1.5。
