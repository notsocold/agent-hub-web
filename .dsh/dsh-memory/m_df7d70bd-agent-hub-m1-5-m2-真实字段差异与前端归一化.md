---
id: "m_df7d70bd"
title: "agent-hub M1.5/M2 真实字段差异与前端归一化"
summary: "真实后端与 contract-delta 草稿的字段差异，以及 M1.5/M2 对齐与后端交接文档位置。"
kind: "reference"
importance: 4
tags: ["contract","api","field-mapping","mcp","skills"]
pinned: false
status: "active"
created: "2026-11-09T16:18:19.672Z"
modified: "2026-11-09T16:19:25.140Z"
revision: 2
origin: "auto"
sessionId: "session-b22e9fec-6fd4-4e7a-8a8b-b8a6595ba3b6"
sessionTitle: "M1.5与M2阶段开发及后端同步"
---

真实后端与 contract-delta 草稿的差异：指令用 content；技能不分页、无 editable、import 返回技能+ignored；MCP available 只有 items、check 用 tools_discovered/last_checked_at、凭据字段 credentials_hint；记忆导出用 items。M1.5/M2 阶段的完整字段对齐记录见前端仓库 docs/handoff/2026-11-09-m15-m2-alignment.md；后端侧交接报告在 agent-hub 仓库 docs/feedback/2026-11-09-m15-backend-report.md 与 2026-11-09-m2-backend-report.md。
