# 差异整改方案：从“接得上”到“对得齐”

- 日期：2026-11-13
- 状态：**待决策**（治理路径 A/B/C + 首批执行范围）；本文只做方案，不改代码
- 依据：[差异统计报告](../../handoff/2026-11-13-gap-audit-report.md)、[30 项差异台账](../../handoff/assets/2026-11-13-gap-ledger.csv)
- 范围：前端 `agent-hub-web` + 后端 `agent-hub` + 文档/测试
- 原则：**能修的先修；补不了的正式缩范围；不造假数据；先补证据再宣称完成**

---

## 0. 建议摘要

### 0.1 推荐路径：B（缩范围 + 补真实数据 + 修前端交互）

30 项差异不建议“全部补齐”。按投入产出比，推荐：

| 处置 | 数量 | 说明 |
|---|---:|---|
| 修（Fix） | **15** | 前端可做或后端小增量，含 3 个 P1 |
| 缩（De-scope） | **4** | 角色/菜单/字典/语言：保留只读，正式标注“目标形态” |
| 接受（Accept） | **9** | 已决策/设计边界，写入“接受清单”，不再按 bug 跟踪 |
| 决策/延后（Decide） | **2** | 消息重新生成、v8 系统设置 IA |

**P1 的关闭方式**：3 项修（D1 运行轨迹、M1 运行量、M7 审计 IP/结果）+ 3 项缩（M4/M5/M6 只读）+ 1 项部分（M8 系统设置补只读平台信息）。若要求 7 项 P1 全部“补齐”，必须走 A 路径，追加约 **20–25 人日** 的后端治理工程。

### 0.2 三条主线

1. **修（15 项，约 24 人日）**：运行轨迹抽屉、审批备注、智能体编辑、审计 IP/结果、概览运行量、用户会话数、工作流运行统计、知识库分类/重建别名、候选分页、系统模板守卫、文档修正。
2. **缩/接受（13 项，0.5 人日文档）**：角色/菜单/字典只读、邀请用户、通知铃铛、多语言、拖拽画布、多实例 SSE、演示徽标、A2A 入站、逐字续流、全局 Agent headers 等。
3. **证（2 人日）**：`smoke:m8` 真实后端留档、M9 审批恢复链路、真实 LLM/embedding 证据、E2E 与真实链路的边界说明。

> 全量 B 路径约 **27.5 人日**（WP0–WP4 + WP6 + WP7），不含可选的管理台搜索与回合折叠。

### 0.3 明确不做（YAGNI）

- 不做假的角色/菜单/字典 CRUD；
- 不做邮件邀请/通知中心（没有邮件与通知基础设施）；
- 不做完整 i18n；
- 不做拖拽画布；
- 不为“运行量图”引入图表库或统计表；
- 不在没有多角色需求时重建 RBAC。

---

## 1. 先做三个决策

> 这三件事不定，WP1–WP4 可以照做，但 WP5 的范围、M8 的验收口径、文档措辞都会反复。

### 1.1 治理层：A / B / C 三选一

| 选项 | 范围 | 后端 | 前端 | 周期 | 风险 | 适用条件 |
|---|---|---|---|---|---|---|
| **A 全量治理** | 角色/权限、菜单、字典、平台设置（认证/配额/保留/开关/危险操作） | 建 4–6 张表 + 15–20 个端点 + 权限中间件；迁移 | 3 页可编辑 + 系统设置 7 分区 | 4–6 周 | 高：RBAC 影响所有路由；迁移不可轻回滚 | 近期确有多角色/多租户/合规要求 |
| **B 缩范围（推荐）** | 保留 2 角色；角色/菜单/字典只读；系统设置补“平台信息/能力开关”只读 | 只做低成本的审计/统计字段 | 3 页标注目标形态；系统设置加只读面板 | 治理层收口 1–2 人日；叠加 WP1/WP4 的信任数据后全量约 27.5 人日 | 低：不动权限模型 | 内部平台，user/admin 足够 |
| **C 最小 RBAC** | 只加 roles 表做标签，不做权限判定 | 小 | 小 | 1 周 | **中高：假 RBAC，误导使用方** | 不建议 |

**推荐 B**。理由：v8 的角色/菜单/字典/平台设置是“目标形态”，后端路线图从未立项；在没有真实多角色需求前，重建 RBAC 的收益低于成本。B 不是“不做”，而是**把不可编辑的部分明确标注，把可得的真实数据补齐**。

