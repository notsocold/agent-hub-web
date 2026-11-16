# 差异整改报告：从“接得上”到“对得齐”（前端 + 文档）

- 日期：2026-11-16
- 依据：[差异审计报告](2026-11-13-gap-audit-report.md)（30 项差异 / 5 处文档偏差 / 4 项验证缺口）、[差异整改方案](../superpowers/plans/2026-11-13-gap-remediation.md)、[治理决策 ADR](../superpowers/specs/2026-11-16-governance-decision.md)
- 决策：**路径 B**（缩范围 + 补真实数据 + 修前端交互）——用户 2026-11-16 拍板
- 范围：前端 `agent-hub-web`（代码 + 测试 + 文档）；后端 `agent-hub` **只读核对**，不修改
- 基线：`agent-hub-web` `f2e0f35` + 工作区未提交改动；后端 `agent-hub` `c7d4909`（`127.0.0.1:8000` 在跑）
- 附件：[差异关闭台账 CSV](assets/2026-11-16-gap-closure.csv)、[M8 冒烟留档](2026-11-16-m8-smoke.md)、[接受清单](2026-11-13-accepted-deviations.md)

> **一句话结论**：30 项差异按 B 路径全部有了明确归宿——**关闭 6 项、部分关闭 4 项、缩范围 4 项、正式接受 9 项、待后端 6 项、延后 1 项**；5 处文档偏差全部修正；V1 验证缺口由真实后端 `smoke:m8` 69 项关闭。本轮未改后端代码、未新增数据库迁移、未引入任何 npm 依赖。

---

## 0. 一页结论

### 0.1 处置结果

| 处置 | 数量 | 差异编号 |
|---|---:|---|
| 关闭（本轮修完） | **6** | D1、D3、D4、D5、A1、W4 |
| 部分关闭（前端就绪 / 后端待补） | **4** | M3（导出已做）、M7（前端就绪）、M8（只读面板）、M9（搜索已做） |
| 缩范围（保留只读 + 正式标注） | **4** | S1、M4、M5、M6 |
| 正式接受（写入接受清单） | **9** | D6、D7、D8、S3、A2、W1、W3、M10、G1 |
| 待后端（B 路径按需排期） | **6** | S2、K1、K2、W2、M1、M2 |
| 延后（需产品/后端先决策） | **1** | D2 |
| **合计** | **30** | — |

另有：文档偏差 **Doc1–Doc5 全修**（并顺手修正 4 份状态文档，见 §6）；验证缺口 **V1 关闭**（`smoke:m8` 69/69 真实后端）；V2/V3/V4 维持既有边界（§5.3）。

### 0.2 7 项 P1 的归宿

| P1 | 处置 | 结果 |
|---|---|---|
| D1 运行轨迹抽屉 | 修 | ✅ 关闭（5 类交互；回合折叠依赖后端 runs 列表） |
| M1 概览运行量 | 待后端 | ⏸ 契约缺口，未造假数据 |
| M4 角色权限只读 | 缩范围 | ✅ 正式标注“目标形态（未排期）” |
| M5 菜单只读 | 缩范围 | ✅ 正式标注“变更需改代码发版” |
| M6 字典只读 | 缩范围 | ✅ 正式标注“字典项变更需发版” |
| M7 审计 IP/结果 | 前端修 + 待后端 | ◐ 前端说明与防御性渲染就绪；`AuditLogOut` 无字段（后端只读核对确认） |
| M8 系统设置 7 分区 | 部分修 | ◐ 新增只读“平台信息/能力开关”（5→7 分区）；运维 IA 列为目标形态 |

### 0.3 门禁数字（2026-11-16 本机实测）

| 检查 | 结果 | 对比基线 |
|---|---|---|
| `pnpm test` | **561 passed / 88 files** | 477 / 80（会话开始前基线，含他人未提交的 2 例） |
| `pnpm type-check` | exit 0 | — |
| `pnpm lint`（oxlint + eslint 等效无 `--fix` 校验） | 0 errors / 0 warnings | — |
| `pnpm build` | ✓ built in 1.48s | — |
| `pnpm size` | ❌ **456.9 KB > 420 KB 上限**（**既有问题，非本轮引入**，见 §7.2） | HEAD 基线已 441.7 KB 超限 |
| `pnpm e2e` | **44 passed + 1 skipped** | 42 + 1（2026-11-12 报告） |
| axe（critical/serious） | **0 违规**（10 个扫描面，含新增运行轨迹抽屉与 4 个管理台页面） | 0 |
| `smoke:m8`（真实后端） | **69/69 通过** | 此前未留档（E3 → **E1**） |

