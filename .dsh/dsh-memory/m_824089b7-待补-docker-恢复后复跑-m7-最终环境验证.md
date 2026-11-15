---
id: "m_824089b7"
title: "待补：Docker 恢复后复跑 M7 最终环境验证"
summary: "M7 前端已完成本地提交，但最终环境 Docker Desktop 不可用，需在环境恢复后补齐部署与真实联调证据。"
kind: "todo"
importance: 3
tags: ["todo","m7","验证","部署"]
pinned: false
status: "active"
created: "2026-11-11T13:01:32.020Z"
modified: "2026-11-11T13:01:32.020Z"
revision: 1
origin: "auto"
sessionId: "session-297bd4d4-aec9-4629-b03b-f999892cb6c8"
sessionTitle: "继续开发项目"
model: "deepseek-official/deepseek-flash"
---

待办：
1) Docker/后端恢复后复跑 pnpm verify:nginx -- --check-deploy（nginx -t 与完整 verify:nginx）、pnpm smoke:m7、pnpm test:real，补齐最终环境证据（此前曾实测通过，最终环境仅 --static-only 通过）。
2) 决定是否合并 feat/m7-frontend-contract 到 master；按用户偏好只本地提交，不推送远端、不删分支。
3) M8 前端等后端 M8 契约冻结后再启动。