**B 的具体动作**：

1. 角色页：保留只读矩阵 + 角色分布；文案改“v1 仅内置 user/admin；多角色为目标形态（未排期）”。
2. 菜单页：保留路由只读镜像；说明“菜单变更需改代码”。
3. 字典页：保留内置枚举只读；说明“字典项变更需发版”。
4. 系统设置：新增两个**只读**面板：
   - `平台信息`：`/system/info` 的 version/build/environment/models/embedding；
   - `能力开关`：`capabilities` 与 `limits` 只读展示。
   不提供认证策略/配额/保留/危险操作的可写假控件。
5. 若未来选 A：以“M10 平台治理”立项，单独设计 RBAC，不复用本次 B 的临时结构。

### 1.2 产品取舍（4 个小决策）

| 议题 | 选项 | 推荐 | 影响 |
|---|---|---|---|
| 邀请用户 | 做邮件邀请 / 管理员创建用户 / 不做 | **不做**；若需要，另立“管理员创建用户”（2–3 人日，临时密码） | M3 的邀请部分缩范围 |
| 消息重新生成 | 真重新生成（改消息/run 模型）/ “重新发送”MVP / 不做 | **先不做**；若要，先做“重新发送”并接受消息重复 | D2 延后 |
| 多语言 | 完整 i18n / 保持只读 / 删除控件 | **保持只读**，加“多语言未启用”说明 | S1 接受 |
| 通知铃铛 | 通知中心 / 不做 | **不做**；顶栏只保留搜索（前端可做） | M9 的通知部分缩范围 |

### 1.3 验收口径（必须先统一）

| 档位 | 定义 | 本次用法 |
|---|---|---|
| 契约先行 | 类型/API 层/mock 就位，OpenAPI 冻结 | WP4 开工条件 |
| 前端完成 | 页面/交互/单测/E2E(mock) 通过 | WP2/WP3 验收 |
| 联调完成 | 真实后端 smoke + 一条真实 HTTP/浏览器证据 + 文档勾选 | WP1/WP6 验收 |

**“v8 全量七页”统一改写为**：“七页在位；角色/菜单/字典只读；系统设置为能力配置 + 平台信息（只读）形态。”

---

## 2. 30 项差异处置总表

> 处置口径：修 = 本次改代码；缩 = 保留只读并正式标注；接受 = 已决策边界；决策/延后 = 需先定产品口径。
> M3、M9 为“部分修 + 部分缩”，计数时归入“修”。

