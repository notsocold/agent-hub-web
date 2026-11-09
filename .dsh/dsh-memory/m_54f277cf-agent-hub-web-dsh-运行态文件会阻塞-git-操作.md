---
id: "m_54f277cf"
title: "agent-hub-web 的 DSH 会话：脱敏原生 zstd 与工作区快照后随仓库提交"
summary: "会话快照不整目录忽略，用 scripts/dsh-session-sanitize.mjs 同一规则脱敏原生 zstd 与工作区快照后提交，脚本带并发写保护可在 dsh web 运行时安全处理活动会话。"
kind: "reference"
importance: 4
tags: ["dsh","session","sanitize","git-hook","security"]
pinned: false
status: "active"
created: "2026-11-09T09:38:34.997Z"
modified: "2026-11-09T16:58:17.610Z"
revision: 7
origin: "auto"
sessionId: "session-c29c921a-6883-41cb-8c3d-3cbdb19b0660"
sessionTitle: "Git泄露API密钥导致推送失败"
model: "deepseek-official/deepseek-flash"
---

DSH 会话快照不整目录忽略，而是用 scripts/dsh-session-sanitize.mjs 把原生 zstd 日志与工作区 .dsh/sessions 快照按同一规则脱敏后再提交；两边文本必须逐字节一致，否则插件判分叉。

写入前脚本会重新 stat 比对 size+mtime：一致才原子替换，若被并发追加则中止并提示重试，绝不覆盖。因此现在可以在 dsh web 运行、会话正在写入时脱敏活动会话，不必先停服。

常用命令：`pnpm sessions:sanitize`（原生+快照一起脱敏）、`pnpm sessions:scan`（只扫描）、`node scripts/dsh-session-sanitize.mjs --staged`（pre-commit 钩子用）、`--current-workspace --apply`。

pre-commit 钩子只拦不自动改，因为自动改工作区快照会让插件判分叉；且钩子只装在本地 .git/hooks/pre-commit（不进版本库），换机器 clone 后需重新安装，或提交前手动跑一次 pnpm sessions:scan。

原生日志比工作区快照多出几条本 turn 事件属正常：插件会判 native-ahead 并跳过导入，不产生重复会话。
