# M6 前端生产化设计（构建 / 续传 / 可观测 / E2E / Nginx）

> 状态：2026-11-11 设计，待确认后进入计划与实施。
>
> 对齐基线：后端 `agent-hub` M6 设计稿 [`2026-11-11-m6-production-observability-design.md`](../../../../PythonProjects/agent-hub/docs/superpowers/specs/2026-11-11-m6-production-observability-design.md) 与前端路线图 [`docs/roadmap.md`](../../roadmap.md) M6 一节。

## 1. 背景与目标

后端 M6 的范围是结构化日志、OTel、Prometheus、`/readyz`、清理任务、启动恢复、优雅停机、Docker/压测/CI，**明确只做后端与运维产物、不改业务契约、前端无需适配**（后端 spec §12「前端影响」）。因此前端 M6 不是复刻后端运维项，而是补齐「前端能上生产」的五个缺口：

1. **构建产物可部署**：可拆分、体积有门禁、生产环境不可能误开 mock、CDN/反向代理有明确产物；
2. **断线可恢复**：SSE 断线后自动重连并补齐事件流，而不是让用户看错误重试；
3. **故障可定位**：`request_id` / `run_id` / 构建版本在 UI 上可见可复制，关键性能指标可采集；
4. **主链路可回归**：Playwright E2E 覆盖登录、对话、审批、知识库；
5. **SSE 经反向代理不坏**：给出 Nginx 配置并用本机已有 nginx 容器实测 `proxy_buffering off` 生效。

成功标准：`pnpm build` + 体积门禁通过；断线重连可自动恢复事件流；错误提示可复制 `request_id`；`pnpm e2e` 全绿；`pnpm verify:nginx` 给出「不缓冲逐帧到达、默认缓冲聚集到达」的对比证据。

## 2. 事实约束

### 2.1 后端 M6 契约（已定稿，不新增业务端点）

| 事实 | 对前端的影响 |
|---|---|
| 不新增业务端点、不改既有请求/响应字段 | 前端不新增 API 调用，只消费既有端点 |
| `/readyz` 增加 `version`/`build`/`env`/`draining` 与 `migrations`/`checkpoint`/`storage` 组件 | 无强制适配；诊断抽屉可选展示 |
| 数据库不可用返回 503 `database_unavailable` | 按 503 通用错误处理即可 |
| 单实例生产化，不引入 Redis 事件总线/跨实例 SSE | **没有 `Last-Event-ID` 续接、没有多实例广播**；重连只能「重发同幂等键 + 前端去重」 |
| 新增 `X-Trace-ID` 响应头（有有效 trace 时） | 前端可被动采集，不依赖 |
| `/metrics` 根路径 | 前端不访问 |

### 2.2 后端既有契约（重连的基础）

- `POST /chat/stream`：相同 `conversation_id + client_message_id` 返回**同一 run 的事件回放**，不创建新消息（`docs/api.md` §7.3）。
- `stream_run_events(run_id, after_seq=0)`：**先回放已落库事件，再继续跟随实时事件**，收到终态事件即关闭（后端 `chat/service.py:1585`）。
- `message.delta` **不落 `run_events`**，回放里没有增量文本；`message.done` 不含完整 content。
- `GET /runs/{id}/events` 的 `payload` 已剔除内部 `_event`，`type` 只是分类，**无法按事件名重放 reducer**（M5 缺口 §4.1）；后端 M6 未计划补。

**结论**：重连可以恢复「run 事件流 + 后续实时事件 + 终态」，**不能恢复断线期间已产生的文本增量**；文本最终由 run 结束后 `refreshHistory()` 补齐。这是本设计接受的诚实边界，不做「逐字续流」的假承诺。

### 2.3 环境事实