| ID | 差异 | 处置 | WP | 动作 / 验收 |
|---|---|---|---|---|
| D1 | 运行轨迹抽屉 6 类交互 | **修** | WP2 | 先做 5 项（时间线/图例/筛选/搜索/事件展开）；回合折叠需 runs 列表，列为 WP2 可选 |
| D2 | 消息重新生成 | **延后** | WP0 | 先决策：真重新生成 / 重新发送 MVP / 不做；不做则从 pages.md 删除 |
| D3 | 审批备注 | **修** | WP3 | 审批卡加备注框（≤500），随 decision 发送；已决卡显示 `decision_note` |
| D4 | 工作流候选仅 20 条 | **修** | WP3 | 一次拉 100 条 + 本地搜索；仍不够时在候选面板提示“仅显示前 100 条” |
| D5 | 停用模板预选静默忽略 | **修** | WP3 | 预选失败时 toast“模板已停用，未预选” |
| D6 | 断线窗口 delta 不补齐 | **接受** | WP7 | 写入接受清单；终态刷新是既定语义 |
| D7 | 多实例 SSE 不支持 | **接受** | WP7 | 写入容量前置条件；扩容前评估粘性会话/事件总线 |
| D8 | 独立审批页删除 | **接受** | WP7 | 对话内审批是产品决策 |
| S1 | 语言切换只读 | **缩** | WP7 | 保留禁用控件 + “多语言未启用”说明 |
| S2 | 偏好不同步 | **修** | WP4 | `user_settings.preferences` + `GET/PUT /preferences`；前端合并本地/服务端 |
| S3 | A2A 设置分区移除 | **接受** | WP7 | M3 取消的既定结果 |
| A1 | 智能体不可编辑名称/鉴权 | **修** | WP3 | 详情抽屉加“编辑”对话框（name/auth）；headers 不编辑 |
| A2 | 全局 Agent headers 不可编辑 | **接受** | WP7 | 明文不回显是安全取舍；保留说明 |
| K1 | 单文档重建缺失 | **修** | WP4 | 加 `POST /knowledge/documents/{id}/rebuild` 别名，复用 `retry_document`；前端改调新端点 |
| K2 | 分类目录缺失 | **修** | WP4 | 加 `GET /knowledge/categories`；前端筛选与输入栏候选改用它 |
| W1 | 工作流步骤 6→5 | **接受 + 文档** | WP7 | 产品确认五类；文档写明“技能/MCP 由 tool 步骤承载” |
| W2 | 工作流无运行统计 | **修** | WP4 | `WorkflowOut` 加 `run_count/last_run_at/last_run_status`；列表批量聚合 |
| W3 | 无拖拽画布 | **接受** | WP7 | 线性列表是 M9 决策；画布列 F3 候选 |
| W4 | 系统模板直达可改表单 | **修** | WP3 | 编辑器加载后若 `scope==='system'`，显示只读态并禁用保存 |
| M1 | 概览无运行量图 | **修** | WP1 | 新端点 `GET /admin/overview/runs?range=24h|7d|30d`；前端 CSS 柱状图 |
| M2 | 用户无会话数列 | **修** | WP1 | `AdminUserOut.conversation_count`；列表批量 COUNT |
| M3 | 用户无邀请/导出 | **修 + 缩** | WP1 / WP7 | 导出（前端 CSV）本次做；邀请缩范围 |
| M4 | 角色权限只读 | **缩** | WP7（或 WP5） | 保留只读；文案标“目标形态”；A 路径才做编辑 |
| M5 | 菜单只读 | **缩** | WP7（或 WP5） | 同上 |
| M6 | 字典只读 | **缩** | WP7（或 WP5） | 同上 |
| M7 | 审计 IP/结果为空 | **修** | WP1 | 中间件写 IP 上下文；`AuditLogOut` 加 `ip/result`；前端渲染 |
| M8 | 系统设置缺 7 分区 | **决策 + 部分修** | WP0 / WP3 | B：加“平台信息/能力开关”只读；A：按 WP5 全做 |
| M9 | 顶栏无搜索/通知 | **修 + 缩** | WP3 / WP7 | 搜索做前端命令面板；通知缩范围 |
| M10 | 演示徽标等装饰 | **接受** | WP7 | 不做 |
| G1 | A2A 入站取消 | **接受** | WP7 | 需求变更，保留编号空位 |

**统计**：修 15、缩 4、接受 9、决策/延后 2 = 30。

> 组合标签按前者计数：M3、M9 计入“修”；W1 计入“接受”；M8 计入“决策”。

---

## 3. 工作包与任务

### WP0 决策与文档（1 人日，先做）

**目标**：把“修/缩/接受/延后”的口径定下来，避免边做边吵。

**产出**
1. `docs/superpowers/specs/2026-11-13-governance-decision.md`（ADR）：选 A/B/C、理由、有效期（建议 3 个月）。
2. `docs/handoff/2026-11-13-accepted-deviations.md`：D6/D7/D8/S1/S3/A2/W1/W3/M10/G1 的接受理由与影响。
3. 文档修正（见 §6）。
4. 更新报告头部：指向本方案与决定记录。

**验收**
- `rg "M8/M9 已立项未开始|M0–M7|398 单测|402 单测|将在 M1.5 提供"` 无命中；
- v8 表述统一为“七页在位、三页只读”；
- 接受清单每条都有“为什么接受 / 什么情况下重开”。

### WP1 管理台信任数据（7 人日：后端 4.5 + 前端 2.5）

**目标**：关掉 M1、M2、M7 三个 P1/P2 的“数据不可信”问题，不依赖 RBAC。

**1A 审计 IP/结果（后端 1.5d + 前端 0.5d）**

- 后端：
  - `app/core/log_context.py` 新增 `client_ip_ctx: ContextVar[str]`；
  - `app/core/middleware.py` 在 `dispatch` 里按 `X-Forwarded-For` 第一段 / `request.client.host` 设置并复位；
  - `app/core/audit.py` 的 `write_audit` 写 `ip=client_ip_ctx.get()`；
  - `app/modules/audit/schemas.py` 的 `AuditLogOut` 加 `ip: str | None`、`result: str`；
  - `service._to_out` 返回 `ip=row.ip`、`result=str((row.detail or {}).get("result", "success"))`；
  - **不新增迁移**（`ip` 列已存在；`result` 先从 detail 取，失败审计后续再补）。
