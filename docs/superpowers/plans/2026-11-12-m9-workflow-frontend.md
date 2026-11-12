# M9 前端工作流实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `/workflows` 骨架 + mock 升级为真实契约：列表、线性步骤编辑器、启停、运行历史；对话「+ → 工作流」选择模板并以 `workflow_id` 发起运行，时间线渲染对齐后端 T6 契约的 `workflow.step` 步骤卡。

**Architecture:** 契约以后端 agent-hub 已提交的 T1–T5 实装代码为准（CRUD/启停/运行历史/chat `workflow_id`），`workflow.step` 事件与 `capabilities.workflows` 开关以后端实施计划 T6/T7 冻结口径为准（后端 T6–T9 由另一条线并行推进，T8 handoff 产出后核对一次契约）。执行模型是「步骤模板 + 审批闸门」，前端不做编排执行，只做模板管理与对话选择；工作流与手动上下文（技能/MCP/知识库）互斥，选择侧清空另一侧。

**Tech Stack:** Vue 3 `<script setup>` + TypeScript、Element Plus、Pinia、MSW 风格 mock（`src/api/mock/`）、Vitest + Playwright。

**Spec:** [M7–M9 前端对齐设计 §5](../specs/2026-11-11-m7-m9-frontend-alignment-design.md) + [前端路线图 M9](../../roadmap.md)（M9-F1…F5 与验收）+ [后端 M9 实施计划](/home/zhaodan/work/PythonProjects/agent-hub/docs/superpowers/plans/2026-11-12-m9-workflow-backend.md)（契约冻结来源）。

## Global Constraints

- 分支 `feat/m9-workflow` 从 `feat/m8-admin-console` 开出（含 M7 全部提交）；提交只在本地、不推送；`git add` 显式路径，禁止 `-A`。
- 契约基准（后端已实装，字段名逐字对齐，不自造）：
  - `WorkflowOut = {id, scope: 'system'|'user', name, description, steps, enabled: boolean, version, created_at, updated_at}`；**无** `slug/status/step_count/run_count`（步骤数前端按 `steps.length` 派生）。
  - 列表/运行历史均为游标分页 `{items, next_cursor, has_more}`（`limit` 1–100 默认 20），复用 M7 起既有游标分页类型与加载模式。
  - 错误语义：他人模板与不存在一律 404 `not_found`；停用模板运行 409 `workflow_disabled`；版本不匹配 409 `workflow_version_conflict`；steps 非法 422 `workflow_steps_invalid`；与手动上下文混传 422 `workflow_context_conflict`；系统模板 runs 403 `forbidden`。
  - steps 约束（前端校验镜像后端 `validate_steps`）：非空数组、≤12 步、`type ∈ {knowledge_search, tool, a2a, approval, answer}`、`id` 唯一非空、`instruction` ≤500 字符、单工具名 ≤200 字符、`tool` 步骤必须 `config.tools` 非空、全部文本总长 ≤8000 字符；工作流 `name` strip 后 1–100 字符且禁双引号与换行；`description` ≤500。
  - `POST /chat/stream` 带 `workflow_id` 与可选 `workflow_version`（≥1）；`workflow.step` 事件 payload 恰为 `{step_id, step_type, step_title, tool, status}`（`status: 'ok' | 'rejected' | string` 宽松处理），紧跟对应 `tool.result` 之后。
- `capabilities.workflows`：mock 恒 true（全功能沙盒，现状保留）；真实模式等后端 T7 后由 `/system/info` 驱动——false 时侧栏置灰（既有 capability 门控）+ 页面顶部「能力未启用」标注，入口禁用。
- 非目标：DAG/并行/条件跳转、拖拽画布、`GET /workflows/catalog`（后端 MVP 无此端点，`config.tools` 用标签输入）、导入导出、版本列表/回滚、跨用户共享、`draft/published` 状态机（后端只有 `enabled` 布尔）。
- 注释、UI 文案一律中文；沿用 Element Plus 既有组件与 `src/components/common/` 通用件；`ElMessageBox/ElMessage` 样式已在 `src/main.ts` 显式引入（新增直接用，不再动 main.ts）。
- 每个 Task 结束：`pnpm type-check && pnpm lint && pnpm test` 全绿后按任务提交信息 commit。

