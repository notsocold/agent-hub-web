# M9 前端工作流交付报告（2026-11-12）

- 范围：前端 M9「工作流管理 + 运行」全量交付（M9-F1 至 M9-F5，含 Task 7 E2E / smoke / 文档收口）
- 后端基线：`agent-hub` M9 T1–T9 已交付（`55d8020` workflows CRUD、`1a3475d` 装配器、`1dc2f10` 运行历史、`85cb5c3` chat 接入、`4687c8b` workflow.step、`cb5d014` 能力开关与 run.workflow 输出、`bf84ec0`/`8c8a026`/`058608d` 收口），`capabilities.workflows=true`
- 契约基准：[`docs/api.md`](../api.md) §13.7（已实装契约，以后端 T3–T5 提交代码为准）；类型 `src/types/workflow.ts` 与后端 `schemas.py` 的 WorkflowOut/WorkflowRunOut 逐字对齐
- 分支：`feat/m9-workflow`（前端，Task 1–6 于 `faf1c2b` 前交付，Task 7 收口提交见下）

## 1. 一句话结论

前端 M9 五项功能全量落地：列表卡片化（启停/删除/运行入口）、线性步骤编辑器（五类参数表单 + `validateWorkflowSteps` 前端镜像校验 + 离开守卫）、运行历史页（终态快照 + 游标分页）、对话接入（候选单选 + query 预选 + `workflow_id` 请求 + `workflow.step` 步骤卡）、契约/类型/mock 收口。全量单测 473 例、E2E 42 例（含新增 M9 主链路与门控 2 例）、`smoke:m9` 56 项真实后端全绿。

## 2. 各任务交付（Task 1–7）

| 任务 | 交付 |
|---|---|
| T1 契约/类型 | `src/types/workflow.ts`（Workflow/WorkflowStep/WorkflowRun/WorkflowStepProcess + `validateWorkflowSteps` 镜像）；`src/api/workflows.ts` 七方法 |
| T2 列表页 | `src/views/WorkflowsView.vue` + `src/stores/workflows.ts`；启停/删除二次确认、关键词过滤、能力门控；mock db `workflows` CRUD + 停用运行 409 |
| T3 编辑器 | `src/views/workflows/WorkflowsEditorView.vue` + `src/components/workflows/WorkflowStepCard.vue`；增删/上移下移、id 重排、五类表单、校验错误行内展示、未保存离开守卫 |
| T4 运行历史 | `src/views/workflows/WorkflowsRunsView.vue`；游标加载更多、run_id 复制、403/404 固定文案；mock fixture 3 条演示运行（running/succeeded/failed） |
| T5 对话接入 | `ChatComposer` 工作流单选（chip + 步骤预览）、`ChatView` 候选加载与 query 预选（`seedWorkflowFromQuery`）、mock stream `workflow.step` 帧与 409 语义 |
| T6 workflow.step 卡 | `src/components/chat/cards/WorkflowStepCard.vue`（ProcessCardShell kind=workflow）；chat-reducer 归约 `workflow.step` 帧 |
| T7 收口 | `e2e/workflows.spec.ts` 2 例、`scripts/smoke-m9-backend.mjs` 56 项、`package.json` `smoke:m9`、六份文档同步、顺手修项（见 §5） |

## 3. 验证证据（2026-11-12 实测）

| 检查 | 结果 |
|---|---|
| `pnpm type-check` | 通过 |
| `pnpm lint` | oxlint + eslint 0 error |
| `pnpm test` | 80 文件 / 473 例通过 |
| `pnpm e2e` | 42 passed + 1 skipped（admin 用户页无其他可停用用户的既有条件跳过），1.4m |
| `pnpm size` | 通过（见提交前复验输出） |
| `pnpm smoke:m9` | **56 项通过，0 失败**：登录 → `capabilities.workflows=true` → 清理残留 → POST 201（scope/user/version/enabled 契约）→ 详情/列表 → PATCH version 1→2 → 启停往返（version 不变）→ 运行前空 → 422 `workflow_steps_invalid` → 404 三连 → `chat/stream` 带 `workflow_id` 收到 `workflow.step`（五键齐全、含检索步骤）→ 运行后 `workflow_runs` 登记 + `run_status=succeeded` 值断言（轮询最多 10 次 × 500ms 等终态追平）→ 过期 version 409 `workflow_version_conflict` → 停用 409 `workflow_disabled` → 无效 id 404 → DELETE 204（runs 随 CASCADE 删除）→ 清理无痕 |
| E2E 主链路 | 列表 4 卡 → 新建 → 编辑器 3 步（检索/a2a/审批）→ 保存回列表 → 卡片 v1/3 步 → 「在对话中使用」→ chip `名称 · v1 · 3 步` → 发送 → 时间线 `.pcard.kind-workflow`「检索工单」卡 → 新模板运行历史空态（mock 限制）→ 客服周报运行历史 3 行 |
| E2E 门控 | `workflows=false`（localStorage 覆盖钩子）：侧栏「工作流」按钮 disabled → `goto /workflows` 被守卫退回 `/chat` 并 toast → 「+ 上下文」菜单工作流入口「未启用」 |

