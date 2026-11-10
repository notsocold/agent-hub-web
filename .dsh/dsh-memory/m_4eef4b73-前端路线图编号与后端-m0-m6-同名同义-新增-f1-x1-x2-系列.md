---
id: "m_4eef4b73"
title: "前端路线图编号与后端同名同义，F1/X1/X2 系列；M3 入站已取消"
summary: "前端 M 编号与后端 M0–M6 同名同义；M3「A2A 入站」已于 2026-11-10 因「仅出站」需求变更取消，F1/X1/X2 继续承载无后端归属的工作。"
kind: "decision"
importance: 4
tags: ["roadmap","里程碑对齐","M3取消","仅出站"]
pinned: false
status: "active"
created: "2026-11-10T02:44:05.881Z"
modified: "2026-11-10T03:10:38.373Z"
revision: 2
origin: "tool"
sessionId: "session-fae653d8-3e19-46f8-bb07-de9204cab272"
sessionTitle: "分析项目开发路线并匹配后端"
model: "deepseek-official/deepseek-flash"
---

# 前端路线图编号与后端 M0–M6 同名同义，新增 F1/X1/X2 系列

对齐结论（2026-11-10，经同日需求变更修订）：前端里程碑与后端 agent-hub/docs/roadmap.md 同名同义，避免双方验收目标错位。

- **M3 = A2A 入站：已于 2026-11-10 取消**（需求变更：本服务只做出站 A2A Client，不发布 Agent Card、不提供 JSON-RPC 入站端点）。保留编号空位避免与后端错位；设置页 A2A 端点分区已移除；原 M3 清单全部作废。
- M4 = 知识库 RAG；M5 = 审批与安全加固（审批中心、审计、RBAC、429/403），不再是「体验与可访问性」；M6 = 生产化与可观测。
- F1 = 纯前端横切工作（虚拟滚动、快捷键、三态统一、可访问性、主题/偏好、性能），不占 M 编号；并行范围收窄为 M4–M6。
- X1 = 工作流、X2 = 完整管理控制台：后端未立项，只有后端立项后才升级为 M 编号；`/api/v1/admin/*` 实测 404。
- 每个 M 需写明后端目标、前端状态、验收证据/门禁；维护「契约前置与联调门禁表」和「待决策表」。
- 变更记录中明确旧版 M3「审批」、M5「体验」作废；旧报告需加历史编号说明。
- 建议推进顺序：M1 收尾 → M4 知识库 → M5 审批中心/审计（M3 入站不再排期）。
- 后端仓库的 M3 清理由后端单独处理。

配套文档：README、docs/pages.md、docs/api.md、docs/architecture.md、docs/development.md、docs/handoff/*、docs/roadmap.md。