---

## 1. 执行方式

### 1.1 并行工作包（写作用域互不重叠）

| 工作包 | 内容 | 主要写作用域 | 结果 |
|---|---|---|---|
| T1 运行轨迹 | D1 | `src/utils/trace.ts`、`src/components/chat/trace/`、`RunTrace*`、`e2e/run-trace.spec.ts` | 24 单测 + 1 E2E |
| T2 对话修复 | D3/D4/D5 | `ApprovalCard`、`ProcessTimeline`、`MessageList`、`ChatView`、`ChatComposer`、`stores/chat*`、`types/chat.ts` | 83 定向单测 |
| T3 体验修复 | A1/W4/M9 搜索 | `components/agents/`、`WorkflowsEditorView`、`AdminLayout`、`CommandPalette` | 45 → 46 单测 + 1 E2E |
| T4 管理台收口 | M3/M4/M5/M6/M7/M8/S1 | `views/admin/`、`components/admin/`、`SettingsView`、`e2e/admin.spec.ts` | 42 → 49 单测 |
| T5 文档口径 | Doc1–Doc5 + ADR + 接受清单 | `README`、`docs/roadmap`、`docs/pages`、`docs/handoff` | 3 份新文档 |
| T6 取证（Lead） | V1 关闭 | `docs/handoff/2026-11-16-m8-smoke.md` | 69/69 |

两轮跟进：T4 补 `?q=`/`?action=` URL 预填与审计类型正式化；T3 补 `AgentAuthType` 放宽为 `none|api_key|oauth2`。Lead 负责两次跨作用域收口（a11y 修复、lint 清理）与全量门禁。

### 1.2 文件规模

- 修改 53 个已跟踪文件、新增 20 个文件（含 3 份文档、9 个测试文件、8 个源码文件）；
- 代码行：+2079 / −238（不含本轮新增文档与本报告）；
- **零新增 npm 依赖、零后端改动、零数据库迁移**。

---

## 2. 关闭项（6 项）

### D1 运行轨迹抽屉（P1）

原型 `ui-v7.html:2935-2995` 的 6 类交互中，本轮交付 5 类 + 1 类列条件项：

| 交互 | 实现 |
|---|---|
| 执行时间线总览条 | `TraceOverview.vue`：按 `durationMs` 比例画段；**无时长用最小宽度并标 `—`，不伪造时长** |
| 颜色图例 | 8 类（消息/技能/工具/MCP/A2A/审批/工作流/错误）带计数 |
| 类型筛选 | `TraceToolbar.vue`：全部 + 8 类，`aria-pressed`、带计数 |
| 搜索 | 标题/副标题/事件名/错误摘要；**payload 不参与搜索**（避免敏感内容被检索） |
| 折叠/展开事件行 | `TraceRow.vue`：`button + aria-expanded`，展开 `redactValue` 脱敏 JSON |
| 回合折叠（Turn N） | ⏸ 需后端 `GET /runs?conversation_id=`；以“全部折叠/全部展开 + 类型筛选”作等价入口 |

数据侧新增 `src/utils/trace.ts`（756 行，纯函数）：把 SSE 实时 `ProcessItem` 与 `GET /runs/{id}/events` 归一为 `TraceEntry`，按 `tool_call_id/step_id/task_id/approval_id/skill_id/message_id` 去重合并，服务端事件补齐 payload/duration/status；返回满 200 条时提示“仅显示最近 200 条”。

### D3 审批备注（P2，后端能力未消费）

- `ApprovalProcess` 新增 `decisionNote?`；`ApprovalCard` 增加 `<textarea maxlength="500">`（可访问 label、字数提示、`n / 500`）；
- 透传链：`ApprovalCard → ProcessTimeline → MessageList → ChatView → chat.resolveApprovalById(id, approve, note)`；
- 成功后写入卡片 `decisionNote`，已决卡显示“备注：…”并过 `redactText`；
- 服务端 `decision_note` 经 `approvalToProcess` 回填（`GET /approvals` 对账 / 409 详情两条路径）；
- **后端零改动**（`ApprovalDecisionRequest.note`、`ApprovalOut.decision_note` 已存在，已只读核对）。

