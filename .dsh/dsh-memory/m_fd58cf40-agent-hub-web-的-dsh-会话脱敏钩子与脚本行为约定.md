---
id: "m_fd58cf40"
title: "agent-hub-web 的 DSH 会话脱敏钩子与脚本行为约定"
summary: "脱敏钩子只在提交前拦截、不自动改写；脚本以 stat 一致性校验保证活动会话可安全脱敏。"
kind: "reference"
importance: 3
tags: ["dsh","git-hook","sanitize","convention"]
pinned: false
status: "active"
created: "2026-11-09T16:58:17.611Z"
modified: "2026-11-09T16:58:17.611Z"
revision: 1
origin: "auto"
sessionId: "session-c29c921a-6883-41cb-8c3d-3cbdb19b0660"
sessionTitle: "Git泄露API密钥导致推送失败"
model: "deepseek-official/deepseek-flash"
---

agent-hub-web 的 DSH 会话密钥防泄漏机制约定：

- pre-commit 钩子只做拦截与提示，不自动修复暂存区/工作区内容。原因是自动改写工作区快照会让 DSH 插件判定原生日志与快照分叉。
- 拦截报错会指出具体文件与命中计数，并给出修复命令；按提示跑脱敏脚本 + 重新 git add 即可通过。
- 脱敏脚本写入前重新 stat 比对 size+mtime，一致才原子替换，检测到并发追加就中止并提示重试，因此活动会话无需停 dsh web 也能处理。
- 钩子装在本地 .git/hooks/，不随仓库分发；新机器需重装或手动扫描。
- 脱敏后需保持原生 zstd 与工作区快照文本逐字节一致，前缀差异（native-ahead）属正常。
