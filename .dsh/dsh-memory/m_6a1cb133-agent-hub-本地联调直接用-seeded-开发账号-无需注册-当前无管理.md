---
id: "m_6a1cb133"
title: "agent-hub 本地联调直接用 seeded 开发账号，无需注册；当前无管理端接口"
summary: "后端 scripts/seed_dev_account.py 幂等维护一个开发账号（dev@example.com），注册有 5 次/小时/IP 限流且不会自动提权；库中账号全为 user，/api/v1/admin/* 实测 404，admin 角色目前只影响设置页角色标签。"
kind: "reference"
importance: 4
tags: ["agent-hub","dev-account","seed","admin","权限","联调"]
pinned: false
status: "active"
created: "2026-11-09T14:32:38.713Z"
modified: "2026-11-09T14:32:38.713Z"
revision: 1
origin: "auto"
sessionId: "session-9d7d823e-57de-441c-a9c4-88a94b7b3280"
sessionTitle: "启动后端并验证测试项目"
model: "deepseek-official/deepseek-flash"
---

agent-hub 联调账号与管理员能力边界（实测结论）：

1. 不要走注册流程：/auth/register 默认 5 次/小时/IP，容易把自己锁住，且注册不验证邮箱、不会自动提权。
2. 固定开发账号来自后端仓库 scripts/seed_dev_account.py（幂等创建/重置，显示名「本地开发账号」，role=user），直接用它与 smoke:real / test:real 的 SMOKE_* / REAL_TEST_* 环境变量对接；密码若被重置，重跑该脚本即可恢复。
3. 数据库里已有 7 个账号（含 dev、个人账号，以及若干 e2e/smoke/store 自动化遗留账号），全部为 user，没有 admin。
4. 后端目前没有管理端能力：/api/v1/admin/users、/admin/skills、/admin/settings/instruction 实测均 404，属 M5+ 规划；前端 M1 路由只有 chat/workflows/agents/tasks/knowledge/settings，无管理端页面。管理端 UI 仅是独立静态原型 docs/prototypes/ui-v8-admin.html，不连后端、不需要登录。
5. 提权只能由运维脚本显式授予（后端 scripts/grant_admin.py <email>，或 seed_dev_account.py --admin 但会重置密码；--revoke 撤销）。副作用：提权不会产生 /admin/* 接口；前端登录时缓存用户信息，需退出重登或刷新 /auth/me 才能看到角色变化；该操作直接改共享开发库的 users.role。
6. 所以验证 M1 对话链路（发消息、SSE 流式、停止、审批、历史会话）不需要 admin 账号；只有在确认「设置页账户角色标签显示管理员」或为 M5 预置账号时才需要提权。
