# F1 体验与可访问性实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 1000 条消息的长会话滚动流畅、加载更早不跳视口、三态统一、⌘K 可全局导航、可访问性达标、消息密度可调。

**Architecture:** 用 `virtua` 的 `VList` 替换 `MessageList` 的全量 `v-for`，行模型由纯函数 `buildMessageRows` 生成；命令面板挂在 `AppLayout`，通过 `chat.pendingScrollMessageId` 与 `MessageList` 解耦；偏好存 localStorage 并以 `<html data-density>` 驱动 CSS 变量；axe 进 Playwright 做门禁。

**Tech Stack:** Vue 3.5 + TS + Vite 8 + Pinia + Element Plus + virtua 0.54 + Playwright + @axe-core/playwright。

**Spec:** `docs/superpowers/specs/2026-11-11-f1-experience-a11y-design.md`

## Global Constraints

- 新增运行时依赖仅 `virtua@0.54.x`；`@axe-core/playwright` 只进 devDependencies。
- 构建门禁：单 chunk ≤ 110 KB gzip、JS 总 ≤ 420 KB、CSS 总 ≤ 60 KB。
- 单测 jsdom 的 `ResizeObserver` 是空 mock，虚拟列表行为一律用 E2E 验证。
- DOMPurify 必须始终在 Markdown 渲染链路内，缓存只能是清洗后的 HTML。
- 不推送远端、不删分支（用户偏好）；提交留在本地。
- 所有面向用户的文案用中文；不新增英文界面文案。

## Review Focus

1. **1000 条消息 + 流式同时进行**：最后一条消息每帧增高，贴底与测量不能互相踩踏，滚动不应抖动或跳回旧位置。
2. **加载更早消息时用户已上滑阅读中间内容**：prepend 后可见文本必须不变。
3. **审批卡所在的 process 行被虚拟列表回收再挂载**：批准/拒绝事件仍要正确到达 ChatView。
4. **命令面板在非 `/chat` 页面打开并选「当前会话消息」**：必须先切到 chat 再定位，不能静默失败。
5. **消息密度切换后滚动位置与测量**：切换不得让视口跳到列表顶部或错位。

---

### Task 1: 依赖与行模型纯函数

**Files:**
- Modify: `package.json`（新增 virtua）
- Create: `src/utils/messageRows.ts`
- Test: `src/utils/__tests__/messageRows.spec.ts`

**Interfaces:**
- Produces: `type MessageRow = { id: string; kind: 'message'; message: ChatMessageView } | { id: 'process'; kind: 'process' }`
- Produces: `buildMessageRows(messages: ChatMessageView[], process: ProcessItem[], currentRunId: string | null): MessageRow[]`

- [ ] **Step 1: 写失败测试**

覆盖：本轮有 assistant（process 插其前）、本轮无 assistant 但有历史 assistant（插最后 assistant 前）、完全没有 assistant（放末尾）、process 为空（不产生行）、空 messages 返回 `[]`。
断言 process 行 `id === 'process'` 只在一次出现，且顺序稳定。

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm vitest run src/utils/__tests__/messageRows.spec.ts`
Expected: FAIL，`buildMessageRows is not a function`

- [ ] **Step 3: 实现 `buildMessageRows`**

按 spec 5.1 的四条锚定规则实现（先按 `run_id === currentRunId` 找 assistant，再退到最后一个 assistant，再退到末尾）。纯函数，不改入参。

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm vitest run src/utils/__tests__/messageRows.spec.ts`
Expected: PASS

- [ ] **Step 5: 安装 virtua 并提交**

Run: `pnpm add virtua`
Expected: `package.json` 与 `pnpm-lock.yaml` 更新，构建不报错。

```bash
git add package.json pnpm-lock.yaml src/utils/messageRows.ts src/utils/__tests__/messageRows.spec.ts
git commit -m "feat(f1): 消息行模型与 virtua 依赖"
```

---

### Task 2: MessageList 虚拟化

**Files:**
- Modify: `src/components/chat/MessageList.vue`（整体重写）
- Modify: `src/views/chat/ChatView.vue:284-297`（props/expose 接线）

**Interfaces:**
- Consumes: `buildMessageRows`（Task 1）、`virtua/vue` 的 `VList` 与 `VListHandle`
- Produces: `defineExpose({ scrollToBottom, scrollToMessage })`
- Produces: `scrollToMessage(id: string): boolean`（找到返回 true）

