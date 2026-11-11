# M5 前端对接与联调记录（2026-11-11）

> **PA-1 后注（2026-11-11）**：本文所述独立审批中心 `/approvals` 与审批页已在第一次原型靠拢中删除；审批改为对话内完成，审批列表接口仅作断线补卡兜底。本文作为历史联调记录保留。

- 范围：前端 M5「审批与安全加固」全量对接
- 后端基线：agent-hub M5（`9095699 docs: 记录 M5 审查修复与最终测试证据`）及 M5 交付报告
- 后端报告：[`2026-11-10-m5-backend-report.md`](../../../../PythonProjects/agent-hub/docs/feedback/2026-11-10-m5-backend-report.md)
- 前端路线图：[`docs/roadmap.md`](../roadmap.md) M5

## 1. 环境准备（已执行）

| 项 | 操作 | 结果 |
|---|---|---|
| 数据库迁移 | `alembic upgrade head` | `c4e7a91b2f36 → 9c1d4e7a2b60 → 2d8f6a1c3e70`，`platform_secrets` 表与 `approvals.tool_call_id` 列可用 |
| 平台密钥加密键 | 在后端 `.env` 配置 `CAPABILITY_SECRET_KEY` 并重启 8000 | `/admin/secrets` 创建 201、轮换 200、删除 204；未配置时的 503 分支在重启前已实测 |
| 管理员账号 | `scripts/grant_admin.py dev@example.com` | `role=admin`；全局审计与密钥接口 200 |
| 运行实例 | `.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000` | `/healthz` ok，OpenAPI 含 M5 端点 |

> 密钥值只写入后端 `.env`，未落库文档、未打印、未提交。

## 2. 前端消费的 M5 契约

### 2.1 审批 SSE 生命周期

```text
approval.required
  → run.interrupted（非终态，SSE 保持；payload.approvals 为本轮 pending ids）
  → 用户决定（中间决定 resumed=false + "本轮还有其他审批待处理"）
  → 最后一个决定 → run.resumed
  → message.delta… → message.done
```

- 审批超时：`message.done(finish_reason="canceled", reason="approval_timeout")`；run 终态 canceled、approval expired。
- `POST /approvals/{id}/decision` 其他正常语义：`运行已结束` / `运行不存在` → `resumed=false`，按「审批已记录」提示。
- 409：`approval_expired`、`approval_already_decided` 分别提示并刷新，不视为致命错误。
- 兼容：仍识别旧 `message.done(finish_reason="interrupted")`。

### 2.2 新端点

| 端点 | 前端用途 |
|---|---|
| `GET /approvals` | 审批中心列表：`status`（含 `all`）、`conversation_id`、`run_id`、`limit`、`cursor`、5 键 `stats` |
| `GET /approvals/{id}` | 详情抽屉 |
| `GET /audit-logs` | 普通用户审计自查（`action`/`resource_type`/`start`/`end`/`cursor`） |
| `GET /admin/audit-logs` | 管理员全局审计（额外 `actor_type`/`actor_id`/`resource_id`；普通用户 403） |
| `/admin/secrets` CRUD | 平台密钥列表/创建/轮换/启停/删除（仅管理员；503 `secret_store_unavailable`） |

### 2.3 限流与安全 UX

- 聊天 429 `rate_limited` + `details.retry_after_seconds` → 输入栏倒计时并禁用发送；
- 登录/注册 429 → 提交按钮倒计时；
- 审批 payload / 审计 detail 敏感键默认遮罩（`RedactedJson`），用户可显式展开本地数据；
- Markdown 外链域名确认后以 `noopener,noreferrer` 打开；
- 401 刷新失败跳登录并提示「登录已过期」。

## 3. 验收证据

| 检查 | 结果 |
|---|---|
| `pnpm type-check` | 通过 |
| `pnpm lint` | oxlint 0 warnings/0 errors；eslint 通过 |
| `pnpm test` | 36 files / 180 tests（M5 当轮；当前全量 232）通过（含 SSE 白名单、store 决定语义/429、终态审批对账、遮罩、外链） |
| `pnpm build` | 通过（ApprovalsView、SettingsView 分包正常） |
| `pnpm smoke:m5` | **163 项断言，0 失败** |
| `pnpm test:real` | M5 3 例通过；M2 2 例 skipped；M1 聊天 1 例因 LLM 401 失败（见 §4.3） |

`smoke:m5` 覆盖：capabilities.approvals、审批列表/`status=all`/stats 5 键/详情 404/决定 404、审计用户+管理员+action/时间过滤、密钥创建 201（无明文）/列表/轮换/停用/过滤/删除 204/删除后 404、聊天 31 次触发 429 且 `retry_after_seconds` 为数字；脚本清理创建的密钥与限流探测会话。

## 4. 缺口与未取证项

### 4.1 运行事件回放无法还原事件名（建议 M6）

