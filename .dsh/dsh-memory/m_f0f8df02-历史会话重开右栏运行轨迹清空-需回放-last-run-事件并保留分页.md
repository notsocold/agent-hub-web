---
id: "m_f0f8df02"
title: "历史会话重开右栏运行轨迹清空：需回放 last_run 事件并保留分页"
summary: "右栏运行详情只读实时事件流、loadConversation 又重置状态，导致重开历史会话时工具/A2A/审批/用量卡片全空；修复是对 conversation.last_run 回放持久化事件并按 last_run 收尾状态。"
kind: "project"
importance: 4
tags: ["chat","run-timeline","replay","stores","agent-hub-web"]
pinned: false
status: "active"
created: "2026-11-16T15:17:20.060Z"
modified: "2026-11-16T15:17:20.060Z"
revision: 1
origin: "auto"
sessionId: "session-8ac27f69-7b57-4478-8174-190fe8cdc0d1"
sessionTitle: "新建会话标题不生成及审批问题"
model: "deepseek-account/deepseek-flash"
---

现象：再次打开历史会话后，右侧常驻「运行详情/运行轨迹」面板内容全部消失（工具调用、A2A 委派、审批卡、token 用量全空）。

根因：面板数据源只有 chat.state.process（实时事件流），而 stores/chat.ts 的 loadConversation 每次都会把状态重置为空，且只有「恢复正在运行的 run」才会回放已落库事件。

修复口径：
- loadConversation 对 conversation.last_run 调用 replayPersistedEvents(lastRun.id, 0)，重建运行轨迹、审批卡与 token 用量；回放后按 last_run 权威状态收尾 streaming/runStatus，避免历史数据被误显示为「运行中」。
- chat-reducer.ts 的 message.created 增加按消息 id 去重，防止 client_message_id 缺失的旧消息在回放时重复插入。
- stores/conversations.ts 新增 refresh()：按已加载条数翻页刷新，保留用户点过「加载更多」的页；ChatView.vue 流结束时改用 refresh() 而非 load()。

数据源依据：GET /runs/{id}/events 返回的历史 run 事件均带 event 名（tool.start/tool.result/a2a.task/a2a.artifact 等），前端回放白名单可完整重建这些卡片。

工程约束：前端单测、vue-tsc、oxlint/eslint 与后端 test_chat/test_conversations 均需保持通过（本次已全绿）；提交时只挑本次的 2 个后端文件（app/modules/chat/service.py、tests/integration/test_chat.py），后端仓库另有 docs/development.md、scripts/README.md、docs/superpowers/specs/... 等不属于本次的未提交改动，不要一起提交。
