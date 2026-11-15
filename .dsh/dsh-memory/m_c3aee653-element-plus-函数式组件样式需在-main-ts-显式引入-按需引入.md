---
id: "m_c3aee653"
title: "Element Plus 函数式组件样式需在 main.ts 显式引入（按需引入下的坑）"
summary: "unplugin-vue-components 只给模板中出现的组件注入样式，脚本里直接调用的 ElMessageBox/ElMessage 必须在 src/main.ts 显式引入对应 style/css，否则弹窗无样式、按钮几乎点不到。"
kind: "project"
importance: 4
tags: ["element-plus","按需引入","unplugin-vue-components","样式","e2e回归"]
pinned: false
status: "active"
created: "2026-11-12T02:20:07.598Z"
modified: "2026-11-12T02:20:07.598Z"
revision: 1
origin: "auto"
sessionId: "session-d551e5da-0010-4b43-8b49-b203b575ffbe"
sessionTitle: "查询管理员账号"
model: "deepseek-official/deepseek-flash"
---

背景：agent-hub-web 用 unplugin-vue-components 按需引入 Element Plus，main.ts 原先只引入了 dark/css-vars.css。

问题（已复现并修复）：ElMessageBox、ElMessage 这类在 <script> 中 import 后调用的函数式组件不经过模板解析，插件不会为其注入样式，导致 el-message-box.css 从未加载——退出登录确认弹窗平铺在页面顶部（无遮罩、宽满屏）、「取消/退出」按钮仅约 17×21px 无法点击。31 个文件里的 ElMessage 轻提示同样受影响，只是短暂显示不易察觉。

修复约定：在 src/main.ts 显式补上函数式组件样式（不会引入全量 CSS，只增几 KB）：
import 'element-plus/es/components/message-box/style/css'
import 'element-plus/es/components/message/style/css'

注意：message-box 的 style/css 入口会自动带上 button/overlay/input 依赖样式。今后若新增 ElNotification、ElLoading 等函数式组件，同样需要在入口手动补样式。

验证方式：e2e/auth.spec.ts 中有回归用例锁定弹窗约 420px 宽、遮罩覆盖整个视口、按钮尺寸正常且「取消」可关闭。
