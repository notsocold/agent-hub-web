---
id: "m_bbc06ee6"
title: "agent-hub-web M1 前端技术选型与工程约定"
summary: "M1 前端采用 Vue3+TS+Vite8+Pinia+Router 加 Element Plus 按需自动导入，契约先行（src/types + mock 层），用 VITE_USE_MOCK 在 mock 与真实后端间切换。"
kind: "project"
importance: 4
tags: ["agent-hub-web","前端架构","mock","sse","技术选型"]
pinned: false
status: "active"
created: "2026-11-09T09:07:09.686Z"
modified: "2026-11-09T09:07:09.686Z"
revision: 1
origin: "auto"
sessionId: "session-c69a987f-0c45-4775-8970-00ebd96503d7"
sessionTitle: "开始实现本项目"
model: "deepseek-official/deepseek-flash"
---

前端底座：Vue 3 + TypeScript + Vite 8 + Pinia + Router；新增 Axios、@microsoft/fetch-event-source、marked + dompurify + highlight.js；Element Plus 按需自动导入。

工程约定：
- 契约先行：类型严格按 docs/handoff/contract-delta.md 落在 src/types/，mock 数据按 fixtures.md；后端改字段只需同步 src/types/ 与 mock 层。
- Mock 层：src/api/mock 复刻 REST + SSE 回放（含批准/拒绝审批、取消、错误脚本），默认 VITE_USE_MOCK=true 可独立演示；新建 .env.local 写 VITE_USE_MOCK=false 即切真实后端；生产构建强制关闭 mock。
- Vite 已配置 /api、/a2a 代理到 http://127.0.0.1:8000。用户会同步启动后端项目（agent-hub）开发，联调以此代理为入口。
- 视觉：v7 原型 "Dispatch Desk" 设计 token（纸感米色、普鲁士蓝、琥珀色、六类过程色板、明暗主题）迁入 src/styles/tokens.css。
- 安全：Markdown 经 DOMPurify 清洗、外链 noopener noreferrer、登录示例凭据只在 mock 模式预填。
- 关键位置：实施计划 docs/superpowers/plans/2026-11-09-m1-chat-workbench.md，HTTP 客户端与 401 并发单飞 src/api/client.ts，SSE 归约 src/stores/chat-reducer.ts（纯函数 + seq 去重 + 未知事件忽略 + delta 按帧合并 + 审批中断后同一流继续）。