## Review Focus

1. **契约漂移**：后端已把 `slug/status/step_count/run_count` 换成 `enabled/steps`，任何残留旧字段读取（如列表页 `row.slug`）都会运行时报错。测试：T3 列表页单测断言渲染 `enabled` 徽标与 `steps.length`，不出现旧字段。
2. **互斥语义**：选中工作流必须清空技能/MCP/知识库，反之亦然；发送 payload 只含其一。测试：T6 ChatComposer 单测断言两侧互清与 payload 形状。
3. **`workflow.step` payload 对齐**：旧 reducer 消费 `workflow_id/step_index/name`，新 payload 是 `step_id/step_title/tool`；重写后回放（M7 `event` 字段）路径必须同样生效。测试：T6 reducer 单测覆盖实时与回放两条入口。
4. **越权与只读**：系统模板不得出现编辑/启停/删除入口；系统模板不得出现运行历史入口（后端 403）。测试：T3 列表页单测断言系统模板操作列只读。
5. **未保存丢失**：编辑器有改动时路由离开需确认；保存失败（422）行内展示错误不丢表单内容。测试：T4 编辑器单测断言守卫与错误回显。

---

### Task 1: 契约类型与 API 层

**Files:**
- Rewrite: `src/types/workflow.ts`
- Modify: `src/types/chat.ts:215-223`（`WorkflowStepData`）、`src/types/chat.ts:398-404`（`WorkflowStepProcess`）
- Modify: `src/types/index.ts`（导出新增类型）
- Rewrite: `src/api/workflows.ts`
- Test: `src/types/__tests__/workflow.spec.ts`（新建）、`src/api/__tests__/workflows.spec.ts`（新建）

**Interfaces:**
- Produces（T2–T6 消费，签名固定）:
  - `WORKFLOW_STEP_TYPES: readonly ['knowledge_search','tool','a2a','approval','answer']`、`WorkflowStepType`、`WorkflowScope`
  - `interface WorkflowStep { id: string; type: WorkflowStepType; title?: string; instruction?: string; config?: { tools: string[] } }`
  - `interface Workflow { id: string; scope: WorkflowScope; name: string; description: string; steps: WorkflowStep[]; enabled: boolean; version: number; created_at: string; updated_at: string }`
  - `interface WorkflowRun { id: string; run_id: string; status: string; created_at: string; run_status: string | null; run_finished_at: string | null; run_duration_ms: number | null; run_error_code: string | null }`
  - `validateWorkflowSteps(steps: WorkflowStep[]): string[]`（返回中文错误列表，空数组=合法；含 Global Constraints 全部 steps 约束与 8000 总预算）
  - `workflowsApi.list(params?: { limit?: number; cursor?: string }): Promise<{ items: Workflow[]; next_cursor: string | null; has_more: boolean }>` 与 `create(payload: { name: string; description?: string; steps: WorkflowStep[] }): Promise<Workflow>`、`get(id)`、`update(id, payload: { name?: string; description?: string; steps?: WorkflowStep[] })`、`setEnabled(id, enabled: boolean)`、`remove(id): Promise<void>`、`listRuns(id, params?)`（同列表分页形状）
  - `WorkflowStepData` 重写为 `extends BaseEventData { step_id: string; step_type: string; step_title: string; tool: string; status: 'ok' | 'rejected' | string }`；`WorkflowStepProcess` 重写为 `extends ProcessBase { kind: 'workflow'; stepId: string; stepType: string; stepTitle: string; tool: string }`

