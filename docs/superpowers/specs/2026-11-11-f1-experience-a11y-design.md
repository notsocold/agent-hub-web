# F1 体验与可访问性设计（2026-11-11）

> 状态：待用户批准（设计稿）
>
> 前序：M6 前端生产化已完成（`docs/handoff/2026-11-11-m6-frontend-report.md`），F1 是其后的纯前端横切工作包。
> 用户已拍板：① 分批交付；② ⌘K 范围为「页面跳转 + 会话标题 + 当前会话已加载消息」；③ 本轮不做 i18n，语言只读、消息密度本地持久化；④ 虚拟滚动用 `virtua`。

## 1. 意图与为什么

用户的核心诉求是「1000 条消息的长会话依然流畅、键盘可完成主要操作、状态与错误一眼能懂」。当前前端功能完整，但有四个体验欠账：

1. **长会话全量渲染**：`MessageList.vue` 用 `v-for` 渲染全部消息，1000 条消息会产生数千个 DOM 节点与上千次 Markdown 解析，滚动会明显掉帧。
2. **没有全局入口**：页面与会话都只能靠鼠标点侧栏，键盘用户缺少快速跳转。
3. **三态规格不一致**：`EmptyState` / `ErrorState` / `LoadingBlock` 已存在于 15+ 处，但尺寸、文案与「骨架 vs 转圈」的用法没有统一约定。
4. **可访问性只做了基础**：全局 `:focus-visible` 与横幅 `aria-live` 已有，但流式消息没有播报、8 处 `outline: none` 未确认有无替代焦点样式、没有自动扫描。

## 2. 目标 / 非目标 / 反目标

### 目标

- F1-A：1000 条消息会话滚动流畅（DOM 节点受控、滚动不跳视口）；加载更早消息不跳；三态组件规格统一并接入全部列表页。
- F1-B：⌘K 命令面板（页面 / 会话标题 / 当前会话已加载消息）；可访问性达到 WCAG AA（对比度、焦点、播报、状态非仅颜色）；消息密度偏好本地持久化；语言只读展示。
- 每批都有可复现的验证证据（单测 + E2E + 构建门禁）。

### 非目标

- 不做 i18n / 中英文切换（用户已定，语言项只读）。
- 不做服务端偏好同步（后端无偏好表/API，不伪造同步）。
- 不做消息全文搜索（后端无接口；⌘K 只搜当前已加载消息）。
- 不做 v7 原型像素级视觉还原（F1 之后的独立工作包）。
- 不改后端契约、不新增后端请求字段。
- 不做逐字 SSE 续流（M6 已知限制，后端能力缺口）。

### 反目标（即使技术可行也算失败）

- 虚拟滚动引入后丢失「回到底部 / 加载更早 / 流式自动贴底 / 审批卡交互」中的任一行为。
- 为了性能让 Markdown 绕过 DOMPurify，或缓存返回未清洗的 HTML。
- 用假数据、假成功、假搜索掩盖功能缺失。
- 为通过 axe 扫描而给无关元素堆 ARIA，掩盖真实键盘/读屏问题。
- 破坏现有 10 例 E2E 与 234 个单测。

## 3. 约束

- 技术栈：Vue 3.5 + TS + Vite 8 + Pinia + Element Plus（按需自动导入）。
- 新增运行时依赖仅 `virtua@0.54.x`（Vue ≥3.2，ESM，`virtua/vue` 子路径导入）。
- 新增开发依赖：`@axe-core/playwright`（只进 E2E，不进生产包）。
- 单测环境为 jsdom，`ResizeObserver` 只有空 mock（不触发回调）→ 虚拟列表行为无法在单测中覆盖，必须用 E2E 验证；单测只覆盖纯逻辑（行组装、缓存、过滤、键盘导航 reducer）。
- 构建门禁：单 chunk ≤ 110 KB gzip、JS 总 ≤ 420 KB、CSS 总 ≤ 60 KB。当前基线：JS 368.5 KB / CSS 37.8 KB / 最大 chunk `markdown` 75.7 KB，virtua 预算内。
- 不启动 Docker/数据库等外部环境；E2E 走 mock 构建（`dist-e2e`）。
- 工作区不含后端代码变更。

## 4. 已决定的实现选择（用户拍板，2026-11-11）

