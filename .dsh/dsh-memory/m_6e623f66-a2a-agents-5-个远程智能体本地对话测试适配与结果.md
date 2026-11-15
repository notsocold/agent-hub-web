---
id: "m_6e623f66"
title: "a2a-agents 5 个远程智能体本地对话测试：适配方式、结果与对端遗留问题"
summary: "5 个 ADK A2A 智能体已接入 agent-hub 后端并完成真实委派对话（10 任务 9 成功），靠临时 launcher、补依赖、Card 兼容字段和 A2A-Version:1.0 头打通，同时暴露 a2a-agents 与后端的若干遗留问题。"
kind: "project"
importance: 4
tags: []
pinned: false
status: "active"
created: "2026-11-12T03:17:01.090Z"
modified: "2026-11-12T03:17:56.384Z"
revision: 2
origin: "auto"
sessionId: "session-7b75e2a6-6432-4ed5-9ee1-3037b96e4f2b"
sessionTitle: "A2A远程智能体对话测试"
---

a2a-agents 的 5 个 ADK A2A 智能体（math 8101 / weather 8102 / translator 8103 / code-assistant 8104 / research 8105）已注册进 agent-hub 后端，并经主智能体 send_message 完成真实委派对话：后端共 10 个任务，9 completed、1 failed（唯一失败是首轮缺协议版本头，补头后重试成功）。

接入适配（未改 a2a-agents 原项目源码）：
1. 原代码导入 agents.<name>.agent 与实际目录不符，用临时 launcher 按文件直接加载模块；
2. 原 .venv 缺 litellm、sse-starlette，在工作区临时 venv 装 google-adk[extensions] 与 a2a-sdk[fastapi]；
3. ADK 2.14 生成的 1.0 Card 只有 supportedInterfaces，后端注册校验要顶层 url/protocolVersion，launcher 覆盖 Card 路由合并兼容字段；
4. 后端 A2aClient 直接构造 SDK transport、不发 A2A-Version 头，服务端按 0.3 拒绝；给每个 Agent 配 headers {"A2A-Version": "1.0"} 后全部成功。

典型 SSE 链路：tool.start → a2a.task(submitted→working→completed) → a2a.artifact → tool.result → message.done。

对端（a2a-agents）遗留问题：translator / code-assistant / research 返回混入模型推理片段且末尾不完整；translator 语言检测把中文判成 en（Agent 自行纠正）；research 的摘要/关键词/阅读时间工具按空格分词，中文 word_count=1 导致结果失真。后端侧：tool.result 摘要按 500 字符截断，完整内容需看任务详情 result.artifact.parts。

长期联调前的修复建议：修 a2a-agents 的启动路径、依赖声明、Card 兼容与 reasoning 输出，并在后端补默认 A2A-Version 头。

完整报告：docs/a2a-dialogue-test-2026-11-12.md。本机环境注意：WSL 在 headless Chromium + 5 Agent 负载下曾两次意外退出，长时间浏览器等待/截图类验证要留断点，结论可退回 SSE 事件与任务记录作证据。