| 资源 | 现状 |
|---|---|
| 后端 | `127.0.0.1:8000` 运行中，`/healthz` 正常；`LLM_API_KEY` 为占位符，聊天会 401，**不能作为 E2E 主链路** |
| dev server | `127.0.0.1:5173`，Vite 代理 `/api`、`/healthz`、`/readyz` 到 8000 |
| Nginx | 本机已有 `dev_nginx` 容器（`nginx:alpine`，`18088->80`），挂载 `/home/zhaodan/work/docker_work/nginx/`，当前无 server 配置（访问被 reset）。容器**无法访问宿主机服务**（已验证 172.18.0.1 / 宿主 LAN IP 均不通），因此 SSE 验证的假源必须跑在容器内 |
| 浏览器 | 无 pandoc/无 Playwright 缓存；用户已授权安装 Playwright + chromium |
| CI | 仓库无 `.github/`；本设计交付 workflow 文件，是否启用由远端决定 |

### 2.4 前端现状基线（2026-11-11 `pnpm build` 实测）

- 产物：`dist` 1.4 MB；JS 总 gzip **363 KB**，CSS 总 gzip **37 KB**。
- 最大 chunk：`ChatView` 383.97 KB / gzip **122.40 KB**；`css-*` 138.04 KB / gzip 46.76 KB；`client` 94.83 KB / gzip 35.98 KB。
- 路由已全部懒加载；Element Plus 按需自动导入。
- SSE：`@microsoft/fetch-event-source`，`onOpen` 重置 `lastSeq=0`，`onError` 直接落 `stream_error`，**无自动重连**。
- 断线恢复：`adoptRun` + 5s 轮询 + `syncPendingApprovals` + 终态 `refreshHistory`（M5 已实现）。
- `request_id`：`ApiRequestError.requestId` 已解析，但只在审计面板可见；`client.ts` 未记录成功响应的 `X-Request-ID`。
- 无 Web Vitals、无构建信息注入、无诊断入口。

## 3. 范围与非目标

### 3.1 范围（本轮）

| 切片 | 交付 |
|---|---|
| A 构建与部署产物 | 分包策略、体积门禁脚本、生产 mock 硬门禁、`deploy/nginx.conf`、`deploy/README.md` |
| B 断线恢复增强 | 自动重连（指数退避）、重连前 run 状态确认、seq 去重、连接状态 UI、降级轮询 |
| C 可观测 | `request_id` 采集与展示、诊断抽屉、构建信息注入、Web Vitals 采集、可选上报钩子 |
| D E2E | Playwright + chromium、mock 模式构建、4 组主链路用例、CI workflow |
| E Nginx SSE 验证 | SSE location 配置、`scripts/verify-nginx-sse.mjs` 自动验证、实测证据 |

### 3.2 非目标（明确不做）

- **不做逐字续流 / `Last-Event-ID` / 多实例广播**：后端 M6 决策为单实例，且回放无事件名与 delta。
- **不做真实后端 E2E**：`VITE_USE_MOCK` 是编译期常量，真实模式需另建 mode + 独立构建，且本机 LLM 401 会让聊天用例假红；真实链路由 `smoke:real` / `test:real` 覆盖。
- **不改后端契约、不新增 API**；不向后端提「必须补」的阻断性需求（只记录建议）。
- **不做 F1 体验项**（虚拟滚动、a11y 审计、⌘K、空态统一、移动端回归）——下一轮独立工作包。
- **不做视觉还原欠账**（v7 像素级）——排在 M6 与 F1 之后。
- **不动 X1/X2**（工作流、完整管理台后端未立项）。
- **不引入 Sentry SDK**：只留 `VITE_ERROR_REPORT_ENDPOINT` / `VITE_PERF_ENDPOINT` 上报钩子（默认关闭），避免体积、隐私与账号依赖。
- **不启动新的 Docker 容器**：Nginx 验证复用已有 `dev_nginx`。
- **不写宿主 `/home/zhaodan/work/docker_work/nginx/`**：只读且不可写，验证只用容器内 `/tmp`。