| 议题 | 决定 |
|---|---|
| 虚拟滚动 | `virtua` 的 `VList`（动态高度内置；`shift` 专为「加载更早」的前置插入锚定设计；约 4.7 KB gzip） |
| ⌘K 范围 | 页面跳转 + 会话标题（`GET /conversations?q=`）+ 当前会话已加载消息定位 |
| 语言 | 本轮不做 i18n；设置页只读展示「简体中文（zh-CN）」 |
| 偏好持久化 | 仅 localStorage（key `agent-hub.preferences`），不做服务端同步 |
| 交付节奏 | 分两批：F1-A（虚拟滚动 + 性能 + 三态）→ F1-B（⌘K + a11y + 偏好） |

## 5. 第一批：体验骨架（F1-A）

### 5.1 长会话虚拟滚动

**改造对象**：`src/components/chat/MessageList.vue`（当前 149 行，无单测）。

**行模型**：把现有「消息 + 末尾执行过程」转成扁平行数组：

```
type MessageRow =
  | { id: string; kind: 'message'; message: ChatMessageView }
  | { id: 'process'; kind: 'process' }   // 仅当 process.length > 0
```

process 行的锚定规则（这是设计定死的边界，不留给实施者猜）：

1. 取 `currentRunId`（`chat.state.runId`）；找到 `messages` 中第一条 `run_id === currentRunId` 的 assistant 消息，process 行插到它之前；
2. 若本轮还没有 assistant 消息（`notice` / `error` / `tool.*` 事件可能先于 `message.started`），插到最后一条 assistant 之前；
3. 若列表里完全没有 assistant 消息，放在列表末尾（最后一条用户消息之后）；
4. `process` 为空时不产生 process 行。

- 纯函数 `buildMessageRows(messages, process, currentRunId)` 放 `src/utils/messageRows.ts`，单测覆盖上述四种边界 + 空列表 + 顺序稳定。
- `VList` 的 slot 根元素必须带唯一 `key`（virtua 官方要求，否则复用错乱）。

**贴底与滚动**：

- `VList` 自带滚动容器；外层改为 flex 列，`VList` 占 `flex:1; min-height:0`。
- 通过 handle 的 `scrollOffset` / `scrollSize` / `viewportSize` 判断 `pinned = scrollSize - scrollOffset - viewportSize < 80`（沿用现有 80px 阈值）。
- 贴底动作：`scrollToIndex(rows.length - 1, { align: 'end' })`；`onScroll` 更新 pinned；`onResize`（视口或 item 高度变化，包含流式增高）时若 pinned 则再次贴底。
- 用户上滑后 pinned=false，流式增高不得把视口拉回底部；「回到底部」浮动按钮沿用现有样式与 `scrollToBottom(true)` 行为。
- 切换会话时重置 pinned=true 并滚到底部（ChatView 在 `loadConversation` 成功后调用 `MessageList` 暴露的方法）。

**加载更早消息**：

- `VList` 设 `shift`（聊天是反向无限滚动：历史 prepend + 新消息 append 并存），使 prepend 后视口内容不跳。
- 「加载更早消息」按钮**放在 VList 之外的固定顶部条**（不参与虚拟滚动），仅 `hasMore` 时显示；加载中显示「正在加载更早消息…」。历史加载完后按钮消失，顶部条高度归零。
- 若 E2E 发现 `shift` 在 append/prepend 混合下不稳，回退方案：`shift=false` + prepend 前记录 `scrollSize/scrollOffset`、渲染后按差值补偿 `scrollTo`（实现细节留给构建者）。

**保留的行为**（验收时必须逐项确认）：

- 执行过程（ProcessTimeline）折叠状态由组件自身维护，虚拟化后行被回收重挂载时允许重置为展开（可接受，记录在案）。
- 审批卡批准/拒绝事件链路不变（ProcessTimeline 作为独立行渲染，事件继续向上抛给 ChatView）。
- 消息内附件下载、引用跳转、复制、外链确认不变。
- 空会话仍由 ChatView 的 welcome 分支渲染，`MessageList` 不渲染空列表。

**为 F1-B 预留**：`defineExpose({ scrollToMessage(id): boolean, scrollToBottom(), refreshSize() })`，`scrollToMessage` 用 `rows.findIndex + scrollToIndex` 实现。

**性能验收（E2E，mock 构建）**：

- 在 mock 数据中增加固定 id 的长会话「性能样本 · 1000 条消息」（仅 mock 环境可见，真实环境不存在）。
- 用例断言：进入该会话后滚动容器内 `.message-row` 节点数 < 50；滚动到顶部与底部各一次不报错；「回到底部」出现并可点击；流式回复期间最后一条持续更新。
- 用 Chromium trace 记录滚动 3 秒的帧耗时，目标平均帧 < 16 ms（作为记录证据，不进 CI 断言，避免机器抖动）。

