---
id: "m_bf11250b"
title: "M1 收尾两项已修复：A2A 设置门控、model/reasoning_effort 随请求发送"
summary: "A2A 设置已按 a2a.enabled 门控；模型/推理选择已随 chat/stream 发送；新增 4 个单测，79 个用例通过。"
kind: "project"
importance: 3
tags: ["todo","M1","A2A","参数透传"]
pinned: false
status: "active"
created: "2026-11-10T02:44:05.907Z"
modified: "2026-11-10T02:51:09.328Z"
revision: 2
origin: "tool"
sessionId: "session-57c394eb-0850-4122-a9ab-2fbf68588dce"
sessionTitle: "分析项目开发路线并匹配后端"
model: "deepseek-official/deepseek-flash"
---

两项 M1/M3 前置代码收尾已于 2026-11-10 完成：

1. `SettingsView.vue` 的 A2A 区块按 `system/info.a2a.enabled` 门控：未启用时显示「入站未启用」、不展示可复制地址、复制按钮禁用；有组件测试覆盖启用/未启用。
2. `ChatContextSelection` 增加 `model` / `reasoning_effort`；`ChatView` 在 `chat.send` 前用 `withModelSelection` 合并当前选择；推理等级仅在 `/system/info.reasoning_efforts` 非空时下发；新增 2 个单元测试。

验证：`pnpm test` 79 个用例通过、`pnpm type-check`、`pnpm build`、`pnpm lint` 通过。

仍待后端仓库同步：`agent-hub/docs/roadmap.md` 的 M1/M2 完成勾选滞后（受工作区边界限制，本次未改后端）。
