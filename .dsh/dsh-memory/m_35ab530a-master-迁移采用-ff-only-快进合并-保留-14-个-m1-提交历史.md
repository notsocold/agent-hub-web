---
id: "m_35ab530a"
title: "master 迁移采用 ff-only 快进合并，保留 14 个 M1 提交历史"
summary: "把 feat/m1-chat-workbench 迁到 master 时选择快进合并而非 squash/rebase，完整保留提交历史，推送由用户自己完成。"
kind: "decision"
importance: 3
tags: ["git","branch","workflow","m1"]
pinned: false
status: "active"
created: "2026-11-09T09:38:35.001Z"
modified: "2026-11-09T09:38:35.001Z"
revision: 1
origin: "auto"
sessionId: "session-3dd9b518-0168-415b-908a-d84b48bf2f72"
sessionTitle: "迁移开发分支变更到master"
model: "deepseek-official/deepseek-flash"
---

迁移 feat/m1-chat-workbench 到 master 时，因 master 是 feat 的直系祖先（无分叉），采用 `git merge --ff-only` 快进，而不是 squash 或 rebase。理由：要求「迁移变更」而不是重写历史，14 个 M1 提交的完整历史更利于回溯。
相关约定：
- 不可逆操作前先做备份（stash 导出为 patch、旧版未跟踪文件另存 /tmp）。
- 冲突的旧 `src/components.d.ts`（自动生成的声明文件，与分支版本不一致）会阻止快进，做法是备份后删除，让分支版本落盘。
- 合并后 feat 分支保留未删；`git push` 与后续提交由用户自己执行，助手不推送。