- 前端：`src/types/audit.ts` 加字段；`AdminAuditView.vue` 渲染 ip/result，空值显示 `—`。
- 测试：`tests/integration/test_audit_api.py` 加“XFF 被记录”“响应含 ip/result”；前端 `AdminAuditView.spec.ts`。

**1B 概览运行量（后端 2d + 前端 1d）**

- 新端点 `GET /api/v1/admin/overview/runs?range=24h|7d|30d`（默认 `7d`）：
  - `24h`：按小时聚合 24 个桶；`7d`/`30d`：按天聚合；
  - 时区固定 `Asia/Shanghai`（可配置），响应显式返回；
  ```json
  {
    "range": "7d",
    "bucket": "day",
    "timezone": "Asia/Shanghai",
    "items": [
      {"bucket_start": "2026-11-07", "total": 42, "succeeded": 38, "failed": 3, "canceled": 1}
    ]
  }
  ```
- 查询：`24h` 用 `date_trunc('hour', timezone('Asia/Shanghai', created_at))`，`7d/30d` 用 `date_trunc('day', ...)`；**补零**到完整桶数；管理员 403。
- 索引：评估 `runs(created_at)`；若表已大，随迁移加 `ix_runs_created_at`。
- 前端：`AdminOverviewView.vue` 增加“运行量”面板，用 CSS 柱状条（不引图表库）；时间范围 24h/7d/30d 切换；空数据显示“暂无运行”。
- 测试：空库补零、跨日/跨小时边界、非管理员 403、前端渲染/切换。

**1C 用户会话数（后端 1d + 前端 0.5d）**

- `AdminUserOut` 加 `conversation_count: int`；
- `list_users` 对当前页 user_ids 做一次 `GROUP BY user_id` COUNT（排除 `status='deleted'`）；
- `get_user`/`update_user` 单用户 COUNT；
- 前端表头加“会话”列（替代或并列“创建于”，建议保留创建于，新增会话）。
- 测试：软删不计、分页页内计数、详情一致。

**1D 用户导出（前端 0.5d）**

- `AdminUsersView` 加“导出 CSV”（当前筛选条件、当前页），列：邮箱/展示名/角色/状态/最近登录/会话数/创建时间；不引后端。

**验收**
- 后端：`pytest tests/integration/test_audit_api.py tests/integration/test_admin_overview.py tests/integration/test_admin_users.py -q`
- 前端：`pnpm test`、`pnpm e2e --grep "admin|audit"`；
- 真实后端可用时：`pnpm smoke:m8` 输出留档。

### WP2 运行轨迹抽屉（5 人日，纯前端；回合折叠 +1 人日可选）

**目标**：把 D1 从“三段摘要”补到“可筛选、可搜索、可展开、可看图例”的排障视图。

**改动文件**
- 新增：`src/utils/trace.ts`（归一化/过滤/搜索/分组）；
- 新增：`src/components/chat/trace/TraceOverview.vue`（时间线 + 图例 + 统计）；
- 新增：`src/components/chat/trace/TraceToolbar.vue`（类型筛选 + 搜索 + 折叠）；
- 新增：`src/components/chat/trace/TraceRow.vue`（行 + `<details>` 展开 payload）；
- 修改：`RunTraceDrawer.vue`（组装上述组件，替换现有简单列表）；
- 修改：`RunTracePanel.vue`（常驻面板只保留概要，详情入口不变）；
- 测试：`src/utils/__tests__/trace.spec.ts`、`src/components/chat/__tests__/RunTraceDrawer.spec.ts`；E2E `e2e/run-trace.spec.ts`。

