---
id: "m_bf11250b"
title: "M1 收尾与 A2A 入站下线：前端已彻底移除 a2a 类型、mock 与设置分区"
summary: "模型/推理选择已随 chat/stream 发送；A2A 入站相关内容在前端仓库整体删除（不只是隐藏门控），文档与架构同步为「仅出站」。"
kind: "project"
importance: 3
tags: ["a2a","m3","settings","types","docs"]
pinned: false
status: "active"
created: "2026-11-10T02:44:05.907Z"
modified: "2026-11-10T03:11:51.641Z"
revision: 4
origin: "auto"
sessionId: "session-fae653d8-3e19-46f8-bb07-de9204cab272"
sessionTitle: "M3 开发启动"
model: "deepseek-official/deepseek-flash"
---

模型/推理等级选择已随 chat/stream 请求发送。原「A2A 设置门控」不是被隐藏而是随 2026-11-10「仅出站」需求变更整体下线：
- 代码侧已删除 SettingsView 的整个 A2A 分区（Agent Card / JSON-RPC 地址、复制按钮、入站状态），导航只剩账号 / 个人能力 / 模型 / 关于；删除 SystemInfo.a2a 与 SystemA2aInfo 类型、system store 的 a2a getter、mock fixtures 里的 a2a 入站块；SettingsView 单测改为断言该分区与端点复制入口不存在。
- 文档侧 roadmap/README/pages/api/architecture/contract-delta/handoff-README 均已同步「M3 已取消（仅出站）」；architecture 中 Nginx 只需代理 /api，不再代理 /a2a 入站端点；contract-delta 建议后端移除 system/info.a2a。
- 保留不动（属出站链路）：智能体注册、Agent Card 拉取预览、健康检查、send_message、出站任务页、A2A 事件卡与任务时间线；原型 HTML（ui-v7* / ui-v8-admin.html）保留为历史资产、不再被规划文档引用。
- 未做：后端 agent-hub 仓库的 M3 清理（见项目待办），以及推送（仓库惯例由用户自行 push）。