### 5.2 性能预算与 Markdown 缓存

- **Markdown 缓存**：`src/utils/markdown.ts` 的 `renderMarkdown` 增加 LRU（上限 200 条，键为原始 Markdown 字符串）。DOMPurify 仍在链路内，缓存的是**清洗后的 HTML**，不改变安全边界。
  - 流式中间态不进缓存：`MarkdownView` 新增 `cache?: boolean`（默认 true），`MessageBubble` 对 `message.streaming === true` 传 `false`，避免每帧 delta 挤掉历史缓存。
  - 单测：同内容第二次调用返回缓存对象/命中计数；超过上限淘汰最旧；流式不写入缓存。
- **流式合并**：现状已按 rAF 合并 `message.delta`（`chat.ts` 的 `scheduleFlush/flushDeltas`），本轮只补测量，不重复实现。
- **体积门禁**：构建后更新 `docs` 中的体积记录；若 `virtua` 使 ChatView chunk 逼近 110 KB，将 `virtua` 加入 `manualChunks` 独立分组（默认按需导入应不会触发）。
- **首屏基线**：记录 `pnpm build` 后的 chunk 表与 `pnpm size` 输出，作为 F1-A 证据。

### 5.3 三态组件统一

**组件规格**（`src/components/common/`）：

| 组件 | 新增/变更 | 用法约定 |
|---|---|---|
| `EmptyState` | 增加 `size: 'sm' \| 'md' \| 'lg'`（默认 md）与可选 `icon` 插槽 | 列表无数据；`title` ≤ 20 字，`description` 说明下一步，动作放 `action` 插槽 |
| `ErrorState` | 不变（已含 code/request_id/retry） | 页面级/区块级错误；`size` 跟随容器（保持紧凑） |
| `LoadingBlock` | 保留（转圈），仅用于**按钮内/局部**加载 | 不再用于列表首屏 |
| `LoadingSkeleton` | **新增**：`variant: 'list' \| 'card' \| 'text'`、`count` | 列表页/抽屉首屏加载，替代 `LoadingBlock` |

**接入清单**（以「所有列表/抽屉首屏加载器」为准，不按文件数量机械对齐）：

- 列表页：`AgentsView`、`TasksView`、`ApprovalsView`、`KnowledgeView`、`WorkflowsView`；
- 设置页六个面板：`InstructionPanel`（`text`）、`MemoryPanel`、`SkillPanel`、`McpPanel`、`AuditPanel`、`SecretPanel`（`list`/`card` 按内容形态）；
- 抽屉：`AgentDetailDrawer`、`ApprovalDetailDrawer`、`TaskDetailDrawer`、`SkillPanel` 的技能详情抽屉、`McpPanel` 的工具抽屉；
- `DocumentDetailDrawer` 没有首屏加载态（数据随列表传入），不接入；
- 按钮内加载保持 `LoadingBlock`/原 spinner。

**文案规范**（写入 `docs/pages.md` 第 10 节）：空态标题说明「没有什么」，描述说明「能做什么」；错误态必须给出可执行的下一步（重试/联系管理员/等待）；不使用「暂无数据」这种无信息量标题作为默认值。

## 6. 第二批：交互与可访问性（F1-B）

### 6.1 ⌘K 命令面板

**组件**：`src/components/common/CommandPalette.vue`，挂载在 `AppLayout`。

- 快捷键：`Ctrl/Cmd + K` 打开；`Esc` 关闭；`↑/↓` 移动；`Enter` 执行；输入框保持焦点，用 `aria-activedescendant` 指向当前项（不移动 DOM 焦点）。
- 可发现性：桌面在 `SideNav` 增加「搜索」按钮（带 `⌘K` 标记）；移动端（<900px，侧栏是抽屉）在 `AppLayout` 的 `.mobile-bar` 增加搜索图标按钮（`aria-label="全局搜索"`）。两种入口打开同一个面板，面板挂载在 `AppLayout`。
- 三组结果（固定顺序）：
  1. **页面**：chat / approvals / agents / tasks / knowledge / settings，按 `capabilities` 过滤（能力关闭的页面置灰并显示「能力未开放」，不跳转）。点击 → `router.push({ name })`。
  2. **会话**：输入 ≥ 1 字符后防抖 250 ms 调 `conversationsApi.list({ q, status: 'active', limit: 8 })`；点击 → 复用统一的 `switchConversation(id)`：若正在流式生成，先 `chat.stop()`（与侧栏切换行为一致），再 `router.push({ name: 'chat', query: { c: id } })`。
  3. **当前会话消息**：仅在当前路由为 `chat` 且 `chat.state.conversationId` 存在时出现；前端匹配已加载消息（`message.content` 包含关键词，最多 8 条）。点击 → 关闭面板 → 通过 `chat.requestScrollToMessage(id)`（store 字段，MessageList 消费后清空）通知 `MessageList.scrollToMessage(id)`。