**数据模型**
```ts
type TraceKind = 'message' | 'skill' | 'tool' | 'mcp' | 'a2a' | 'approval' | 'workflow' | 'error'

interface TraceEntry {
  id: string
  kind: TraceKind
  title: string
  subtitle: string
  status: 'running' | 'ok' | 'error' | 'waiting' | 'canceled'
  startedAt?: string
  durationMs?: number | null
  payload?: Record<string, unknown>
  source: 'live' | 'server'   // ProcessItem / RunEvent
}
```
- 合并策略：同 `seq`/同 `toolCallId` 的 live + server 事件去重，server 优先补齐 payload；
- 时间线：按 `durationMs` 画段；无时长的段用最小宽度并标注“—”，**不伪造时长**；
- 筛选：`全部/消息/技能/工具/MCP/A2A/审批/工作流/错误`，带计数；
- 搜索：标题/副标题/event/错误摘要；payload 默认不参与搜索（避免敏感内容被检索）；
- 展开：`<details>` 展示 redacted JSON（复用 `redactValue`）；
- 折叠：先做“全部折叠/展开”；**回合折叠**（Turn 1/2）依赖多 run 数据，方案见下。

**回合折叠（可选，+1 人日）**
- 现状：抽屉只拿当前 run 的 items；messages 有 `run_id`，但没有 conversation runs 列表端点。
- 方案 A（推荐）：后端加 `GET /runs?conversation_id=&limit=`（1d），前端按 run 分组；
- 方案 B：前端从 `GET /conversations/{id}/messages` 取 run_id，再逐个 `GET /runs/{id}/events`（N+1，最多 3–5 个 run，可接受）；
- 方案 C：本期不做回合折叠，只做“按类型折叠”，并在报告里把该项标为“需 runs 列表”。

**验收**
- 单测：过滤计数、搜索、去重、空态；
- E2E：打开抽屉 → 筛选“工具” → 搜索命中 → 展开一行 → 图例可见；
- axe：抽屉打开态 0 critical/serious；
- 不新增后端依赖（除可选回合折叠）。

### WP3 前端快修（4 人日）

**3A 审批备注（0.5d）**
- `types/chat.ts` 的 `ApprovalProcess` 加 `decisionNote?: string`；
- `ApprovalCard.vue` 加 `<textarea maxlength="500">`（可选），emit `approve(note)` / `reject(note)`；
- `ProcessTimeline.vue` → `MessageList.vue` → `ChatView.vue` 透传 note；
- `stores/chat.ts` 的 `resolveApprovalById` 已支持 `note`，只改调用；
- 已决卡显示 `decisionNote`（有值时）；
- 测试：空备注/带备注发送、已决展示、超长截断。

**3B 智能体编辑（2d）**
- 新增 `src/components/agents/AgentEditDialog.vue`：name、auth.type、auth.secret_ref（`env:` / `secret:` 前缀校验）；
- `AgentDetailDrawer.vue` 加“编辑”按钮（仅 `canManage`）；
- `AgentsView.vue` 接 `agentsApi.update`，成功后刷新详情与列表；
- **不编辑 headers**（响应不回显明文，避免覆盖风险）；
- 测试：校验、提交、403 文案、成功后刷新。

**3C 系统模板守卫（0.5d）**
- `WorkflowsEditorView.vue` 加载后判断 `scope === 'system'`：显示只读徽标、禁用保存、隐藏删除；
- 直接访问 `/workflows/{systemId}` 不再出现“可改但保存 404”；
- 测试：直达系统模板 → 保存按钮 disabled。

**3D 工作流候选 + 停用提示（1d）**
- `ChatView.loadWorkflowOptions` 改为 `workflowsApi.list({ limit: 100 })`；
- `ChatComposer` 工作流面板加本地搜索框；
- `seedWorkflowFromQuery` 失败且原因可判定时 toast“模板已停用/不可用，未预选”；
- 测试：100 条、搜索、停用提示、无效 id 静默（保持现有）。

**3E 管理台搜索（可选，1d）**
- 复用 `CommandPalette` 的交互，新增管理台路由/用户/审计动作三组；用户搜索调 `adminApi.users({ q })`；
- 不做通知铃铛。

**验收**：`pnpm test` + `pnpm e2e --grep "approval|agents|workflows|admin"`；无后端改动（除无）。

### WP4 契约小增量（8 人日）

**4A 工作流运行统计（1.5d 后端 + 0.5d 前端）**
- `WorkflowOut` 加：
  ```python
  run_count: int = 0
  last_run_at: datetime | None = None
  last_run_status: str | None = None
  ```
- `list_workflows`：对当前页 **`scope='user'` 的本人模板** 一次 `GROUP BY workflow_id` 聚合（COUNT/MAX），避免 N+1；**系统模板不返回他人运行统计**（与 `/workflows/{id}/runs` 对系统模板 403 的口径一致），前端显示 `—`；
- `get_workflow`：单条聚合，系统模板同理；
- 前端 `types/workflow.ts`、`WorkflowsView.vue` 卡片展示“N 次运行 · 最近 …”；
- 测试：无运行=0、分页页内统计、列表/详情一致。

