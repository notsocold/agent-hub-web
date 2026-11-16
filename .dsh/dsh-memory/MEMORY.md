# dsh-memory · Project agent-hub-web

> Generated index. Topic files in this directory are the source of truth;
> edits here are overwritten. Edit a topic file or use Settings → Memory.

Project: `/home/zhaodan/work/NodeJsProjects/agent-hub-web`

Active topics: 62

- [审批卡误报「已过期」：后端不落 approval.decided 事件，历史回放需查 approvals 补决定](m_548eda73-审批卡误报-已过期-后端不落-approval-decided-事件-历史回放需.md) — 历史会话里已批准的审批卡会显示「审批已过期」，因为事件流中没有 approval.decided、卡片 decision 为空，而过期判定只看 expires_at 不看状态。 · `project` · importance 4 · 2026-11-16
- [pnpm size 预算自 2026-11-12 起已超标，CI 一直红灯，M9 报告的数字不实](m_062206a5-pnpm-size-预算自-2026-11-12-起已超标-ci-一直红灯-m9.md) — 构建体积门禁 pnpm size 的 420 KB gzip 阈值在 M9 交付后（43a16b7，422.9 KB）就已超限，本轮整改后达 456.9 KB，CI 因执行该脚本持续红灯，等待用户在两种方案中拍板。 · `project` · importance 4 · 2026-11-16
- [差距整改执行（2026-11-16）：用户选方案 A，30 项差异全部有归宿](m_43be688c-差距整改执行-2026-11-16-用户选方案-a-30-项差异全部有归宿.md) — 差异审计的整改已按用户选定的方案 A（前端 + 文档全量，后端只读核对）执行完毕，30 项差异按关闭、部分关闭、缩范围、正式接受、待后端、延后六类全部归类，并留下整改报告与关闭清单。 · `decision` · importance 4 · 2026-11-16
- [历史会话重开右栏运行轨迹清空：需回放 last_run 事件并保留分页](m_f0f8df02-历史会话重开右栏运行轨迹清空-需回放-last-run-事件并保留分页.md) — 右栏运行详情只读实时事件流、loadConversation 又重置状态，导致重开历史会话时工具/A2A/审批/用量卡片全空；修复是对 conversation.last_run 回放持久化事件并按 last_run 收尾状态。 · `project` · importance 4 · 2026-11-16
- [会话标题自动生成：默认标题不一致（已收敛为「新对话」并兼容旧数据）](m_8584c130-会话标题自动生成-默认标题不一致-已收敛为-新对话-并兼容旧数据.md) — 新建会话标题不生成的根因是前后端默认标题不一致（前端「新会话」vs 后端只认「新对话」），现已统一默认值并让后端兼容旧「新会话」且不覆盖用户手改标题。 · `project` · importance 4 · 2026-11-16
- [agent-hub 审批（HITL）只在三种条件下触发，默认环境无落点](m_1e406da9-agent-hub-审批-hitl-只在三种条件下触发-默认环境无落点.md) — 审批 gate 仅由 requires_approval=true 的 MCP 工具、requires_approval=true 的 A2A 目标 Agent、或含审批步的工作流触发；当前库里 MCP/工作流为 0、20 个远程 Agent 全为 false、approvals 表 0 条，所以对话中「测试审批」无法触发。 · `project` · importance 4 · 2026-11-16
- [2026-11-13 差异审计：前后端与原型/需求 30 项差距，P1 7 项](m_685099b5-2026-11-13-差异审计-前后端与原型-需求-30-项差距-p1-7-项.md) — agent-hub-web 与 v7/v8 原型、docs/pages.md、roadmap 及后端 OpenAPI 的静态差异审计，产出 30 项差异台账与报告，结论是「接口接得上、功能对不齐」。 · `reference` · importance 4 · 2026-11-12
- [像素级对齐（阶段 2）完成：v7 六页 + v8 七页按原型重做呈现层](m_a94e1c18-像素级对齐-阶段-2-完成-v7-六页-v8-七页按原型重做呈现层.md) — 2026-11-12 完成 agent-hub-web 像素级对齐：新增 prototype.css/admin.css/图标 sprite 基座，六页工作台与管理台七页按 v7/v8 原型重做呈现层，逻辑与契约零改动，并留下有意为之的差异清单。 · `project` · importance 4 · 2026-11-12
- [后端 M8 管理端已交付（2026-11-11）：15 个 /admin/* 端点 + 前端交接文档](m_79921508-后端-m8-管理端已交付-2026-11-11-15-个-admin-端点-前端.md) — agent-hub 后端 M8 管理端已于 2026-11-11 交付，含 15 个 /admin/* 端点、无数据库迁移，并提供前端交接文档，前端 M8 可据此对接。 · `reference` · importance 4 · 2026-11-12
- [a2a-agents 5 个远程智能体本地对话测试：适配方式、结果与对端遗留问题](m_6e623f66-a2a-agents-5-个远程智能体本地对话测试-适配方式-结果与对端遗留问题.md) — 5 个 ADK A2A 智能体已接入 agent-hub 后端并完成真实委派对话（10 任务 9 成功），靠临时 launcher、补依赖、Card 兼容字段和 A2A-Version:1.0 头打通，同时暴露 a2a-agents 与后端的若干遗留问题。 · `project` · importance 4 · 2026-11-12
- [agent-hub-web 前端走 mock 的根因：.env.development 写死 VITE_USE_MOCK=true（Vite env 优先级坑）](m_ecd96990-agent-hub-web-前端走-mock-的根因-env-developme.md) — 前端 dev server 默认用 mock 是因为 .env.development 里写死 VITE_USE_MOCK=true，覆盖它必须新建 .env.development.local（不是 .env.local），且改完必须重启 dev server。 · `reference` · importance 4 · 2026-11-12
- [Element Plus 函数式组件样式需在 main.ts 显式引入（按需引入下的坑）](m_c3aee653-element-plus-函数式组件样式需在-main-ts-显式引入-按需引入.md) — unplugin-vue-components 只给模板中出现的组件注入样式，脚本里直接调用的 ElMessageBox/ElMessage 必须在 src/main.ts 显式引入对应 style/css，否则弹窗无样式、按钮几乎点不到。 · `project` · importance 4 · 2026-11-12
- [M7 前端续流/权限落地的行为变更与已知限制](m_6674367e-m7-前端续流-权限落地的行为变更与已知限制.md) — M7 前端全量接入续流与 RBAC 后确定的四条用户可见行为变更，以及三处已知限制。 · `decision` · importance 4 · 2026-11-11
- [M7 前端契约适配完成（2026-11-11）](m_90b880e4-m7-前端契约适配完成-2026-11-11.md) — 分支 feat/m7-frontend-contract 完成 M7 前端全量（续流/事件回放/RBAC/审批字段/授权链接/401-503 文案/Nginx），325 单测与 28 E2E 全绿，smoke:m7 48 项、test:real M7 5 例真实通过，本地 19 提交未推送；最终环境 Docker Desktop 不可用导致 --check-deploy 与真实联调无法复验。 · `project` · importance 4 · 2026-11-11
- [agent-hub 后端 M7 Task 1–4 已落地：续流端点、event 字段、RBAC、审批字段](m_f85a78a8-agent-hub-后端-m7-task-1-4-已落地-续流端点-event-.md) — 后端 M7 前四项（真实续流端点、事件 event 字段、写操作 RBAC、审批字段）已落地，前端 M7 据此实施；本地 M4 入库与 LLM 用例因缺 embedding/key 跑不了。 · `reference` · importance 4 · 2026-11-11
- [PA-1 第一次原型靠拢已完成并本地提交（2026-11-11）](m_23e1536d-pa-1-第一次原型靠拢已完成并本地提交-2026-11-11.md) — 前端按三条口径完成 PA-1：单侧栏、彻底删除审批页并改为对话内审批、宽屏常驻运行轨迹、设置页长滚动+改密、Agent 输出抽屉；验证全绿并本地提交未推送。 · `project` · importance 4 · 2026-11-11
- [原型对齐分两阶段：先 PA 第一次靠拢，立项全部完成后再做最终靠拢](m_c5795037-原型对齐分两阶段-先-pa-第一次靠拢-立项全部完成后再做最终靠拢.md) — 用户 2026-11-11 口径：以现有后端能力与前端实现为基础先做第一次向原型靠拢，偏离必须纠正（审批只在对话内），最终像素级靠拢等 M7–M9 完成后进行。 · `decision` · importance 4 · 2026-11-11
- [前端与 v7/v8 原型差距盘点：M0–M6+F1 已完成，缺口在 M7/M8/M9](m_2245ce60-前端与-v7-v8-原型差距盘点-m0-m6-f1-已完成-缺口在-m7-m8-.md) — 对齐 docs/pages.md、roadmap 与 v7/v8 定稿原型后，前端已交付 M0–M6+F1（8/11 立项项），剩余三块全部依赖后端契约。 · `project` · importance 4 · 2026-11-11
- [M7–M9 前端规划对齐（2026-11-11）与落地口径](m_90b09e7a-m7-m9-前端规划对齐-2026-11-11-与落地口径.md) — 前端已按后端 M7/M8/M9 立项完成规划对齐（只改文档）：M7 增量续流+RBAC+审批字段、M8 v8 全量管理台（无契约三页只读）、M9 线性工作流；含 Nginx 续流 location、capabilities.workflows 阻断条件等关键口径。 · `decision` · importance 4 · 2026-11-11
- [M6 前端生产化完成（2026-11-11）](m_947efa91-m6-前端生产化完成-2026-11-11.md) — 前端 M6 已完成并 ff-only 合并进 master（13 提交未推送）：分包体积门禁、生产 mock 双层门禁、SSE 断线重连、诊断抽屉/Web Vitals、Playwright 10 例 + CI 配置、Nginx SSE 对照实测；审查问题已修，并留下一组已知限制。 · `project` · importance 4 · 2026-11-11
- [M5 后端契约实际行为与本地联调环境](m_b64d9bc4-m5-后端契约实际行为与本地联调环境.md) — M5 联调环境：8000 已重启、DB 迁移到 2d8f6a1c3e70、CAPABILITY_SECRET_KEY 已配、dev 账号 admin；事件回放与 approval.required 字段存在缺口。 · `reference` · importance 4 · 2026-11-10
- [M5 审批与安全加固前端完成并真实联调](m_80a61915-m5-审批与安全加固前端完成并真实联调.md) — 2026-11-11 前端 M5 完成：审批事件状态机/审批中心/审计/平台密钥/安全 UX，真实 SSE 白名单曾漏放新事件（已修），本地提交 6922fa6 未推送。 · `project` · importance 4 · 2026-11-10
- [M4 知识库前端完成、联调通过并已快进合并到 master](m_297e13a9-m4-知识库前端完成-联调通过并已快进合并到-master.md) — M4 知识库前端已完成真实联调，并以 ff-only 快进合并进 master，提交未推送，origin/master 仍落后。 · `project` · importance 4 · 2026-11-10
- [agent-hub-web 真实后端联调环境与限流约定](m_25168cdb-agent-hub-web-真实后端联调环境与限流约定.md) — agent-hub-web 真实联调：8000 实例 + Vite 代理、dev server 仅监听 127.0.0.1，各里程碑有冒烟与真实用例脚本；知识库联调需指定 KNOWLEDGE_DIR。 · `reference` · importance 4 · 2026-11-10
- [agent-hub 知识库 M4 后端契约实际行为（前端按此落地，不造端点）](m_af9313d3-agent-hub-知识库-m4-后端契约实际行为-前端按此落地-不造端点.md) — M4 后端上传同步入库返回终态、无单文档重建与分类目录端点、rebuild 的 own 语义与系统文档只读等实际契约行为。 · `reference` · importance 4 · 2026-11-10
- [A2A 能力边界收缩为仅出站，不做入站 Server](m_74289a06-a2a-能力边界收缩为仅出站-不做入站-server.md) — 2026-11-10 用户决策：agent-hub 只做出站 A2A Client，不发布 Agent Card、不提供 JSON-RPC 入站端点；M3 取消，设置页 A2A 分区移除。 · `decision` · importance 4 · 2026-11-10
- [前端路线图编号与后端同名同义，F1/X1/X2 系列；M3 入站已取消](m_4eef4b73-前端路线图编号与后端同名同义-f1-x1-x2-系列-m3-入站已取消.md) — 前端 M 编号与后端 M0–M6 同名同义；M3「A2A 入站」已于 2026-11-10 因「仅出站」需求变更取消，F1/X1/X2 继续承载无后端归属的工作。 · `decision` · importance 4 · 2026-11-10
- [事故善后：活动会话已脱敏，剩余 Key 轮换与其他工作区](m_b5975052-事故善后-活动会话已脱敏-剩余-key-轮换与其他工作区.md) — 活动会话已脱敏并推送；剩余：轮换 4 把 key、清理其他工作区会话、公开历史清理、钩子跨机安装。 · `todo` · importance 4 · 2026-11-09
- [agent-hub-web 的 DSH 会话：脱敏原生 zstd 与工作区快照后随仓库提交](m_54f277cf-agent-hub-web-的-dsh-会话-脱敏原生-zstd-与工作区快照后.md) — 会话快照不整目录忽略，用 scripts/dsh-session-sanitize.mjs 同一规则脱敏原生 zstd 与工作区快照后提交，脚本带并发写保护可在 dsh web 运行时安全处理活动会话。 · `reference` · importance 4 · 2026-11-09
- [agent-hub M1.5/M2 真实字段差异与前端归一化](m_df7d70bd-agent-hub-m1-5-m2-真实字段差异与前端归一化.md) — 真实后端与 contract-delta 草稿的字段差异，以及 M1.5/M2 对齐与后端交接文档位置。 · `reference` · importance 4 · 2026-11-09
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
- [2026-11-16 差异整改执行结果（B 路径，前端+文档）](m_122753b8-2026-11-16-差异整改执行结果-b-路径-前端-文档.md) — agent-hub-web 按 2026-11-13 审计报告执行 B 路径整改：关闭 6 项、部分关闭 4 项、缩范围 4 项、接受 9 项、待后端 6 项、延后 1 项；561 单测/44 E2E/smoke:m8 69 全绿，但 pnpm size 自 M9 起即为红。 · `project` · importance 3 · 2026-11-16
- [2026-11-16 修复标题不生成与重开会话侧栏清空](m_4c453ea7-2026-11-16-修复标题不生成与重开会话侧栏清空.md) — 修复三处：标题前后端默认值对齐并加旧值兼容；历史会话重开时回放 last_run 事件重建运行轨迹；对话结束刷新侧栏改用保留分页的 refresh。477 前端测试与 13 后端集成测试全绿，真实后端验证标题链路通过。 · `decision` · importance 3 · 2026-11-16
- [M9 前端工作流完成（2026-11-12）](m_5e5c2753-m9-前端工作流完成-2026-11-12.md) — 前端 M9 工作流完成：分支 feat/m9-workflow 14 提交未推送未合并，终审通过态，门禁 475 单测/42 E2E/smoke 67 项真实 0 失败；后端 M9 T1-T9 已全部交付。 · `project` · importance 3 · 2026-11-12
- [待补：Docker 恢复后复跑 M7 最终环境验证](m_824089b7-待补-docker-恢复后复跑-m7-最终环境验证.md) — M7 前端已完成本地提交，但最终环境 Docker Desktop 不可用，需在环境恢复后补齐部署与真实联调证据。 · `todo` · importance 3 · 2026-11-11
- [下一步顺序：PA-6 输入栏纠偏待做，最终靠拢等 M7–M9；后端续流已落地](m_d9859b24-下一步顺序-pa-6-输入栏纠偏待做-最终靠拢等-m7-m9-后端续流已落地.md) — F1 与 PA-1 已完成，后端 M7 续流端点与 event 字段已落地、前端 M7 已开工；下一小批为 PA-6 输入栏顺序与工作流 M9 标注，最终靠拢等 M7–M9。 · `todo` · importance 3 · 2026-11-11
- [前端 F1 体验与可访问性完成（2026-11-11，含已知限制）](m_df16db57-前端-f1-体验与可访问性完成-2026-11-11-含已知限制.md) — F1 体验与可访问性已完成，并以 --ff-only 快进合并进 master（含 M7–M9 文档对齐提交），仍未推送 origin。 · `project` · importance 3 · 2026-11-11
- [长列表虚拟滚动选型定 vitrua，弃 vue-virtual-scroller](m_48006ca2-长列表虚拟滚动选型定-vitrua-弃-vue-virtual-scroller.md) — 聊天长会话虚拟滚动选择 virtua（VList），因 vue-virtual-scroller 不支持前置插入锚定、@tanstack/vue-virtual 需自写锚定。 · `decision` · importance 3 · 2026-11-11
- [M1 收尾与 A2A 入站下线：前端已彻底移除 a2a 类型、mock 与设置分区](m_bf11250b-m1-收尾与-a2a-入站下线-前端已彻底移除-a2a-类型-mock-与设置分.md) — 模型/推理选择已随 chat/stream 发送；A2A 入站相关内容在前端仓库整体删除（不只是隐藏门控），文档与架构同步为「仅出站」。 · `project` · importance 3 · 2026-11-10
- [后端 agent-hub 待清理 M3 入站设计](m_f0e95fc7-后端-agent-hub-待清理-m3-入站设计.md) — 前端已按「仅出站」清理完毕；后端仓库仍需取消 M3、标注 a2a.md 入站章节、评估移除 A2A_ENABLED/Card 配置与 system/info.a2a。 · `todo` · importance 3 · 2026-11-10
- [后端仓库 agent-hub 的 docs/roadmap.md M1/M2 勾选仍滞后，需单独同步](m_626d77c1-后端仓库-agent-hub-的-docs-roadmap-md-m1-m2-勾.md) — agent-hub-web 侧文档已收尾，但后端仓库 roadmap 的 M1/M2 完成勾选尚未更新，需在后端仓库单独提交同步。 · `todo` · importance 3 · 2026-11-10
- [agent-hub-web 的 DSH 会话脱敏钩子与脚本行为约定](m_fd58cf40-agent-hub-web-的-dsh-会话脱敏钩子与脚本行为约定.md) — 脱敏钩子只在提交前拦截、不自动改写；脚本以 stat 一致性校验保证活动会话可安全脱敏。 · `reference` · importance 3 · 2026-11-09
- [agent-hub-web 公开仓库推送：沙箱无 HTTPS 凭据，改用 SSH remote](m_1108af97-agent-hub-web-公开仓库推送-沙箱无-https-凭据-改用-ssh.md) — agent-hub-web 是 public 仓库，Agent 沙箱内没有 HTTPS git 凭据助手，push 需用 SSH 地址而非 https。 · `reference` · importance 3 · 2026-11-09
- [master 迁移采用 ff-only 快进合并，保留 14 个 M1 提交历史](m_35ab530a-master-迁移采用-ff-only-快进合并-保留-14-个-m1-提交历史.md) — 把 feat/m1-chat-workbench 迁到 master 时选择快进合并而非 squash/rebase，完整保留提交历史，推送由用户自己完成。 · `decision` · importance 3 · 2026-11-09
- [本机没有 Chromium，HTML 原型只能做静态校验，需用户自己在浏览器看渲染](m_5d920272-本机没有-chromium-html-原型只能做静态校验-需用户自己在浏览器看渲.md) — 该开发机未安装 Chromium，无法对生成的 HTML 原型截图做像素级检查，只能做标签配对/重复 id/CSS 括号/JS 语法/DOM id 引用等静态校验，并把实际渲染确认交给用户在浏览器打开。 · `reference` · importance 3 · 2026-11-09
- [待用户拍板：交接包 D1–D8 八项决策](m_d505a964-待用户拍板-交接包-d1-d8-八项决策.md) — 后端交接包遗留 8 项决策待用户拍板，其中 D1/D2/D7/D8 直接影响表结构与里程碑，需在 M1 编码前定。 · `todo` · importance 3 · 2026-11-08
- [A2A 远程委派只经 send_message 工具，per-skill 包装工具非必需](m_c8947c89-a2a-远程委派只经-send-message-工具-per-skill-包装工.md) — A2A 主智能体调用远程智能体走统一 send_message(agent, task, context)，按 skill 生成的 agent_<slug>__<skill_id> 包装工具并非协议所需，也不应暴露到界面。 · `reference` · importance 3 · 2026-11-08
- [agent-hub-web 定位与 UI 原型约定（调度台 Dispatch Desk）](m_07916c67-agent-hub-web-定位与-ui-原型约定-调度台-dispatch-d.md) — agent-hub-web 以 docs/prototypes/ 单文件 HTML 分版本迭代；v7 含工作流管理、+ 输入菜单、模型/推理等级、智能体卡片、任务结果、流式返回与运行轨迹。 · `project` · importance 3 · 2026-11-05