## 4. 设计

### 4.1 A：构建与部署产物

#### A1 分包策略

在 `vite.config.ts` 增加 `build.rollupOptions.output.manualChunks`：

- `vue-vendor`：`vue`、`vue-router`、`pinia`；
- `markdown`：`marked`、`dompurify`、`highlight.js`（及其语言包）；
- `http`：`axios`、`@microsoft/fetch-event-source`；
- Element Plus 保持自动导入的默认分块（强制合并会放大首屏，且与按需样式冲突）。

判定标准：`ChatView` 不再把 Markdown 三件套打进同一 chunk；首屏入口链（`index` + `vue-vendor` + `http` + 布局）gzip 不超过 200 KB。

#### A2 体积门禁

新增 `scripts/check-bundle-size.mjs`：

- 读取 `dist/assets`，**逐文件 gzip 后求和**（与 Vite 构建报告口径一致；不按全部拼接后压缩，避免口径不一致）；
- 默认阈值（可用 `BUNDLE_MAX_CHUNK_KB` / `BUNDLE_MAX_TOTAL_JS_KB` / `BUNDLE_MAX_TOTAL_CSS_KB` 覆盖）：
  - 单 chunk ≤ **110 KB**（当前最大 ChatView 122.4 KB → 不拆分就失败，强制 A1 生效；拆分后预计 < 100 KB）；
  - JS 总 gzip ≤ **420 KB**（当前 363 KB + 15% 余量）；
  - CSS 总 gzip ≤ **60 KB**（当前 37 KB）。
- 输出 Top 10 chunk 表格与各 chunk 名称；任一超限 `exit 1`。
- `pnpm size` 直接调用；`pnpm build` 保持纯构建，CI 里串联 `build && size`。

#### A3 生产 mock 硬门禁

两层：

1. **构建期**：`vite.config.ts` 改为函数式配置，`command === 'build'` 且 `mode === 'production'` 且 `VITE_USE_MOCK === 'true'` 时直接 `throw` 并提示「生产构建禁止 mock」。只拦 `build`，不拦 `preview`：否则 shell 里遗留的 `VITE_USE_MOCK` 会让 `vite preview` 在加载配置时就误抛。E2E 使用 `--mode e2e`，不受影响。
2. **运行期**：`main.ts` 在 `import.meta.env.MODE === 'production'` 且 `VITE_USE_MOCK === 'true'` 时抛出可见错误（理论上不可达，作为最后一道保险）。注意这里用 `MODE` 而不是 `PROD`：`vite build --mode e2e` 的产物 `import.meta.env.PROD` 仍为 `true`，用 `PROD` 会误伤 E2E 启动。
   - 接受的残余风险：`vite build --mode e2e` 产物（含 mock）如果被误部署到生产，运行期不会拦截。缓解：`dist-e2e` 独立目录 + 部署文档明确「生产只部署 `dist`」。若要更强保证，后续可加 CI 校验 `dist/index.html` 不含 mock chunk。

#### A4 CDN / 静态资源部署

- `vite.config.ts` 支持 `VITE_BASE_PATH`（默认 `/`）注入 `base`；CDN 场景设置为 CDN 路径前缀。
- 约定：`index.html` 不缓存（`Cache-Control: no-cache`），`/assets/*` 长缓存（`immutable, max-age=31536000`）；API 与 SSE 必须同源反代（避免 CORS + 凭据 + 事件流跨域问题），CDN 只托管静态资源。
- `deploy/nginx.conf` 同时承担「静态站 + API 反代 + SSE」三件事，作为生产参考配置。

#### A5 部署文档

`deploy/README.md`：构建命令、环境变量表（`VITE_API_BASE_URL`、`VITE_BASE_PATH`、`VITE_USE_MOCK`、`VITE_PERF_LOG`、`VITE_PERF_ENDPOINT`、`VITE_ERROR_REPORT_ENDPOINT`）、Nginx 部署步骤、缓存策略、验证命令、回滚（保留上一份 `dist` 目录 + 原子替换软链）。