**4B 知识库分类目录 + 重建别名（2d 后端 + 1d 前端）**
- `GET /knowledge/categories`：返回 `{items:[{category, count}]}`，可见范围与文档列表一致（系统 + 自己）；
- `POST /knowledge/documents/{id}/rebuild`：复用 `retry_document`，语义为“从原文重建”；`retry` 保留兼容；
- 前端 `api/knowledge.ts`、`stores/capabilities.ts`（候选改 categories）、`KnowledgeView.vue`（分类筛选/重建按钮）；
- 测试：分类去重/空分类、权限 404、重建成功/原文缺失 failed。

**4C 偏好同步（2d 后端 + 1d 前端）**
- 迁移：`user_settings` 加 `preferences JSONB NOT NULL DEFAULT '{}'`（可回滚）；
- 端点：`GET/PUT /api/v1/preferences`，schema：
  ```json
  {"theme":"light|dark","density":"compact|cozy|comfortable","language":"zh-CN"}
  ```
  部分更新；未知键 422；
- 前端：`api/preferences.ts` + `usePreferences` 启动时合并（服务端优先，失败回退 localStorage）；设置页保存时同步；
- 测试：默认值、部分更新、未知键、断网回退。

**验收**：后端全量 `pytest -q`；前端 `pnpm test`；真实后端 smoke（若环境可用）。

### WP5 治理层（条件立项，A 路径才做）

- 触发条件：出现多角色/多租户/合规审计要求，且 B 路径的只读方案被否决。
- 范围：roles/permissions/user_roles、menus、dictionaries、system_settings 白名单、权限中间件、前端 3 页可编辑 + 系统设置 7 分区。
- 预估：后端 20–25 人日、前端 8–10 人日、迁移 2–3 个；需独立 spec + 独立计划。
- **本次不写代码**；B 路径下只产出 ADR 与“目标形态”说明。

### WP6 验证与门禁（2 人日）

1. **`smoke:m8` 留档**：后端启动后执行 `pnpm smoke:m8`，输出写入 `docs/handoff/2026-11-XX-m8-smoke.md`；若环境不可用，标记“未取证”，不得写“已联调”。
2. **真实后端 M8 用例**：新增 `scripts/real-m8.spec.ts`（用户列表/角色变更 422/409、审计 403），纳入 `test:real`。
3. **M9 审批恢复**：扩展 `scripts/smoke-m9-backend.mjs`，断言 `approval.required → 批准 → run.resumed → workflow.step(ok)`。
4. **E2E 边界**：在 README/CI 注明“E2E 只跑 mock 构建”；真实链路以 smoke/test:real 为准。
5. **契约漂移检查（可选）**：脚本对比后端 `openapi.json` 与前端 API 调用集合，CI 报警新增端点未消费。

### WP7 正式接受清单（0.5 人日）

产出 `docs/handoff/2026-11-13-accepted-deviations.md`，每条包含：

- 现象、为什么接受、影响、重开条件、责任人/日期。

覆盖：D6、D7、D8、S1、S3、A2、W1、W3、M4、M5、M6、M10、G1，以及 M3 的邀请部分、M9 的通知部分。

---

## 4. 排期与并行

假设 2 人（1 后端 + 1 前端），人日为含测试的估算，不含环境等待。

| 周 | 后端 | 前端 | 里程碑 |
|---|---|---|---|
| W1 | WP1（审计/概览/用户数） | WP2（轨迹抽屉）| WP0 完成；WP1 接口冻结 |
| W2 | WP1 联调 + WP4A/4B | WP2 收尾 + WP3 | M1/M2/M7 关闭；D1/D3/A1 关闭 |
| W3 | WP4C + WP6 | WP4 前端 + 文档 | S2/K1/K2/W2 关闭；smoke:m8 留档 |
| W4+ | WP5（仅 A 路径） | WP5 前端 | 治理决策后另行排期 |

**关键路径**：WP1 后端 → WP1 前端联调 → WP6 留档；WP2 与 WP1 并行，不互相阻塞。

---

## 5. 关键设计说明

### 5.1 为什么审计 IP 不要新增迁移

