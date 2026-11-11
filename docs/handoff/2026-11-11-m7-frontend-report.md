# M7 前端契约适配交付报告（2026-11-11）

- 范围：前端 M7「契约补齐与安全收口」全量适配（M7-F1 至 M7-F8）
- 后端基线：`agent-hub` M7（`6ba7cff feat: approval.required 事件补齐审批卡字段（M7 Task 4）` 及之前的 Task 1–4）
- 后端依据：
  - `agent-hub/app/modules/chat/router.py` 的 `GET /runs/{run_id}/stream`
  - `agent-hub/app/modules/chat/schemas.py` 的 `RunEventOut.event`
  - `agent-hub/app/core/deps.py` 的 `require_admin`（403 `forbidden` + `details.required_role`）
- 前端规划：[对齐设计](../superpowers/specs/2026-11-11-m7-m9-frontend-alignment-design.md) §3、[实施计划](../superpowers/plans/2026-11-11-m7-frontend-contract.md)
- 分支：`feat/m7-frontend-contract`（本地提交，未推送）

## 1. 一句话结论

前端已消费后端 M7 全部能力：断线从 `lastSeq` **续流优先**（回放已落库事件 + 实时增量，400/404/失败回退轮询）、事件回放 `event` 驱动 reducer 补卡、agents/tasks 写入口按管理员显隐、审批 5 字段与脱敏预览、A2A 授权链接白名单容错、登录 401 与 403/503 文案收口、Nginx 续流 location。`smoke:m7` 48 项与 `test:real` M7 5 例在真实后端通过；全量 `pnpm test` 317 例、`pnpm e2e` 28 例全绿。

## 2. 后端 M7 实际契约（已核实）

| 契约 | 实际行为 |
|---|---|
| `RunEventOut.event` | 原始 SSE 事件名；未知时为空串；`payload` 剔除 `_event`；`payload` 内含 `seq` |
| `GET /runs/{id}/stream?after_seq=N` | GET + Bearer；`text/event-stream`；`id: seq` / `event` / `data`；先回放 `seq > N` 再跟随实时；`X-Run-ID` 响应头；终态后关闭；`interrupted` 保持连接；400 `replay_too_large`（>1000 条）；404 不泄露存在性；15s `: ping`；进程内单实例 |
| agents 写接口 | `POST /agents`、`PATCH/DELETE /agents/{id}`、`refresh`、`health` 均为 `AdminUser`；读接口与 `/agents/preview` 保持登录用户 |
| tasks 动作接口 | `cancel` / `resume` / `authorize` / `reject` 均为 `AdminUser`；读接口保持登录用户 |
| 403 | `code=forbidden`、`details.required_role="admin"`、后端审计 `security.rbac_denied` |
| `approval.required` | 新增 `tool_display_name` / `executor` / `target` / `side_effect` / `payload_preview` |
| A2A `authorization_url` | 非法/内网/超长置 `null`；前端无链接时提示不可用 |

## 3. 前端实现映射

| 能力 | 实现 |
|---|---|
| M7-F1 续流 | `src/api/runs.ts` 新增 `runsApi.stream(runId, afterSeq, handlers)`（`fetch-event-source` GET + Bearer + 401 单飞重试）；`src/stores/chat.ts` 的 `performReconnect` 改为续流优先，400/404/失败分别降级 |
| M7-F2 事件回放 | `src/types/run.ts` `RunEvent.event`；`src/stores/chat-reducer.ts` `eventNameOfRunEvent`；`src/stores/chat.ts` `replayPersistedEvents`（分页回放、`seq` 去重、空事件名跳过）；`RunTracePanel` 展示事件名 |
| M7-F3 权限边界 | `src/stores/auth.ts` `isAdmin`；`AgentsView` / `AgentDetailDrawer` / `TasksView` / `TaskDetailDrawer` 写入口按角色渲染；`SettingsView` 复用 `isAdmin` |
| M7-F4 审批字段 | `ApprovalCard` 优先渲染事件 5 字段；无 `payload` 时用 `payload_preview`（字符串级脱敏）；两者皆无提示「参数预览不可用」 |
| M7-F5 授权链接 | `src/components/tasks/authorizationUrl.ts` `isSafeAuthorizationUrl`；`TaskDetailDrawer` 无安全链接时提示「授权链接不可用，请联系管理员」且不渲染按钮 |
| M7-F6 文案 | `src/api/client.ts`：登录/注册 401 不进 refresh、直接展示后端文案；403 `forbidden` 统一「当前账号无管理员权限」；503 统一「服务暂不可用，请稍后重试」 |
| M7-F7 契约/mock | `src/api/mock/stream.ts` `mockRunStream`；`mockDb` 新增 `appendRunEvent` / `subscribeRunEvents` / `onRunTerminal` / `waitRunTerminal` / `upsertRun` / `setRunStatus`；mock 聊天事件落库（delta 不落库），fixtures 补 `event`；新增续流/回放/降级单测 |
| M7-F8 部署 | `deploy/nginx.conf` 新增 `location ~ ^/api/v1/runs/[0-9a-fA-F-]+/stream$`（`proxy_buffering off` / `proxy_cache off` / `gzip off` / 3600s 读写超时 / `Connection ""`）；`verify-nginx-sse.mjs --check-deploy` 增加 7 项静态断言与 `/api/` 不得 `^~` 检查；`deploy/README.md` 同步 |
| 真实联调 | `scripts/smoke-m7-backend.mjs`（48 项）、`scripts/real-m7.spec.ts`（5 例，已加入 `vitest.real.config.ts`） |

