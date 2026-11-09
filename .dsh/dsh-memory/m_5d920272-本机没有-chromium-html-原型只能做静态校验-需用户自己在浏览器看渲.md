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
modified: "2026-11-09T09:14:30.126Z"
revision: 2
origin: "auto"
sessionId: "session-c69a987f-0c45-4775-8970-00ebd96503d7"
sessionTitle: "开始实现本项目"
model: "deepseek-official/deepseek-flash"
---

该开发机未安装 Chromium，无法对生成的 HTML 原型/Vue 页面截图做像素级检查，只能做标签配对/重复 id/CSS 括号/JS 语法/DOM id 引用等静态校验，实际渲染确认交给用户在浏览器打开。已向用户提议安装 Playwright + Chromium 以便逐页截图与原型比对，等用户批准后执行。
