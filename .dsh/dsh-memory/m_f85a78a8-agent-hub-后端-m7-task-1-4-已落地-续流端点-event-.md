---
id: "m_f85a78a8"
title: "agent-hub 后端 M7 Task 1–4 已落地：续流端点、event 字段、RBAC、审批字段"
summary: "后端 M7 前四项（真实续流端点、事件 event 字段、写操作 RBAC、审批字段）已落地，前端 M7 据此实施；本地 M4 入库与 LLM 用例因缺 embedding/key 跑不了。"
kind: "reference"
importance: 4
tags: ["M7","后端契约","SSE","联调"]
pinned: false
status: "active"
created: "2026-11-11T12:47:33.397Z"
modified: "2026-11-11T12:47:33.397Z"
revision: 1
origin: "auto"
sessionId: "session-297bd4d4-aec9-4629-b03b-f999892cb6c8"
sessionTitle: "继续开发项目"
model: "deepseek-official/deepseek-flash"
---

后端 agent-hub 仓库 M7 的 Task 1–4 已完成：提供真实 SSE 续流端点、事件流补上 event 字段、写操作 RBAC、审批相关字段。前端 agent-hub-web 的 M7 据此开工（顺序：续流 API + 事件回放 + 重连状态机 → RBAC 与 Nginx 续流 location → 错误文案收口），真实后端 M7 契约冒烟 48 项全部通过。本地真实联调中 M7/M5 用例全绿；M4 知识库入库与 LLM 相关用例受本机环境限制（embedding 服务与 LLM key 不可用）无法跑通，属环境问题，不新起容器/服务。
