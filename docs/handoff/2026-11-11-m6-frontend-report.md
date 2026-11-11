# M6 前端生产化交付报告（2026-11-11）

> 状态：**前端 M6 已完成**（A 构建部署 / B 断线续传 / C 可观测 / D E2E / E Nginx SSE）。
> F1 体验收口与视觉还原欠账按用户决策排到下一轮。
> 设计：[`docs/superpowers/specs/2026-11-11-m6-frontend-production-design.md`](../superpowers/specs/2026-11-11-m6-frontend-production-design.md)
> 计划：[`docs/superpowers/plans/2026-11-11-m6-frontend-production.md`](../superpowers/plans/2026-11-11-m6-frontend-production.md)

## 1. 范围与结论

后端 M6（agent-hub）明确「只做后端与运维产物、不改业务契约、前端无需适配」，因此前端 M6 的目标不是复刻后端运维项，而是补齐上生产的前置条件：

| 切片 | 交付 | 结论 |
|---|---|---|
| A 构建与部署产物 | 分包、体积门禁、生产 mock 硬门禁、Nginx 配置、部署文档 | ✅ |
| B 断线续传 | 自动重连、回填 `conversation_id`、`lastSeq` 去重、降级轮询 | ✅（不做逐字续流，见 §5） |
| C 可观测 | `request_id` 采集/展示/复制、诊断抽屉、构建信息、Web Vitals | ✅ |
| D E2E | Playwright + chromium，9 例主链路，CI workflow | ✅ |
| E Nginx SSE | `deploy/nginx.conf` + `verify:nginx` 对照实测 | ✅ |

## 2. 验证结果（本机 2026-11-11）

| 命令 | 结果 |
|---|---|
| `pnpm test` | 44 文件 / **232 用例通过** |
| `pnpm type-check` | 通过 |
| `pnpm lint` | 通过（`oxlint --fix` + `eslint --fix --cache`） |
| `pnpm build` | 通过 |
| `pnpm size` | 通过：单 chunk 最大 78.1 KB（markdown），JS 总 367.8 KB，CSS 总 37.6 KB |
| `VITE_USE_MOCK=true pnpm build` | **按预期失败**：`生产构建禁止 mock` exit 1 |
| `pnpm e2e` | **9 passed**（auth 3 / chat 2 / approval 2 / knowledge 2） |
| `pnpm verify:nginx` | exit 0：`/sse` 逐秒到达（999–1002 ms），`/sse-buffered` 集中到达（首帧 5030 ms） |
| `pnpm verify:nginx --check-deploy` | exit 0：`nginx -t` 语法通过 |

分包前后对比（gzip）：

| chunk | 改造前 | 改造后 |
|---|---|---|
| ChatView | 118.7 KB | **41.3 KB** |
| markdown（marked + DOMPurify + highlight.js） | 与 ChatView 合并 | **75.7 KB（独立按需）** |
| vue-vendor | 合并 | 36.1 KB |
| http（axios + fetch-event-source） | 合并 | 21.5 KB |

## 3. 关键实现

### 3.1 断线自动重连（B）

- 退避：`1s → 2s → 4s → 8s → 16s`，±20% 抖动，最多 5 次、总窗口 60s；离线暂停计时，`online` 立即重试并重置计数。
- **重连前必须 `GET /runs/{id}`**：用 `RunOut.conversation_id` 回填 `state.conversationId`。这是正确性关键——新会话可能「后端已建 run、前端还没收到 `conversation.created`」，直接重发会被后端当成新会话新建 run。run 不一致则放弃重连并降级。
- **不去 `startStream`**：新增内部 `performReconnect()`，不重置 `lastSeq/process/runId`；重连保留 `lastSeq`，回放事件按 seq 去重。
- 正常 EOF（`onclose` 且未收到 `message.done`）也视为断线并进入重连判定。
- 达到上限进入 `degraded`，复用 M5 的恢复横幅 + 轮询，不新增第二套恢复 UI。
- UI：`ConnectionBanner` 在重连中显示「第 N/5 次」与「停止重连」；降级后只保留恢复横幅，避免双横幅。

### 3.2 可观测（C）

- `client.ts` 拦截器把 `X-Request-ID` / `X-Trace-ID` / 状态 / 耗时写入 `src/utils/diagnostics.ts` 的 20 条环形缓冲。
- 错误态组件展示并复制 `request_id`；聊天 `error` 事件透传 `request_id` 到 reducer。
- 账号菜单 →「诊断信息」抽屉：构建信息、运行时上下文（run_id / conversation_id）、最近请求、最近错误、Web Vitals；只展示排障元数据，不展示 token、消息正文、审批 payload。
- Web Vitals 自研采集 LCP/CLS/INP/TTFB（不引第三方包），`VITE_PERF_LOG=true` 时打印；上报钩子默认关闭。

### 3.3 Nginx SSE（E）

`deploy/nginx.conf` 的 SSE location 关键项：

