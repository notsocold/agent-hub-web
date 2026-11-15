---
id: "m_b64d9bc4"
title: "M5 后端契约实际行为与本地联调环境"
summary: "M5 联调环境：8000 已重启、DB 迁移到 2d8f6a1c3e70、CAPABILITY_SECRET_KEY 已配、dev 账号 admin；事件回放与 approval.required 字段存在缺口。"
kind: "reference"
importance: 4
tags: ["m5","联调环境","后端契约","rbac"]
pinned: false
status: "active"
created: "2026-11-10T16:53:19.987Z"
modified: "2026-11-10T16:54:25.152Z"
revision: 2
origin: "auto"
sessionId: "session-0a94e52e-3601-4523-8bc7-cbbe9227ef15"
sessionTitle: "前端M5开发对接开始"
---

M5 本地联调环境与后端契约实况：
- 8000 后端为 M5 代码；执行 alembic upgrade head 后 DB 到 2d8f6a1c3e70（platform_secrets 表与 approvals.tool_call_id 可用），此前停在 M4 的 c4e7a91b2f36，未迁移时密钥接口 500、审批决定缺列。
- CAPABILITY_SECRET_KEY 已写入后端 .env（值不记录），重启 uvicorn 后 /admin/secrets CRUD 正常（201/204），未配置时返回 503 secret_store_unavailable。
- dev@example.com 被临时提为 admin 以联调全局审计与密钥，尚未 revoke。
- 本机 LLM_API_KEY 是占位符：DeepSeek 返回 401，pnpm test:real 中 M1 聊天用例失败属环境问题、非回归；因此「批准 → 恢复 → 继续输出」的真实 HTTP 链路无法在本机触发，只能用 mock 流 + reducer/store 单测 + 后端测试证据覆盖，真实联调覆盖审批列表/详情/过期/409/403。
- 契约缺口：GET /runs/{id}/events 剔除了 payload._event，无法还原事件名，前端只能「轮询 run 状态 + 终态补历史 + 补审批卡」，无法逐字续流；建议后端 M6 在回放响应加 event 字段或提供 GET /runs/{id}/stream?after_seq=。
- 写操作 RBAC 后端未落地（agents/tasks 写接口仍是 CurrentUser，无角色 403），前端不伪造角色禁用，只隐藏管理员专属入口。
