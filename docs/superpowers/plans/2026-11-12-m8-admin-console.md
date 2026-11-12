# M8 前端管理台（v8 全量）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付 `/admin` 独立管理控制台（概览、用户、角色权限、菜单、字典、审计、系统设置七页），有契约页面接真实 `/admin/*` 接口，无契约三页只读并显式标注，普通用户不可见且直接访问显示无权限页。

**Architecture:** 契约层先行（`types/admin.ts` → `api/admin.ts` → mock 15 端点），再做独立 `AdminLayout`（深墨侧栏 + 七页）与 `meta.requiresAdmin` 守卫，最后逐页实现。系统设置复用既有 `AuditPanel`/`SecretPanel` 与领域组件；角色权限/菜单/字典从内置数据读取，不造假 CRUD。

**Tech Stack:** Vue 3.5 / TypeScript 6 / Vite 8 / Pinia 4 / Vue Router 5 / Element Plus / Vitest / Playwright。

**Spec:** `agent-hub/docs/feedback/2026-11-11-m8-frontend-handoff.md`、`agent-hub/docs/api.md` §12、`docs/roadmap.md` M8、`docs/pages.md` §8.1、`docs/prototypes/ui-v8-admin.html`

## Global Constraints

- 后端契约以 `agent-hub` M8（15 个 `/admin/*` 端点）为准；错误判断一律用 `error.code`，不解析 message。
- 非管理员：入口不可见；直接访问 `/admin/*` 显示无权限页；403 `forbidden` 不改登录态、不循环刷 token。
- 无契约三页（角色权限/菜单/字典）**只读** + 顶部提示「后端暂未提供接口」；不做假 CRUD、不显示假成功。
- 写操作二次确认；同值 no-op 由后端保证，前端不伪造成功提示（保存后以响应为准）。
- 用户页：不能改自己的 role、不能停用自己（控件提前禁用）；409 `last_admin_protected` 刷新列表与 stats。
- 系统设置：MCP `secret:NAME` 提示先建平台密钥；新建后即使 unhealthy 也保存成功并展示 `last_error`；不显示 headers/明文。
- 概览刷新 ≥30s，不做秒级轮询；`generated_at` 展示数据时间。
- 视觉：沿用 `src/styles/tokens.css`（深墨 `--ink` 侧栏 + `--paper` 内容区），复用 `PageShell/PageHeader/StatCard/StatusBadge/EmptyState/ErrorState/LoadingSkeleton`。
- 不新增依赖；不新增后端契约；提交信息 `feat|fix|test|docs(scope): 中文摘要`，本地提交不推送。
- 门禁：`pnpm test`、`type-check`、`lint`、`build`、`size`、`e2e`（含七页 axe 0 critical/serious）。

## Review Focus

1. **普通用户直接访问 `/admin/*`**：必须显示无权限页而不是空白/404；管理台 API 403 不得触发 refresh 循环。→ Task 3/9 测试。
2. **最后一个活跃管理员**：降级/停用最后管理员时 409 文案正确、列表与 stats 刷新、控件回滚。→ Task 5 测试。
3. **自己的行**：改自己 role / 停用自己控件禁用，绕过 UI 直接调用由后端 422 兜底并提示。→ Task 5 测试。
4. **无契约三页不造假**：角色/菜单/字典的写按钮必须禁用并说明原因，E2E 断言提示文案。→ Task 6/9。
5. **MCP 凭据不泄露**：表单只显示 `credentials_hint`，响应/测试断言不含 headers 明文；unhealthy 仍保存成功。→ Task 8 测试。
6. **审计与能力开关**：`SKILLS_ENABLED=false` 等不影响管理端配置页；审计页复用管理员模式且 403 正常。→ Task 7/8 测试。

---

## 执行顺序

- **Phase 1（串行，root）**：Task 1 契约层 → Task 2 mock。
- **Phase 2（并行，子代理）**：Task 4 概览、Task 5 用户、Task 6 只读三页、Task 7 审计、Task 8 系统设置（root 先完成 Task 3 布局/路由/守卫，子代理只写自己的视图文件）。
- **Phase 3（串行，root）**：Task 9 E2E + 文档 + 独立审查。
- 分支：`feat/m8-admin-console`（已从本地 master 切出）。

---