- [ ] **Step 1: 写失败测试** `src/types/__tests__/workflow.spec.ts`：合法 3 步样例（knowledge_search → a2a → approval，`config.tools: ['send_message']`）`validateWorkflowSteps` 返回 `[]`；非法六例各断言一条中文错误（空数组/未知 type/id 重复/tool 缺 `config.tools`/instruction 501 字符/总文本 8001 字符）；`Workflow` 类型样例断言含 `enabled/version/steps`、不含 `slug/status`（`// @ts-expect-error` 探针）。
- [ ] **Step 2: 写失败测试** `src/api/__tests__/workflows.spec.ts`：mock axios 层断言 7 个方法的 method/url/body（`POST /workflows`、`PUT /workflows/{id}/enabled` body `{enabled}`、`DELETE` 期望 204、`GET /workflows/{id}/runs` 透传 cursor 参数）。
- [ ] **Step 3: 跑测试确认失败**：`pnpm test -- src/types/__tests__/workflow.spec.ts src/api/__tests__/workflows.spec.ts` → FAIL（导出不存在）。
- [ ] **Step 4: 实现**：按 Interfaces 重写两文件与 `types/index.ts` 导出；`WorkflowStepData/WorkflowStepProcess` 替换为新字段（旧字段引用在 T6 前允许暂留编译错误的文件仅限 `chat-reducer.ts` 与 `WorkflowStepCard.vue`——本任务先不改这两个文件，若 `pnpm type-check` 因它们报错，则本任务内把它们改成最小对齐版：reducer 用 `step_id` 拼 `workflow:${stepId}`、映射 `status`，卡片改读 `stepTitle/tool`）。
- [ ] **Step 5: 跑测试确认通过**：`pnpm type-check && pnpm test` 全绿。
- [ ] **Step 6: Commit**：`git add src/types/workflow.ts src/types/chat.ts src/types/index.ts src/api/workflows.ts src/types/__tests__/workflow.spec.ts src/api/__tests__/workflows.spec.ts src/stores/chat-reducer.ts src/components/chat/cards/WorkflowStepCard.vue && git commit -m "feat(m9): 工作流契约类型与 API 层对齐后端实装（F5）"`。

### Task 2: mock 层对齐新契约

**Files:**
- Modify: `src/api/mock/fixtures.ts:1002-1040`（`mockWorkflows`）、`src/api/mock/db.ts`（`listWorkflows` 与新增方法）、`src/api/mock/routers.ts:1005`（`/workflows` 路由组）
- Modify: `src/api/mock/stream.ts`（发送带 `workflow_id` 时插 `workflow.step` 演示事件）
- Test: `src/api/mock/__tests__/workflows-mock.spec.ts`（新建；目录不存在则仿照既有 mock 测试位置）

**Interfaces:**
- Consumes: T1 `Workflow/WorkflowRun/workflowsApi` 形状。
- Produces: mock 端点与真实后端同形状——`GET /workflows`（游标分页 `{items,next_cursor,has_more}`，系统模板 + 用户模板）、`POST /workflows`（201，`scope:'user'`、`version:1`）、`GET/PATCH/DELETE /workflows/{id}`（PATCH version+1）、`PUT /workflows/{id}/enabled`（不改 version）、`GET /workflows/{id}/runs`（返回 `WorkflowRun[]` 分页，含 running/succeeded/failed 三种演示态）；mock db 方法名沿用既有命名惯例（`listWorkflows/createWorkflow/...`）。
- `mockWorkflows` 重写为 3 条新形状（`id` 保持旧值不变，`stream.ts` 的 `workflow_run` label 引用不破）：`客服周报`（enabled，3 步：检索 → a2a → 审批，正好覆盖验收样例）、`知识库巡检`（enabled，2 步 tool+answer）、`发布简报`（enabled=false，2 步）。

