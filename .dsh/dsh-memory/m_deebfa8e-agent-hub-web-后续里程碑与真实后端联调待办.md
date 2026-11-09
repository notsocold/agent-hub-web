---
id: "m_deebfa8e"
title: "agent-hub-web M1 真实后端联调与热修复复验结果"
summary: "M1 真实联调与后端热修复复验全部通过；cursor 分页已修复，后续按 M1.5/M2/M4/M5+ 推进。"
kind: "todo"
importance: 4
tags: ["agent-hub-web","联调","M1","复验","todo"]
pinned: false
status: "active"
created: "2026-11-09T09:07:09.698Z"
modified: "2026-11-09T14:05:08.627Z"
revision: 3
origin: "tool"
sessionId: "session-c4e294a5-52c8-4c6a-87bf-5bd4cb1721d3"
sessionTitle: "开始实现本项目"
model: "deepseek-official/deepseek-flash"
---

2026-11-09 已完成 agent-hub-web 与真实后端的 M1 联调，并在后端热修后完成复验。

- 后端：http://127.0.0.1:8000；前端 Vite 5173 通过 /api 代理，`.env.development.local` 设置 VITE_USE_MOCK=false（注意 .env.local 不会覆盖 .env.development）。
- 已落实 12 个契约点：error.details、幂等回放（同 client_message_id + seq 基线重置）、reasoning_efforts 空值隐藏、capabilities.agents/tasks 置灰、运行事件字段、历史倒序、能力错误码、附件下载置灰、审批 resumed=false、interrupted 占锁恢复、knowledge_categories 命名、stats/cursor 语义。
- 后端热修已复验：cursor 编码 JSON-safe（会话/消息分页两页 200、无重复、第二页更旧；before+cursor 时 cursor 优先）；OpenAPI 已补 chat/stream 错误/SSE 头/事件与 ErrorEnvelope；RunEventOut.tokens/error、ApprovalDecisionResult.resume_error 已 required+nullable（前端类型同步收紧）；404/422 request_id 与 X-Request-ID 一致；限流参数化并有 dev 账号 seed。
- 验证：pnpm type-check、pnpm test（55）、pnpm build、pnpm lint 通过；pnpm test:real（2）通过；pnpm smoke:real（97 断言，含 cursor 翻页）通过；后端 pytest（27）通过。
- 反馈文档：agent-hub/docs/feedback/2026-11-09-frontend-integration-response.md（§11 复验记录）；后端热修说明：同目录 2026-11-09-backend-hotfix-response.md；交接包：agent-hub-web/docs/handoff/contract-delta.md §17。
- 后续：M1.5 附件上传/受控下载、技能/MCP/知识库上下文选择；M2 智能体/任务与 interrupt 审批；M4 知识库；M5+ 工作流/管理端。审批分页真实 HTTP 复验需等 M2 有审批事件，当前由后端集成测试覆盖。
- 体验项：开发机无 Chromium，像素级视觉需用户在浏览器确认。