### Task 1: 契约类型与 `/admin` API

**Files:**
- Create: `src/types/admin.ts`；Modify `src/types/index.ts`
- Create: `src/api/admin.ts`
- Test: `src/types/__tests__/admin-contract.spec.ts`

**Interfaces:**
- 类型：`AdminUser`（id/email/display_name/role/status/last_login_at/created_at/updated_at）、`AdminUserStats`、`AdminUserPage`、`AdminOverview`（含 8 个 A2A 状态键、`runs.canceled` 单 L）、`AdminInstruction`、`AdminSkillList`、`AdminMcpServer`、`AdminMcpServerCreate/UpdateRequest`、`AdminAgentUpdateRequest`、`AdminUserUpdateRequest`。
- API：`adminApi.users(params)`、`adminApi.user(id)`、`adminApi.updateUser(id, body)`、`adminApi.overview()`、`adminApi.instruction()`、`adminApi.saveInstruction(content: string | null)`、`adminApi.skills(q?)`、`adminApi.setSkillEnabled(id, enabled)`、`adminApi.setSkillForceDisabled(id, forceDisabled)`、`adminApi.mcpServers()`、`adminApi.createMcpServer(body)`、`adminApi.updateMcpServer(id, body)`、`adminApi.deleteMcpServer(id)`、`adminApi.agents(params)`、`adminApi.updateAgent(id, body)`。

- [ ] Step 1: 写失败测试（类型形状 + API 路径/方法/参数）。
- [ ] Step 2: 运行确认失败。
- [ ] Step 3: 实现类型与 API（复用 `apiClient`）。
- [ ] Step 4: `pnpm vitest run src/types/__tests__/admin-contract.spec.ts` 通过。
- [ ] Step 5: 提交 `feat(m8): 管理台契约类型与 API`。

### Task 2: mock 15 个 `/admin/*` 端点

**Files:**
- Modify: `src/api/mock/db.ts`（管理员用户表、系统技能/MCP/Agent 管理视图、overview 计数、平台指令）
- Modify: `src/api/mock/routers.ts`（15 个路由 + 403/409/422 语义）
- Modify: `src/api/mock/fixtures.ts`（≥6 个用户、系统技能/MCP/Agent 样本、审计动作）
- Test: `src/api/__tests__/admin-mock.spec.ts`

**Interfaces:**
- 普通用户（非 `admin@example.com`）访问任意 `/admin/*` → 403 `forbidden` + `details.required_role="admin"`。
- 用户 PATCH：`cannot_change_own_role`/`cannot_disable_self` 422、`last_admin_protected` 409、未知字段 422。
- 系统项写接口按 handoff 的 no-op/409/422/503 语义返回。

- [ ] Step 1: 写失败测试（403 全端点、用户规则、overview 形状、技能双开关、MCP 409/422、Agent 只读字段 422）。
- [ ] Step 2: 运行确认失败。
- [ ] Step 3: 实现 fixtures + db + routers。
- [ ] Step 4: 测试通过。
- [ ] Step 5: 提交 `feat(m8): mock 管理台端点与 fixtures`。

### Task 3: AdminLayout、路由与守卫

**Files:**
- Create: `src/layouts/AdminLayout.vue`、`src/views/admin/AdminForbiddenView.vue`
- Modify: `src/router/index.ts`、`src/router/guards.ts`（`requiresAdmin` meta）、`src/components/layout/SideNav.vue` / `AccountMenu.vue`（管理入口仅管理员）
- Test: `src/layouts/__tests__/AdminLayout.spec.ts`、`src/router/__tests__/admin-guard.spec.ts`

**Interfaces:**
- 路由：`/admin`（概览）、`/admin/users`、`/admin/roles`、`/admin/menus`、`/admin/dictionaries`、`/admin/audit`、`/admin/settings`；`meta.requiresAdmin=true`。
- 守卫：已登录非 admin → `{ name: 'admin-forbidden' }`；未登录 → 登录页（redirect 保留）。
- `AdminLayout`：深墨侧栏（品牌 + 返回工作台 + 四组导航 + 账号区）、移动端抽屉、内容区 `<RouterView />`。