- **跨页导航规则**：不在 `/chat` 时选中会话或消息，一律 `router.push({ name: 'chat', query: { c: id } })`，不在当前页面拼 query；消息定位依赖 ChatView 挂载并加载完成后消费 `pendingScrollMessageId`，加载完成前该字段保留、由 watch 触发一次后清空。
- 状态：空输入只显示页面组；搜索中显示 `LoadingSkeleton`（count=3）；无结果显示 `EmptyState( size='sm' )`；请求失败显示 `ErrorState`（可重试，保留 request_id）。
- a11y：`role="dialog"` + `aria-modal="true"` + `aria-label="全局搜索"`；列表 `role="listbox"`，选项 `role="option"` + `aria-selected`；打开时记住并恢复触发元素焦点。
- 不做：跨会话消息全文搜索、知识库检索（用户已定）。

### 6.2 可访问性

**对比度（已实测，2026-11-11）**：全部正文级 token 组合 ≥ 4.5:1（最低 `ink-3/paper` 4.74、`ink-3/surface-2` 4.91），浅/深色两套均通过。`amber/paper` 3.50、`amber/amber-soft` 3.34 仅适合大字/图形（≥3:1）。工作项：

- 代码核查 `--amber` 不得用于正文文字，仅用于图标、状态点、进度；若发现正文用法改为 `--amber-text`（4.98:1）。
- 深色主题中 `--amber`（#d4a04a on #171f24 = 7.87）无问题。

**焦点**：8 处 `outline: none` 逐一确认（`base.css:198`、`ChatComposer` ×3、`ConversationSidebar`、`ApprovalsView`、`TaskDetailDrawer`、`UploadDialog`）：

- 若元素本身不可聚焦（装饰性 input / 隐藏 file input），保留但加注释说明；
- 若可聚焦且无替代样式，补 `:focus-visible` 样式（沿用全局 `outline: 2px solid var(--prussian)`）；
- 输入容器用 `:focus-within` 的情况保持，不重复画环。

**流式播报**：`MessageList` 内加 `.sr-only` 的 `aria-live="polite"` 区域，只在**状态节点**播报（「助手开始回复」「回复完成」「生成失败」「等待审批」），不逐字播报 delta；播报文本用 `aria-atomic="true"`。

**状态不只靠颜色**：审查所有 `.dot` / 色调徽标 / kind 色板，确认都有文字或图标并存；`status-chip` 已有文字标签，保持。

**跳转链接**：`AppLayout` 增加「跳到主内容」skip link（sr-only，focus 时显示），指向 `<main>`。

**键盘回归**：验证 Tab 顺序、抽屉 Esc、命令面板 Esc、账号菜单 Esc、发送 Enter/Shift+Enter 不回归。

**自动扫描**：新增 `@axe-core/playwright`（devDependency），断言 `critical` / `serious` 为 0，扫描点覆盖：

- 登录页；
- 对话页两个状态：welcome 空态、发送一条消息后的消息态（含 Markdown 内容）；
- 命令面板打开态（`role="dialog"` + listbox 组合是最容易违规的新界面）；
- 审批页待处理 Tab、知识库页、设置页、智能体/任务页默认态。

发现 Element Plus 内部违规时：应用层可修的修，库内部的记录为 known issue 并在 CI 中用 allowlist 精确排除该规则+该选择器，不整体关闭扫描。

**移动端回归**：E2E 增加 390×844 视口用例（移动端导航抽屉打开/关闭、发送一条消息、消息列表可滚动、⌘K 按钮不遮挡输入框）。仅覆盖 Chromium；iOS Safari 的虚拟滚动风险记录为已知限制。

### 6.3 偏好：消息密度与语言只读

**Composable**：`src/composables/usePreferences.ts`

- `density: 'compact' | 'cozy' | 'comfortable'`，默认 `cozy`（与现状一致）。
- 持久化：`localStorage['agent-hub.preferences']`，读取失败回退默认（隐私模式）。
- 应用到 `<html data-density>`，CSS 变量驱动：`--message-gap`（12 / 22 / 32 px）、`.turn` 间距、正文行高微调；其他组件不联动字号，避免布局回归。