- [ ] **Step 1: 写失败测试**：list 返回 3 条且含系统模板一条（新增 fixture，`scope:'system'`）与分页字段；create 返回 `version:1` 且列表出现；PATCH 后 `version+1`；`setEnabled(false)` 后 version 不变；DELETE 后 get 404；`listRuns` 返回 2 条且 `run_status` 有值；stream：payload 带 `workflow_id` 时事件序列里 `workflow.step` 条数 ≥ 步骤数-1 且 `event_type` 为 `workflow`。
- [ ] **Step 2: 跑测试确认失败**。
- [ ] **Step 3: 实现**：fixtures 重写 + 新增 1 条系统模板；db/routers 按 Interfaces 落 7 个端点；stream.ts 在既有 mock run 序列的工具阶段按选定工作流 steps 逐条 emit `workflow.step`（`status:'ok'`，payload 字段严格按 T1 `WorkflowStepData`），审批中断恢复后对审批步骤补发一条 `'ok'`。
- [ ] **Step 4: 跑测试确认通过**；`pnpm test` 全绿（受影响的既有 mock/stats 断言一并修正为 `{items,next_cursor,has_more}` 形状）。
- [ ] **Step 5: Commit**：`git add src/api/mock && git commit -m "feat(m9): mock 工作流端点与 fixtures 对齐真实契约"`。

### Task 3: workflows store 与列表页重写

**Files:**
- Create: `src/stores/workflows.ts`
- Rewrite: `src/views/WorkflowsView.vue`
- Test: `src/stores/__tests__/workflows.spec.ts`（新建）、`src/views/__tests__/WorkflowsView.spec.ts`（重写既有）

**Interfaces:**
- Consumes: T1 `workflowsApi`、T2 mock。
- Produces: `useWorkflowsStore` 状态 `{ items: Workflow[]; loading; error; cursor; hasMore }`，动作 `load(reset?: boolean): Promise<void>`（游标追加翻页）、`refresh(): Promise<void>`、`setEnabled(id, enabled)`、`remove(id)`（成功后本地剔除）；列表页供 T6「在对话中使用」跳转使用 `router.push({ path: '/chat', query: { workflow_id, workflow_version, workflow_name } })`。
- 列表页形态（对齐 v7 原型卡片化）：每条一张「执行轨迹卡片」——名称、`scope` 标识（系统/我的）、描述、启用开关（`el-switch` + `ElMessageBox` 二次确认）、步骤数 `steps.length`、步骤类型芯片（按五类着色，含序号）、版本、更新时间；操作：在对话中使用（仅 `enabled` 且 capability 开）/ 编辑（仅本人）/ 运行历史（仅本人）/ 删除（仅本人 + `ElMessageBox` 确认）；工具栏：关键词搜索（本地过滤）+ 新建按钮 → `/workflows/new`；真实模式 `capabilities.workflows=false` 时顶部 `el-alert`「工作流能力未启用」且操作按钮禁用。

- [ ] **Step 1: 写失败测试**（store）：load 组装分页、refresh 重置、setEnabled/remove 后本地状态一致。
- [ ] **Step 2: 写失败测试**（视图）：渲染 3 张卡片且系统模板无编辑/删除/启停按钮；本人模板开关点击触发确认框并调用 setEnabled；删除确认后条目消失；搜索过滤生效；空态与错误态各一例。
- [ ] **Step 3: 跑测试确认失败**。
- [ ] **Step 4: 实现** store 与视图（替换旧 `el-table/slug/statusFilter/notReady`，复用 `PageShell/PageHeader/EmptyState/ErrorState/LoadingSkeleton/StatusBadge` 与 `ElMessageBox`；`ElMessage` 反馈启停/删除结果）。
- [ ] **Step 5: 跑测试确认通过**；`pnpm type-check && pnpm lint && pnpm test` 全绿。
- [ ] **Step 6: Commit**：`git add src/stores/workflows.ts src/stores/__tests__/workflows.spec.ts src/views/WorkflowsView.vue src/views/__tests__/WorkflowsView.spec.ts && git commit -m "feat(m9): 工作流列表页卡片化与 store（F1）"`。

