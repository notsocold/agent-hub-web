# Agent Hub Web（agent-hub-web）

> Agent Hub 的前端工程骨架：Vue 3 + TypeScript + Vite + Pinia + Vue Router。

后端项目：[agent-hub](../../PythonProjects/agent-hub)（FastAPI + LangGraph + A2A + pgvector）。

> **当前状态：M0 结构初始化。**
> 已用 create-vue（`--bare`）生成 Vue 工程配置与最小入口，并确定目录规划；**没有实现任何页面、路由、请求层或业务代码，未安装依赖**。
> 需求还在细化，后续在独立工作区继续。

## 1. 规划定位

面向终端用户的对话工作台：

- **对话**：与主智能体多轮聊天，SSE 流式展示回答、工具调用、A2A 任务进度；
- **会话**：浏览/重命名/归档历史会话，查看来源引用与运行详情；
- **智能体**：注册远程 A2A 智能体，查看 Agent Card 与技能，做健康检查；
- **任务**：跟踪主智能体发起的远程 A2A 任务，支持取消；
- **知识库**：上传文档、查看索引状态、调试检索；
- **设置**：账号、模型参数展示、A2A 端点信息。

> 以上为产品方向，具体交互与范围待需求细化后确认。

## 2. 当前技术栈

| 类别 | 选型 | 状态 |
|---|---|---|
| 框架 | Vue 3（`<script setup>`） | 已生成脚手架 |
| 语言 | TypeScript | 已配置 |
| 构建 | Vite | 已配置 |
| 路由 | Vue Router | 已在 package.json 声明，未安装；路由表为空 |
| 状态 | Pinia | 已在 package.json 声明，未安装；无 store |
| 代码质量 | ESLint + Oxlint + Prettier | 已配置 |
| 包管理 | pnpm | 约定 |

以下为**规划中、尚未加入依赖**的选型（需求细化后再定）：

| 类别 | 候选 |
|---|---|
| UI 组件库 | Element Plus / Naive UI |
| HTTP | Axios |
| SSE | `@microsoft/fetch-event-source` |
| Markdown | `marked` + `dompurify` |
| 时间 | `dayjs` |

## 3. 目录结构

```text
agent-hub-web/
├── src/
│   ├── main.ts              # 应用入口（Pinia + Router）
│   ├── App.vue              # 根组件（占位）
│   ├── README.md            # src 目录规划与分层约定
│   ├── router/
│   │   └── index.ts         # 路由表（当前为空）
│   ├── api/                 # 规划：HTTP 客户端与接口模块（空）
│   ├── components/          # 规划：展示组件（空）
│   ├── composables/         # 规划：SSE / Markdown 等组合式函数（空）
│   ├── layouts/             # 规划：应用外壳（空）
│   ├── stores/              # 规划：Pinia stores（空）
│   ├── styles/              # 规划：全局样式（空）
│   ├── types/               # 规划：契约类型（空）
│   └── views/               # 规划：路由页面（空）
├── docs/                    # 架构、页面、API 对接、开发、路线图
├── public/
├── .env.example             # 环境变量模板（规划项）
├── vite.config.ts
├── tsconfig*.json
├── eslint.config.ts
├── .prettierrc.json
├── .oxlintrc.json
└── package.json
```

> 空目录用 `.gitkeep` 占位；具体文件在需求细化后创建。

## 4. 后续开始开发时

> 当前未安装依赖。以下命令在需求确认、开始编码后执行。

```bash
pnpm install      # 安装脚手架依赖
pnpm dev          # http://localhost:5173
pnpm build        # 类型检查 + 生产构建
pnpm lint         # oxlint + eslint
pnpm format       # Prettier
```

前后端联调时，需要在 `vite.config.ts` 增加代理（当前未配置）：

| 前缀 | 目标 | 用途 |
|---|---|---|
| `/api` | `http://127.0.0.1:8000` | 业务 REST + SSE |
| `/a2a` | `http://127.0.0.1:8000` | Agent Card / JSON-RPC 联调 |

## 5. 当前状态（M0 · 仅结构）

已初始化：

- [x] create-vue（`--bare`）Vue 3 + TS + Vite 工程配置
- [x] Pinia / Vue Router 依赖声明（未安装）
- [x] ESLint + Oxlint + Prettier + type-check 脚本
- [x] 规划目录占位（api / components / composables / layouts / stores / styles / types / views）
- [x] `.env.example` 环境变量模板
- [x] 文档：架构、页面、API 对接、开发、路线图

明确未包含（全部留待后续编码任务）：

- [ ] 登录/注册、路由守卫
- [ ] 对话页与 SSE 接入
- [ ] 会话/智能体/任务/知识库页面
- [ ] HTTP 客户端、Pinia store、类型定义
- [ ] UI 组件库、Markdown 渲染
- [ ] 依赖安装、构建验证、测试

## 6. 文档索引

| 文档 | 内容 |
|---|---|
| [前端架构](docs/architecture.md) | 分层、数据流、状态管理、SSE 设计（设计稿） |
| [页面规划](docs/pages.md) | 页面清单、布局、交互与状态（设计稿） |
| [API 对接](docs/api.md) | Axios/SSE 用法、认证、错误、类型生成（设计稿） |
| [开发指南](docs/development.md) | 环境、命令、规范、新增页面步骤 |
| [路线图](docs/roadmap.md) | 与后端对齐的 M1–M6 前端任务 |

## 7. 与后端的关系

- 后端契约：[agent-hub/docs/api.md](../../PythonProjects/agent-hub/docs/api.md)、[A2A 设计](../../PythonProjects/agent-hub/docs/a2a.md)；
- 后端当前同样处于 M0 结构初始化，未实现接口；
- 建议先确认需求与页面范围，再同步推进两端接口契约。
