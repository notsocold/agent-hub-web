---
id: "m_5d920272"
title: "本机没有 Chromium，HTML 原型只能做静态校验，需用户自己在浏览器看渲染"
summary: "该开发机未安装 Chromium，无法对生成的 HTML 原型截图做像素级检查，只能做标签配对/重复 id/CSS 括号/JS 语法/DOM id 引用等静态校验，并把实际渲染确认交给用户在浏览器打开。"
kind: "reference"
importance: 3
tags: ["environment","chromium","html-prototype","verification"]
pinned: false
status: "active"
created: "2026-11-05T15:59:46.609Z"
modified: "2026-11-05T15:59:46.609Z"
revision: 1
origin: "auto"
sessionId: "session-251bc05a-32c8-4daf-a6c1-b8a9a4073a9f"
sessionTitle: "设计项目前端界面初版"
model: "deepseek-official/deepseek-flash"
---

在生成单文件 HTML 原型后，不要期待自己能截图或做像素级视觉验证：本机没有 Chromium，也没有可用的无头浏览器。可做的自检限于静态层面——HTML 标签配对、重复 id、CSS 括号、JS 语法，以及脚本引用的 DOM id 是否都存在。结论里应明确说明未做视觉验证，并请用户直接在浏览器打开文件查看实际渲染效果，再据此提调整意见。