### 4.2 B：断线恢复增强

#### B1 状态机

新增 `connection` 状态（`idle | connecting | open | reconnecting | degraded`），与现有 `streaming` 解耦：

```
connecting --open--> open --error--> reconnecting --成功--> open
                                        |--超过上限/离线/终态--> degraded
degraded = 保留现有「恢复横幅 + 轮询 + 终态补历史」
```

#### B2 重连触发

仅在同时满足以下条件时自动重连：

1. 已拿到 `runId`（`X-Run-ID` 或 `run.started`）；
2. 错误不是 `ApiRequestError` 的 4xx 业务错误（409/403/401/422 不重连，按现有逻辑处理；401 交给现有单飞刷新）；
3. 浏览器在线（`navigator.onLine`）；
4. 用户未点「停止」。

重连动作 = **用同一 `ChatAttempt`（同 `client_message_id`、同上下文）重新调用 `openChatStream`**，后端按幂等键返回同一 run 的回放 + 继续跟随。

**重连前必须先 `GET /runs/{id}` 并用返回值回填/校验**（这是正确性前提，不是优化）：

- 用 `RunOut.conversation_id` 回填 `state.conversationId`。新会话场景下，断线可能发生在「后端已创建 run、前端还没收到 `conversation.created`/`run.started`」的窗口：此时 `state.conversationId` 仍是 `null`，凭 runId 重连会以 `conversation_id=undefined` 重发，后端会**新建会话和 run**，导致重复用户消息、且旧 `lastSeq` 会丢弃新 run 的前 N 个事件。
- 校验返回的 run 与当前 `state.runId` 一致；不一致说明用户已切走或 run 已被替换 → 放弃重连，走 degraded。
- `interrupted` → 不重连，走现有审批横幅 + 轮询；终态 → 不重连，直接 `refreshHistory()` + 对账审批；`running/queued` → 重连。

#### B3 退避与上限

- 退避：`1s → 2s → 4s → 8s → 16s`，带 ±20% 抖动，最多 **5 次**，总窗口 60s。
- 每次重连先执行 B2 的 `GET /runs/{id}` 回填与校验；只有 `running/queued` 才真正重发流。
- 重连失败计入次数；达到上限 → `degraded`（恢复横幅 + 轮询，保持 M5 行为）。
- `online` 事件触发一次立即重试（并重置计数）；`visibilitychange` 回到前台时若仍 `degraded` 不自动重连，交给用户点「重新连接」。

#### B4 去重（关键）

- 重连时**保留 `lastSeq`**，不重置。后端回放的已处理事件因 `seq <= lastSeq` 被 reducer 丢弃，避免：
  - `message.delta` 之外的事件重复应用（`usage` 覆盖、`tool` upsert 本身幂等，但 `message.created` 会重复建消息）；
  - 重复触发 `refreshHistory()` 或审批同步。
- `onOpen` 区分首次连接与重连：首次（新 run / `adoptRun`）重置 `lastSeq=0`，重连保留。
- 正常 EOF（`onclose` 未收到 `message.done`）也算断线，必须进入重连判定；只靠 `onerror` 会漏掉「服务端静默关流」。
- 已知边界只有一条：**重连请求必须带 B2 回填的 `conversation_id`**，否则会新建 run（见 B2）。`message.delta` 在途不会造成误丢（SSE 有序，`onError` 会先 `flushDeltas`）。

#### B5 UI

- 重连中：消息区顶部细条提示「连接中断，正在重新连接（第 N/5 次）」，可点「停止重连」；不遮挡输入区。
- 降级：复用 `RunRecoveryBanner`，文案改为「连接已断开，正在通过轮询恢复」，保留「重新连接」「停止运行」按钮。
- 离线：顶部提示「网络已断开，恢复后自动重连」，不消耗重连次数。