- [ ] **Step 1: 写 MessageList 的新模板结构**

`VList` 包在 `.message-shell`（flex 列）里：固定顶部「加载更早」条（`hasMore` 时）、`VList`（`flex:1; min-height:0`）、浮动「回到底部」按钮。slot 根元素 `:key="row.id"`；process 行渲染 `ProcessTimeline`，message 行渲染 `MessageBubble`。**不要给 `VList` 设 `shift`**：聊天同时有 append 与中间插入，shift 只适用于纯头部增删。

- [ ] **Step 2: 实现滚动逻辑**

`pinned` 初始 true；`onScroll` 用 `scrollSize - scrollOffset - viewportSize < 80` 更新；`onResize` 时若 pinned 用 `requestAnimationFrame` 合并调用 `scrollToIndex(last, { align: 'end' })`；`scrollToBottom(smooth)` 同样合并。切换会话（`messages` 从空到非空）时重置 pinned 并贴底。

- [ ] **Step 3: 暴露方法并接线 ChatView**

`scrollToMessage` 用 `rows.findIndex(row => row.kind === 'message' && row.message.id === id)` + `scrollToIndex(index, { align: 'center' })`。ChatView 在 `loadConversation` 成功后 `nextTick` 调 `scrollToBottom()`；在 `chat.pendingScrollMessageId` 有值时调用 `scrollToMessage` 并清空（该字段 Task 8 才创建，Task 2 只读取 `chat.pendingScrollMessageId ?? null`，字段可先加入 store 的 state 接口）。

- [ ] **Step 4: 运行现有单测与类型检查**

Run: `pnpm type-check && pnpm test`
Expected: PASS（MessageList 无单测，但类型与既有用例不能回归）

- [ ] **Step 5: 提交**

```bash
git add src/components/chat/MessageList.vue src/views/chat/ChatView.vue src/stores/chat.ts
git commit -m "feat(f1): 消息列表切换 virtua 虚拟滚动"
```

---

### Task 3: 长会话 mock 数据与 E2E

**Files:**
- Modify: `src/api/mock/db.ts`（或 `fixtures.ts`）：新增固定 id 的「性能样本 · 1000 条消息」会话
- Modify: `e2e/chat.spec.ts`：新增长会话用例

**Interfaces:**
- Consumes: Task 2 的 `.message-row` 类名
- Produces: E2E 用会话 id 常量（与 mock 数据一致）

- [ ] **Step 1: 写 E2E 用例（先失败）**

用例：登录 → 打开长会话（URL `?c=<长会话 id>`）→ 断言 `.message-row` 数量 < 50 → 滚到顶部 → 触发「加载更早消息」→ 断言原可见消息文本仍在视口附近 → 点「回到底部」→ 断言贴底（滚动条位置接近底部）。

- [ ] **Step 2: 运行确认失败**

Run: `pnpm e2e --grep "长会话"`
Expected: FAIL（会话不存在或 `.message-row` 不存在）

- [ ] **Step 3: 造 mock 数据**

生成 1000 条 user/assistant 交替消息（含 1 条长 Markdown 代码块），只在 mock db 初始化时构造，不进入真实请求路径。

- [ ] **Step 4: 运行确认通过**

Run: `pnpm e2e --grep "长会话"`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/api/mock e2e/chat.spec.ts
git commit -m "test(f1): 1000 条消息长会话 E2E"
```

---

### Task 4: Markdown 渲染缓存

**Files:**
- Modify: `src/utils/markdown.ts`
- Modify: `src/components/common/MarkdownView.vue`
- Modify: `src/components/chat/MessageBubble.vue`（传 `:cache="!message.streaming"`）
- Test: `src/utils/__tests__/markdown.spec.ts`

**Interfaces:**
- Produces: `renderMarkdown(content: string, options?: { cache?: boolean }): string`，默认 `cache: true`，LRU 上限 200。
- Consumes: 现有 DOMPurify 清洗链路不变。

- [ ] **Step 1: 写失败测试**

同内容两次调用命中缓存（用 `mock` 计数或暴露 `__markdownCacheStats` 仅测试用）；超过 200 条淘汰最旧；`cache:false` 不写入。

- [ ] **Step 2: 运行确认失败**

Run: `pnpm vitest run src/utils/__tests__/markdown.spec.ts`
Expected: FAIL

- [ ] **Step 3: 实现 LRU 并与组件接线**

Map 作为 LRU；`MarkdownView` 增加 `cache?: boolean` 透传；`MessageBubble` 对流式消息传 `false`。

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm vitest run src/utils/__tests__/markdown.spec.ts && pnpm test`
Expected: PASS（现有 MarkdownView 用例不回归）

