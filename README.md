# Agent Hub Web（agent-hub-web）

> Agent Hub 的前端工程：Vue 3 + TypeScript + Vite + Pinia + Vue Router + Element Plus。

后端项目：[agent-hub](../../PythonProjects/agent-hub)（FastAPI + LangGraph + A2A + pgvector）。

> **当前状态：M1 前端已实现，开发环境默认使用内置 mock。**
> 已实现登录/注册、路由守卫、应用布局与主题、对话工作台（SSE 流式、过程卡片、审批、停止、历史会话）、运行详情，以及工作流/智能体/任务/知识库/设置页面骨架。
> 默认 `.env.development` 开启 `VITE_USE_MOCK=true`，按 `docs/handoff/fixtures.md` 回放 REST 与 SSE；后端就绪后改为 `false`（或在 `.env.local` 覆盖）即走真实接口。
> 单文件 HTML 原型见 [docs/prototypes](docs/prototypes/README.md)；后端交接包见 [docs/handoff](docs/handoff/README.md)。

## 1. 规划定位

面向终端用户的对话工作台：

- **对话**：与主智能体多轮聊天，SSE 流式展示回答、工具调用、A2A 任务进度与审批；
- **会话**：浏览/重命名/归档历史会话，查看来源引用与运行详情；
- **智能体**：注册远程 A2A 智能体，查看 Agent Card 与技能，做健康检查；
- **任务**：跟踪主智能体发起的远程 A2A 任务，处理补充信息与授权；
- **知识库**：上传文档、查看索引状态、调试检索；
- **工作流**：把技能、检索、A2A、MCP 与审批编排成有序步骤模板；
- **设置**：账号、模型参数、A2A 端点与个人能力。

## 2. 技术栈

| 类别 | 选型 | 状态 |
|---|---|---|
| 框架 | Vue 3（`<script setup>`） | 已接入 |
| 语言 | TypeScript 严格模式 | 已配置 |
| 构建 | Vite 8 | 已配置代理与自动导入 |
| 路由 | Vue Router 5（懒加载 + 守卫） | 已实现 |
| 状态 | Pinia 4（Setup Store） | 已实现 auth / conversations / chat / system |
| UI | Element Plus 2（按需自动导入）+ 原型设计 token | 已接入 |
| HTTP | Axios（统一错误信封、401 单飞刷新） | 已实现 |
| SSE | `@microsoft/fetch-event-source` | 已实现，支持 POST + Bearer |
| Markdown | `marked` + DOMPurify + highlight.js | 已实现 |
| 时间 | dayjs（zh-cn） | 已实现 |
| 测试 | Vitest 5 + @vue/test-utils + jsdom | 已配置，46 个用例 |
| 代码质量 | ESLint + Oxlint + Prettier | 已配置 |
| 包管理 | pnpm | 已使用（项目内 `.npmrc` 指定 store） |

## 3. 目录结构

```text
agent-hub-web/
├── src/
│   ├── main.ts                 # 入口：mock 安装、登录态恢复、挂载
│   ├── App.vue                 # ElConfigProvider + RouterView
│   ├── api/                    # client / auth / conversations / chat / approvals / runs / system / agents / tasks / knowledge / workflows
│   │   └── mock/               # fixtures、内存 db、REST 路由、axios adapter、SSE 回放
│   ├── components/
│   │   ├── common/             # MarkdownView、PageShell、PageHeader、StatCard、StatusBadge、三态组件
│   │   ├── layout/             # SideNav、AccountMenu
│   │   └── chat/               # 会话侧栏、消息时间线、过程卡片、输入栏、运行详情
│   ├── composables/            # useTheme、useMediaQuery、useAutoScroll、useChatStream
│   ├── layouts/                # AppLayout、AuthLayout
│   ├── router/                 # 路由表与守卫
│   ├── stores/                 # auth、conversations、chat、chat-reducer、system
│   ├── styles/                 # tokens、base、markdown、element 主题映射
│   ├── types/                  # 契约类型（会话/聊天/SSE/运行/审批/智能体/任务/知识库/系统）
│   ├── utils/                  # storage、format、markdown
│   └── views/                  # 登录/注册/对话/工作流/智能体/任务/知识库/设置
├── docs/                       # 架构、页面、API、开发、路线图、原型、交接包、实施计划
├── public/
├── .env.development            # 默认 mock
├── .env.production             # 默认关闭 mock
├── vite.config.ts              # 代理 /api、/a2a + Element Plus 自动导入
├── vitest.config.ts
└── package.json
```

## 4. 常用命令

```bash
pnpm install      # 安装依赖（项目内 store，首次会自动创建 .pnpm-store）
pnpm dev          # http://localhost:5173（默认 mock）
pnpm build        # 类型检查 + 生产构建
pnpm preview      # 预览构建产物
pnpm test         # Vitest 单测
pnpm type-check   # 仅类型检查
pnpm lint         # oxlint + eslint（自动修复）
pnpm format       # Prettier 格式化 src/
```