### D4 工作流候选分页（P2）

`workflowsApi.list({ limit: 100 })`（后端 `limit ≤ 100`，默认 20，已核对 OpenAPI）；`ChatComposer` 工作流面板加本地搜索（名称/描述）、无匹配空态、达到 100 条提示“仅显示前 100 条模板，更多请到工作流页”。

### D5 停用模板提示（P3）

`seedWorkflowFromQuery` 命中停用模板时 `ElMessage.warning('该模板已停用，未预选')`；无效 id / 请求失败仍静默 `console.warn`（保持原语义）。

### A1 智能体编辑（P2）

- 新增 `AgentEditDialog.vue`：名称、`auth.type`（**按后端实装 `none|api_key|oauth2`**）、`auth.secret_ref`（`env:` / `secret:` 前缀校验）；
- `AgentDetailDrawer` 增加“编辑”（`canManage` 时），成功后回写详情并刷新列表；
- 错误按 `403/422/409/404` 分支文案；
- **headers 不编辑**：响应不回显明文，避免覆盖风险 → 归入 A2 接受清单，对话框内明示。

### W4 系统模板守卫（P3）

`WorkflowsEditorView` 加载后 `scope === 'system'`：只读徽标“系统模板只读，如需调整请复制为我的模板”、名称/描述只读、保存 `disabled`、步骤增删/移动控件隐藏；直达 `/workflows/{systemId}` 不再“可改但保存 404”。

---

## 3. 部分关闭 / 缩范围（8 项）

| 编号 | 本轮做了什么 | 剩余 |
|---|---|---|
| M3 | 用户页“导出 CSV”（当前筛选、当前页、UTF-8 BOM、RFC4180 转义、空页禁用） | 邀请用户 → 接受清单 AD-M3i |
| M7 | 列头说明 + 页面说明条 + 正式类型 `AuditLog.ip?/result?` + 有值即渲染的防御性逻辑 | 后端 `AuditLogOut` 加 `ip/result`（模型已有 `ip` 列，低成本） |
| M8 | 系统设置 5 → 7 分区：只读“平台信息”（`/system/info`）+ “能力开关”（capabilities/limits） | 认证策略/配额/数据保留/危险操作 → 目标形态（A 路径才做） |
| M9 | 管理台顶栏搜索（7 路由 + 用户 400ms 防抖检索 + 审计动作；Ctrl/Cmd+K 与 `/`；Esc 与焦点回归） | 通知铃铛 → 接受清单 AD-M9n |
| S1 | 语言下拉保持禁用 + “多语言未启用（未排期）” | 完整 i18n 未排期 |
| M4 | 只读矩阵 + 说明条“v1 仅 user/admin，多角色为目标形态” | RBAC 需 A 路径立项 |
| M5 | 只读路由镜像 + 说明“菜单变更需改代码发版” | 菜单表/API 未立项 |
| M6 | 内置枚举只读 + 说明“字典项变更需发版” | 字典表/API 未立项 |

---

## 4. 待后端与延后（7 项）

| 编号 | 缺口（后端只读核对结论） | 建议（B 路径按需排期） |
|---|---|---|
| M1 | 无 `/admin/overview/runs`；`/admin/overview` 只有累计计数 | 新增按日/按小时聚合端点（方案 §WP1-1B） |
| M2 | `AdminUserOut` 无 `conversation_count` | 列表页批量 `GROUP BY user_id` COUNT |
| M7 | `AuditLogOut` 仅 8 字段，无 `ip/result`；`audit_logs.ip` 列已存在 | 加字段 + 中间件写 IP（方案 §WP1-1A，无迁移） |
| S2 | 无 `/preferences` 端点 | `user_settings.preferences` JSONB + GET/PUT |
| K1 | 只有 `/documents/{id}/retry` | 加 `POST /documents/{id}/rebuild` 别名 |
| K2 | 无 `/knowledge/categories` | 加目录端点；否则候选范围需提示 |
| W2 | `WorkflowOut` 无 `run_count/last_run_at/last_run_status` | 列表页批量聚合 |
| D2 | 无 regenerate / 重新发送端点 | 先由产品冻结契约（真重新生成 vs 重新发送 MVP） |

> 这 7 项未做任何“假实现”：不造统计表、不伪造审计字段、不给只读页加假写控件。

---

## 5. 验证证据

### 5.1 命令与真实输出