```nginx
proxy_buffering off;   # 禁止缓冲，帧到达即下发
proxy_cache off;       # SSE 不缓存
gzip off;              # 压缩会引入缓冲
proxy_http_version 1.1;
proxy_set_header Connection "";
proxy_read_timeout 3600s;
proxy_send_timeout 3600s;
```

验证方式（`scripts/verify-nginx-sse.mjs`）：复用已有 `dev_nginx` 容器，在容器 `/tmp` 起独立 `nginx -c` 临时实例（监听 80，不触碰主进程与只读挂载），用 busybox `nc -lk -p 18999 -e` 做逐帧假源，宿主 Node 客户端经 `127.0.0.1:18088` 对照读取 `/sse` 与 `/sse-buffered`。脚本 `finally` 清理临时实例与文件，端口被占用时明确报错退出而不杀进程。

### 3.4 E2E（D）

- 构建：`vite build --mode e2e --outDir dist-e2e`（mock 产物，不覆盖 `dist`）→ `vite preview`。
- 用例：登录成功 / 错误密码 / 登出；发送消息流式回复 / 停止生成；发布触发审批并批准 / 拒绝；知识库列表与检索命中 / 无命中空态。
- 选择器优先 `getByRole` / `getByPlaceholder` / `getByTestId`，无硬等待；chromium 启动加 `--no-proxy-server`。
- 本机 chromium 缺系统库（libnspr4 / libnss3 / libasound），用 `scripts/setup-e2e-libs.sh` 把 jammy deb 解包到项目内 `.playwright-libs/`，由 `e2e` 脚本注入 `LD_LIBRARY_PATH`；CI 用 `playwright install --with-deps` 不需要该脚本。

## 4. 顺带修复的真实缺陷

- **知识库文档列表标题零宽**：`.doc-row` 固定列总宽超过面板宽度时，第一列被压成 0，标题不可见（E2E 发现，Playwright 判定 `hidden`）。已改为 `overflow-x: auto` + 最小宽度，窄屏横向滚动。
- **mock 检索语义**：mock 原来对无匹配查询仍返回全部就绪文档；已按真实后端语义改为查询词无命中时返回空，E2E 空态用例据此成立。

## 5. 未取证项与限制（如实记录）

1. **不做逐字续流**：后端 `GET /runs/{id}/events` 的 payload 剔除了 `_event`，`type` 只是分类，且没有 `Last-Event-ID` / SSE 续接端点；`message.delta` 不落库，回放里没有增量文本。断线期间已生成的文本只能等 run 结束后 `refreshHistory()` 补齐。建议后端后续给回放加 `event` 字段，或提供 `GET /runs/{id}/stream?after_seq=`。
2. **重连的真实长流证据缺失**：本机 `LLM_API_KEY` 为占位符（聊天 401），无法形成可断开的长 SSE 流。重连正确性由 12 个 store 单测 + reducer 去重单测覆盖，未取得真实后端断线重连的 HTTP 证据。
3. **E2E 只跑 mock 构建**：`VITE_USE_MOCK` 是编译期常量，只改 `baseURL` 不会关闭 mock adapter，故不提供「真实后端 E2E」模式，避免「全绿但全是 mock」的假阳性；真实链路继续由 `smoke:real` / `test:real` 覆盖。
4. **Nginx 验证是「指令语义」证据**：临时实例 + 容器内假源证明 `proxy_buffering off` 生效，不覆盖真实后端 LLM 长流；`--check-deploy` 只验语法。
5. **CI 仅为配置交付**：仓库尚无远端 workflow 运行记录，是否有 runner 由用户决定。
6. **本机环境变更**：验证过程中 Docker Desktop 曾由后台任务启动（`dev_nginx` 等容器恢复运行），验证后未关闭；如需恢复「Docker 停止」状态请手动处理。

## 6. 遗留与后续

- **F1 体验与可访问性**（下一轮）：长会话虚拟滚动、可访问性审计（对比度 / focus ring / aria-live）、⌘K 全局搜索、空态统一、移动端回归、性能预算二次收口。
- **呈现型欠账**（F1 之后）：v7 原型像素级还原。
- **后端建议**（不阻断）：回放事件名 / SSE 续接端点；写操作 RBAC 403（M5 遗留）；多实例 SSE 留 M7 决策。
- **顺带发现**：登录 401 会被全局拦截器统一转成「登录已过期，请重新登录」，登录失败文案丢失后端原因；建议后续单独修复（登录请求不应进入 refresh 流程）。

## 7. 提交记录

```
feat(observability): 采集构建信息与请求/错误诊断数据
build(web): 强制生产关 mock 与产物体积分包门禁
feat(observability): 错误态展示并复制 request_id
feat(observability): Web Vitals 采集与诊断抽屉
feat(chat): SSE 断线自动重连与事件去重
feat(chat): 重连状态条与可中断重连
test(e2e): 引入 Playwright 与 mock 预览启动链
build(deploy): Nginx SSE 配置与反向代理实测脚本
fix(knowledge): 文档列表窄列横向滚动，避免标题被挤成零宽
test(e2e): 覆盖对话/审批/知识库主链路
docs(m6): 收口生产化交付报告与 CI
```
