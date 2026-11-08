---
id: "m_894de5a5"
title: "agent-hub-web v7 对话：过程收起定稿、A2A 流式开关、Agent Skill 移除与六类过程色板"
summary: "v7 过程收起保留草稿与定稿；移除 Agent Skill 标签（改为保留实际工具名）；Agent 抽屉按 streaming 能力流式或等待最终结果；六类过程改为绿/蓝/琥珀/青/紫/红色板并应用到卡片、轨道、轨迹与工作流。"
kind: "decision"
importance: 4
tags: ["agent-hub-web","ui-prototype","thinking-collapse","bubble-color","a2a"]
pinned: false
status: "active"
created: "2026-11-08T13:42:11.819Z"
modified: "2026-11-08T14:15:48.914Z"
revision: 5
origin: "tool"
sessionId: "session-251bc05a-32c8-4daf-a6c1-b8a9a4073a9f"
sessionTitle: "设计项目前端界面初版"
---

v7 对话页最终确认：

## 1. 过程收起
- 周报草稿与最终定稿**都保留**（都是主智能体非思考输出）。
- 计划节点只有思考，收起时整节点隐藏；其他主智能体节点按“有无非思考输出”保留。
- 不新增 progress / input_required / auth_required / cancel 的 UI（用户明确不需要）。

## 2. 用户气泡
- 亮色 #17465E 普鲁士蓝，暗色 #233A46；用户确认可以。

## 3. A2A Agent Skill
- `Agent Skill · verify_numbers` 已从远程委派行和 Agent 抽屉移除。
- 原因：它是远程 Agent Card 的**能力声明**，不等于某个 A2A Task 实际使用的 skill；A2A 调用把 task/message 发给 Agent 整体，`a2a_tasks` 没有 skill_id 字段，无法验证远程内部实际用了哪个 skill。
- 保留实际工具名 `agent_data_analyst__verify_numbers`（这是被主智能体调用的工具），不保留 Agent Skill 标签。
- Agent Card 页仍展示远程 Agent 的 skills，因为那是注册时的能力声明。

## 4. 远程流式/非流式
- AGENT_STREAMS 增加 streaming：
  - data-analyst: true → 打开 Agent 抽屉后逐段流式回放 artifact，标签“A2A artifact 流 / 回放中 / 重新播放”。
  - editorial-reviewer: false → 打开后显示“等待最终返回”，约 800ms 后一次性显示最终结果，标签“A2A 最终结果 / 等待最终返回 / 重新加载”。
- A2A 行提示：data-analyst 显示“查看流”，editorial-reviewer 显示“查看结果”。
- 真实项目中由 Agent Card capabilities.streaming 决定，不支持流式时等待最终 task result。

## 5. 任务过程色板（六类明确区分）
| 类型 | 亮色 | 暗色 |
|---|---|---|
| 技能 | #3D6A4E | #8DBBA0 |
| 检索 | #2E6485 | #8FB8CC |
| 工具 | #A9741F | #D4A04A |
| A2A | #2E746E | #8CC7BF |
| MCP | #5A4E72 | #B3A4C9 |
| 审批 | #9C3A2B | #DE907E |

应用位置：
- 过程卡片的节点、kind chip、tool-card 左侧色条；
- A2A 委派组左边框、A2A tag、远程 Agent badge、查看流提示、Agent 抽屉 badge/流标签；
- 审批卡左边框与图标；
- 右侧执行轨道的 marker 类型色；
- 运行轨迹时间线条与事件 chip；
- 工作流页步骤条的 vector/A2A 颜色；
- Agent 卡片页远程 badge。

## 6. 仍待同步
- `ui-v7-pages.html` 任务列表里的 task-skill 小标签仍是工具名派生；严格按 `a2a_tasks` 字段也应移除/改 tool，目前未动。
- A2A 后端仍是设计稿，app/modules/a2a 只有 .gitkeep。
