# Agent Hub Web（agent-hub-web）

> Agent Hub 的前端工程：Vue 3 + TypeScript + Vite + Pinia + Vue Router + Element Plus。

后端项目：[agent-hub](../../PythonProjects/agent-hub)（FastAPI + LangGraph + A2A + pgvector）。

> **当前状态：M1.5 与 M2 前端均已实现，并与真实后端完成联调（2026-11-10 凌晨）。**
> 已实现登录/注册、路由守卫、应用布局与主题、对话工作台（SSE 流式、工具/技能/A2A/审批过程卡片、停止、历史会话）、运行详情、M1.5 个人能力（输入栏「+」上下文、附件上传/下载、指令/记忆/技能/MCP 设置页），以及 M2 智能体注册向导/Agent Card/健康检查/启停删除与任务列表/详情/取消/补充信息/授权/拒绝（真实 M2 后端 + 本地假 A2A Agent 已验证）。
> 仓库默认 `.env.development` 仍开启 `VITE_USE_MOCK=true`，按 `docs/handoff/fixtures.md` 回放 REST 与 SSE；本机联调用 `.env.development.local` 覆盖为 `VITE_USE_MOCK=false` 即走真实接口。
> 后端 M1 契约反馈见 `agent-hub/docs/feedback/2026-11-09-frontend-contract-feedback.md`，前端对接结论见 `agent-hub/docs/feedback/2026-11-09-frontend-integration-response.md`；M1.5/M2 实现与偏差见 `agent-hub/docs/feedback/2026-11-09-m15-backend-report.md`、`agent-hub/docs/feedback/2026-11-09-m2-backend-report.md`。
> **路线对齐（2026-11-10）**：前端 M 编号与后端 M0–M6 同名同义；**M3「A2A 入站」已取消（需求变更：本服务仅出站 A2A Client）**；M5=审批与安全加固；体验项为 F1，工作流/完整管理台为 X1/X2 待立项。详见[路线图](docs/roadmap.md)。
> 单文件 HTML 原型见 [docs/prototypes](docs/prototypes/README.md)；后端交接包见 [docs/handoff](docs/handoff/README.md)。

## 1. 规划定位

面向终端用户的对话工作台：

- **对话**：与主智能体多轮聊天，SSE 流式展示回答、工具调用、A2A 任务进度与审批；
- **会话**：浏览/重命名/归档历史会话，查看来源引用与运行详情；
- **智能体**：注册远程 A2A 智能体，查看 Agent Card 与技能，做健康检查；
- **任务**：跟踪主智能体发起的远程 A2A 任务，处理补充信息与授权；
- **知识库**：上传文档、查看索引状态、调试检索（M4）；
- **工作流**：把技能、检索、A2A、MCP 与审批编排成有序步骤模板（**X1 待后端立项；当前仅页面骨架与 mock**）；
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
| 测试 | Vitest 5 + @vue/test-utils + jsdom | 已配置，79 个单测 + 4 个真实后端联调用例 + M1/M1.5 冒烟脚本 |
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
pnpm test         # Vitest 单测（无需后端）
pnpm test:real    # 真实后端 store/SSE 联调（需后端 + REAL_TEST_EMAIL；M2 用例另需 REAL_FAKE_AGENT_URL）
pnpm smoke:real   # 真实后端 M1 协议冒烟（需后端，可走 Vite 代理）
pnpm smoke:m15    # 真实后端 M1.5 能力层冒烟（附件/指令/记忆/技能/MCP/审批 + SSE）
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
- **真实后端**：新建 `.env.development.local` 写入 `VITE_USE_MOCK=false`，启动后端 `agent-hub`（默认 `http://127.0.0.1:8000`），Vite 已配置 `/api`、`/a2a`、`/healthz`、`/readyz` 代理。
  - 注意 Vite 的环境文件优先级：`.env.development` 会覆盖 `.env.local`，因此开发模式必须用 `.env.development.local`。
- **直连后端**：`VITE_API_BASE_URL=http://localhost:8000/api/v1`，需后端允许 CORS；后端已返回 `Access-Control-Expose-Headers: X-Request-ID, X-Run-ID`。
- 生产构建 `.env.production` 强制 `VITE_USE_MOCK=false`。
- **真实联调脚本**：
  - `SMOKE_EMAIL=you@example.com SMOKE_PASSWORD=... pnpm smoke:real`：注册/登录 → 系统信息 → SSE → 幂等回放 → 并发 409 → 取消 → 历史/事件 → 能力错误 → 审批/恢复 → 登出。
  - `REAL_TEST_EMAIL=you@example.com REAL_TEST_PASSWORD=... pnpm test:real`：直接用前端 store 与 `fetch-event-source` 连真实后端。
  - 后端注册接口有频率限制，自动化请复用已有账号（两个脚本都支持环境变量登录）。
  - M2 真实联调先启动假 Agent：`uv run python scripts/mock_a2a_agent.py`（在 agent-hub 仓库，默认 127.0.0.1:9100），再执行 `REAL_FAKE_AGENT_URL=http://127.0.0.1:9100 ... pnpm test:real`。

mock 登录：任意邮箱 + 8 位以上密码；密码为 `wrong-password` 时返回 401。

## 6. 当前状态（M1.5 / M2 前端）

已完成：

