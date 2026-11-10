---
id: "m_25168cdb"
title: "agent-hub-web 真实后端联调环境与限流约定"
summary: "agent-hub-web 真实联调：8000 实例 + Vite 代理、dev server 仅监听 127.0.0.1，各里程碑有冒烟与真实用例脚本；知识库联调需指定 KNOWLEDGE_DIR。"
kind: "reference"
importance: 4
tags: ["testing","real-backend","environment","m4"]
pinned: false
status: "active"
created: "2026-11-09T13:35:29.135Z"
modified: "2026-11-10T14:45:58.988Z"
revision: 4
origin: "auto"
sessionId: "session-c67717f4-a7ae-4576-b6fb-cc26506a66d5"
sessionTitle: "前端M4开发对接"
model: "deepseek-official/deepseek-flash"
---

agent-hub-web 真实联调约定：
- 后端在 /home/zhaodan/work/PythonProjects/agent-hub 起 8000 实例，前端用 Vite 代理；dev server 仅监听 127.0.0.1。
- 每个里程碑各有脚本：M1/M1.5/M2 的冒烟与真实用例、M4 的 pnpm smoke:m4（管理员/普通用户两套断言）与 scripts/real-m4.spec.ts（通过 vitest.real.config.ts 以 VITE_USE_MOCK=false 运行）。
- 知识库（M4）联调时后端数据目录在沙箱外只读，必须用 KNOWLEDGE_DIR=/tmp/agent-hub-knowledge 启动 uvicorn，否则 rebuild 会把原文不可达的文档置为 failed（会污染 dev 库的历史文档）。
- 联调前先跑后端 scripts/seed_dev_account.py（幂等创建 dev@example.com，需要管理员时加 --admin），联调后把该账号恢复为 role=user 并停掉 8000 实例。
