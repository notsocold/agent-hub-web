---
id: "m_54f277cf"
title: "agent-hub-web（公开仓库）的 DSH 会话数据绝不能入库"
summary: "密钥泄露事故根因是 DSH 会话快照插件只忽略 lock/tmp/backup 而不忽略 session.v4.jsonl，现已整目录忽略并从索引移除，但公共历史里的旧快照未清理。"
kind: "reference"
importance: 5
tags: ["security","git","dsh","sessions","gitignore"]
pinned: false
status: "active"
created: "2026-11-09T09:38:34.997Z"
modified: "2026-11-09T16:34:50.978Z"
revision: 4
origin: "auto"
sessionId: "session-c29c921a-6883-41cb-8c3d-3cbdb19b0660"
sessionTitle: "Git泄露API密钥导致推送失败"
model: "deepseek-official/deepseek-flash"
---

事故：某次对话读取了后端项目 `.env` 与 `~/.dsh/credentials.yaml`，明文 Key 被写进 `.dsh/sessions/*/session.v4.jsonl`，随 M2 提交进 git。仓库 `https://github.com/notsocold/agent-hub-web` 是 public，GitHub secret scanning push protection 在服务端拒收（GH013），push 一直失败。

根因：DSH 的 `@local/dsh-workspace-session` 插件（`~/.dsh/profiles/web/node_modules/@local/dsh-workspace-session/lib/gitignore.js`）设计上认为快照应随仓库走，只追加 4 条忽略：`.dsh/workspace-session.json`、`.dsh/sessions/**/session.lock`、`.dsh/sessions/**/*.tmp`、`.dsh/sessions/.backup/`；`session.v4.jsonl` 本身不在列表里，`git add -A` 就会把整段对话带走。插件启动时会幂等补回这 4 行，因此该追加要单独提交，否则工作区一直显示 `M .gitignore`。

已落地修复：`.gitignore` 增加 `.dsh/sessions/` 与 `.dsh/workspace-session.json` 整目录忽略；`git rm -r --cached .dsh/sessions`（本地文件保留，DSH 正常读写）；`git commit --amend` 重写从未推送成功的 M2 提交（哈希变化，其余代码改动原样保留）；用 SSH 推送成功。

现状与遗留：泄露的两个 blob 只存在于被改写的本地提交，未推上 GitHub；但已公开的 `2fa3678` 及更早提交里仍有 7 个旧 `session.v4.jsonl`（扫过只有变量名文字、无明显真实密钥），未做 `git filter-repo --path .dsh/sessions --invert-paths` + force push，因为那是改写公共历史，需用户拍板。

注意：不要手工把 `session.v4.jsonl` 里的密钥改成 `<REDACTED>`——DSH 会从 `.backup/native.jsonl` 把快照恢复回去；要彻底清除必须先停掉 dsh web，再同时处理 v4 快照与 `.backup/native.jsonl`，或直接删除对应旧会话。