`GET /runs/{id}/events` 响应剔除了 `payload._event`，`type` 仅为分类（run/message/tool/…），前端无法按事件名重放 reducer。因此：

- 断线恢复 = 轮询 `GET /runs/{id}` + 进入会话时 `GET /approvals?run_id=&status=pending` 补卡 + 终态 `refreshHistory()`；
- 做不到逐字续流。

建议后端在回放响应增加 `event` 字段，或提供 `GET /runs/{id}/stream?after_seq=` 的 SSE 续接端点。

### 4.2 写操作 RBAC 未落地

后端 agents/tasks 写接口仍为 `CurrentUser`，没有角色 403。前端只做：

- 隐藏管理员专属入口（平台密钥、全局审计）；
- 系统 MCP 写工具按 `user_allowed=false` 置灰（M1.5 已有）；
- 不伪造角色禁用。

待后端补齐 403 后再接「非管理员看不到可执行写操作」。

### 4.3 LLM key 占位导致审批恢复无真实 HTTP 证据

本机 `LLM_API_KEY` 为 6 位占位符，聊天请求返回 DeepSeek 401，无法真实触发「LLM 决定调用工具 → approval.required → 批准 → run.resumed → 继续输出」全链路。已取得的替代证据：

- mock 流按新事件顺序回放（批准/拒绝两条路径）；
- `chat-m5.spec.ts` 覆盖 `run.interrupted`/`run.resumed`/多审批/超时/旧契约；
- 后端 M5 测试 395 项通过（含 `test_hitl_interrupt.py` 的批准恢复、拒绝不执行、超时取消）。

`smoke:real` 的 M1 聊天用例因此失败（`finishReason=null`，实际为 error 事件），不是本次前端改动回归。

### 4.4 `approval.required` 事件字段少于 `ApprovalOut`

真实后端事件只保证 `approval_id/tool_call_id/tool/source/risk/reason/payload/expires_at`，没有 `tool_display_name/executor/target/side_effect/payload_preview`；后端 `docs/api.md` §8.2 的字段表比实现多。前端在 `run.interrupted` 后用 `GET /approvals?run_id=&status=all` 拉完整审批补卡，对话内卡片与审批中心详情字段一致。建议后端补齐事件字段或修正文档。

### 4.5 其他未覆盖

- 普通用户 403：开发账号已提为 admin，M5 冒烟未构造第二个普通账号；
- 真实审批成功恢复后的 SSE 续接（受 §4.3 限制）；
- 密钥 503 分支：重启加载 `CAPABILITY_SECRET_KEY` 前已实测，重启后 503 不再出现，靠后端测试覆盖；
- 审批中心在窄屏的浏览器视觉走查（已用组件测试与构建覆盖，未做人工截图）。

## 5. 前端改动清单

| 区域 | 文件 |
|---|---|
| 契约/类型 | `src/types/chat.ts`、`run.ts`、`audit.ts`、`secret.ts`、`index.ts`；`src/api/approvals.ts`、`audit.ts`、`secrets.ts` |
| 状态机 | `src/stores/chat-reducer.ts`、`src/stores/chat.ts` |
| 对话 UI | `src/views/chat/ChatView.vue`、`components/chat/{MessageList,ProcessTimeline,RunRecoveryBanner}.vue`、`components/chat/cards/ApprovalCard.vue` |
| 审批中心 | `src/views/ApprovalsView.vue`、`src/components/approvals/*` |
| 设置页 | `src/views/SettingsView.vue`、`src/components/settings/{AuditPanel,SecretPanel}.vue` |
| 安全 UX | `src/utils/redact.ts`、`src/components/common/RedactedJson.vue`、`MarkdownView.vue`、`views/auth/{Login,Register}View.vue`、`main.ts` |
| 导航/路由 | `src/components/layout/SideNav.vue`、`src/router/index.ts` |
| mock | `src/api/mock/{db,routers,stream}.ts`、`securityFixtures.ts` |
| 测试/脚本 | `src/stores/__tests__/chat-m5.spec.ts`、`scripts/smoke-m5-backend.mjs`、`scripts/real-m5.spec.ts`、`vitest.real.config.ts`、`package.json` |
| 文档 | `docs/roadmap.md`、`api.md`、`pages.md`、`architecture.md`、`development.md`、`README.md`、本文件 |

## 6. 复现命令

```bash
# 后端（agent-hub）
alembic upgrade head
python scripts/grant_admin.py dev@example.com
uvicorn app.main:app --host 127.0.0.1 --port 8000

# 前端
pnpm install
pnpm type-check && pnpm lint && pnpm test && pnpm build
pnpm smoke:m5
VITE_API_BASE_URL=http://127.0.0.1:8000/api/v1 VITE_USE_MOCK=false pnpm test:real
```

> `smoke:m5` 最后会触发约 60s 聊天限流窗口，建议在 `test:real` 之后运行。
