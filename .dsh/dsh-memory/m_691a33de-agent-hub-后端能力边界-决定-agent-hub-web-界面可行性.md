---
id: "m_691a33de"
title: "agent-hub 后端能力边界（决定 agent-hub-web 界面可行性）"
summary: "agent-hub 后端文档位于 /home/zhaodan/work/PythonProjects/agent-hub（README、docs/api.md、docs/a2a.md、docs/database.md），其能力边界决定前端原型哪些元素能做。"
kind: "reference"
importance: 4
tags: ["agent-hub","后端契约","能力边界","API"]
pinned: false
status: "active"
created: "2026-11-05T15:22:56.129Z"
modified: "2026-11-05T15:22:56.129Z"
revision: 1
origin: "auto"
sessionId: "session-251bc05a-32c8-4daf-a6c1-b8a9a4073a9f"
sessionTitle: "设计项目前端界面初版"
model: "deepseek-official/deepseek-flash"
---

前端 agent-hub-web 的原型元素必须以后端仓库 /home/zhaodan/work/PythonProjects/agent-hub 为准，关键文档：README.md、docs/api.md、docs/a2a.md、docs/database.md。

已核对到的边界：
- 没有 MCP：技术栈、API、SSE 事件里都没有 MCP 连接器、工具发现或鉴权设计。
- 没有 Slack 集成，也没有频道权限校验。
- 没有主智能体的「技能注册表」；技能只有 A2A Agent Card 里的 skills，表现为 agent_<slug>__<skill_id> 形式的远程工具。
- HITL 是 LangGraph 的 interrupt() → approval.required → decision → resume，不存在「预批准/自动发送」语义；approvals 表字段含 tool_name、reason、payload、expires_at、a2a_task_id。运行期间同时只允许 1 个 run。
- a2a.task 事件带 progress（0–1 标量）与状态枚举（working/completed/…），没有「第几步/共几步」的步骤数。
- message.done.usage 只有 input_tokens / output_tokens，没有缓存 token，也没有 context window 字段。
- 工具层只有知识检索（真实工具名 search_knowledge，pgvector HNSW + cosine、top_k=5、category 过滤、chunk 与命中分数）、远程 Agent 调用、审批；工具事件不返回知识库文档总数。
- 附件上传接口未实现（文档标注「后续提供」）；/runs/{run_id}/events 运行事件回放仍在规划中。