- `audit_logs.ip` 列已存在（`app/db/models/audit.py:39`），只是 `write_audit` 没写；
- 用 `client_ip_ctx` 在中间件统一注入，所有调用点零改动；
- `result` 先由 `detail.get("result", "success")` 提供，避免为“当前只有成功审计”造一列；
- 后续要记录失败审计时，再补 `result` 列与失败写入点。

### 5.2 为什么运行量图单独开端点

- `/admin/overview` 现有“最多 10 条 SELECT”的性能断言（`test_admin_overview.py`）；
- 按日聚合是 7/30 天范围查询，和累计计数不是同一频次；
- 单独 `GET /admin/overview/runs?range=` 可独立缓存/限流，也便于以后换统计表。

### 5.3 为什么工作流统计放后端

- 前端对每张卡调 `/workflows/{id}/runs` 会产生 N+1；
- 列表页一次批量聚合即可，且详情/列表口径一致；
- 不改表，只加聚合字段，无迁移。

### 5.4 为什么知识库“重建”用别名而不是新逻辑

- `retry_document` 已经是“从 storage_key 重读原文并重建索引”，与单文档重建语义一致；
- 新增 `POST /documents/{id}/rebuild` 只是契约命名对齐，复用同一服务，风险最低；
- 长期可把 `retry` 标为 deprecated，前端只调 `rebuild`。

### 5.5 为什么偏好同步要加列而不是塞 system_settings

- `system_settings` 是平台级 key-value，用户级偏好放进去会污染平台配置与审计；
- `user_settings` 已有 `user_id` 主键，加 `preferences JSONB` 最贴合；
- 迁移可逆：`DROP COLUMN preferences` 即回滚。

### 5.6 运行轨迹的“回合折叠”边界

- 当前抽屉只加载当前 run；原型 Turn 1/2 需要多 run 数据；
- 本期先交付 5 项交互，回合折叠单列为可选；
- 若要做，优先加 `GET /runs?conversation_id=`（1d），不要在前端硬造轮次。

---

## 6. 文档修正清单（WP0）

| 文件 | 位置 | 现状 | 改为 |
|---|---|---|---|
| `README.md` | 7、22、120、144-145、180 | M0–M7、M8/M9 待后端、复选框未勾 | M0–M9 已完成（M3 取消）；M8 七页在位/三页只读；M9 已交付 |
| `docs/prototypes/README.md` | 18、32-36 | M7–M9 已立项未开始 / 后续承接 | 已交付；M8 三页只读、M9 五类步骤 |
| `docs/roadmap.md` | 8、36、204 | 398 / 402 / 475 混用 | 当前 475；历史数字注明统计时点 |
| `docs/handoff/README.md` | 18 | M0–M7、M8/M9 已立项 | 同 README |
| `src/components/chat/MessageBubble.vue` | 165 | “下载端点将在 M1.5 提供” | “下载附件” |
| `docs/pages.md`、`docs/roadmap.md` | pages.md §8.1；roadmap 5、8、36、279 | “v8 全量七页” | “七页在位；角色/菜单/字典只读；系统设置为能力配置 + 平台信息” |

> 文档修正与代码同批评审；不要只改 README 不改 roadmap 口径。

---

## 7. 验证与门禁

### 7.1 每个 WP 的最低证据

| WP | 单测 | 集成/E2E | 真实后端 |
|---|---|---|---|
| WP1 | 前端 3 个 spec | 后端 3 个 test 文件 | `smoke:m8`（有环境时） |
| WP2 | trace util + drawer | `e2e/run-trace.spec.ts` | 不需要 |
| WP3 | 4 个组件 spec | `e2e/approval|agents|workflows` | 不需要 |
| WP4 | 前后端各 2–3 个 | 后端 3 个 test 文件 | `smoke:m9` / 新接口冒烟 |
| WP6 | — | — | smoke + test:real 输出留档 |

### 7.2 推荐命令

```bash
# 前端
pnpm test
pnpm type-check
pnpm e2e
pnpm smoke:m8   # 需后端 8000 + dev_postgres

# 后端
cd ../agent-hub
.venv/bin/pytest tests/integration/test_audit_api.py \
  tests/integration/test_admin_overview.py \
  tests/integration/test_admin_users.py -q
.venv/bin/python scripts/export_openapi.py   # 契约变更后重导出
```

### 7.3 完成定义（DoD）

