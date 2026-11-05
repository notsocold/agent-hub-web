---
id: "m_6855443e"
title: "agent-hub-web 原型 v7：工作流管理页 + 输入区「+」菜单 + 模型/推理等级"
summary: "v7 新增工作流管理页与可配置步骤编辑器，重做对话输入区为「+」上下文菜单（附件/技能/工作流/知识库）和右侧模型/推理等级选择，并打通工作流在对话中的调用。"
kind: "decision"
importance: 4
tags: ["agent-hub-web","原型","workflow","ui"]
pinned: false
status: "active"
created: "2026-11-05T15:22:56.130Z"
modified: "2026-11-05T17:11:03.608Z"
revision: 9
origin: "auto"
sessionId: "session-251bc05a-32c8-4daf-a6c1-b8a9a4073a9f"
sessionTitle: "设计项目前端界面初版"
model: "deepseek-official/deepseek-flash"
---

agent-hub-web 原型 v7（docs/prototypes/ui-v7.html 对话页 + ui-v7-pages.html 五页面样例，v6 保留未动）：

侧栏导航调整为：对话 / 工作流 / 智能体 / 任务 / 知识库。

工作流管理页：
- 用「执行轨迹卡片」而非普通配置表展示：名称、版本、描述、启用状态、步骤数、远程智能体数、审批数、运行次数；
- 步骤类型固定六类并按类型着色：技能 → 检索 → 工具 → 远程智能体 → MCP → 审批（带序号与连接线）；
- 600px 右侧编辑器可增删步骤、从六类中添加具体项（如 weekly-report、search_knowledge、tickets.aggregate、data-analyst · verify_numbers、slack · conversations.info）、上移下移、每步勾选「写操作需审批」；
- 支持启用/停用/编辑/复制/删除；草稿状态不能在对话中使用，启用后才出现「在对话中使用」。

对话输入区：
- 去掉「@ 智能体」按钮，输入栏左侧改为「+」上下文菜单：附件（本地多选，保留「@ 选择文件」提示）/ 技能多选 / 工作流 / 知识库 / 管理工作流；选中后变成输入框上方可分别移除的 chips；
- 选中工作流后输入框内显示轨迹预览（加载技能 → 向量检索 → 数据聚合 → 数据分析 → 措辞审阅 → MCP 校验 → 发送审批）；发送后用户气泡展示本次携带的附件/技能/知识库，助手侧上方出现工作流步骤条；对话页顶部另有「当前运行」状态条，与下一轮在「+」里选择的工作流区分；
- 输入栏右侧为模型（deepseek-chat / deepseek-reasoner）+ 推理等级（标准/深度/最大）下拉，按钮显示当前组合，菜单向上弹出并与「+」菜单互斥。

工作流页与对话页联动：工作流卡片「在对话中使用」通过 URL 把工作流 id、名称、最新步骤带入对话页，编辑过或新建并启用的工作流会覆盖对话页种子数据；「查看工作流」可回到管理页。

后端缺口：目前没有 /workflows CRUD 接口与对话请求的 workflow_id 参数，工作流是页面内存数据、刷新回种子数据；模型/推理等级也只是前端选择状态，真实执行需在 run 请求里加参数。