### Task 4: 线性步骤编辑器

**Files:**
- Create: `src/views/workflows/WorkflowsEditorView.vue`、`src/components/workflows/WorkflowStepCard.vue`（编辑器步骤卡，注意与对话页 `cards/WorkflowStepCard.vue` 不同目录不同职责）
- Modify: `src/router/index.ts`（`/workflows/new` 与 `/workflows/:id` 两条路由，`meta: { title: '工作流编辑', capability: 'workflows' }`）
- Test: `src/views/__tests__/WorkflowsEditorView.spec.ts`（新建）

**Interfaces:**
- Consumes: T1 `WorkflowStep/validateWorkflowSteps`、T2 mock create/get/update。
- Produces: 保存成功后 `router.replace('/workflows')`；五类步骤参数表单字段固定——`knowledge_search`：`title`+`instruction`；`tool`：`title`+`config.tools`（标签输入，必填 ≥1）；`a2a`：`title`+`instruction`；`approval`：`title`+`instruction`+`config.tools`（标签输入，必填 ≥1）；`answer`：`title`+`instruction`；`id` 由前端自动生成（`s{n}` 递增，不暴露编辑）；步骤操作：添加（五类下拉）、删除、上移、下移；校验错误行内展示（`validateWorkflowSteps` + name/description 约束：name 1–100 禁双引号换行、description ≤500）；有改动时 `onBeforeRouteLeave` 弹 `ElMessageBox.confirm`（取消则停留）。

- [ ] **Step 1: 写失败测试**：新建模式保存调 `create` 且 payload steps 为 3 步合法结构；编辑模式回填 `get` 数据、保存调 `update`；tool 步骤删空 `config.tools` 后保存被行内错误拦住且不发起请求；步骤上移后顺序交换；未保存离开弹确认（`onBeforeRouteLeave` 被 ElMessageBox 拦截时不跳转）；422 错误码行内展示 `workflow_steps_invalid` 文案。
- [ ] **Step 2: 跑测试确认失败**。
- [ ] **Step 3: 实现** 编辑器视图与步骤卡组件（线性列表 + 连接竖线，按五类着色复用列表页芯片配色；不做拖拽）。
- [ ] **Step 4: 跑测试确认通过**；`pnpm type-check && pnpm lint && pnpm test` 全绿。
- [ ] **Step 5: Commit**：`git add src/views/workflows src/components/workflows src/router/index.ts src/views/__tests__/WorkflowsEditorView.spec.ts && git commit -m "feat(m9): 线性步骤编辑器与五类参数表单（F2）"`。

### Task 5: 运行历史页

**Files:**
- Create: `src/views/workflows/WorkflowsRunsView.vue`
- Modify: `src/router/index.ts`（`/workflows/:id/runs`，`meta.title: '运行历史'`）、`src/views/WorkflowsView.vue`（本人模板卡片加「运行历史」入口）
- Test: `src/views/__tests__/WorkflowsRunsView.spec.ts`（新建）

**Interfaces:**
- Consumes: T1 `workflowsApi.listRuns`、T2 mock runs 演示数据。
- Produces: 列表列 = 状态徽标（`running/succeeded/failed/canceled/interrupted`，沿用 `StatusBadge` 语义色）、发起时间 `created_at`、run 终态 `run_status`、耗时 `run_duration_ms`、错误码 `run_error_code`、`run_id`（mono 展示，点击复制）；「加载更多」按 `has_more/next_cursor`；404 → `ErrorState`「工作流不存在」；403（系统模板）→ `ErrorState`「运行历史仅模板创建者可查看」。