- 代码 + 测试 + 文档三件套齐全；
- 契约变更已重导出 `openapi.json` 并同步前端类型；
- 新增端点有 401/403/404/422 的最小断言；
- 真实后端证据（smoke/test:real）或明确“未取证”标注；
- 不把 mock 通过写成“已联调”。

### 7.4 Review Focus（独立审查重点看这 5 类）

| # | 输入/条件 | 期望行为 |
|---|---|---|
| 1 | 审计 IP：直连、反向代理、伪造 `X-Forwarded-For`、IPv6 | 只取可信第一段并截断 64；取不到写 `null` 而不是空串；不能因 IP 采集影响主请求 |
| 2 | 概览按日：跨时区、跨日/跨小时边界、空库、`range=30d` | 日期连续补零；时区固定可配置；空库返回全 0；非管理员 403；不写审计 |
| 3 | 轨迹合并：live 与 server 重复、`seq` 回退、200 条上限、敏感 payload | 按 `seq`/`toolCallId` 去重且 server 补齐；payload 默认遮罩；超限提示而不是静默截断 |
| 4 | 工作流统计：系统模板、他人模板、分页页内、无运行 | 只统计本人 user 模板；系统/他人不泄露运行次数；无运行显示 0/`—`；列表与详情一致 |
| 5 | 偏好同步：服务端与本地冲突、断网、未知键、旧数据 | 服务端优先、失败回退本地；未知键 422；迁移默认 `{}` 不破坏旧行 |

---

## 8. 风险与回滚

| 风险 | 触发 | 缓解/回滚 |
|---|---|---|
| 概览按日查询拖慢管理台 | runs 表大 | 先加 `runs(created_at)` 索引；仍慢则退化为“近 7 天缓存/统计表” |
| 审计 IP 取错（代理伪造 XFF） | 部署在不可信代理后 | 只信第一段 + 生产 Nginx 覆盖该头；文档写明信任边界 |
| 偏好迁移失败 | 迁移脚本问题 | 迁移可逆；上线前空库 + 有数据两套 `alembic upgrade/downgrade` 验证 |
| 轨迹抽屉事件过多卡顿 | 一次 200+ 事件 | 服务端已限 200；前端过滤 + 折叠；必要时虚拟滚动 |
| A 路径 RBAC 返工 | 中途改权限模型 | 不在 B 路径预埋半成品角色表；A 独立立项 |
| 工作流统计聚合慢 | 模板多/运行多 | 只对当前页 ids 聚合；索引 `workflow_runs(workflow_id, created_at)` 已存在 |

---

## 9. 执行建议

### 9.1 首批范围（建议现在确认）

**Wave 1 = WP0 + WP1 + WP2 + WP3**（约 17 人日，2 人并行 1.5–2 周）：

- 关闭 P1：D1、M1、M7（其余 P1 走缩范围/部分补）；
- 关闭 P2：M2、M3（导出）、D3、D4、D5、A1、W4、M9（搜索）；
- 产出：可演示的管理台真实数据 + 完整运行轨迹抽屉 + 4 个前端体验修复。

**Wave 2 = WP4 + WP6 + WP7**（约 10.5 人日，1 人 1 周 / 2 人 3–4 天）：

- 关闭 P2：S2、K1、K2、W2；
- 补齐 M8 冒烟与 M9 审批恢复证据；
- 文档口径收口。

### 9.2 需要你拍板的三件事

1. **治理路径**：选 B（推荐，5–7 人日收口）还是 A（全量 RBAC，+20–25 人日）？
2. **首批范围**：是否按 Wave 1（WP0+WP1+WP2+WP3）开工？
3. **真实后端环境**：`smoke:m8` 需要 8000 + dev_postgres。你希望我在有环境时执行，还是由你跑完把输出给我留档？

### 9.3 执行方式

- 推荐 **子代理并行 + 独立审查**：后端 WP1/WP4 与前端 WP2/WP3 文件集不重叠，可并行；每个 WP 完成后由独立子代理按 §7 验收，最后统一回归。
- 若你希望更快，也可 **Native 单线**：我按 WP 顺序实现，最后统一审查；适合环境不稳定、需要频繁本地判断的情况。

---

*本方案不含代码改动。确认路径与范围后，再按 WP 拆成独立实施计划（每个 WP 一份，含 TDD 步骤与提交粒度）。*
