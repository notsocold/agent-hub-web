---
id: "m_deebfa8e"
title: "agent-hub-web 后续里程碑与真实后端联调待办"
summary: "M1 前端已完成，待真实后端启动后复验 SSE/停止/审批恢复/字段一致性，之后按 M1.5、M2、M4、M5+ 推进。"
kind: "todo"
importance: 3
tags: ["agent-hub-web","todo","里程碑","联调"]
pinned: false
status: "active"
created: "2026-11-09T09:07:09.698Z"
modified: "2026-11-09T09:07:09.698Z"
revision: 1
origin: "auto"
sessionId: "session-c69a987f-0c45-4775-8970-00ebd96503d7"
sessionTitle: "开始实现本项目"
model: "deepseek-official/deepseek-flash"
---

用户启动 agent-hub 后端后，需先做真实联调：复验 SSE 原始帧、停止生成、审批中断恢复、字段与契约一致性，并按真实响应修正契约差异。

后续里程碑：M1.5 附件上传、技能/MCP/知识库上下文选择、个人能力四区块；M2 智能体注册向导与 Agent Card 预览、任务补充信息/授权/拒绝；M4 知识库上传/重试/重建/检索调试；M5+ 工作流编辑器与 v8 管理控制台。

体验项：移动端会话切换入口、虚拟滚动、E2E；开发机无 Chromium，像素级视觉需用户在浏览器确认。