#### B6 测试与证据口径

- reducer 单测：重连时重复事件被 `lastSeq` 丢弃；`message.created` 不重复建消息。
- store 单测（假 SSE + 假时钟）：退避序列、次数上限、终态停止、离线暂停、`online` 立即重试、**重连前回填 `conversation_id`**、run 不一致放弃重连、正常 EOF 触发重连。
- 手工验收：浏览器 DevTools 断网/断流后恢复，观察重连横幅与事件补齐。**不承诺真实后端长流证据**：本机 `LLM_API_KEY` 为占位符，聊天 401 无法形成可断的长流；真实链路由单测 + 现有 `smoke:real` 兜底，报告里如实标注。

### 4.3 C：可观测

#### C1 request_id / trace_id 采集

- `src/api/client.ts` 响应拦截器记录：`X-Request-ID`、`X-Trace-ID`（M6 后端新增，缺失则空）、`method`、`url`、`status`、耗时到 ring buffer（最近 20 条）。
- SSE：`error` 事件里的 `request_id` 单独记录；`X-Run-ID` 记录当前 run。
- 导出 `getRecentRequests()` / `getLastRequestId()` / `subscribeDiagnostics()`。

#### C2 错误展示

- 新增 `src/utils/errors.ts#describeError(error)`，返回 `{ message, code, status, requestId }`。
- `ErrorState` 增加可选 `requestId` 与「复制」按钮；聊天错误卡片展示 `code + request_id`。
- 全局 toast 统一走 `showApiError()`（内部 `ElMessage.error` + request_id 前缀），避免各面板自行拼文案。

#### C3 诊断抽屉

- 入口：账号菜单「诊断信息」（`AccountMenu.vue`）；快捷键不必。
- 内容：应用版本、构建时间、git sha、`API base`、mock 开关、当前 `conversation_id` / `run_id`、最近 20 条请求（状态/耗时/request_id）、最近错误（含 request_id/trace_id）、Web Vitals 摘要；分组复制按钮。
- 生产环境可见（这是排障入口，不是调试面板）；不展示 token、消息内容、审批 payload。

#### C4 构建信息注入

`vite.config.ts#define`：`__APP_VERSION__`（package.json）、`__BUILD_TIME__`（ISO）、`__GIT_SHA__`（`git rev-parse --short HEAD`，失败为 `unknown`）。新增 `src/env.d.ts` 声明。

#### C5 Web Vitals

新增 `src/utils/web-vitals.ts`：

- `PerformanceObserver` 采集 LCP、CLS、INP；`navigation` 采集 TTFB；上报到内存 ring buffer（最近 20 条），诊断抽屉可见。
- `VITE_PERF_LOG=true` 时开发/预览环境 `console.table`；生产默认静默。
- 不引第三方包（`web-vitals` 会把包体积与版本策略绑死）。

#### C6 上报钩子（可选，默认关闭）

- `VITE_ERROR_REPORT_ENDPOINT`：未捕获错误与 `ApiRequestError` 以 `navigator.sendBeacon` POST；失败静默。
- `VITE_PERF_ENDPOINT`：Web Vitals 批量 POST。
- 不接 Sentry；文档说明可替换实现。

### 4.4 D：E2E（Playwright）

#### D1 运行模式

- 默认 **mock 模式**：`vite build --mode e2e --outDir dist-e2e`（读 `.env.e2e`：`VITE_USE_MOCK=true`）→ `vite preview --outDir dist-e2e --port 4173`，不依赖后端与 LLM key，CI 可复现。单独的 `dist-e2e` 避免覆盖生产 `dist`，并加入 `.gitignore`。
- **本轮不做真实后端 E2E**：`VITE_USE_MOCK` 是编译期常量，只改 Playwright `baseURL` 不会关掉 mock adapter，会产出「全绿但全是 mock」的假阳性；要做真实模式必须另建 `e2e-real` mode 与独立构建，而本机 LLM 401 又会让聊天用例假红。真实后端链路继续由 `smoke:real` / `test:real` 覆盖（已写入非目标）。
- 浏览器代理：本机环境设置了 `HTTP_PROXY`，Playwright 启动 chromium 时加 `--no-proxy-server`（或 `NO_PROXY=*`），避免 E2E 流量被代理拦截。

