# API 对接指南

后端契约以 [`agent-hub/docs/api.md`](../../../PythonProjects/agent-hub/docs/api.md) 为准；本文只写前端如何消费。里程碑归属与开工门禁见[路线图](roadmap.md)。

> 前端已实现 `src/api/client.ts`、`src/api/<domain>.ts`、`src/types/` 与 `src/api/mock/`；
> 开发环境默认 mock，联调时设置 `VITE_USE_MOCK=false`。

## 1. 地址与代理

| 环境 | Base URL | 说明 |
|---|---|---|
| 开发 | `/api/v1`（默认） | Vite 代理到 `http://127.0.0.1:8000` |
| 生产 | `/api/v1` | Nginx 反代同源，避免 CORS |
| 直连后端 | `VITE_API_BASE_URL=http://localhost:8000/api/v1` | 需后端配置 CORS |

`src/api/client.ts` 读取 `VITE_API_BASE_URL`，未设置时使用 `/api/v1`。

## 2. Axios 使用方式

```ts
import { apiClient } from '@/api/client'
import type { PageResult } from '@/types/api'
import type { Conversation } from '@/types/chat'

export async function listConversations(cursor?: string): Promise<PageResult<Conversation>> {
  const { data } = await apiClient.get<PageResult<Conversation>>('/conversations', {
    params: { limit: 20, cursor },
  })
  return data
}
```

约定：

- 每个业务域一个 `src/api/<domain>.ts`，页面不直接调 `apiClient`；
- 函数返回已解包的数据，不把 AxiosResponse 泄漏到页面；
- 查询参数用 `params`，不要手拼 URL；
- 类型从 `src/types/` 引入，不在 api 文件里重复定义。

## 3. 认证

```ts
// 登录成功后
authStore.setSession(tokens) // 写 localStorage
authStore.setUser(user)

// 请求拦截器自动附加
Authorization: Bearer <access_token>
```

刷新策略（M1）：

1. 收到 401 且存在 refresh token → 调用 `POST /auth/refresh`；
2. 刷新成功：更新 token，重放原请求一次；
3. 刷新失败：清空会话，跳 `/login`；
4. 并发 401 用单飞锁（`useAuth` 内共享 Promise），避免多次刷新。

## 4. SSE 聊天

```ts
import { fetchEventSource } from '@microsoft/fetch-event-source'
import type { ChatStreamRequest, ChatEventName } from '@/types/chat'

export function openChatStream(
  payload: ChatStreamRequest,
  handlers: {
    onEvent: (event: ChatEventName, data: unknown) => void
    onError: (error: Error) => void
    signal: AbortSignal
  },
): Promise<void> {
  return fetchEventSource('/api/v1/chat/stream', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      Authorization: `Bearer ${localStorage.getItem('agent-hub.access-token') ?? ''}`,
    },
    body: JSON.stringify(payload),
    signal: handlers.signal,
    openWhenHidden: true,
    async onopen(response) {
      const ok =
        response.ok && response.headers.get('content-type')?.includes('text/event-stream')
      if (!ok) throw new Error(`SSE 连接失败：HTTP ${response.status}`)
    },
    onmessage(ev) {
      if (!ev.event || ev.event === 'ping') return
      const data = ev.data ? JSON.parse(ev.data) : {}
      handlers.onEvent(ev.event as ChatEventName, data)
    },
    onerror(error) {
      // 抛错终止重连；网络类错误可返回重试毫秒数
      handlers.onError(error as Error)
      throw error
    },
  })
}
```

注意：

- 必须设置 `Accept: text/event-stream`，后端据此返回流；
- `EventSource` 不支持 POST/自定义头，不要用原生实现；
- 组件卸载时 `controller.abort()`；
- 解析失败的单帧记录日志并跳过，不终止整条流；
- `message.done` / `error` 后主动 `abort()`。

## 5. 错误处理

后端统一错误信封：

```json
{"error": {"code": "not_found", "message": "会话不存在", "request_id": "..."}}
```

`apiClient` 已转换为 `ApiRequestError`：

```ts
import { ApiRequestError } from '@/api/client'

try {
  await createConversation()
} catch (error) {
  if (error instanceof ApiRequestError) {
    ElMessage.error(error.message)
    console.warn('request_id=', error.requestId)
  }
}
```

约定：

- 401 由拦截器清理会话，页面不必重复处理；
- 业务错误展示 `message`，调试信息记录 `code` + `request_id`；
- 网络错误（status=0）提示「网络异常，请稍后重试」。

## 6. 类型与 OpenAPI

当前 `src/types/` 为手写契约类型。后续可选：

```bash
# 从后端 OpenAPI 生成类型（规划）
pnpm dlx openapi-typescript http://localhost:8000/openapi.json -o src/types/openapi.d.ts
```

生成后仍需保留 UI 层类型（如带本地状态的 `ChatMessage`），不要直接用生成类型做组件状态。

## 7. 并发与缓存

- 同一会话同时只允许一个运行：发送前检查 `chat.streaming`，否则禁用输入；
- 列表请求用 cursor 分页，不缓存全量；
- 写操作成功后失效相关 store 的列表缓存（简单 invalidate，不做持久化缓存）；
- 重复点击提交用 loading 锁，避免重复创建。

## 8. 调试

```bash
# 直接看 SSE 原始帧
curl -N -X POST http://localhost:8000/api/v1/chat/stream \
  -H 'Content-Type: application/json' \
  -H 'Accept: text/event-stream' \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"message":"你好"}'
```

