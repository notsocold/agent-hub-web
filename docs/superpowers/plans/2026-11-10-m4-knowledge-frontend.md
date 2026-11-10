# M4 知识库前端对接 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把前端从「知识库页面骨架 + mock 列表」升级为与后端 M4 真实契约一致的完整知识库前端：文档管理、检索调试、对话分类过滤、引用与工具卡来源。

**Architecture:** 契约层（types/api/mock）先行并冻结字段形状；页面层拆成「文档列表 + 上传对话框 + 详情抽屉 + 检索调试面板」；对话层复用现有 `ChatContextSelection` 管道，把 `knowledge_categories` 接入输入栏「+」菜单，并把 `tool.result.citations` 接入过程时间线。

**Tech Stack:** Vue 3.5 + TypeScript + Vite 8 + Pinia + Element Plus（按需自动导入）+ Vitest + jsdom + axios mock adapter。

**Spec:**
- 后端交付报告：`/home/zhaodan/work/PythonProjects/agent-hub/docs/feedback/2026-11-10-m4-backend-report.md`
- 前端范围：[`docs/roadmap.md`](../../roadmap.md) M4 小节、[`docs/pages.md`](../../pages.md) §7
- 冻结契约：[`src/types/knowledge.ts`](../../../src/types/knowledge.ts)、[`src/types/conversation.ts`](../../../src/types/conversation.ts) `Citation`

## Global Constraints

- 文档对象恰好 11 字段：`id, title, source_uri, category, status, chunk_count, size_bytes, owner, error, created_at, updated_at`（没有 `filename`）。
- 检索 hit 恰好 10 字段：`chunk_id, document_id, title, document_title, document_filename, category, chunk_index, content, score, updated_at`；`title` 是分块章节标题。
- `Citation` 恰好 7 字段：`index, document_id, chunk_id, title, category, score, updated_at`，不带 `content`。
- `stats` 恰好 6 键：`documents, chunks, ready, indexing, pending, failed`，是可见范围全量、不随筛选变化。
- 状态码：上传新建 201、同内容幂等 200、超限 413 `payload_too_large`、不支持的扩展名 422 `validation_error`、`scope=system` 非管理员 403 `forbidden`；检索在 Embedding 不可用时 503 `service_unavailable`；`KNOWLEDGE_ENABLED=false` 时所有端点 403 `capability_disabled`。
- 上传是同步入库，返回终态；`pending/indexing` 只可能来自脚本导入或重建，前端轮询不得伪造进度。
- 后端没有「单文档重建」端点；`POST /knowledge/documents/{id}/retry` 从原文重新入库，可承载「重建此文档」。全量重建只有管理员 `POST /knowledge/rebuild {scope: all|system|own}`，`own` = 所有用户的私有文档。
- `capabilities.knowledge=false` 时入口置灰、路由退回对话页；不做本地假成功。
- mock 与真实后端同形状，不新增只在 mock 存在的字段；不改动后端仓库。

## File Structure

| 文件 | 职责 |
|---|---|
| `src/types/knowledge.ts` | 文档/命中/统计/上传/重建 DTO |
| `src/api/knowledge.ts` | 7 个端点的 axios 封装，upload 区分 201/200 |
| `src/api/mock/{routers,db,fixtures}.ts` | mock 端点与可写数据 |
| `src/utils/knowledge.ts` | 分类聚合、状态轮询判定、分数/标签格式化（纯函数） |
| `src/views/KnowledgeView.vue` | 页面编排：列表、筛选、分页、轮询、深链 |
| `src/components/knowledge/UploadDialog.vue` | 拖拽/选择/粘贴上传 |
| `src/components/knowledge/DocumentDetailDrawer.vue` | 详情 + 重试/删除/去检索 |
| `src/components/knowledge/SearchDebugPanel.vue` | 检索调试与复制 |
| `src/components/chat/ChatComposer.vue` | 「+」知识库分类面板与 `knowledge_categories` |
| `src/stores/capabilities.ts` | 分类候选的加载与缓存 |
| `src/stores/chat-reducer.ts` | `tool.result.citations` → `ToolProcess.citations` |
| `src/components/chat/cards/ToolCard.vue` | 工具卡引用列表 |
| `src/components/chat/MessageBubble.vue` | 引用按 `document_id` 深链 |
| `scripts/smoke-m4-backend.mjs` | 真实后端冒烟 |
| `scripts/real-m4.spec.ts` | 真实后端检索/引用用例 |
| `docs/{roadmap,pages,api}.md` | M4 状态与契约收口 |

