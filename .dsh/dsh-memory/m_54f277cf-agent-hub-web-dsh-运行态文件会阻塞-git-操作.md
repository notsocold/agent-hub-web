---
id: "m_54f277cf"
title: "agent-hub-web：DSH 运行态已加入 .gitignore 并移出索引"
summary: "DSH 持续写入的 .dsh/sessions/ 与 .dsh/workspace-session.json 已加入 .gitignore 并从版本库移除，本地文件保留。"
kind: "project"
importance: 3
tags: ["git","gitignore","dsh","repo-hygiene"]
pinned: false
status: "active"
created: "2026-11-09T09:38:34.997Z"
modified: "2026-11-09T09:40:53.099Z"
revision: 2
origin: "auto"
sessionId: "session-3dd9b518-0168-415b-908a-d84b48bf2f72"
sessionTitle: "迁移开发分支变更到master"
model: "deepseek-official/deepseek-flash"
---

DSH 会持续写入被跟踪的 .dsh 运行态文件，曾导致工作区变脏、阻塞快进合并和 stash pop。现已把 .dsh/sessions/ 与 .dsh/workspace-session.json 加入 .gitignore 并 git rm --cached（本地文件保留在磁盘），.pnpm-store/ 的忽略规则此前已存在于 .gitignore，无需重复添加。注意：.dsh/dsh-memory/（MEMORY.md 与 m_*.md 记忆文件）仍保持被跟踪状态，是入库还是同样视为本地数据忽略，尚待用户决定。