```text
$ pnpm test
 Test Files  88 passed (88)
      Tests  561 passed (561)
   Duration  10.67s

$ pnpm type-check          → exit 0（vue-tsc --build 无输出）
$ npx oxlint .             → Found 0 warnings and 0 errors（284 files / 127 rules）
$ npx eslint . --cache     → exit 0
$ pnpm build               → ✓ built in 1.48s
$ pnpm e2e                 → 44 passed + 1 skipped（30.5s）
$ pnpm e2e e2e/a11y.spec.ts → 10 passed（0 critical/serious）
$ node scripts/smoke-m8-backend.mjs → 结果：69 项通过，0 项失败
```

E2E 新增覆盖：
- `e2e/run-trace.spec.ts`：打开抽屉 → 筛选“工具” → 搜索命中 → 展开一行 → 图例可见（含抽屉打开态 axe 门禁）；
- `e2e/palette.spec.ts`：管理台顶栏搜索 → 用户结果跳转 / 审计动作跳转 / `/` 重开。

### 5.2 本轮修复的回归阻断

集成阶段发现并修复 3 类问题（均已回归通过）：

1. **a11y 回归**：新搜索按钮的 `kbd` 文本使可见文本（“搜索 Ctrl K”）与可访问名（“搜索管理台（Ctrl+K 或 /）”）不匹配，触发 `label-content-name-mismatch (serious)`，导致 3 个管理台页面 a11y 用例失败。修复：快捷键提示改由 CSS 内容渲染并保持 `aria-hidden`，显示与快捷键语义不变（`aria-keyshortcuts` 保留）。
2. **lint 阻断**：2 处测试文件未使用变量（`warningSpy`、`wrapper`）→ oxlint 2 errors，已清理。
3. **跨任务契约衔接**：管理台搜索跳转带 `?q=` / `?action=`，但目标页原先不读 query → 已补 `onMounted` 预填且保证首屏只请求一次；`AgentAuthInput.type` 与后端枚举对齐为 `none|api_key|oauth2`。

### 5.3 未取证项（保持诚实标注）

| 项 | 原因 |
|---|---|
| V2 真实后端浏览器级 E2E | E2E 仍跑 mock 构建；真实链路以 `smoke:*` / `test:real` 为准（路线图 §6 既定边界） |
| V3 真实 LLM / embedding 长流 | 本机 LLM key 为占位符、embedding 不可用 |
| V4 M9 审批恢复链路 | 当前库 `approvals` 表为空、MCP/工作流无 `requires_approval=true`，无法在真实后端触发审批 gate |

---

## 6. 文档口径

### 6.1 Doc1–Doc5 修正

| 编号 | 文件 | 修正 |
|---|---|---|
| Doc1 | `README.md` | “M0–M7 已完成 / M8、M9 待后端” → M0–M9 已完成（M3 取消）；M8 七页在位、三页只读；M9 五类步骤；复选框勾选；后端 M0–M9 已交付（78 路径 / 109 操作） |
| Doc2 | `docs/prototypes/README.md` | “M7/M8/M9 已立项未开始 / 后续承接” → 已交付；M8 三页只读、M9 五类步骤 |
| Doc3 | `docs/roadmap.md` | 398/402/475 混用 → 统一为“当前 561 单测（2026-11-16）”，历史数字标注统计时点与口径 |
| Doc4 | `docs/handoff/README.md` | 同 Doc1 |
| Doc5 | `src/components/chat/MessageBubble.vue:165` | “受控下载端点将在 M1.5 提供” → “下载附件” |

### 6.2 新增文档

- [接受清单](2026-11-13-accepted-deviations.md)：12 条（D6/D7/D8/S1/S3/A2/W1/W3/M10/G1 + M3 邀请、M9 通知），每条含现象/为什么接受/影响/可观测重开条件；
- [治理决策 ADR](../superpowers/specs/2026-11-16-governance-decision.md)：路径 B、A/C 否决理由、有效期 3 个月（2027-02-16 复核）、A 路径触发条件；
- [M8 冒烟留档](2026-11-16-m8-smoke.md)：69 项真实后端输出与副作用自愈说明；
- [文档修订记录](2026-11-16-doc-sync.md)：逐文件“原口径 → 新口径”与自检输出。

### 6.3 v8 表述统一

