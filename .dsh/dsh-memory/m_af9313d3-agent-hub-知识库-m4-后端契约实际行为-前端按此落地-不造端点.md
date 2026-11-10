---
id: "m_af9313d3"
title: "agent-hub 知识库 M4 后端契约实际行为（前端按此落地，不造端点）"
summary: "M4 后端上传同步入库返回终态、无单文档重建与分类目录端点、rebuild 的 own 语义与系统文档只读等实际契约行为。"
kind: "reference"
importance: 4
tags: ["knowledge","api-contract","backend","m4"]
pinned: false
status: "active"
created: "2026-11-10T14:45:58.986Z"
modified: "2026-11-10T14:45:58.986Z"
revision: 1
origin: "auto"
sessionId: "session-c67717f4-a7ae-4576-b6fb-cc26506a66d5"
sessionTitle: "前端M4开发对接"
model: "deepseek-official/deepseek-flash"
---

agent-hub 后端 M4 知识库的实际契约行为（前端已按这些实现，后续不要假设不存在的端点/进度）：
- 上传是同步入库并直接返回终态（201 新建 / 200 已存在，超限 413、扩展名 422、scope=system 403）；没有真实异步进度，轮询只对脚本导入/重建产生的 pending/indexing 有意义，不要做假进度条。
- 没有「单文档重建」端点，只有失败重试 POST /knowledge/documents/{id}/retry（后端实际不限制原状态，可用它承载「重建此文档」）；另有管理员 rebuild(scope)。
- 没有分类目录端点，分类候选只能来自可见文档聚合去重 + 手输。
- rebuild(scope=own) 指所有用户的私有文档，不是管理员本人的文档；系统文档（owner=null）对普通用户只读。
- 检索不可用返回 503 service_unavailable，能力关闭返回 403 capability_disabled，需要与空结果区分提示。
- 后端交付报告位置：/home/zhaodan/work/PythonProjects/agent-hub/docs/feedback/2026-11-10-m4-backend-report.md；后端 M4 无单文档重建、无分类目录是其设计选择，前端不应自造契约。
