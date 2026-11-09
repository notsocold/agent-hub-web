# dsh-memory · Project agent-hub-web

> Generated index. Topic files in this directory are the source of truth;
> edits here are overwritten. Edit a topic file or use Settings → Memory.

Project: `/home/zhaodan/work/NodeJsProjects/agent-hub-web`

Active topics: 26

- [事故善后：活动会话已脱敏，剩余 Key 轮换与其他工作区](m_b5975052-事故善后-活动会话已脱敏-剩余-key-轮换与其他工作区.md) — 活动会话已脱敏并推送；剩余：轮换 4 把 key、清理其他工作区会话、公开历史清理、钩子跨机安装。 · `todo` · importance 4 · 2026-11-09
- [agent-hub-web 的 DSH 会话：脱敏原生 zstd 与工作区快照后随仓库提交](m_54f277cf-agent-hub-web-的-dsh-会话-脱敏原生-zstd-与工作区快照后.md) — 会话快照不整目录忽略，用 scripts/dsh-session-sanitize.mjs 同一规则脱敏原生 zstd 与工作区快照后提交，脚本带并发写保护可在 dsh web 运行时安全处理活动会话。 · `reference` · importance 4 · 2026-11-09
- [agent-hub M1.5/M2 真实字段差异与前端归一化](m_df7d70bd-agent-hub-m1-5-m2-真实字段差异与前端归一化.md) — 真实后端与 contract-delta 草稿的字段差异，以及 M1.5/M2 对齐与后端交接文档位置。 · `reference` · importance 4 · 2026-11-09
- [agent-hub-web 真实后端联调环境与限流约定](m_25168cdb-agent-hub-web-真实后端联调环境与限流约定.md) — agent-hub-web 真实联调：8000 实例 + Vite 代理、dev server 仅监听 127.0.0.1，M1/M1.5/M2 各自有冒烟与真实用例脚本。 · `reference` · importance 4 · 2026-11-09
- [agent-hub 后端 M1.5/M2 遗留限制与后续里程碑归属](m_7c140300-agent-hub-后端-m1-5-m2-遗留限制与后续里程碑归属.md) — M1.5/M2 已完成但入站 A2A Server、写操作 RBAC、单实例 HITL registry 等留给后续里程碑。 · `project` · importance 4 · 2026-11-09
- [M1.5/M2 前后端已完成并联调通过](m_025de865-m1-5-m2-前后端已完成并联调通过.md) — M1.5（附件/指令/记忆/技能/MCP/审批）与 M2（远程智能体/A2A/任务）前后端已全部完成并真实联调通过。 · `project` · importance 4 · 2026-11-09
- [agent-hub 本地联调直接用 seeded 开发账号，无需注册；当前无管理端接口](m_6a1cb133-agent-hub-本地联调直接用-seeded-开发账号-无需注册-当前无管理.md) — 后端 scripts/seed_dev_account.py 幂等维护一个开发账号（dev@example.com），注册有 5 次/小时/IP 限流且不会自动提权；库中账号全为 user，/api/v1/admin/* 实测 404，admin 角色目前只影响设置页角色标签。 · `reference` · importance 4 · 2026-11-09
- [agent-hub 后端 M1 联调缺陷（已修复并复验）](m_0bffd3bd-agent-hub-后端-m1-联调缺陷-已修复并复验.md) — 后端 P0/P1/P2 热修已在 8000 实例复验通过：cursor 分页不再 500、request_id 一致、OpenAPI 相关字段收紧为必填可空，前端类型已同步。 · `reference` · importance 4 · 2026-11-09
- [agent-hub-web M1 真实后端联调与热修复复验结果](m_deebfa8e-agent-hub-web-m1-真实后端联调与热修复复验结果.md) — M1 真实联调与后端热修复复验全部通过；cursor 分页已修复，后续按 M1.5/M2/M4/M5+ 推进。 · `todo` · importance 4 · 2026-11-09
- [agent-hub-web 当前实现与 v7 原型有差距，视觉对齐拆为独立 P0–P3 工作包](m_6f21d7a9-agent-hub-web-当前实现与-v7-原型有差距-视觉对齐拆为独立-p0.md) — M1 实现只做到结构近似、视觉未收口，已分类为「呈现型欠账」与「功能型里程碑」，并提议把还原原型作为独立工作包先做 P0+P1。 · `decision` · importance 4 · 2026-11-09
- [UI 混合策略：Element Plus 做通用件、对话区自研；降级不造假](m_c422d95c-ui-混合策略-element-plus-做通用件-对话区自研-降级不造假.md) — 通用交互用 Element Plus，对话时间线/过程卡片/审批卡/输入栏按原型自研；未接入能力统一提示后续里程碑而不做本地假成功。 · `decision` · importance 4 · 2026-11-09
- [agent-hub-web M1 前端技术选型与工程约定](m_bbc06ee6-agent-hub-web-m1-前端技术选型与工程约定.md) — M1 前端采用 Vue3+TS+Vite8+Pinia+Router 加 Element Plus 按需自动导入，契约先行（src/types + mock 层），用 VITE_USE_MOCK 在 mock 与真实后端间切换。 · `project` · importance 4 · 2026-11-09
- [后端交接包 v1.0 位置与关键结论](m_79b5c3ab-后端交接包-v1-0-位置与关键结论.md) — agent-hub-web 已产出 docs/handoff 交接包，包含契约增量、工作包、fixtures、工作流/管理端方案与 8 个待拍板决策。 · `project` · importance 4 · 2026-11-08
- [原型自检定稿的交互规则：上下文互斥、发送即清空、上限、停止复用发送位与二次确认](m_73771f38-原型自检定稿的交互规则-上下文互斥-发送即清空-上限-停止复用发送位与二次确认.md) — 原型自检定稿的交互规则：上下文互斥、发送即清空、技能/MCP 上限、停止按钮与发送按钮同位（执行中及待审批时切换为停止）、危险操作二次确认。 · `decision` · importance 4 · 2026-11-08
- [agent-hub 后端能力边界（决定 agent-hub-web 界面可行性）](m_691a33de-agent-hub-后端能力边界-决定-agent-hub-web-界面可行性.md) — agent-hub 后端文档位置与能力边界；A2A 仍为设计稿，且 v7/v8 原型中多项交互仍缺后端契约字段或接口。 · `reference` · importance 4 · 2026-11-08
- [agent-hub-web v7 对话：过程收起定稿、A2A 流式开关、Agent Skill 移除与六类过程色板](m_894de5a5-agent-hub-web-v7-对话-过程收起定稿-a2a-流式开关-agen.md) — v7 过程收起保留草稿与定稿；移除 Agent Skill 标签（改为保留实际工具名）；Agent 抽屉按 streaming 能力流式或等待最终结果；六类过程改为绿/蓝/琥珀/青/紫/红色板并应用到卡片、轨道、轨迹与工作流。 · `decision` · importance 4 · 2026-11-08
- [agent-hub-web v8 管理员控制台（独立管理会话原型）](m_e70f698d-agent-hub-web-v8-管理员控制台-独立管理会话原型.md) — v8 管理员控制台独立为 ui-v8-admin.html：深墨管理侧栏 + 概览/用户/角色权限/菜单/字典/审计/系统设置七页，v7 工作台不出现管理员入口。 · `decision` · importance 4 · 2026-11-05
- [输入框「@」只用于选择文件，上下文能力统一收进「+」菜单](m_93398223-输入框-只用于选择文件-上下文能力统一收进-菜单.md) — 用户明确：@ 是文件选择用途，不用于选择智能体；附件、技能、工作流、知识库等显式选择统一收进输入栏「+」上下文菜单。 · `decision` · importance 4 · 2026-11-05
- [agent-hub-web 原型 v7：工作流管理页 + 输入区「+」菜单 + 模型/推理等级](m_6855443e-agent-hub-web-原型-v7-工作流管理页-输入区-菜单-模型-推理等.md) — v7 新增工作流管理页与可配置步骤编辑器，重做对话输入区为「+」上下文菜单（附件/技能/工作流/知识库）和右侧模型/推理等级选择，并打通工作流在对话中的调用。 · `decision` · importance 4 · 2026-11-05
- [agent-hub-web 的 DSH 会话脱敏钩子与脚本行为约定](m_fd58cf40-agent-hub-web-的-dsh-会话脱敏钩子与脚本行为约定.md) — 脱敏钩子只在提交前拦截、不自动改写；脚本以 stat 一致性校验保证活动会话可安全脱敏。 · `reference` · importance 3 · 2026-11-09
- [agent-hub-web 公开仓库推送：沙箱无 HTTPS 凭据，改用 SSH remote](m_1108af97-agent-hub-web-公开仓库推送-沙箱无-https-凭据-改用-ssh.md) — agent-hub-web 是 public 仓库，Agent 沙箱内没有 HTTPS git 凭据助手，push 需用 SSH 地址而非 https。 · `reference` · importance 3 · 2026-11-09
- [master 迁移采用 ff-only 快进合并，保留 14 个 M1 提交历史](m_35ab530a-master-迁移采用-ff-only-快进合并-保留-14-个-m1-提交历史.md) — 把 feat/m1-chat-workbench 迁到 master 时选择快进合并而非 squash/rebase，完整保留提交历史，推送由用户自己完成。 · `decision` · importance 3 · 2026-11-09
- [本机没有 Chromium，HTML 原型只能做静态校验，需用户自己在浏览器看渲染](m_5d920272-本机没有-chromium-html-原型只能做静态校验-需用户自己在浏览器看渲.md) — 该开发机未安装 Chromium，无法对生成的 HTML 原型截图做像素级检查，只能做标签配对/重复 id/CSS 括号/JS 语法/DOM id 引用等静态校验，并把实际渲染确认交给用户在浏览器打开。 · `reference` · importance 3 · 2026-11-09
- [待用户拍板：交接包 D1–D8 八项决策](m_d505a964-待用户拍板-交接包-d1-d8-八项决策.md) — 后端交接包遗留 8 项决策待用户拍板，其中 D1/D2/D7/D8 直接影响表结构与里程碑，需在 M1 编码前定。 · `todo` · importance 3 · 2026-11-08
- [A2A 远程委派只经 send_message 工具，per-skill 包装工具非必需](m_c8947c89-a2a-远程委派只经-send-message-工具-per-skill-包装工.md) — A2A 主智能体调用远程智能体走统一 send_message(agent, task, context)，按 skill 生成的 agent_<slug>__<skill_id> 包装工具并非协议所需，也不应暴露到界面。 · `reference` · importance 3 · 2026-11-08
- [agent-hub-web 定位与 UI 原型约定（调度台 Dispatch Desk）](m_07916c67-agent-hub-web-定位与-ui-原型约定-调度台-dispatch-d.md) — agent-hub-web 以 docs/prototypes/ 单文件 HTML 分版本迭代；v7 含工作流管理、+ 输入菜单、模型/推理等级、智能体卡片、任务结果、流式返回与运行轨迹。 · `project` · importance 3 · 2026-11-05