## 5. mock 与后端联调

开发环境默认 `.env.development`：

```env
VITE_USE_MOCK=true
VITE_API_BASE_URL=
```

- **mock 模式**：`src/api/client.ts` 使用同构 axios adapter；`openChatStream` 走 `src/api/mock/stream.ts`，按 fixtures 回放事件，包含审批中断后同一流继续、取消、错误脚本。
- **真实后端**：在 `.env.local` 写入 `VITE_USE_MOCK=false`，启动后端 `agent-hub`（默认 `http://127.0.0.1:8000`），Vite 已配置 `/api` 与 `/a2a` 代理。
- **直连后端**：`VITE_API_BASE_URL=http://localhost:8000/api/v1`，需后端允许 CORS。
- 生产构建 `.env.production` 强制 `VITE_USE_MOCK=false`。

mock 登录：任意邮箱 + 8 位以上密码；密码为 `wrong-password` 时返回 401。

## 6. 当前状态（M1）

已完成：

- [x] 工程基座、设计 token、Element Plus 主题映射、暗色主题
- [x] 契约类型、Axios 客户端、统一错误信封、401 单飞刷新
- [x] 内置 mock：REST + SSE 回放（会话/消息/审批/智能体/任务/知识库/工作流/系统信息）
- [x] 登录/注册、token 持久化、登录态恢复、路由守卫
- [x] 应用布局：一级导航、折叠、移动端抽屉、账号菜单、退出登录
- [x] 对话工作台：会话侧栏（搜索/分组/重命名/归档/删除）、消息时间线、Markdown、思考卡、技能/工具/A2A/审批/工作流/提示卡、引用与产物、停止、运行详情
- [x] 会话历史加载与本地列表刷新
- [x] 工作流/智能体/任务/知识库/设置页面骨架（真实 mock 数据、筛选、统计、任务详情抽屉、智能体健康检查）
- [x] Vitest：契约、客户端、mock 路由、SSE 顺序、reducer、store、路由守卫、输入栏
- [x] `pnpm type-check`、`pnpm test`、`pnpm build` 通过

明确未包含（后续里程碑）：

- [ ] 真实 SSE 联调与断线续传（M1 末–M2）
- [ ] 附件上传、技能/MCP/知识库上下文选择（M1.5）
- [ ] 智能体注册向导、Agent Card 预览、启停/删除（M2）
- [ ] 任务补充信息/授权/拒绝动作（M2）
- [ ] 知识库上传、重试、重建、检索调试（M4）
- [ ] 工作流编辑器与执行（M5+）
- [ ] v8 管理控制台（M5+）
- [ ] E2E 与虚拟滚动（M5–M6）

## 7. 文档索引

| 文档 | 内容 |
|---|---|
| [前端架构](docs/architecture.md) | 分层、数据流、状态管理、SSE 设计 |
| [页面规划](docs/pages.md) | 页面清单、布局、交互与状态 |
| [API 对接](docs/api.md) | Axios/SSE 用法、认证、错误、类型生成 |
| [开发指南](docs/development.md) | 环境、命令、规范、新增页面步骤 |
| [路线图](docs/roadmap.md) | 与后端对齐的 M1–M6 前端任务 |
| [M1 实施计划](docs/superpowers/plans/2026-11-09-m1-chat-workbench.md) | 任务拆分、文件与验收 |
| [HTML 原型索引](docs/prototypes/README.md) | v7 工作台 / v7 页面样例 / v8 管理控制台 |
| [原型自检报告](docs/prototypes/review-2026-11-08.md) | 前后端契约对照、可行性风险、已修复问题 |
| [后端交接包](docs/handoff/README.md) | 契约增量、工作流/管理端方案、后端工作包与 fixtures |

## 8. 与后端的关系

- 后端契约：[agent-hub/docs/api.md](../../PythonProjects/agent-hub/docs/api.md)、[A2A 设计](../../PythonProjects/agent-hub/docs/a2a.md)；
- 前端类型按 `docs/handoff/contract-delta.md` 编写，mock 数据按 `fixtures.md` 复刻；
- 交接包中的 8 项决策（D1–D8）尚未全部拍板；前端按推荐项实现并在类型/降级处保留兼容：
  - D3 模型/推理等级：`/system/info` 为空时隐藏选择器；
  - D4 知识库选择：请求字段为 `knowledge_categories`；
  - D8 HITL：按“保持流 + 超时”处理，审批后同一流继续；
- 后端就绪后优先联调：登录 → `/auth/me` → 会话列表 → 发消息 SSE → 停止 → 审批 → 运行事件。