## Review Focus

- 上传同内容重复必须是 200 且不是 201，页面提示「已存在」而不是「上传成功」。
- 413（超限）与 422（扩展名不支持）要分开提示，不能都叫「上传失败」。
- 文档 `category` 可以是空字符串：聚合分类时要过滤空值，筛选不能出现空 chip。
- 轮询只对 `pending/indexing` 生效，页面隐藏或组件卸载时停止，失败不无限重试。
- `citation.document_id` 指向已删除文档时详情 404，必须回退为按标题搜索并给出提示。
- 普通用户对系统文档（`owner=null`）不可重试/删除，按钮不显示。
- 检索空结果与 503 是两种状态：空结果不是错误。
- `rebuild(scope=own)` 是「所有用户的私有文档」，不是「我自己的文档」。

---

### Task 1: 契约、API 与 mock

**Files:**
- Modify: `src/types/knowledge.ts`
- Modify: `src/api/knowledge.ts`
- Modify: `src/api/mock/db.ts`, `src/api/mock/routers.ts`, `src/api/mock/fixtures.ts`
- Test: `src/api/mock/__tests__/knowledge.spec.ts`（新建）

**Interfaces:**
- Produces: `knowledgeApi.documents/get/upload/search/remove/retry/rebuild`，签名见下。
- Produces: `KnowledgeStats`、`KnowledgeDocumentPage`、`KnowledgeUploadResult`、`KnowledgeRebuildRequest`、`KnowledgeRebuildResult`。
- Produces: `mockDb.uploadKnowledgeDocument/deleteKnowledgeDocument/retryKnowledgeDocument/rebuildKnowledgeIndex`。

- [x] **Step 1: 写失败测试**——覆盖：列表 `q/category/status/owner_scope` 过滤与 6 键 stats；上传新建 201、同文件 200、超 10MB 413、`.exe` 422；删除 204 后列表减少；失败文档 retry 变 ready；非管理员 rebuild 403、管理员 rebuild 返回 `{documents,chunks,failed,elapsed_ms}`。
- [x] **Step 2: 运行并确认失败**（`pnpm vitest run src/api/mock/__tests__/knowledge.spec.ts`）。
- [x] **Step 3: 实现 types/API/mock**：upload 用 `FormData` + `onUploadProgress`，读 `response.status === 201` 判定 `created`；mock 用 `filename+size` 做幂等键，`scope=system` 置 `owner=null`。
- [x] **Step 4: 运行测试通过**。
- [x] **Step 5: 提交** `feat(knowledge): 对齐 M4 契约与 API/mock`。

### Task 2: 页面工具函数与知识库页

**Files:**
- Create: `src/utils/knowledge.ts`、`src/utils/__tests__/knowledge.spec.ts`
- Create: `src/components/knowledge/{UploadDialog,DocumentDetailDrawer,SearchDebugPanel}.vue`
- Modify: `src/views/KnowledgeView.vue`
- Test: `src/views/__tests__/KnowledgeView.spec.ts`（新建，mock `@/api/knowledge`）

**Interfaces:**
- Consumes: Task 1 的 `knowledgeApi` 与 DTO。
- Produces: `aggregateCategories(docs: KnowledgeDocument[]): string[]`、`isInterimStatus(status): boolean`、`statusLabel/statusTone`、`formatScore`。
- UploadDialog emits `uploaded(document, created)`；DocumentDetailDrawer emits `retry/delete/search`；SearchDebugPanel 自己调用 `knowledgeApi.search`。

- [x] **Step 1: 写失败测试**——`aggregateCategories` 过滤空字符串并去重；`isInterimStatus` 只对 pending/indexing 为真；页面首屏调用 `documents({limit:20})` 并渲染 6 键统计；筛选变化重新请求；`?document_id=` 打开详情抽屉。
- [x] **Step 2: 运行确认失败**。
- [x] **Step 3: 实现工具函数、三个子组件与页面**：两栏布局；列表服务端筛选 + 游标「加载更多」；5s 轮询仅在存在 pending/indexing 且页面可见时；上传成功刷新并高亮；删除二次确认；重建按钮仅 `auth.user.role==='admin'`。
- [x] **Step 4: 运行测试通过**。
- [x] **Step 5: 提交** `feat(knowledge): 知识库页上传、检索调试与文档管理`。