- [ ] Step 1: 写失败测试（守卫路由表、非 admin 重定向、admin 渲染侧栏）。
- [ ] Step 2: 运行确认失败。
- [ ] Step 3: 实现布局/路由/守卫/入口。
- [ ] Step 4: 测试通过。
- [ ] Step 5: 提交 `feat(m8): 管理台布局、路由与管理员守卫`。

### Task 4: 概览页

**Files:** Create `src/views/admin/AdminOverviewView.vue`；Test `src/views/admin/__tests__/AdminOverviewView.spec.ts`

- 统计区：用户/会话/消息/运行/任务/知识库/附件存储；运行与任务状态明细行；`generated_at`。
- 打开拉一次 + 手动刷新按钮；不自动轮询。
- 三态（加载/错误/空数据）复用通用组件。
- 测试：渲染计数、`runs.canceled` 单 L、刷新调用 API。

### Task 5: 用户管理页

**Files:** Create `src/views/admin/AdminUsersView.vue`；Test `src/views/admin/__tests__/AdminUsersView.spec.ts`

- 筛选：`q`（防抖 250ms）/role/status；游标分页（加载更多）；`stats` 展示。
- 行内：角色下拉、状态开关；自己的行禁用（对比 `auth.user.id`）；409/422 文案与回滚；成功后刷新行与 stats。
- 测试：普通用户行可操作、自己行禁用、409 刷新、非法游标回第一页（API 层）。

### Task 6: 只读三页

**Files:** Create `src/views/admin/AdminRolesView.vue`、`AdminMenusView.vue`、`AdminDictionariesView.vue`；Test 同目录 3 个 spec。

- 角色权限：两角色说明 + 用户角色分布（来自 `adminApi.users({limit:1})` 的 stats）+ 内置能力矩阵。
- 菜单：从 `routes` 派生前端菜单树（只读）。
- 字典：内置枚举（任务状态/审批风险/知识库状态/run 状态/事件类型）。
- 三页顶部统一提示「后端暂未提供该配置接口，本页为只读展示」，禁用写按钮。

### Task 7: 审计页

**Files:** Create `src/views/admin/AdminAuditView.vue`；Test 同目录 spec。

- 复用 `AuditPanel`（管理员模式 `can-view-all=true`），页头说明来源 `GET /admin/audit-logs`。

### Task 8: 系统设置页

**Files:** Create `src/views/admin/AdminSettingsView.vue` + `src/components/admin/settings/*`（InstructionPanel/SkillPanel/McpPanel/AgentPanel）；Test 同目录 spec。

- 分区 Tab：平台指令 / 系统技能 / 系统 MCP / 全局 Agent / 平台密钥。
- 指令：textarea + 字数上限 + 保存/恢复默认（二次确认）+ 元信息。
- 技能：列表 + 全局启停 + 强制停用两个开关，`effective_enabled` 展示。
- MCP：列表（credentials_hint，无 headers）+ 新建/编辑表单（slug/transport 只读于编辑）+ 删除确认 + unhealthy 提示。
- Agent：列表 + 编辑弹窗（name/enabled/requires_approval/auth/headers），只读字段不提交。
- 密钥：复用 `SecretPanel is-admin`。

### Task 9: E2E、文档与审查

**Files:** Create `e2e/admin.spec.ts`；Modify `docs/roadmap.md`、`README.md`、`docs/pages.md`、`docs/api.md`、`docs/architecture.md`、`docs/handoff/2026-11-11-m8-frontend-report.md`。

- E2E：管理员登录（mock admin@example.com）→ 七页可达 + 用户页改状态 + 无契约三页提示 + axe 扫描；普通用户看不到入口、直接访问无权限页。
- 文档：M8-F1~F9 勾选、测试数、交付报告。
- 独立子代理审查并修复 Critical/Important。

---

## 风险与限制

| 风险 | 应对 |
|---|---|
| 无契约三页被要求可编辑 | 只读 + 提示；需后端另立项（M10+） |
| mock 管理员用户与真实 `dev@example.com` 不一致 | mock 登录 `admin@example.com` 即管理员；文档写明 |
| 自己/最后管理员规则与后端重复 | 前端禁用是体验优化，后端 422/409 是最终防线 |
| 系统 MCP `secret:` 依赖密钥 | 表单提示先到平台密钥区创建；503 单独提示 |
| 审计 `GET /admin/audit-logs` 已有 | 复用 M5 面板，不重复实现 |
