---
id: "m_bf11250b"
title: "M1 收尾：model/reasoning 透传生效；A2A 设置门控随 M3 取消移除"
summary: "模型/推理选择已随 chat/stream 发送；原 A2A 设置门控因 2026-11-10 需求变更（仅出站）随分区一并移除，79 个用例通过。"
kind: "project"
importance: 3
tags: ["M1","A2A","参数透传","M3取消"]
pinned: false
status: "active"
created: "2026-11-10T02:44:05.907Z"
modified: "2026-11-10T03:10:38.384Z"
revision: 3
origin: "tool"
sessionId: "session-fae653d8-3e19-46f8-bb07-de9204cab272"
sessionTitle: "分析项目开发路线并匹配后端"
model: "deepseek-official/deepseek-flash"
---

# M1 收尾：A2A 设置门控、model/reasoning_effort 随请求发送

- 2026-11-10 完成项 1（仍然有效）：`ChatContextSelection` 增加 `model` / `reasoning_effort`；`ChatView` 在 `chat.send` 前用 `withModelSelection` 合并当前选择；推理等级仅在 `/system/info.reasoning_efforts` 非空时下发；2 个单元测试。
- 2026-11-10 完成项 2（已被同日需求变更覆盖）：`SettingsView.vue` 的 A2A 区块曾按 `system/info.a2a.enabled` 门控并有 2 个测试。因「服务仅出站、M3 入站取消」，设置页 A2A 端点分区已整块移除，`SystemInfo.a2a` 类型、store getter 与 mock 数据一并删除；SettingsView 测试改为验证入站分区与复制入口不存在。
- 验证：`pnpm test` 79 个用例通过、`pnpm type-check`、`pnpm build`、`pnpm lint` 通过。
- 仍待后端仓库同步：`agent-hub/docs/roadmap.md` 的 M1/M2 完成勾选滞后，以及 M3 入站设计清理（后端单独处理）。
