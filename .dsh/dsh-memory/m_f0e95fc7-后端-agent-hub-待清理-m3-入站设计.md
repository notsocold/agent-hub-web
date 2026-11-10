---
id: "m_f0e95fc7"
title: "后端 agent-hub 待清理 M3 入站设计"
summary: "前端已按「仅出站」清理完毕；后端仓库仍需取消 M3、标注 a2a.md 入站章节、评估移除 A2A_ENABLED/Card 配置与 system/info.a2a。"
kind: "todo"
importance: 3
tags: ["后端待办","agent-hub","M3取消"]
pinned: false
status: "active"
created: "2026-11-10T03:10:38.405Z"
modified: "2026-11-10T03:10:38.405Z"
revision: 1
origin: "tool"
sessionId: "session-fae653d8-3e19-46f8-bb07-de9204cab272"
---

# 后端 agent-hub 待清理 M3 入站设计

前置：2026-11-10 需求变更——服务只做出站 A2A Client，不提供入站 A2A Server。前端仓库已完成清理，后端仓库尚未同步。

后端待办（由后端会话单独处理）：

- `docs/roadmap.md`：M3「A2A 入站」标为取消/不实施，移出后续排期；保留编号或与前端确认。
- `docs/a2a.md` 第 4 节「入站：A2A Server」：标注「不做」，保留作为历史设计或删除。
- `app/core/config.py`：`a2a_enabled`、`a2a_public_url`、`a2a_agent_path`、`a2a_card_timeout_seconds`、`a2a_max_skills` 等入站/Card 配置评估移除；出站客户端配置（超时、SSRF 白名单）保留。
- `app/modules/system/schemas.py`：`SystemA2aInfoOut` 与 `SystemInfoOut.a2a` 建议移除。
- `app/modules/a2a/card.py`（Agent Card 构建）与入站相关测试：若只服务出站，评估删除或仅保留 Card 校验工具。
- 保留：`client.py`、`tool.py`、远程 Agent 注册/健康检查、任务表（出站方向）。

前端对应契约：`docs/handoff/contract-delta.md` §11 已标注 `system/info.a2a` 废弃。
