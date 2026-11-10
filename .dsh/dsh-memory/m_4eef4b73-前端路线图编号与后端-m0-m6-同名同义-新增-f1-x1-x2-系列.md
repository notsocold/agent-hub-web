---
id: "m_4eef4b73"
title: "前端路线图编号与后端 M0–M6 同名同义，新增 F1/X1/X2 系列"
summary: "agent-hub-web 的 docs/roadmap.md 放弃自增 M1–M6，改为与 agent-hub 后端同编号同语义，并用 F1（前端横切）与 X1/X2（后端未立项）承载无后端归属的工作。"
kind: "decision"
importance: 4
tags: ["roadmap","里程碑对齐","agent-hub","文档约定"]
pinned: false
status: "active"
created: "2026-11-10T02:44:05.881Z"
modified: "2026-11-10T02:44:05.881Z"
revision: 1
origin: "auto"
sessionId: "session-57c394eb-0850-4122-a9ab-2fbf68588dce"
sessionTitle: "分析项目开发路线并匹配后端"
model: "deepseek-official/deepseek-flash"
---

对齐结论（2026-11-10）：前端里程碑必须与后端 agent-hub/docs/roadmap.md 同名同义，避免双方验收目标错位。

- M3 = A2A 入站（Agent Card、JSON-RPC、入站鉴权），不再是「审批」；审批卡已在 M1.5 交付，归入 M5「提前交付」。
- M4 = 知识库 RAG；M5 = 审批与安全加固（审批中心、审计、RBAC、429/403），不再是「体验与可访问性」；M6 = 生产化与可观测。
- F1 = 纯前端横切工作（虚拟滚动、快捷键、三态统一、可访问性、主题/偏好、性能），不占 M 编号。
- X1 = 工作流、X2 = 完整管理控制台：后端未立项，只有后端立项后才升级为 M 编号；`/api/v1/admin/*` 实测 404，故管理台只能是 X2。
- 每个 M 需写明后端目标、前端状态、验收证据/门禁；并维护「契约前置与联调门禁表」和「待决策表」。
- 变更记录中明确旧版 M3「审批」、M5「体验」作废；旧报告（如 docs/prototypes/review-2026-11-08.md）需加历史编号说明以防被继续引用。
- 建议推进顺序：M1 收尾 → M3 契约与 fixtures → M3 门控/入站可观测 → M4 → M5；M3 为薄前端里程碑，剩余产能并行 F1。

配套同步的文档：README、docs/pages.md、docs/api.md、docs/architecture.md、docs/development.md、docs/handoff/*（README、work-packages、admin-console、workflows、contract-delta）。