## 4. 验证证据（2026-11-11 实测）

| 检查 | 结果 |
|---|---|
| `pnpm test` | 58 文件 / 317 例通过 |
| `pnpm type-check` | 通过 |
| `pnpm lint` | oxlint + eslint 0 error |
| `pnpm build` | 通过（1.9s） |
| `pnpm size` | JS 总 gzip 377.1 KB（上限 420）、CSS 38.2 KB（上限 60），通过 |
| `pnpm e2e` | 28 passed（含 a11y 扫描；轨迹滚动区已加 `tabindex` 修复 `scrollable-region-focusable`） |
| `pnpm verify:nginx -- --check-deploy` | exit 0；续流 location 7 项指令齐全；完整 `verify:nginx` 对照实测 exit 0 |
| `pnpm smoke:m7` | 48 项通过：登录 → 创建 run（LLM 占位下 `llm_error`，事件仍落库）→ events `event` 字段 → 续流回放 5 帧 seq 严格递增 + 终态关闭 → `after_seq` 无重复 → 普通用户写 agents 403 + `required_role` → 普通用户读 200 |
| `pnpm test:real` | M7 5 例、M5 3 例通过；`real-m4` 上传入库与 `real-backend` 聊天用例因本机 embedding/LLM key 限制失败（环境性，非 M7 回归） |

真实联调命令（后端 8000 由本机 `.venv/bin/python -m uvicorn app.main:app` 启动）：

```bash
node scripts/smoke-m7-backend.mjs
pnpm test:real   # vitest.real.config.ts 已包含 scripts/real-m7.spec.ts
```

## 5. 行为变更（需要知晓）

1. **重连语义变化**：M6 断线重连会重发 `POST /chat/stream`（同一 `client_message_id` 幂等）；M7 起改为 `GET /runs/{id}/stream?after_seq=lastSeq`，不再重发消息、不再新建 run。
2. **普通用户写入口消失**：M7 前普通用户可调用 agents/tasks 写接口（前端只是隐藏入口），后端 M7 后统一 403；前端改为不渲染入口（含两个详情抽屉），并补了「入口不可见 + 直接调用 403」两层回归。
3. **登录 401 文案**：不再进入 refresh 流程，密码错误直接显示后端「邮箱或密码错误」。
4. **403/503 文案集中收敛**：`apiErrorFromResponse` 统一覆写，页面无需各自判断。
5. **审批卡**：有事件字段时不再依赖详情请求；`payload_preview` 是脱敏预览，完整 payload 仍可展开。

## 6. 未做项与限制

- **逐字续传不承诺**：`message.delta` 不落库，断线窗口内文本由终态 `refreshHistory()` 补齐；这是后端 M7 非目标。
- **真实长流证据受限**：本机 `LLM_API_KEY` 为占位，聊天 run 以 `llm_error` 结束；续流证据覆盖「回放 + 终态关闭 + after_seq 去重」，未覆盖「真实增量 delta 续流」。
- **Nginx 未在生产端口端到端验证**：`deploy/nginx.conf` 做了容器内 `nginx -t` 与静态断言；`verify:nginx` 完整对照实测验证的是「逐帧 vs 缓冲」语义，不覆盖真实续流 + Bearer。
- **多实例**：续流依赖后端进程内事件总线，前端不做跨实例假设。
- **E2E 仍只跑 mock 构建**：续流状态机证据在 store 单测与 `test:real`，Playwright 未新增断线续流用例。
- **本次未推送远端、未删除分支**（按用户偏好留给用户）。

## 7. 相关文档

- [路线图](../roadmap.md) M7
- [API 对接 §12.5 / §13](../api.md)
- [架构：SSE 设计](../architecture.md)
- [页面规划：对话页/智能体页/任务页](../pages.md)
- [M7–M9 对齐交接](2026-11-11-m7-m9-alignment.md)