全仓统一为：**“七页在位；角色/菜单/字典只读；系统设置为能力配置 + 平台信息（只读）形态”**（`README`、`pages.md`、`roadmap.md`、`handoff/README.md`）。

---

## 7. 风险与后续

### 7.1 风险

| 风险 | 说明 | 缓解 |
|---|---|---|
| 运行轨迹合并边界 | live 与 server 审批事件依赖 `approval_id` 关联；若后端只回 `tool_call_id` 可能出现一行重复 | 当前契约要求 `approval_id`，风险低；真实联调时验证 |
| 候选截断口径 | `length >= 100` 即提示，含停用模板计数 | 提示文案已说明“前 100 条”；后端调整上限需同步 |
| URL 预填只在挂载时读一次 | 同页改 query（组件未重挂）不跟随 | 当前入口均为跨页跳转；如需同页联动再补 watch |
| 只读面板错误态 | 已有数据 + 刷新失败显示“以上为上次成功加载的数据” | jsdom 单测覆盖首屏失败；建议浏览器复验 |
| 系统内置 Agent 不可编辑 | 后端 `AgentOut` 无 `is_builtin` 标记，前端仅防御性判断 | 产品若要求硬约束，后端需暴露标记 |

### 7.2 集成发现：体积门禁在 HEAD 已是红色（非本轮引入，需决策）

`pnpm size` 不在 30 项差异内，但集成阶段跑 CI 等效门禁时发现它是红的，且**不是本轮改动造成**：

| 基线 | JS 总 gzip | 与 420 KB 上限 |
|---|---:|---|
| `43a16b7`（M9 交付后、像素对齐前） | **422.9 KB** | 已超 2.9 KB |
| `f2e0f35`（本轮基线 HEAD） | **441.7 KB** | 已超 21.7 KB |
| 本轮整改后（工作区） | **456.9 KB** | 超 36.9 KB（本轮 +15.2 KB） |

- `.github/workflows/ci.yml:30` 串行执行 `pnpm size`，因此**该门禁自 2026-11-12 M9 交付起即为红**；M9 前端交付报告中的「`pnpm size` 通过」与实测不符（历史记录错误）。
- 超限主因是 M7–M9 与像素对齐新增的真实功能（管理台七页、工作流、运行轨迹、Element Plus 重组件），不是本轮引入；单 chunk 上限（110 KB）仍满足（最大 chunk 为 markdown 75.7 KB）。
- 本轮**未擅自放宽阈值**（改阈值属于质量门禁决策）。两条候选方案，需产品/工程确认：
  1. 重新基线化：`BUNDLE_MAX_TOTAL_JS_KB` 420 → 480 KB，并在 roadmap 记录「M10 前重新评估」；
  2. 改指标：总量改为「首屏 JS gzip 预算」（约 200 KB）+ 保留单 chunk 110 KB，更贴合真实加载体验，但需要一次脚本与文档改造。
- 在该决策落地前，任何提交都会让 CI 的 `build` 之后步骤保持红色——建议作为下一轮第一个修复项。

### 7.3 建议的下一步

1. **后端小增量包（M10 候选）**：M7 审计字段（无迁移）→ M2 会话数 → M1 运行量 → W2 工作流统计 → S2 偏好 → K1/K2 知识库；均为低风险增量，见方案 §WP1/§WP4。
2. **条件项**：RBAC/菜单/字典/平台运维 IA 走 A 路径独立立项（不预埋半成品）。
3. **取证**：在具备真实 LLM key 与审批配置的环境补 V3/V4；浏览器级真实链路可另立 spike。
4. **提交**：本轮改动尚未提交（工作区同时含上一任务的会话回放/标题修复改动）；建议按「代码+测试」「文档口径」两个提交拆分后评审。

---

## 8. 复跑命令

```bash
cd /home/zhaodan/work/NodeJsProjects/agent-hub-web

pnpm test                 # 561 passed / 88 files
pnpm type-check           # exit 0
npx oxlint .              # 0 errors
npx eslint . --cache      # exit 0
pnpm build                # 生产构建
pnpm e2e                  # 44 passed + 1 skipped（需 Playwright 浏览器）
node scripts/smoke-m8-backend.mjs   # 需后端 127.0.0.1:8000 + dev_postgres，69/69
```

---

*本报告与 [差异关闭台账 CSV](assets/2026-11-16-gap-closure.csv) 配对使用；台账逐行给出 30 项差异的整改后状态与证据。*