#### D2 用例（chromium，4 组）

1. `auth.spec.ts`：登录成功 → 对话页；错误密码提示；登出。
2. `chat.spec.ts`：发送消息 → 流式 delta 渲染 → 完成态；停止按钮中断。
3. `approval.spec.ts`：发送含「审批/发布/写操作」的消息（mock 触发）→ 审批卡出现 → 批准 → `run.resumed` 后继续输出；拒绝路径。
4. `knowledge.spec.ts`：知识库页列表、上传对话框（mock）、检索调试返回结果、空结果提示。

选择器优先 `getByRole` / `getByPlaceholder` / `getByText`；确实不稳定处补 `data-testid`（只加在列表项、审批卡、消息容器等少数位置）。

#### D3 配置与脚本

- `playwright.config.ts`：`testDir: 'e2e'`，`webServer` 启动 `pnpm e2e:server`，`reuseExistingServer: !process.env.CI`，失败保留 trace/video。
- `package.json`：`e2e`、`e2e:server`、`e2e:report`。
- `.github/workflows/ci.yml`：`pnpm install` → `lint` → `type-check` → `test` → `build` → `size` → `e2e`（chromium）；E2E 作为独立 job，失败上传 trace 产物。
- `.gitignore` 增加 `test-results/`、`playwright-report/`。

### 4.5 E：Nginx SSE 验证

#### E1 配置

`deploy/nginx.conf` 关键片段（示意）：

```nginx
server {
    listen 80;
    root /usr/share/nginx/html;

    # SPA fallback
    location / { try_files $uri $uri/ /index.html; }

    # 静态资源长缓存
    location /assets/ { expires 1y; add_header Cache-Control "public, immutable"; }

    # API（含 SSE）：必须关闭缓冲、保持长连接
    location /api/ {
        proxy_pass http://agent-hub-backend;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Request-ID $request_id;
        proxy_set_header Connection "";

        # SSE 关键项
        proxy_buffering off;
        proxy_cache off;
        gzip off;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }

    location = /healthz { proxy_pass http://agent-hub-backend/healthz; }
    location = /readyz  { proxy_pass http://agent-hub-backend/readyz; }
}
```

注意：`proxy_buffering off` 放在 `/api/` 上会同时影响普通 JSON（无副作用，只是少了一层解耦缓冲）；若要更精细，可为 `/api/v1/chat/stream` 单独建 location。实施时二选一并注释原因。

#### E2 验证脚本（2026-11-11 已做可行性验证）

**约束（实测）**：

- `dev_nginx` 的 `/etc/nginx/conf.d` 与 `/etc/nginx/nginx.conf` 都是宿主目录的 **只读 bind mount**，容器内无法写入或 reload 注入；宿主目录属主 `nobody:nogroup` 755，当前用户也不可写。**原设计的「写 conf.d + reload」不可行**。
- 主 nginx 进程虽然运行，但因为没有 server 配置，**实际不监听 80**（`18088` 端口映射到容器 80，连接被 reset）。因此容器内 80 端口空闲。
- 容器内可写 `/tmp`；容器内有 busybox `nc`（支持 `-lk -p PORT -e PROG`，`-e` 必须是最后一个参数）。
- 宿主设置了 `HTTP_PROXY` 与 `NODE_OPTIONS=--use-env-proxy`，访问非 localhost 地址会被代理拦截；验证脚本必须显式绕过代理（`NO_PROXY` / `--noproxy '*'`）。
- 宿主只能通过映射端口 `127.0.0.1:18088` 访问容器，不能直连容器 IP 的其他端口。