### Task 3: 对话侧分类选择与引用展示

**Files:**
- Modify: `src/components/chat/ChatComposer.vue`
- Modify: `src/stores/capabilities.ts`、`src/views/chat/ChatView.vue`
- Modify: `src/types/chat.ts`、`src/stores/chat-reducer.ts`
- Modify: `src/components/chat/cards/ToolCard.vue`、`src/components/chat/MessageBubble.vue`
- Test: `src/components/chat/__tests__/ChatComposer.spec.ts`、`src/stores/__tests__/chat-reducer.spec.ts`

**Interfaces:**
- Consumes: `ChatContextSelection.knowledge_categories`（已存在）、`Citation`。
- Produces: `ToolProcess.citations?: Citation[]`；composer `knowledgeCategories` prop（候选分类）与内联手输。

- [x] **Step 1: 写失败测试**——composer 在 `capabilities.knowledge=true` 时显示分类面板，选择 ≤5 个后 `send` 携带 `knowledge_categories` 且发送后清空；`capabilities.knowledge=false` 时菜单项禁用；reducer 把 `tool.result.citations` 写进 `ToolProcess.citations`。
- [x] **Step 2: 运行确认失败**。
- [x] **Step 3: 实现**：分类面板（候选 + 手输 + 上限）、chip、`buildContext` 下发；capabilities store 懒加载分类；ToolCard 引用列表；MessageBubble 改 `?document_id=`。
- [x] **Step 4: 运行测试通过**。
- [x] **Step 5: 提交** `feat(chat): 知识库分类选择与引用来源`。

### Task 4: 真实冒烟、文档与整体验证

**Files:**
- Create: `scripts/smoke-m4-backend.mjs`、`scripts/real-m4.spec.ts`
- Modify: `package.json`（`smoke:m4`）、`scripts/smoke-real-backend.mjs`（删除 knowledge 403 旧断言）
- Modify: `docs/roadmap.md`、`docs/pages.md`、`docs/api.md`

- [x] **Step 1: 写冒烟脚本**：登录 → 上传 md/txt → 列表 stats → 检索 → 分类过滤 → 删除；管理员分支（提权后）验证 rebuild 与 `owner_scope=all`；结束时清理自己创建的数据。
- [x] **Step 2: 更新旧断言**：`knowledge_categories` 不再 403，改为验证传入后聊天不被拒。
- [x] **Step 3: 文档收口**：M4 前端状态改「已联调/实现中」，补端点与行为差异（单文档重建=retry、同步入库、无分类目录）。
- [x] **Step 4: 全量验证**：`pnpm type-check && pnpm lint && pnpm test && pnpm build`；启动 `uvicorn` + seed 开发账号后跑 `pnpm smoke:m4` 与 `pnpm test:real`。
- [x] **Step 5: 提交** `test(knowledge): M4 真实冒烟与文档收口`。

---

## Self-Review

- **Spec coverage:** 页面文档管理→Task 2；上传/重试/删除/重建→Task 2；检索调试→Task 2；分类菜单→Task 3；引用与工具卡→Task 3；契约→Task 1；真实联调证据→Task 4。
- **Type consistency:** `knowledgeApi.upload` 返回 `{document, created}`；页面据此提示 200/201 差异。`ToolProcess.citations` 与 `Citation` 同形。
- **Review Focus:** 每条都在 Task 1/2/3 的测试步骤中落位。

---

## 完成记录（2026-11-10）

- Task 1：`ec14227`（契约/API/mock，`pnpm test` 96）
- Task 2：`8bd7f2e`（页面/组件/工具函数，`pnpm test` 106）
- Task 3：`ecf103c`（分类菜单/工具卡引用/深链，`pnpm test` 113）
- Task 4：`d422739`（smoke:m4 39/38 断言、real-m4 3/3、文档收口）
- 环境限制：真实 LLM key 为占位符，M1 store 真实用例 401；知识库检索走 fake embedding，语义召回率未取得证据（与后端 M4 报告口径一致）。
