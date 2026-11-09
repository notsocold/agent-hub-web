---
id: "m_25168cdb"
title: "agent-hub-web 真实后端联调环境与限流约定"
summary: "agent-hub-web 真实联调：8000 实例 + Vite 代理、dev server 仅监听 127.0.0.1，M1/M1.5/M2 各自有冒烟与真实用例脚本。"
kind: "reference"
importance: 4
tags: ["agent-hub-web","联调","测试","环境"]
pinned: false
status: "active"
created: "2026-11-09T13:35:29.135Z"
modified: "2026-11-09T16:19:25.139Z"
revision: 3
origin: "auto"
sessionId: "session-b22e9fec-6fd4-4e7a-8a8b-b8a6595ba3b6"
sessionTitle: "M1.5与M2阶段开发及后端同步"
model: "deepseek-official/deepseek-flash"
---

agent-hub-web 真实后端联调环境：8000 实例 + Vite 代理，dev server 仅监听 127.0.0.1，注册限流严，复用既有开发账号（dev@example.com）。真实链路验证脚本：pnpm smoke:real（M1，97 项断言）、pnpm smoke:m15（M1.5，68 项断言，覆盖附件/指令/记忆/技能/MCP/SSE）、pnpm test:real（M2，4 用例：Agent CRUD/健康检查/启停/删除、对话调用真实假 Agent、任务列表与详情）。跑 M2 用例需启动假 A2A Agent：在 agent-hub 仓库执行 uv run python scripts/mock_a2a_agent.py（默认 127.0.0.1:9100，带 --streaming 可验证流式 Agent），并设置 REAL_FAKE_AGENT_URL / REAL_TEST_EMAIL / REAL_TEST_PASSWORD。