**方案（已跑通）**：

1. 在容器 `/tmp/agent-hub-sse-verify/` 写两个临时文件：
   - `serve.sh`：先读掉 HTTP 请求头（避免未读入站数据导致关闭时 RST），再逐秒发 5 帧 `data: N`，最后关闭；
   - `sse.conf`：一个临时 nginx 实例配置，`listen 80`，含 `/sse`（`proxy_buffering off`）与 `/sse-buffered`（默认缓冲）两个 location，upstream 指向 `127.0.0.1:18999`。
2. 启动假源：`nc -lk -p 18999 -e /tmp/agent-hub-sse-verify/serve.sh`（`-lk -e` 支持多连接，避免第二次请求 502）。
3. 启动临时实例：`nginx -c /tmp/agent-hub-sse-verify/sse.conf`（独立 pid/error_log，都在 `/tmp`；**不触碰主 nginx**）。
4. 宿主 Node 客户端（`NO_PROXY=*`）分别流式读取 `http://127.0.0.1:18088/sse` 与 `/sse-buffered`，记录每帧到达毫秒；断言：
   - `/sse`：5 帧到达时间跨度为 3–5 秒，相邻帧间隔 ≥ 500ms；
   - `/sse-buffered`：5 帧在 ≤ 1 秒内集中到达，或首帧延迟 ≥ 4 秒。
5. `finally` 清理：kill 临时 nginx 与 nc、删除 `/tmp/agent-hub-sse-verify/`；失败时打印手动恢复命令。
6. 输出 PASS/FAIL 与两条路径的逐帧时间线，存档到 `docs/handoff/`。
7. 可选 `--check-deploy`：把 `deploy/nginx.conf` 复制进临时实例目录，补 `upstream agent-hub-backend { server 127.0.0.1:8000; }` 与 `root` 目录后执行 `nginx -t`，只验证交付配置语法，不验证运行时。注意：E2 的逐帧实验验证的是「SSE 关键指令的语义」，不是 `deploy/nginx.conf` 的运行时行为——两者要分开写进证据。

> 2026-11-11 手工验证结果：`/sse` 逐帧（时间戳 875/876/877/878/879 秒），`/sse-buffered` 集中到达（885 秒 ×5）。方案成立。

> 不写宿主 `/home/zhaodan/work/docker_work/nginx/`（只读且不可写）：验证只用容器内临时目录，避免污染用户环境。正式配置以 `deploy/nginx.conf` 交付。

### 4.6 交付物清单

```
deploy/nginx.conf
deploy/README.md
scripts/check-bundle-size.mjs
scripts/verify-nginx-sse.mjs
src/utils/errors.ts            （扩展）
src/utils/diagnostics.ts       （新增：ring buffer + 构建信息）
src/utils/web-vitals.ts        （新增）
src/components/common/DiagnosticsDrawer.vue（新增）
src/components/chat/ConnectionBanner.vue   （新增或复用恢复横幅）
src/stores/chat.ts             （重连状态机与去重）
src/api/client.ts             （响应头采集）
playwright.config.ts
e2e/{auth,chat,approval,knowledge}.spec.ts
.github/workflows/ci.yml
docs/handoff/2026-11-11-m6-frontend-report.md（实施后补充证据）
docs/roadmap.md               （M6 状态更新）
```

## 5. 验收标准

| 项 | 证据 |
|---|---|
| A 构建 | `pnpm build` 通过；`pnpm size` 通过且输出 Top 10；`VITE_USE_MOCK=true pnpm build` **失败**（门禁生效） |
| B 续传 | 新增单测通过；手工断线（容器 kill 连接/浏览器断网）后自动重连并补齐事件，降级路径可用 |
| C 可观测 | 诊断抽屉可从账号菜单打开，展示版本/构建时间/request_id/run_id/Web Vitals；错误态可复制 request_id |
| D E2E | `pnpm e2e` 4 组用例通过（chromium）；CI 配置可解析 |
| E Nginx | `pnpm verify:nginx` 退出码 0，输出 `/sse` 逐帧、`/sse-buffered` 聚集的对比证据 |
| 全量回归 | `pnpm lint` / `type-check` / `test` / `build` / `size` / `e2e` 全绿 |

