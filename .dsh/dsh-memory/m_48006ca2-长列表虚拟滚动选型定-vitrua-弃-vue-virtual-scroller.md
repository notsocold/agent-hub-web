---
id: "m_48006ca2"
title: "长列表虚拟滚动选型定 vitrua，弃 vue-virtual-scroller"
summary: "聊天长会话虚拟滚动选择 virtua（VList），因 vue-virtual-scroller 不支持前置插入锚定、@tanstack/vue-virtual 需自写锚定。"
kind: "decision"
importance: 3
tags: ["虚拟滚动","选型","virtua","F1"]
pinned: false
status: "active"
created: "2026-11-11T08:17:50.536Z"
modified: "2026-11-11T08:17:50.536Z"
revision: 1
origin: "auto"
sessionId: "session-eb19e2c2-e3f7-41e6-8aad-3da15cb44ac1"
sessionTitle: "M6完成后的前端开发"
model: "deepseek-official/deepseek-flash"
---

2026-11-11 决策：F1 长会话虚拟滚动采用 virtua（VList 组件式接入，0.54.2，约 4.7 KB gzip），而非 vue-virtual-scroller 或 @tanstack/vue-virtual。

理由：vue-virtual-scroller 3.0.5 虽仍在维护（10.8k stars、周下载约 79 万），但明确不支持「前置插入的滚动锚定」——加载更早消息时需手写 scrollHeight 差值补偿，且无限加载/键盘导航/ARIA 全需自写，DynamicScroller 有空白行问题反馈；@tanstack/vue-virtual 生态最大但 headless，动态高度需 measureElement、锚定也要自写；virtua 周下载约 162 万、动态高度内置，其 shift prop 文档明确定位为「反向无限滚动时在列表头部插入条目」，正好命中聊天历史加载场景。自研不在选项内（动态测量、前置锚定、流式增高均为成熟库已解决问题）。

注意：virtua 的滚动与尺寸事件是 emits 而非 props，且根元素自带 height:100%，接入时组件结构需据此调整。