真实联调环境：后端 `agent-hub` 本机 `.venv/bin/python -m uvicorn app.main:app`（8000，dev_postgres 容器 + `seed_dev_account.py --admin`）；`workflow.step` 帧依赖 LLM 真实调用工具（本机 key 可用，检索步骤命中 `search_knowledge` 后两帧 `workflow.step`）。

## 4. E2E 与 mock 基础设施说明

- **RED→GREEN 记录**：链路已在 Task 1–6 实现，首轮 RED 均来自断言/环境路径而非功能缺失，如实记录：①主链路第 7 步 `page.goto('/workflows')` 整页重载重置 mock 内存数据（新建模板消失）→ 改为侧栏 SPA 导航；②门控用例误判可进入 `/workflows` 页 → 守卫实际退回对话页（`blocked` toast 展示后被 replace 掉）；③`ctx-workflow` 需先点「添加上下文」展开菜单；④第四轮 2 passed。
- **mock 能力覆盖钩子**：`src/api/mock/db.ts` 新增读取 localStorage 键 `mock-capability-override`（JSON `{"workflows": false}`），仅 mock 分包生效，供 E2E `addInitScript` 写入门控场景；mock 沙盒默认全能力开启，此前无法演练置灰。
- **mock 会话身份持久化（M8 债务修复）**：mock 登录把角色写在内存 user 上，整页加载后 mockDb 重置、`/auth/me` 返回 `role=user`，导致 M8 管理台 E2E 7 例（当年缺 chromium 系统库从未真实运行）首次跑即失败（403 无权限页）。修复：mock 登录/注册时把 email 记入 localStorage（`mock-session-email`）、登出清除，`reset()` 按其重建身份——与真实后端「token 重载后指向同一用户」语义一致。`admin.spec.ts` 7 passed + 1 skipped。

## 5. 顺手修项（控制器指派）

`ChatView.vue` `seedWorkflowFromQuery` 注释补一行：**workflow_name 仅作展示提示，chip 文案以 get(id) 返回为准，故不读取**（选最小改动方案，未新增读取逻辑）。

## 6. 已知限制台账

| 限制 | 说明 | 影响 |
|---|---|---|
| 输入栏候选只取第一页 | `loadWorkflowOptions` 调 `workflowsApi.list()` 默认 `limit=20`，不分页加载 | 候选超过 20 条时输入栏搜不到后面的模板；列表页完整 |
| `capability=false` 时列表请求仍发出 | `WorkflowsView.onMounted` 无条件 `workflows.load()`；后端 CRUD 配置面不受开关影响（R1 惯例），列表可读 | 门控只置灰按钮与导航，不发假请求语义成立；后端若将来对 `/workflows` 也加开关校验需同步调整 |
| 系统模板编辑 URL 直达 | `/workflows/{系统模板id}` 直达可读（get 200），表单可改但保存 PATCH 404，错误行内展示「保存失败（not_found）」 | 无编辑入口（列表不渲染系统模板编辑按钮）；直达 URL 是兜底路径，不破坏数据 |
| mock 不登记新运行 | mock chat 运行不写 `workflowRuns`（静态 fixture 挂客服周报 3 条） | mock E2E 中新模板运行历史为空态；真实后端已验证登记 + 终态同步（`smoke:m9`） |
| 审批步骤卡在演示态可见 | 前端 `canceled`/`failed` 演示态覆盖取消/失败语义；审批超时语义沿用 M5 既有实现 | 真实「审批中断 → 恢复 → workflow.step(ok/rejected)」链路由后端 T6 保证；`smoke:m9` 收到 `run.interrupted` 即断流（恢复帧 run.resumed/workflow.step ok/message.done 不在其断言范围），脚本仅验证了审批决策端点可达（200） |
| `smoke:m9` 运行断言依赖 LLM | `workflow.step` 帧在后端由「工具完成 → 步骤命中」映射发出；LLM/embedding 不可用时该段失败 | 脚本顶部已注明；CRUD 与错误语义断言不依赖 LLM |

## 7. 真实联调状态与待办

- ✅ `smoke:m9` 56 项已在真实后端（T1–T9 全交付）通过，运行链路（`workflow.step` 五键、`workflow_runs` 终态同步、409/404 语义）已验证——原计划「等后端 T6–T9 后联调」已闭环。
- 待办（非本任务阻塞项）：
  1. 后端 `smoke:m9` 纳入常规回归（随 M9 后端回归一起跑）；
  2. 审批轮真实链路（带 approval 步骤模板的 `approval.required` → 批准 → 恢复 → `workflow.step`）建议在后端回归用例中补自动断言；
  3. `pnpm smoke:m8` 与管理台 E2E 已随本次浏览器环境修复跑通，后续在后端启动状态下复跑一次留档。

## 8. 变更文件清单（Task 7）

- 新增：`e2e/workflows.spec.ts`、`scripts/smoke-m9-backend.mjs`、`docs/handoff/2026-11-12-m9-workflow-frontend-report.md`
- 修改：`package.json`（`smoke:m9`）、`src/views/chat/ChatView.vue`（顺手修项注释）、`src/api/mock/db.ts`（能力覆盖钩子 + 会话身份持久化）、`src/api/mock/routers.ts`（登录/注册/登出接入会话身份）、`docs/roadmap.md`、`docs/pages.md`、`docs/architecture.md`、`docs/development.md`、`docs/api.md`
- `src/components.d.ts` 为 unplugin 自动生成，随构建更新
