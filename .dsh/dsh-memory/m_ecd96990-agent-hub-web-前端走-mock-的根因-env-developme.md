---
id: "m_ecd96990"
title: "agent-hub-web 前端走 mock 的根因：.env.development 写死 VITE_USE_MOCK=true（Vite env 优先级坑）"
summary: "前端 dev server 默认用 mock 是因为 .env.development 里写死 VITE_USE_MOCK=true，覆盖它必须新建 .env.development.local（不是 .env.local），且改完必须重启 dev server。"
kind: "reference"
importance: 4
tags: ["vite","env","mock","模型选择","联调"]
pinned: false
status: "active"
created: "2026-11-12T02:35:30.602Z"
modified: "2026-11-12T02:35:30.602Z"
revision: 1
origin: "auto"
sessionId: "session-f9d3d861-c4ef-4564-ac4a-dde2514aa6e6"
sessionTitle: "对话模型选择无效排查"
model: "deepseek-official/deepseek-flash"
---

现象与根因（agent-hub-web）：后端已配好 LLM 模型但前端下拉仍是 mock 数据（deepseek-chat/deepseek-reasoner），发消息也不到后端。原因是 dev server 启动时注入的 VITE_USE_MOCK=true，main.ts 据此调用 installMockAdapter(apiClient) 替换 axios adapter，所有请求不出浏览器。

Vite 环境变量文件优先级：.env.development.local > .env.development > .env.local。项目里 .env.development 写死 VITE_USE_MOCK=true，只建 .env.local 会被压掉；正确做法是新建 .env.development.local 写 VITE_USE_MOCK=false（*.local 已被 .gitignore 忽略，不入库），VITE_API_BASE_URL 留空走 Vite proxy → 8000。原本 .env.development 与 .env.example 的注释错误地写成用 .env.local 覆盖（docs/development.md 写的是对的），已一并勘误。

环境变量只在 dev server 启动时注入，改完必须停掉并重启 pnpm dev（热更新不重读）。

重启后的验证口径：模型下拉应为 deepseek-flash（默认）/ deepseek-v4-pro；设置页温度 0.2、最大输出 4096；system/info 返回 environment=dev 且 models 为上述两个；chat/stream 请求体顶层带 model，后端 run.started.model 与之相同；切换模型后 run.started.model 跟随变化才算生效。

后端侧：start_chat 按 payload.model or settings.llm_model 取值并校验 LLM_MODELS 白名单，前端 ChatView → withModelSelection → chat.send → openChatStream 把 model 展开到请求体顶层，链路本身无问题。
