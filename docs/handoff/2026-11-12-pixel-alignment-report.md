# 像素级对齐交付报告（阶段 2）

- 日期：2026-11-12
- 范围：v7 工作台 + v7-pages 业务五页 + v8 管理台七页 + 全局框架（侧栏、页头、统计条、按钮/表单/徽标等）
- 基线：`docs/prototypes/ui-v7.html`、`ui-v7-pages.html`、`ui-v8-admin.html`（2026-11-08 定稿）
- 口径：视觉按原型重做，业务逻辑、接口契约、RBAC、续流、审批状态机全部保留；原型有而后端拿不到的展示项省略或降级，不造假数据。

## 1. 做法

1. **样式基座**：把 v7 工作台与 v7-pages 的原型 CSS 整体移植为 `src/styles/prototype.css`（全局类：`.page-head/.page-title/.page-sub`、`.stats/.stat`、`.toolbar/.seg/.tool-search`、`.st/.btn/.panel/.data-table`、`.chat-head/.stream/.entry/.tool-card/.approval-card/.composer*`、`.agent-card*`、`.doc-row`、`.wf-card`、`.settings-nav` 等）。
2. **管理台样式**：从 v8 原型提取并全部加 `.admin-shell` 前缀，落在 `src/styles/admin.css`，只由 `index.css` 引入一次，避免覆盖业务页同名类。
3. **组件模板**：逐页把模板类名与 DOM 结构换成原型结构；script 里的数据加载、分页、轮询、校验、二次确认、RBAC 判断保持不变。
4. **图标**：从三份原型提取 55 个内联 symbol，生成 `IconSprite.vue` + `AppIcon.vue`，替代手写路径图标。
5. **布局**：`AppLayout` 改为原型 `.app`（侧栏 + 主区）网格；`PageShell` 改为 `.page-main > .page-scroll > .page`；对话页 `.chat-layout` 承担 chat + trace 两栏（>1180px 常驻，窄屏抽屉）。

## 2. 逐页结构变化

| 页面 | 原型化后的结构 |
|---|---|
| 全局侧栏 | 波浪线品牌、新建会话、五项导航（无独立搜索项）、会话区「会话 N + 搜索 + 分组列表」、底部 A2A 连接条 + 账号菜单；管理台入口收进账号菜单（v7 侧栏不出现管理员入口） |
| 对话页 | chat-head（标题 + main-agent/状态/runId + 状态胶囊 + 轨迹开关）、当前运行工作流条、用户消息 meta+气泡+附件、执行过程条 + 节点时间轴、思考卡、技能/检索/工具/MCP 卡（`details.tool-card`）、A2A 委派卡、审批卡、composer（+ 菜单/模型菜单/发送停止）、右侧运行轨迹三段式（执行轨道 / 引用来源 / 本轮智能体）+ 运行事件抽屉 |
| 智能体页 | 无框统计条 → 胶囊筛选 + 搜索 → 两列卡片（头像、slug、状态、开关、URL、技能 chips、协议/鉴权/最近检查、Card 折叠、健康检查/刷新/删除） |
| 任务页 | 无框统计条 → 胶囊筛选 → 手风琴列表（请求 / 状态时间线 / 产出 / 操作），默认展开第一条，深链自动展开 |
| 知识库页 | 无框统计条 4 卡 → 左「文档 N/总数 + 搜索分类 + 文档行卡片」，右「检索调试」面板（参数、命中、耗时与复制） |
| 工作流页 | 无框统计条 → 图标块 + 名称/版本 + 开关的卡片、步骤 chip 链路、`N 步 · N 个远程智能体 · N 个审批` + 更新时间、主/次/危险按钮；编辑器与运行历史用 `page-head + panel` 延展 |
| 设置页 | 左侧竖排 tab（选中白卡）、右侧长滚动分区（账号 field-row、个人能力 panel、模型/界面/安全与审计/关于） |
| 管理台 | 深墨侧栏分组计数 + 面包屑 + 无框统计条 + 面板化七页；概览用真实数据聚合（审计前 10 条、审批/降级/失败待处理） |

## 3. 门禁结果

| 项 | 结果 |
|---|---|
| 单元测试 | 475 passed / 80 files |
| E2E（生产构建） | 42 passed + 1 skipped |
| 可访问性（axe，critical/serious） | 0 违规 |
| `vue-tsc --build` | 通过 |
| `pnpm lint`（oxlint + eslint） | 0 error / 0 warning |

因结构变化同步调整的测试（只改定位与等价断言，不删校验）：

- `e2e/approval.spec.ts`：状态胶囊改用 `.chat-actions .status-chip`（会话项也含「待审批」文字）。
- `e2e/admin.spec.ts`：管理台入口改为账号菜单，并补充普通用户菜单断言。
- `e2e/mobile.spec.ts`：抽屉态断言 `.app.sidebar-open` + `.sidebar-scrim`。
- `e2e/workflows.spec.ts`：时间线工作流卡选择器 `.pcard` → `.entry`。
- `src/components/chat/__tests__/*`、`layout/__tests__/SideNav.spec.ts`、`views/__tests__/*`：随类名/结构与统计数量调整。

## 4. 已知限制与有意偏离

1. **数据缺口**：工作流「运行次数」、管理概览「近 7 天运行量柱状图」、用户「会话数」、审计「IP/结果」、角色矩阵细粒度权限等后端无契约，整块省略或显示 `—`。
2. **管理台入口**：按原型 v7 收进账号菜单（原侧栏「管理控制台」项已移除），管理员仍可从账号菜单进入。
3. **原型装饰**：管理台「原型演示」徽标、全局搜索框、铃铛、邀请用户、用户导出等装饰项未实现（无契约或非产品功能）。
4. **保留的功能增强**（原型没有但产品需要）：对话内审批多卡/倒计时、两段式智能体注册、详情抽屉、任务轮询与深链、虚拟滚动、⌘K 命令面板、诊断抽屉、暗色主题、移动端搜索入口。
5. **对比度取舍**：侧栏底色为 `paper-2`，原型的 `--ink-3`（#606b72）在其上仅 4.37:1，不满足 AA；侧栏内改用同色系更深的 #5a656c（4.7:1），页面主体仍用原型值。归档会话同样从整行 `opacity:.55` 改为文字色降级。
6. **Element Plus 残留**：部分弹层（任务详情、注册、上传、改密、命令面板）仍用 Element Plus 外壳，仅主体视觉对齐原型。
7. **原型独有演示态**：审批「已批准/已拒绝」灰化态、A2A 流式回放抽屉在 mock 下可复现，真实后端行为以 M7/M9 契约为准。

## 5. 验证材料

- 原型截图：`.tmp/pixel/shots/proto-v7-*.png`、`proto-v8-*.png`
- 对齐后截图：`.tmp/pixel/shots/final-*.png`（1440×900、暗色、390 移动端、管理台七页）
- 截图脚本：`.tmp/pixel/shots-final.mjs`、`shots.mjs`、`shot-pages.mjs`