## 6. 风险与未取证项

1. **文本增量不可恢复**（后端限制）：重连只恢复事件与终态，断线期间已生成的文本靠 run 结束后历史补齐；若用户断线时模型已输出一半且 run 长时间不结束，界面会显示「已断开」且无新文本。
2. **重连的请求身份**：必须用 `GET /runs/{id}` 回填 `conversation_id` 再重发（B2），否则会新建 run；这是本设计中唯一不能出错的重连约束，已用单测钉住。
3. **Nginx 验证复用容器 80 端口**：主 nginx 当前没有 server 配置、不监听 80，所以临时实例可用；若用户以后给主 nginx 加了 `listen 80`，验证脚本会在启动前检测端口占用并明确报错（不杀主进程）。临时实例与 nc 进程在 `finally` 中清理。
4. **E2E 主要跑 mock**：真实后端链路（LLM 401）无法覆盖，仍由 `smoke:real` / `test:real` 与后端测试兜底；真实 E2E 仅覆盖非 LLM 路径。
5. **CI 仅为配置交付**：仓库无远端 workflow 历史，是否启用、是否有 runner 由用户决定。

## 7. 我做的决定（可被推翻）

1. **重连上限 5 次 / 60s**：与浏览器常见退避经验对齐；常量集中在 `src/utils/retry.ts`，可调。
2. **重连前必查 `GET /runs/{id}` 并回填 `conversation_id`**：解决「新会话 run 已创建、前端还没收到 `conversation.created`」时重连会新建会话/run 的正确性漏洞（设计审查 P0）。代价是每次重连多一次请求。
3. **运行期 mock 门禁用 `MODE` 而不是 `PROD`**：否则无法跑 E2E；接受「`dist-e2e` 误部署到生产不会被运行期拦截」的残余风险，用独立目录 + 部署文档缓解。
4. **本轮不做真实后端 E2E**：避免「改了 baseURL 但还在跑 mock」的假阳性；真实链路继续由 `smoke:real` / `test:real` 覆盖。
5. **体积门禁单 chunk 110 KB**：当前 ChatView 122.4 KB，不拆就失败，强制 A1 的拆分真正生效；gzip 口径为逐文件求和。
6. **不引入 Sentry**：只留上报钩子；理由是体积、隐私与账号依赖，且后端 M6 也没有错误聚合平台。
7. **Web Vitals 自研**：不引 `web-vitals` 包，规模小、可控。
8. **Nginx 验证用容器内独立 `nginx -c` 实例 + 容器内 `nc -lk -e` 假源**：`conf.d` 是只读挂载、主 nginx 不监听 80、宿主无法访问容器非映射端口，这是唯一可行且不污染用户环境的路径（已实测）。
9. **Element Plus 不强制合块**：与按需导入的样式拆分冲突，收益不确定。
10. **F1 与视觉欠账不在本轮**：已与用户确认排在 M6 之后。

## 8. 留给后续

- **F1 体验与可访问性**：虚拟滚动、a11y 审计（对比度/focus ring/aria-live）、⌘K、空态统一、移动端回归、性能预算二次收口。
- **呈现型欠账**：v7 原型像素级还原（独立工作包）。
- **X1/X2**：工作流与完整管理台，等后端立项。
- **向后端反馈**（不阻断）：`GET /runs/{id}/events` 增加 `event` 字段或提供 `GET /runs/{id}/stream?after_seq=`，前端即可做真正的逐字续流；多实例 SSE 需 M7 决策。