- [ ] **Step 5: 提交**

```bash
git add src/utils/markdown.ts src/components/common/MarkdownView.vue src/components/chat/MessageBubble.vue src/utils/__tests__/markdown.spec.ts
git commit -m "perf(f1): Markdown 渲染 LRU 缓存"
```

---

### Task 5: 三态组件统一

**Files:**
- Modify: `src/components/common/EmptyState.vue`（`size` + `icon`）
- Create: `src/components/common/LoadingSkeleton.vue`
- Modify 接入清单（见 spec 5.3）：Agents/Tasks/Approvals/Knowledge/Workflows + 六个设置面板 + 五个抽屉
- Test: `src/components/common/__tests__/state-components.spec.ts`

**Interfaces:**
- Produces: `EmptyState` props `{ title?, description?, size?: 'sm'|'md'|'lg' }`，插槽 `action`、`icon`
- Produces: `LoadingSkeleton` props `{ variant?: 'list'|'card'|'text'; count?: number }`

- [ ] **Step 1: 写失败测试**

`EmptyState` 默认 md；传 `size="sm"` 渲染对应 class；`LoadingSkeleton` 按 count 渲染占位行数。

- [ ] **Step 2: 运行确认失败**

Run: `pnpm vitest run src/components/common/__tests__/state-components.spec.ts`
Expected: FAIL

- [ ] **Step 3: 实现组件并替换接入点**

列表首屏 `LoadingBlock` → `LoadingSkeleton`；按钮内加载保留 `LoadingBlock`。

- [ ] **Step 4: 运行测试与类型检查**

