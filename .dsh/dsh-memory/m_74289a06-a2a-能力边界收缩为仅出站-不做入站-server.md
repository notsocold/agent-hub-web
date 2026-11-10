---
id: "m_74289a06"
title: "A2A 能力边界收缩为仅出站，不做入站 Server"
summary: "2026-11-10 用户决策：agent-hub 只做出站 A2A Client，不发布 Agent Card、不提供 JSON-RPC 入站端点；M3 取消，设置页 A2A 分区移除。"
kind: "decision"
importance: 4
tags: ["A2A","仅出站","M3取消","能力边界"]
pinned: false
status: "active"
created: "2026-11-10T03:10:38.393Z"
modified: "2026-11-10T03:10:38.393Z"
revision: 1
origin: "tool"
sessionId: "session-fae653d8-3e19-46f8-bb07-de9204cab272"
---

# A2A 能力边界收缩为仅出站

- 决策日期：2026-11-10，用户明确「本项目服务仅能出站不能入站」。
- 保留（出站 A2A Client）：远程智能体注册、Agent Card **拉取预览**、健康检查/启停/刷新、对话内 `send_message`、任务页（出站任务）、A2A 事件卡与任务时间线。
- 移除（原 M3 入站 A2A Server）：Agent Card 发布与 `.well-known` 路由、JSON-RPC 入站端点、入站鉴权（API Key/OAuth2）、`contextId ↔ conversationId` 映射、入站任务、`source=a2a` 会话与来源标记、设置页 A2A 端点分区、`system/info.a2a` 前端读取。
- 前端落地：`SettingsView` 删除 A2A 分区；`SystemInfo.a2a`/`SystemA2aInfo` 类型、system store 的 `a2a` getter、mock 系统信息中的 a2a 块删除；SettingsView 测试改为断言入站分区与复制入口不存在。
- 契约文档：`docs/handoff/contract-delta.md` §11 标注 `system/info.a2a` 废弃；`docs/roadmap.md` M3 标取消并保留编号空位；README/pages/api/architecture 同步。
- 后端仓库（agent-hub）的 M3 清理由后端会话单独处理，不在前端提交内。
