---
id: "m_1e406da9"
title: "agent-hub 审批（HITL）只在三种条件下触发，默认环境无落点"
summary: "审批 gate 仅由 requires_approval=true 的 MCP 工具、requires_approval=true 的 A2A 目标 Agent、或含审批步的工作流触发；当前库里 MCP/工作流为 0、20 个远程 Agent 全为 false、approvals 表 0 条，所以对话中「测试审批」无法触发。"
kind: "project"
importance: 4
tags: ["approval","hitl","a2a","mcp","workflow","agent-hub"]
pinned: false
status: "active"
created: "2026-11-16T15:04:25.310Z"
modified: "2026-11-16T15:04:25.310Z"
revision: 1
origin: "auto"
sessionId: "session-8ac27f69-7b57-4478-8174-190fe8cdc0d1"
sessionTitle: "新建会话标题不生成及审批问题"
model: "deepseek-account/deepseek-flash"
---

后端审批 gate 的触发判定（agent-hub app/modules/chat/tools.py）：
1. MCP 工具：mcp_tools.requires_approval = true；
2. A2A 委派：目标远程 Agent 的 requires_approval = true；
3. 工作流审批步：模板中的审批步骤（force_approval_tools）。

当前环境实测：mcp_servers/mcp_tools 0 条、workflows 0 条、20 个远程 Agent 全部 requires_approval=false、approvals 表 0 条 —— 这套 HITL 链路从未被真正触发过。内置工具（search_knowledge、read_skill_file、send_message、save_memory）按设计不弹审批，因此在对话里要求「测试审批」不会有审批卡，助手的「无法触发审批流程」说法符合当前配置。

要演示/验证审批卡，任选其一：
- 管理台 → Agent 管理 → 编辑某远程 Agent（如 code-reviewer）→ 打开「需要审批」→ 对话里委派任务，应出现 approval.required 审批卡（AdminAgentCard.vue 已接该 PATCH 字段）；
- 设置 → MCP → 添加服务 → 把工具勾成「需要审批」（McpPanel.vue）→ 对话中调用；
- 工作流 → 建含审批步的模板 → 对话里用「+」选中执行。

排查提示：「审批已过期，无法继续执行」属于另一类情况（approval_timeout_seconds 超时或重复决策），与「从未触发过审批」不同。

id 识别坑：用户报的 0e7ef626-bf34-400e-a69d-f4b09f71e040 是 runs.id（run 状态 succeeded），不是会话 id；其所属会话为 5c0716d9-…（因标题 bug 显示为「新会话」）。