Run: `pnpm test && pnpm type-check`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/components src/views src/views/__tests__ src/components/common/__tests__
git commit -m "refactor(f1): 统一空态/错误态/骨架屏规格"
```

---

### Task 6: F1-A 门禁与文档

**Files:**
- Modify: `docs/roadmap.md`（F1 勾选与变更记录）
- Modify: `docs/pages.md`（三态与响应式章节）

- [ ] **Step 1: 全量验证**

Run: `pnpm lint && pnpm type-check && pnpm test && pnpm build && pnpm size && pnpm e2e`
Expected: 全绿；记录 size 输出。

- [ ] **Step 2: 更新文档并提交**

```bash
git add docs/roadmap.md docs/pages.md
git commit -m "docs(f1): 记录第一批量验收证据"
```

---

### Task 7: 消息密度与设置页「界面」分区

**Files:**
- Create: `src/composables/usePreferences.ts`
- Test: `src/composables/__tests__/usePreferences.spec.ts`
- Modify: `src/views/SettingsView.vue`（新 `interface` 分区）
- Modify: `src/components/chat/MessageBubble.vue`（间距走变量）
- Modify: `src/styles/tokens.css` 或 `base.css`（`data-density` 变量）

**Interfaces:**
- Produces: `usePreferences()` 返回 `{ density, setDensity }`，`Density = 'compact'|'cozy'|'comfortable'`，storage key `agent-hub.preferences`。
- Produces: `<html data-density="...">`。

- [ ] **Step 1: 写失败测试**

默认 `cozy`；设置后写入 localStorage；损坏 JSON 回退默认；未知值回退默认。

- [ ] **Step 2: 运行确认失败**

Run: `pnpm vitest run src/composables/__tests__/usePreferences.spec.ts`
Expected: FAIL

- [ ] **Step 3: 实现并接入**

设置页「界面」分区：主题开关（复用 `useTheme`）、密度三段、语言只读、偏好说明。密度由入口 `initPreferences()` 初始化（不能依赖设置页懒加载），切换即时生效；对话页重新挂载时自然按新密度排版。

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm test && pnpm type-check`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/composables src/views/SettingsView.vue src/components/chat/MessageBubble.vue src/styles
git commit -m "feat(f1): 消息密度偏好与界面设置分区"
```

---

### Task 8: ⌘K 命令面板

**Files:**
- Create: `src/components/common/CommandPalette.vue`
- Create: `src/utils/commandPalette.ts`（过滤/排序纯函数）
- Test: `src/utils/__tests__/commandPalette.spec.ts`
- Modify: `src/layouts/AppLayout.vue`（挂载、快捷键、移动端入口）
- Modify: `src/components/layout/SideNav.vue`（桌面搜索按钮）
- Modify: `src/stores/chat.ts`（`pendingScrollMessageId` 字段与 `requestScrollToMessage`）
- Modify: `src/views/chat/ChatView.vue` / `MessageList.vue`（消费）

**Interfaces:**
- Produces: `filterPaletteItems(pageItems, query, capabilities)`、`matchMessages(messages, query, limit)`
- Produces: `chat.pendingScrollMessageId: string | null`、`chat.requestScrollToMessage(id)`
- Consumes: `conversationsApi.list({ q, status: 'active', limit: 8 })`

- [ ] **Step 1: 写失败测试**

页面组按能力过滤；空查询只返回页面；匹配大小写不敏感；消息匹配截断到 8 条且优先最近。

- [ ] **Step 2: 运行确认失败**

Run: `pnpm vitest run src/utils/__tests__/commandPalette.spec.ts`
Expected: FAIL

- [ ] **Step 3: 实现纯函数与组件**

组件：`role="dialog"` + `aria-modal` + combobox/listbox + `aria-activedescendant`；键盘 ↑↓/Enter/Esc；250 ms 防抖 + AbortController；空/加载/错误/无结果四态用 Task 5 组件。

- [ ] **Step 4: 接线导航**

页面 → `router.push({ name })`；会话 → 流式中先 `chat.stop()` 再 `router.push({ name: 'chat', query: { c } })`；消息 → `requestScrollToMessage` + push chat。

- [ ] **Step 5: 写 E2E 并运行**

三条路径 + 跨页路径（从 `/settings` 打开面板选会话）。Run: `pnpm e2e --grep "命令面板"`

- [ ] **Step 6: 提交**

```bash
git add src/components/common/CommandPalette.vue src/utils/commandPalette.ts src/utils/__tests__/commandPalette.spec.ts src/layouts src/components/layout src/stores/chat.ts src/views/chat e2e
git commit -m "feat(f1): Cmd/Ctrl+K 命令面板"
```

---

### Task 9: 可访问性收口

**Files:**
- Modify: `src/styles/base.css` 与 8 处 `outline: none`
- Modify: `src/components/chat/MessageList.vue`（sr-only aria-live）
- Modify: `src/layouts/AppLayout.vue`（skip link）
- Create: `e2e/a11y.spec.ts` + `pnpm add -D @axe-core/playwright`

- [ ] **Step 1: 修焦点与播报**

逐一处理 outline:none；流式状态播报（开始/完成/失败/待审批，不逐字）。

- [ ] **Step 2: 写 axe E2E**

扫描登录、对话（空态与消息态）、命令面板打开、审批、知识库、设置、智能体、任务；断言 critical/serious 为 0。

- [ ] **Step 3: 运行并修复**

Run: `pnpm e2e --grep "a11y"`
Expected: PASS；库内部违规用精确 allowlist。

- [ ] **Step 4: 提交**

```bash
git add src e2e package.json pnpm-lock.yaml
git commit -m "feat(f1): 可访问性收口与 axe 门禁"
```

---

### Task 10: 移动端 E2E、文档与收尾

**Files:**
- Create: `e2e/mobile.spec.ts`
- Modify: `docs/roadmap.md`、`docs/pages.md`、`docs/architecture.md`

- [ ] **Step 1: 移动端用例**

390×844：打开导航抽屉 → 关闭；发送一条消息；搜索按钮打开命令面板；输入框不被遮挡。

- [ ] **Step 2: 全量验证**

Run: `pnpm lint && pnpm type-check && pnpm test && pnpm build && pnpm size && pnpm e2e`
Expected: 全绿。

- [ ] **Step 3: 更新文档并提交**

```bash
git add e2e/mobile.spec.ts docs
git commit -m "docs(f1): 第二批量验收与文档收口"
```

---

### Task 11: 独立审查与修复

- [ ] **Step 1: 派独立子代理审查整个分支**（对照 spec 的 Review Focus 与验收表，检查虚拟滚动边界、a11y、命令面板时序）
- [ ] **Step 2: 修复审查问题并复跑全量验证**
- [ ] **Step 3: 汇报验证结果与未做项**（不推送、不合并）