浏览器 DevTools：

- Network → 选中 SSE 请求 → EventStream 面板看事件；
- 若长时间无输出，检查 Nginx `proxy_buffering off`；
- 401 检查 localStorage token 与后端时钟偏差。

## 9. 个人能力层接口（M1.5，已实现）

| 功能 | 接口 | 说明 |
|---|---|---|
| 指令 | `GET/PUT /instructions` | 生效指令、来源（user/system_default）、默认值、4000 字符上限 |
| 长期记忆 | `/memories` | 列表/新增/修改/删除/清空/导出，支持 `kind`、`status`、`q` |
| 技能 | `/skills`、`/skills/catalog` | 系统 + 用户技能；zip 导入；参考文件读取 |
| MCP | `/mcp/servers`、`/mcp/available` | 系统 + 用户服务器；工具发现；凭据只回显提示 |

请求仍走 `/api/v1`，认证、错误信封与分页约定同上。设置页四区块与输入栏「+」选择器已按此契约实现；显式选择只影响当次请求。

## 10. 知识库接口（M4，已实现）

| 功能 | 接口 | 说明 |
|---|---|---|
| 上传 | `POST /knowledge/documents` | multipart：`file` + 可选 `title`/`category`/`scope`；新建 **201**、同内容幂等 **200**、超 10MB **413** `payload_too_large`、扩展名不支持 **422** `validation_error`、`scope=system` 非管理员 **403** `forbidden` |
| 列表 | `GET /knowledge/documents` | `q`（标题/来源路径）、`category`、`status`、`owner_scope=visible|all`（`all` 仅管理员）、`limit`、`cursor`；返回 `{items,next_cursor,has_more,stats}` |
| 详情 | `GET /knowledge/documents/{id}` | 他人私有文档与不存在统一 **404** |
| 删除 | `DELETE /knowledge/documents/{id}` | **204**；分块级联删除，原文删除失败只记日志 |
| 重试/重建单篇 | `POST /knowledge/documents/{id}/retry` | 从原文重新入库；不限制原状态，可当作「重建此文档」；系统文档普通用户 **403** |
| 检索调试 | `POST /knowledge/search` | `{query,top_k?,filters?:{category?}}`；`top_k` 1–20，缺省取服务端配置；Embedding 不可用 **503** `service_unavailable`；库为空返回空 `hits` |
| 重建索引 | `POST /knowledge/rebuild` | 仅管理员：`{scope: all|system|own}`；`own` = 所有用户的私有文档；返回 `{documents,chunks,failed,elapsed_ms}` |

形状（与前端冻结类型逐字段一致）：

- 文档对象 11 字段：`id,title,source_uri,category,status,chunk_count,size_bytes,owner,error,created_at,updated_at`（**没有** `filename`，`owner=null` 表示系统文档，`error=null` 表示无错误）；
- 检索 hit 10 字段：`chunk_id,document_id,title,document_title,document_filename,category,chunk_index,content,score,updated_at`；`title` 是分块章节标题；
- `stats` 6 键：`documents,chunks,ready,indexing,pending,failed`，是可见范围全量、不随筛选变化；
- `message.done.citations` 与 `tool.result.citations` 元素 7 字段：`index,document_id,chunk_id,title,category,score,updated_at`，**不带 content**。

前端约定：

- 上传是同步入库并返回终态；`pending/indexing` 只来自脚本导入或重建，列表每 5s 轮询这些文档，页面隐藏即暂停；
- 单文档重建复用 `/retry`；全量重建按钮仅对 `role=admin` 显示；
- 后端没有分类目录端点，输入栏分类候选 = 可见文档 `category` 去重 + 手输（≤5 个）；空分类不进入候选；
- `knowledge_categories` 作为 `search_knowledge` 的默认分类过滤，发送后清空；
- `KNOWLEDGE_ENABLED=false` 时所有知识库端点 **403** `capability_disabled`，前端显示能力门控并退回对话页；
- 引用点击按 `document_id` 打开详情；文档已删除（404）时回退按标题 `q` 搜索。

## 11. 契约缺口（按里程碑）

以下元素尚无后端契约或尚未实现，接入前需先补设计；归属以[路线图](roadmap.md)为准：

| 归属 | 缺口 | 当前处理 |
|---|---|---|
| M3（已取消） | A2A 入站不实施：Agent Card 发布、JSON-RPC 入站端点、入站任务/会话、API Key 管理 | 服务仅出站；前端已移除设置页入站分区，`system/info.a2a` 不再读取（建议后端移除该字段） |
| M4（已对齐） | 知识库端点、citations、`knowledge_categories` | 已实现并联调；仅剩「单文档重建 / 分类目录」缺口，前端用 retry 与文档聚合替代 |
| M5 | 审计查询 API、写操作 RBAC 的 403 | 审批中心可先做；审计/RBAC 等后端 |
| X1 | 工作流管理（`workflows` / `workflow_runs`，或明确不落地） | 待立项，不做编辑器/执行 |
| X2 | 管理端用户、角色权限、菜单、字典、审计查询 | 待立项；`/api/v1/admin/*` 实测 404 |

已由后端补齐、不再列为缺口：附件上传/受控下载、审批列表/详情/决定、会话搜索 `q`、`message_count`、`chat/stream` 的 `model`/`reasoning_effort` 与 reasoning SSE 事件。

详见 [原型自检报告](prototypes/review-2026-11-08.md)；字段级方案、任务包与样例见[后端交接包](handoff/README.md)。
