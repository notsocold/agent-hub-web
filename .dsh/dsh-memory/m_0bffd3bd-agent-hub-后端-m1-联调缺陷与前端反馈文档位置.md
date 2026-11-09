---
id: "m_0bffd3bd"
title: "agent-hub 后端 M1 联调缺陷（已修复并复验）"
summary: "后端 P0/P1/P2 热修已在 8000 实例复验通过：cursor 分页不再 500、request_id 一致、OpenAPI 相关字段收紧为必填可空，前端类型已同步。"
kind: "reference"
importance: 4
tags: ["backend","contract","pagination","openapi","verification"]
pinned: false
status: "active"
created: "2026-11-09T13:35:29.132Z"
modified: "2026-11-09T14:06:44.566Z"
revision: 3
origin: "auto"
sessionId: "session-c4e294a5-52c8-4c6a-87bf-5bd4cb1721d3"
sessionTitle: "后端M1对接反馈同步"
model: "deepseek-official/deepseek-flash"
---

后端热修复已在 127.0.0.1:8000 实例独立复验通过：
- 分页：conversations/messages 的 cursor 分页（含 limit=1/2）不再 500；第二页无重复、created_at 严格更旧；`before` 与 `cursor` 同时传时 cursor 优先；非法 cursor 返回 422 validation_error 而非 500；404/422 的 request_id 与响应头 X-Request-ID 完全一致。
- OpenAPI 契约收紧：RunEventOut.tokens / error 与 ApprovalDecisionResult.resume_error 改为 required + nullable；新增 ErrorEnvelopeOut / ErrorBodyOut，details 允许 null；POST /chat/stream 的 200 改为 text/event-stream 并声明 X-Run-ID、X-Request-ID 及完整错误响应集合。前端 src/types（run.ts / approval.ts / api.ts）与 mock fixtures 已同步收紧。
- 能力边界：审批分页需至少 2 条审批数据，M1 没有会触发审批的工具，无法通过 HTTP 独立造数，只能由后端集成测试 test_approval_pagination_has_more 覆盖。
- 复验方法：用 dev@example.com 开发账号对真实 HTTP 做分页翻页断言，复验完成后清理该账号下创建的测试会话，避免污染开发库。
- 文档位置：后端仓库在 /home/zhaodan/work/PythonProjects/agent-hub，前后端反馈记录在 docs/feedback/；前端契约变更记录在 docs/handoff/contract-delta.md。
