---
id: "m_54f277cf"
title: "agent-hub-web 的 DSH 会话：脱敏原生 zstd 与工作区快照后随仓库提交"
summary: "会话快照不整目录忽略，而是用 scripts/dsh-session-sanitize.mjs 把原生 zstd 与工作区快照用同一规则脱敏后再提交（两边文本必须逐字节一致，否则插件判分叉）。"
kind: "reference"
importance: 4
tags: ["git","dsh","secret","sanitize"]
pinned: false
status: "active"
created: "2026-11-09T09:38:34.997Z"
modified: "2026-11-09T16:53:45.705Z"
revision: 6
origin: "auto"
sessionId: "session-c29c921a-6883-41cb-8c3d-3cbdb19b0660"
sessionTitle: "Git泄露API密钥导致推送失败"
model: "deepseek-official/deepseek-flash"
---

决策：agent-hub-web 不把会话目录整块忽略，而是去掉敏感值后随仓库提交，保留会话的可用性与历史价值。

机制（dsh-workspace-session）：`~/.dsh/sessions/<slug>/<id>/session.v4.jsonl.zstd` 是运行时真源，append-only（header 帧 + 每批事件一个 zstd 帧，每次 append 重新 open('a')）；`<workspace>/.dsh/sessions/<id>/session.v4.jsonl` 只是随 git 的纯文本镜像。导入时逐事件比较规范化文本（comparableEvents），完全一致才跳过；只洗一边会判 diverged，备份两边并把远端分支重建为新会话 id，凭空多出重复会话。启动/轮询/每轮 flush 都会从原生重新导出，所以必须先洗原生再洗快照，且两边用同一套规则替换保证文本逐字节相等。

工具：scripts/dsh-session-sanitize.mjs（纯 Node ≥22.15，无依赖）。处理三类文件：原生 .zstd（逐帧解压→替换→带校验和重压，保留帧边界）、工作区 session.v4.jsonl、冲突备份 .backup/native.jsonl。规则：sk-*、ZAI `[0-9a-f]{32}.[A-Za-z0-9]{16}`、ghp_*、AKIA*、AIza*、xox* → `[REDACTED:<KIND>]`。安全：写前逐行 JSON.parse、seq 连续校验、替换幂等、先备份再临时文件 rename 原子替换。模式：默认只扫描、--apply 就地脱敏、--check 命中退出 1、--staged 只查暂存 blob、--current-workspace/--exclude-id 限范围。npm scripts：pnpm sessions:scan / sessions:sanitize / sessions:check。

限制：正在被 DSH 追加写入的活动会话不能改（会丢事件、seq 断档），必须等该会话不再产生新事件后再洗。

.gitignore 只保留插件要求的机器本地项：.dsh/workspace-session.json、.dsh/sessions/**/session.lock、*.tmp、.dsh/sessions/.backup/。

预提交钩子 .git/hooks/pre-commit 只装在本机、不进版本库（换机器或重新 clone 需重装），发现暂存快照含密钥就拒绝提交。