- [x] 工程基座、设计 token、Element Plus 主题映射、暗色主题
- [x] 契约类型、Axios 客户端、统一错误信封、401 单飞刷新
- [x] 内置 mock：REST + SSE 回放（会话/消息/审批/智能体/任务/知识库/工作流/系统信息）
- [x] 登录/注册、token 持久化、登录态恢复、路由守卫
- [x] 应用布局：一级导航、折叠、移动端抽屉、账号菜单、退出登录
- [x] 对话工作台：会话侧栏（搜索/分组/重命名/归档/删除）、消息时间线、Markdown、思考卡、技能/工具/A2A/审批/工作流/提示卡、引用与产物、停止、运行详情
- [x] 会话历史加载与本地列表刷新
- [x] 工作流/智能体/任务/知识库/设置页面骨架（真实 mock 数据、筛选、统计、任务详情抽屉、智能体健康检查）
- [x] 真实后端 M1 联调：错误 `details`、幂等回放、409 运行恢复、能力开关置灰、历史倒序、运行事件回放
- [x] Vitest：契约、客户端、mock 路由、SSE 顺序、reducer、store、路由守卫、输入栏；真实后端 store/SSE 联调
- [x] **M1.5**：附件上传/去重/受控下载；输入栏「+」技能/MCP 选择与 chips、`@` 文件选择、发送后清空；技能/指令/记忆/MCP 设置页；`skill.activated`/`memory.saved`/`tool.*` 事件卡；真实后端 M1.5 冒烟 68 项断言通过
- [x] **M2 前端**：智能体列表/筛选/统计、两段式注册（预览 Agent Card → 确认）、详情抽屉（原始 Card/技能/最近任务）、健康检查/刷新/启停/删除；任务列表/筛选/分页/轮询、详情抽屉（请求/结果/错误/时间线）、取消/补充信息/授权/拒绝；对话内 A2A 卡片跳转任务
- [x] `pnpm type-check`、`pnpm test`（79）、`pnpm build`、`pnpm lint` 通过
- [x] 真实后端联调：`smoke:real` 97 项、`smoke:m15` 68 项、`test:real` 4 个用例（含 M2 远程 Agent 调用与任务详情）

明确未包含（后续里程碑，编号与后端一致）：

> M3「A2A 入站」已于 2026-11-10 取消：服务只做出站 A2A Client，不发布 Agent Card、不提供入站端点；设置页入站分区已移除。

- [ ] 知识库上传、重试、重建、检索调试与引用（M4）
- [ ] 审批中心、审计查询与写操作 RBAC（M5；对话内审批卡已可用，审计需后端 admin 契约）
- [ ] 断线续传 / Last-Event-ID（M6；当前靠历史 + `after_seq` 运行事件恢复）
- [ ] 工作流编辑器与执行（X1 待后端立项，当前仅骨架 + mock）
- [ ] v8 完整管理控制台（X2 待后端立项；M5 只在审计契约就绪时做最小集）
- [ ] E2E（M6）与虚拟滚动/可访问性（F1）

## 7. 文档索引

| 文档 | 内容 |
|---|---|
| [前端架构](docs/architecture.md) | 分层、数据流、状态管理、SSE 设计 |
| [页面规划](docs/pages.md) | 页面清单、布局、交互与状态 |
| [API 对接](docs/api.md) | Axios/SSE 用法、认证、错误、类型生成 |
| [开发指南](docs/development.md) | 环境、命令、规范、新增页面步骤 |
| [路线图](docs/roadmap.md) | 与后端 M0–M6 同名同义的前端任务、F/X 系列与契约门禁 |
| [M1 实施计划](docs/superpowers/plans/2026-11-09-m1-chat-workbench.md) | 任务拆分、文件与验收 |
| [HTML 原型索引](docs/prototypes/README.md) | v7 工作台 / v7 页面样例 / v8 管理控制台 |
| [原型自检报告](docs/prototypes/review-2026-11-08.md) | 前后端契约对照、可行性风险、已修复问题 |
| [后端交接包](docs/handoff/README.md) | 契约增量、工作流/管理端方案、后端工作包与 fixtures |
| [M1.5/M2 字段对齐](docs/handoff/2026-11-09-m15-m2-alignment.md) | 真实后端字段差异、前端归一化、假 A2A Agent 联调命令 |

## 8. 与后端的关系

- 后端契约：[agent-hub/docs/api.md](../../PythonProjects/agent-hub/docs/api.md)、[A2A 设计](../../PythonProjects/agent-hub/docs/a2a.md)；
- 前端类型按 `docs/handoff/contract-delta.md` 编写，mock 数据按 `fixtures.md` 复刻；
- **交接包是 2026-11-08 的提案**：其中的「M5+」编号已被 [路线图](docs/roadmap.md) 的 X1/X2 取代；契约与 fixtures 仍然有效，字段冲突时以 `contract-delta.md` 和当前 OpenAPI 为准；
- 交接包中的 8 项决策（D1–D8）尚未全部拍板；前端按推荐项实现并在类型/降级处保留兼容：
  - D3 模型/推理等级：`/system/info` 为空时隐藏选择器；
  - D4 知识库选择：请求字段为 `knowledge_categories`；
  - D8 HITL：按“保持流 + 超时”处理，审批后同一流继续；
- 后端状态以 `agent-hub/docs/feedback/` 的实现报告与 OpenAPI 为准；后端 `docs/roadmap.md` 的完成勾选可能滞后（M1/M2 尚未勾选），不要据此判断前端可联调范围；
- 后端就绪后优先联调：**M4 知识库** → **M5 审批中心/审计**（M3 入站已取消，不再排期）。
