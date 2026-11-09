---
id: "m_c422d95c"
title: "UI 混合策略：Element Plus 做通用件、对话区自研；降级不造假"
summary: "通用交互用 Element Plus，对话时间线/过程卡片/审批卡/输入栏按原型自研；未接入能力统一提示后续里程碑而不做本地假成功。"
kind: "decision"
importance: 4
tags: ["agent-hub-web","决策","element-plus","降级"]
pinned: false
status: "active"
created: "2026-11-09T09:07:09.696Z"
modified: "2026-11-09T09:07:09.696Z"
revision: 1
origin: "auto"
sessionId: "session-c69a987f-0c45-4775-8970-00ebd96503d7"
sessionTitle: "开始实现本项目"
model: "deepseek-official/deepseek-flash"
---

UI 策略：Element Plus 承担表单、表格、抽屉等通用交互，对话时间线、过程卡片、审批卡、输入栏等原型特有部分自研，避免被组件库默认样式带偏视觉还原。

降级原则（不造假）：附件、技能/MCP/知识库上下文选择、上传、工作流编辑等未接入能力统一提示「将在 M1.5/M2/M4 接入」，不写本地成功态。

交接包待拍板项的实现取舍：D3（模型可选）、D4（knowledge_categories）、D8（HITL 保持流）已按交接包推荐项实现；若后端最终结论不同，需同步修改这三处。
