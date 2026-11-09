---
id: "m_1108af97"
title: "agent-hub-web 公开仓库推送：沙箱无 HTTPS 凭据，改用 SSH remote"
summary: "agent-hub-web 是 public 仓库，Agent 沙箱内没有 HTTPS git 凭据助手，push 需用 SSH 地址而非 https。"
kind: "reference"
importance: 3
tags: ["git","ssh","agent-hub-web","sandbox"]
pinned: false
status: "active"
created: "2026-11-09T16:34:50.982Z"
modified: "2026-11-09T16:34:50.982Z"
revision: 1
origin: "auto"
sessionId: "session-c29c921a-6883-41cb-8c3d-3cbdb19b0660"
sessionTitle: "Git泄露API密钥导致推送失败"
model: "deepseek-official/deepseek-flash"
---

仓库 `https://github.com/notsocold/agent-hub-web` 是公开仓库（匿名 HTTP 200 可确认），因此任何含密钥的提交都会被服务端 push protection 拦截。

Agent 沙箱里 `git push` 用 https remote 会报 `could not read Username for 'https://github.com'`（没有 credential helper），这不是密钥或认证配置问题；改用 `git push git@github.com:notsocold/agent-hub-web.git master`（已注册的 SSH key）即可成功。用户在自己终端看到的原始报错可能不同（多为 GH013 secret 提示）。