- [ ] **Step 1: 写失败测试**：渲染 2 条 mock 记录且状态徽标语义正确；`has_more=true` 时点击加载更多追加且 cursor 前进；404 与 403 各自渲染对应 ErrorState 文案。
- [ ] **Step 2: 跑测试确认失败**。
- [ ] **Step 3: 实现** 视图、路由与列表页入口。
- [ ] **Step 4: 跑测试确认通过**；全绿检查同前。
- [ ] **Step 5: Commit**：`git add src/views/workflows/WorkflowsRunsView.vue src/router/index.ts src/views/WorkflowsView.vue src/views/__tests__/WorkflowsRunsView.spec.ts && git commit -m "feat(m9): 工作流运行历史页（F3）"`。

### Task 6: 对话接入

**Files:**
- Modify: `src/components/chat/ChatComposer.vue:565-581`（工作流菜单项与工作流选择面板）、`props/emits`（context 组装处透传 `workflow_id/workflow_version`）
- Modify: `src/types/capability.ts`（`ChatContextSelection` 增 `workflow_version?: number`）
- Modify: `src/stores/chat-reducer.ts:141,664-681`（`mapWorkflowStatus` 与 `case 'workflow.step'` 对齐新 payload）、`src/components/chat/cards/WorkflowStepCard.vue`（读 `stepTitle/tool`）
- Modify: `src/views/chat/ChatView.vue`（读 `route.query` 的 `workflow_id/workflow_version/workflow_name` 预选工作流）
- Test: `src/components/chat/__tests__/ChatComposer.spec.ts`（追加）、`src/stores/__tests__/chat-workflow.spec.ts`（新建）

**Interfaces:**
- Consumes: T1 `WorkflowStepData` 新 payload、T2 mock stream 演示事件。
- Produces:
  - 菜单项：`data-testid="ctx-workflow"`，`capabilityOn('workflows')` 关闭时禁用并显示「未启用」；面板列 `enabled === true` 的模板（系统 + 本人，`workflowsApi.list`），单选后回主菜单，chip 显示 `工作流名 · v{version} · {steps.length} 步`（可移除）。
  - 互斥：选中工作流时清空 `selectedSkills/selectedServers/selectedTools/selectedCategories`；选中任一技能/MCP/知识库时清空工作流选择。
  - 发送：context 带 `workflow_id` 与 `workflow_version`（由选中模板带出）；已选工作流时步骤预览行显示在 chip 下方（序号 + title，纯文本，原型「轨迹预览」的 M9 结构版）。
  - reducer：`case 'workflow.step'` 用 `step_id` 作主键（`workflow:${step_id}`）、`mapWorkflowStatus` 把 `'ok'`→`'ok'`、`'rejected'` 与未知值→`'error'`；回放路径（`event` 字段还原）同样生效——两条入口共用同一 reducer case，测试各覆盖一条。

- [ ] **Step 1: 写失败测试**（reducer）：实时 payload `{step_id:'s1', step_type:'knowledge_search', step_title:'检索政策', tool:'search_knowledge', status:'ok'}` 产出 `kind:'workflow'` 项且 `id === 'workflow:s1'`；`status:'rejected'` 映射失败态；同 `step_id` 二次事件 upsert 不重复。
- [ ] **Step 2: 写失败测试**（composer）：capability 关时菜单项禁用；开时面板列出 enabled 模板、disabled 模板不出现；选中工作流后技能/MCP/知识库选择被清空、chip 显示版本与步数；反向再选技能后工作流 chip 消失；send payload 断言含 `workflow_id`+`workflow_version` 且不含 `skills/mcp_servers/knowledge_categories`。
- [ ] **Step 3: 跑测试确认失败**。
- [ ] **Step 4: 实现** composer 面板/互斥/chip/预览行、reducer 与卡片对齐、ChatView query 预选（无效 id 静默忽略并 `console.warn`）。
- [ ] **Step 5: 跑测试确认通过**；跑 `pnpm test`（既有 `chat-replay/chat-recovery/messageRows` 等受影响用例一并修正）与 `pnpm type-check && pnpm lint` 全绿。
- [ ] **Step 6: Commit**：`git add src/components/chat src/types/capability.ts src/stores/chat-reducer.ts src/stores/__tests__/chat-workflow.spec.ts src/views/chat/ChatView.vue src/components/chat/__tests__/ChatComposer.spec.ts && git commit -m "feat(m9): 对话接入工作流选择与 workflow.step 步骤卡（F4）"`。

