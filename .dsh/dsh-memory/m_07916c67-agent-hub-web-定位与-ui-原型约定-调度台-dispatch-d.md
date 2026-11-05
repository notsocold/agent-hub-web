---
id: "m_07916c67"
title: "agent-hub-web 定位与 UI 原型约定（调度台 Dispatch Desk）"
summary: "agent-hub-web 以 docs/prototypes/ 单文件 HTML 分版本迭代；v7 含工作流管理、+ 输入菜单、模型/推理等级、智能体卡片、任务结果、流式返回与运行轨迹。"
kind: "project"
importance: 3
tags: ["agent-hub-web","ui-prototype","dispatch-desk","design-conventions"]
pinned: false
status: "active"
created: "2026-11-05T14:50:38.518Z"
modified: "2026-11-05T17:09:56.453Z"
revision: 6
origin: "tool"
sessionId: "session-251bc05a-32c8-4daf-a6c1-b8a9a4073a9f"
sessionTitle: "设计项目前端界面初版"
model: "deepseek-official/deepseek-flash"
---

agent-hub-web 是多智能体对话工作台，界面设计先以 `docs/prototypes/` 下的单文件 HTML 原型迭代，设计概念为「调度台」。原型按版本累积、保留旧版便于对比（ui-v1 → ui-v7）。

v7 结构：

- `ui-v7.html`：对话页；`ui-v7-pages.html`：工作流 / 智能体 / 任务 / 知识库 / 设置五页面样例，共用 DSH 式侧栏。
- 左侧栏展开 288px / 收起 56px；导航顺序：对话、工作流、智能体、任务、知识库；会话支持右键/更多/重命名/归档/删除。
- 对话页：用户消息深色气泡；执行总线只承载助手侧；五类过程卡保留；HITL 审批；右侧执行轨道 + 运行轨迹抽屉 + 远程智能体流式返回抽屉。
- 输入区：`+` 菜单管理附件、技能、工作流、知识库；上下文 chips + 工作流轨迹预览；右侧模型选择（deepseek-chat / deepseek-reasoner）和推理等级（标准/深度/最大）。
- 工作流页：步骤化执行轨迹（技能/检索/工具/A2A/MCP/审批），可新建/编辑/复制/启停/删除；「在对话中使用」通过 hash 把配置带入对话。
- 任务页：已完成/失败任务可打开返回结果抽屉；智能体页：2 列卡片；设置页：账号字段只读并注明接口待补。
- 工作流数据当前为页面内存；真实项目需后端 CRUD 与对话 workflow_id。
