---
id: "m_548eda73"
title: "审批卡误报「已过期」：后端不落 approval.decided 事件，历史回放需查 approvals 补决定"
summary: "历史会话里已批准的审批卡会显示「审批已过期」，因为事件流中没有 approval.decided、卡片 decision 为空，而过期判定只看 expires_at 不看状态。"
kind: "project"
importance: 4
tags: ["approval","chat","history-replay","event-stream"]
pinned: false
status: "active"
created: "2026-11-16T16:04:45.040Z"
modified: "2026-11-16T16:04:45.040Z"
revision: 1
origin: "auto"
sessionId: "session-8ac27f69-7b57-4478-8174-190fe8cdc0d1"
sessionTitle: "新建会话标题不生成及审批问题"
model: "deepseek-account/deepseek-flash"
---

现象：chat?c=<id> 历史会话中已完成（后端 status=approved，运行已 succeeded）的审批卡显示「审批已过期」。
根因两条：
1) 后端不写 approval.decided 事件，只在事件流里用 approval.required → run.interrupted → run.resumed 表示审批与恢复，所以回放重建的卡片 decision 恒为 null。
2) ApprovalCard.vue 的过期判定原来只看 expires_at（now >= expiresAt），不看审批状态，因此决策时间早于截止时间但当前时间已过截止时就被判过期。
修复口径（已落地）：
- expired 仅对「仍等待且未决策」的卡生效（status==='waiting' && !decision && now >= expiresAt）；已批准/已拒绝/已处理的历史卡不再判过期。
- 状态文案优先级：已批准 → 已拒绝 → 已处理 → 已取消 → 已过期 → 待审批；已决卡的超时行显示截止时间而非 00:00。
- 历史会话回放后调用 approvalsApi.list({ run_id }) 补齐每条审批的最终决定，卡片能显示准确的「已批准/已拒绝」。
注意：真正超时未处理（status 仍为 waiting）的审批才应显示「已过期」。
