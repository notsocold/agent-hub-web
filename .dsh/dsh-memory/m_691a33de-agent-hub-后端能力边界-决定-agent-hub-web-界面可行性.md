---
id: "m_691a33de"
title: "agent-hub 后端能力边界（决定 agent-hub-web 界面可行性）"
summary: "agent-hub 后端文档位置与能力边界；A2A 仍为设计稿，且 v7/v8 原型中多项交互仍缺后端契约字段或接口。"
kind: "reference"
importance: 4
tags: ["agent-hub","backend","a2a","capability-boundary"]
pinned: false
status: "active"
created: "2026-11-05T15:22:56.129Z"
modified: "2026-11-08T15:17:19.291Z"
revision: 3
origin: "auto"
sessionId: "session-e6e474e4-9377-43a6-bc0c-2e146bafe88a"
sessionTitle: "项目原型设计与合理性自检"
model: "deepseek-official/deepseek-flash"
---

agent-hub 后端文档位置与能力边界；A2A 仍为设计稿，app/modules/a2a/ 只有 .gitkeep，当前无真实远程数据。按 docs/prototypes/review-2026-11-08.md 的自检逐项核对，以下原型能力尚无后端契约支撑：chat/stream 没有 model 与 reasoning_effort 字段，也没有 reasoning SSE 事件（思考摘要无法流式）；attachments 只有 ID 字段、没有上传端点；chat/stream 没有 knowledge 字段（知识库 chip 无实际请求字段）；会话列表没有 q 与 message_count；后端有 GET /approvals 但原型无独立审批列表入口；memory.saved 已设计但原型未演示；没有 workflows/workflow_runs 表或 API，架构也明确不做通用 BPMN 编排器；v8 管理后台的用户、角色权限、菜单、字典、审计查询均无管理端 API，只有系统指令、系统 MCP、系统技能三类接口可用。