**设置页**：`SettingsView` 新增「界面」分区（`SectionKey` 增加 `interface`）：

- 主题：浅色/深色（复用 `useTheme`，与账号菜单里的切换保持同一状态）；
- 消息密度：三段选择；
- 语言：只读「简体中文（zh-CN）」+ 说明「多语言将在后续版本评估」；
- 偏好说明：底部注明「偏好仅保存在本浏览器，不随账号同步」。

**页面文档**：更新 `docs/pages.md` 设置页区块与响应式/可访问性章节；更新 `docs/roadmap.md` F1 勾选状态与变更记录。

## 7. 验收标准与证据

| 批次 | 验收 | 证据 |
|---|---|---|
| F1-A | 1000 条会话滚动流畅、DOM 受控 | E2E 长会话用例（`.message-row` < 50）+ Chromium trace 记录 |
| F1-A | 加载更早不跳视口 | E2E：滚到顶部 → 加载更早 → 断言可见消息文本未变 |
| F1-A | 贴底/回到底部/流式增高行为不回归 | E2E：发送后自动贴底；上滑后流式不拉回；点「回到底部」回底 |
| F1-A | Markdown 缓存正确且不破坏安全边界 | 单测（缓存命中/淘汰/流式不缓存）+ 现有 DOMPurify 用例 |
| F1-A | 三态统一 | 代码清单核对 + 单测（组件 props）+ 页面截图/手测 |
| F1-A | 门禁 | `pnpm test`、`type-check`、`lint`、`build`、`size` 全过 |
| F1-B | ⌘K 三类结果可用 | E2E：页面跳转、会话搜索（对话页内）、会话搜索（从 `/settings` 跨页）、当前会话消息定位 |
| F1-B | a11y | axe 扫描 critical/serious = 0；对比度脚本输出；键盘手测清单 |
| F1-B | 偏好 | 单测（读写/损坏回退）+ E2E（切换密度后刷新仍生效） |
| F1-B | 移动端 | E2E 390×844 冒烟 |
| F1-B | 文档 | `roadmap.md` / `pages.md` / `architecture.md` 同步 |

## 8. 风险与回退

| 风险 | 影响 | 回退/缓解 |
|---|---|---|
| `virtua` 的 `shift` 在 append + prepend 混合下表现不稳 | 消息跳动、可见内容错位 | 先按设计实现；不稳则 `shift=false` + prepend 差值补偿 `scrollTo`；仍不行退回 `vue-virtual-scroller`（已评估，需手写补偿） |
| 虚拟列表回收导致 ProcessTimeline 折叠状态重置 | 轻微体验损失 | 可接受并记录；如需保持，把折叠状态提升到 store（本轮不做） |
| 流式增高时 `onResize` 触发贴底过于频繁 | 滚动抖动/性能 | 贴底动作合并到 `requestAnimationFrame`，同一帧只执行一次 |
| Markdown 缓存内存增长 | 长会话内存上升 | LRU 200 条 + 只缓存非流式内容 |
| axe 扫描暴露 Element Plus 内部违规 | CI 红 | 应用层可修的修；库内部精确 allowlist（规则+选择器），不整体关闭 |
| 命令面板与会话搜索请求打爆后端 | 体验/限流 | 250 ms 防抖 + limit 8 + 请求取消（AbortController） |
| 命令面板跨页定位消息的时序不稳（路由切换 → 加载会话 → MessageList 挂载 → 滚动） | 定位静默失败 | `pendingScrollMessageId` 在 store 保留、由 MessageList 就绪后消费并清空；E2E 覆盖从 `/settings` 打开面板选中消息的路径；仍不稳则跨页时只跳到会话、不定位消息（降级为提示「已进入会话」，定位仅限对话页内） |
| 消息密度改变行高影响虚拟测量 | 切换密度后位置跳动 | 切换后 `scrollToIndex(pinned ? last : 当前可见项)` 并触发一次重算 |

## 9. 留给构建者的自主决定

以下细节由实施者按代码现状决定，不需要回问：

- `VList` 外层 DOM 结构与样式类名、`scrollToIndex` 的具体对齐参数。
- ProcessTimeline 作为独立行还是内嵌进最后一条消息（推荐独立行，保持组件边界）。
- 「加载更早」固定条的高度、过渡动画与断点样式。
- 命令面板的排序权重（页面 > 会话 > 消息，已在上文约定）。
- 骨架屏的形状与条数。
- 消息密度的具体行高/间距数值（以上表区间为准，以视觉不回归为约束）。
- LRU 的数据结构（Map 即可）。
