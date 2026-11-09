---
id: "m_7c140300"
title: "agent-hub 后端 M1.5/M2 遗留限制与后续里程碑归属"
summary: "M1.5/M2 已完成但入站 A2A Server、写操作 RBAC、单实例 HITL registry 等留给后续里程碑。"
kind: "project"
importance: 4
tags: ["agent-hub","后端","里程碑","限制"]
pinned: false
status: "active"
created: "2026-11-09T16:19:25.137Z"
modified: "2026-11-09T16:19:25.137Z"
revision: 1
origin: "auto"
sessionId: "session-b22e9fec-6fd4-4e7a-8a8b-b8a6595ba3b6"
sessionTitle: "M1.5与M2阶段开发及后端同步"
model: "deepseek-official/deepseek-flash"
---

agent-hub 后端在 M1.5/M2 交付后仍存在的边界（不影响当轮验收），决定后续实现归属：
1. M3 入站 A2A Server 未实现，A2A_ENABLED 仍为 false，system/info.a2a 只是占位信息。
2. agents/tasks 的写操作暂无 admin/RBAC 限制，计划 M5 收紧；A2A 的 authorization_url 尚未做后端白名单校验。
3. HITL 等待状态存在进程内 registry，只在单实例部署下成立；多实例需要 M6 消息总线。
4. 未做定时健康巡检与 MCP 连接复用；记忆/知识库的语义检索归 M4。
5. 前端对原型的视觉还原仍按「呈现型欠账」保留，M1.5/M2 阶段以功能、契约与真实联调为主。