### Task 7: E2E、smoke 与文档收口

**Files:**
- Create: `e2e/workflows.spec.ts`、`scripts/smoke-m9-backend.mjs`
- Modify: `package.json`（`smoke:m9`）、`docs/roadmap.md`（M9-F1…F5 勾选与验收状态）、`docs/pages.md`（8.2 工作流页状态）、`docs/architecture.md`（workflows 行）、`docs/development.md`（状态行）、`docs/api.md` §13.7（改「已实装，以前端对接的后端 T3–T5 代码为准」）、`docs/handoff/2026-11-12-m9-workflow-frontend-report.md`（新建交付报告）

**Interfaces:**
- Consumes: T2–T6 全部交付。
- Produces: E2E（mock 构建）覆盖：列表卡片 → 新建 → 编辑器加 3 步（检索/a2a/审批）保存 → 列表出现 → 「在对话中使用」→ composer chip 出现 → 发送 → 时间线出现 `workflow.step` 步骤卡 → 运行历史页可见记录。smoke:m9（真实后端）脚本按既有 `smoke-m8-backend.mjs` 模式：登录 → CRUD 七端点 → 3 步模板 → `chat/stream` 带 `workflow_id` 断言 `workflow.step` 帧 → 清理；脚本顶部注释注明「需后端 T6–T9 交付后运行，当前后端 `capabilities.workflows` 仍 false 时 CRUD 可验、运行断言会 409」。

- [ ] **Step 1: 写 E2E**（按上述链路 1 条主用例 + `workflows=false` 置灰 1 条）并跑 `pnpm e2e` 全绿（28 例基线 + 新增）。
- [ ] **Step 2: 写 smoke 脚本**并在本地真实后端（若 8000 在跑）试运行一次，记录可验证范围（CRUD 必绿；运行断言若 409 `workflow_disabled` 属预期，标注等待后端 T7）。
- [ ] **Step 3: 文档同步**（按 Files 清单逐一更新；roadmap 变更记录加 2026-11-12 一行）。
- [ ] **Step 4: 全量验证**：`pnpm type-check && pnpm lint && pnpm test && pnpm e2e && pnpm size` 全绿。
- [ ] **Step 5: Commit**：`git add e2e/workflows.spec.ts scripts/smoke-m9-backend.mjs package.json docs && git commit -m "test(m9): E2E 与 smoke:m9 冒烟脚本，文档同步（F5 收口）"`。
- [ ] **Step 6: 全分支审查**：dispatch 独立子代理对照本计划 Global Constraints + Review Focus 审查全部 diff，问题按序修复后重跑 Step 4。

## Self-Review 结论

- 规格覆盖：roadmap M9-F1→T3、F2→T4、F3→T5、F4→T6、F5→T1+T2+T7；验收四条（3 步模板保存运行 / `workflow.step` 可见 / 取消失败语义 / `workflows=false` 置灰）分别落在 T2+T5、T6、T2（canceled/failed 演示态）+T7 smoke、T7 E2E。
- 类型一致性：`Workflow/WorkflowStep/WorkflowRun/WorkflowStepData/WorkflowStepProcess` 与 `workflowsApi` 七方法在 T1 定义、T2–T6 消费处签名一致；mock db 方法沿用既有命名惯例并留待实现时对齐文件内现状。
- Review Focus 五条均有归属测试（T3/T6/T6/T3/T4）。
- 比例：计划只含签名、测试断言与决策点，无实现正文转录。
