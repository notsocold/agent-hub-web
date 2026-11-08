# 联调 fixtures 与契约测试

- 用途：给后端做种子数据与契约测试，给前端做 mock；保证两端看到同一批形状
- 原则：字段可多不可少；未知枚举可容忍；示例是**形状基准**，不是完整业务数据
- 配套：字段定义见 [`contract-delta.md`](contract-delta.md)，任务包见 [`work-packages.md`](work-packages.md)

---

## 1. 固定实体

为了避免示例之间对不上，约定以下常量（UUID 均为合法 v4 形状，可直接用于测试）：

| 实体 | 值 |
|---|---|
| 用户 | `11111111-1111-4111-8111-111111111111`（周丹，`role=admin`） |
| 会话 | `22222222-2222-4222-8222-222222222222`（Q3 客服工单周报） |
| 运行 | `33333333-3333-4333-8333-333333333333` |
| 用户消息 | `44444444-4444-4444-8444-444444444444` |
| 助手消息 | `55555555-5555-4555-8555-555555555555` |
| 审批 | `66666666-6666-4666-8666-666666666666` |
| 远程智能体 | `77777777-7777-4777-8777-777777777777`（data-analyst） |
| A2A 任务 | `88888888-8888-4888-8888-888888888888`（`a2a_task_id=task_9b2a`） |
| 知识文档 | `99999999-9999-4999-8999-999999999999`（Q3 客服复盘 v2） |
| 工作流 | `aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`（客服周报） |

种子实体建议：

| 类型 | 数据 |
|---|---|
| 用户 | 周丹（admin）、林雨（ops）、陈默（support）、赵可（editor）、王砚（auditor，disabled）、李柚（pending） |
| 智能体 | data-analyst（healthy）、editorial-reviewer（healthy）、code-assistant（degraded） |
| 会话 | 7 个：5 个今天/昨天 + 1 个归档 + 1 个待审批 |
| 任务 | 8 个：submitted、working、input_required、auth_required、completed、failed、canceled、rejected |
| 知识文档 | 6 个：ready ×4（含「退款政策」）、indexing ×1、failed ×1 |
| 工作流 | 客服周报（published，7 步）、代码审查（published，4 步）、知识库巡检（draft，3 步） |

---

## 2. 对话 SSE 完整序列

### 2.1 场景

- 新会话，消息：`根据知识库里的 Q3 客服复盘和这份工单表，整理一份团队周报……`
- 使用工作流「客服周报」；
- 模型 `deepseek-chat`，`reasoning_effort=low`（原型默认标准）；
- 中途触发 Slack 写操作审批；
- 批准后继续，最终完成。

> 为可读性，示例省略了部分重复的 `workflow.step(done)`、`tool.start/result` 与 `message.delta` 帧；实际实现应按事件语义完整发送。

### 2.2 第一段：到审批为止

```text
id: 1
event: conversation.created
data: {"conversation_id":"22222222-2222-4222-8222-222222222222","title":"Q3 客服工单周报","ts":"2026-11-08T14:41:18Z","run_id":"33333333-3333-4333-8333-333333333333","seq":1}

id: 2
event: run.started
data: {"run_id":"33333333-3333-4333-8333-333333333333","conversation_id":"22222222-2222-4222-8222-222222222222","user_message_id":"44444444-4444-4444-8444-444444444444","client_message_id":"c-001","model":"deepseek-chat","reasoning_effort":"low","workflow_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","workflow_version":2,"ts":"2026-11-08T14:41:18Z","seq":2}

id: 3
event: message.created
data: {"message_id":"44444444-4444-4444-8444-444444444444","role":"user","client_message_id":"c-001","created_at":"2026-11-08T14:41:18Z","run_id":"33333333-3333-4333-8333-333333333333","ts":"2026-11-08T14:41:18Z","seq":3}

id: 4
event: message.started
data: {"message_id":"55555555-5555-4555-8555-555555555555","role":"assistant","run_id":"33333333-3333-4333-8333-333333333333","started_at":"2026-11-08T14:41:18Z","ts":"2026-11-08T14:41:18Z","seq":4}

id: 5
event: reasoning.delta
data: {"message_id":"55555555-5555-4555-8555-555555555555","delta":"这是一份要对外发布的团队周报，先把统计口径固定为按创建时间归入 Q3。","run_id":"33333333-3333-4333-8333-333333333333","ts":"2026-11-08T14:41:19Z","seq":5}

id: 6
event: reasoning.done
data: {"message_id":"55555555-5555-4555-8555-555555555555","duration_ms":12000,"tokens":642,"summary":"先固定统计口径；数字交 data-analyst 核对；Slack 发布前必须审批。","run_id":"33333333-3333-4333-8333-333333333333","ts":"2026-11-08T14:41:30Z","seq":6}

id: 7
event: workflow.step
data: {"workflow_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","workflow_version":2,"step_index":1,"step_type":"skill","name":"weekly-report","status":"running","duration_ms":null,"run_id":"33333333-3333-4333-8333-333333333333","ts":"2026-11-08T14:41:30Z","seq":7}

id: 8
event: skill.activated
data: {"skill_id":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","slug":"weekly-report","name":"周报生成","scope":"system","estimated_tokens":820,"run_id":"33333333-3333-4333-8333-333333333333","ts":"2026-11-08T14:41:30Z","seq":8}

id: 9
event: workflow.step
data: {"workflow_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","workflow_version":2,"step_index":2,"step_type":"retrieval","name":"search_knowledge","status":"running","duration_ms":null,"run_id":"33333333-3333-4333-8333-333333333333","ts":"2026-11-08T14:41:31Z","seq":9}

id: 10
event: tool.start
data: {"tool_call_id":"call_1","tool":"search_knowledge","display_name":"知识检索","args":{"query":"Q3 客服复盘 · 工单分类口径","top_k":5},"args_preview":"query=Q3 客服复盘 · 工单分类口径, top_k=5","source":"knowledge","source_id":null,"run_id":"33333333-3333-4333-8333-333333333333","ts":"2026-11-08T14:41:31Z","seq":10}

id: 11
event: tool.result
data: {"tool_call_id":"call_1","status":"ok","summary":"命中 3 个片段","result_preview":"Q3 客服复盘 v2 (0.94)、工单分类规范 v3 (0.92)、售后话术库 (0.81)","duration_ms":800,"source":"knowledge","citations":[{"index":1,"document_id":"99999999-9999-4999-8999-999999999999","chunk_id":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","title":"Q3 客服复盘 v2","category":"客服","score":0.94,"updated_at":"2026-09-30T00:00:00Z"}],"run_id":"33333333-3333-4333-8333-333333333333","ts":"2026-11-08T14:41:32Z","seq":11}

id: 12
event: a2a.task
data: {"task_id":"88888888-8888-4888-8888-888888888888","a2a_task_id":"task_9b2a","agent":"data-analyst","agent_detail":{"id":"77777777-7777-4777-8777-777777777777","slug":"data-analyst","name":"Data Analyst"},"state":"working","progress":0.3,"request_summary":"核对工单数字与知识库来源","duration_ms":null,"run_id":"33333333-3333-4333-8333-333333333333","ts":"2026-11-08T14:41:32Z","seq":12}

id: 13
event: a2a.artifact
data: {"task_id":"88888888-8888-4888-8888-888888888888","a2a_task_id":"task_9b2a","artifact":{"type":"text","summary":"12/12 项数字核对通过，2 处引用待补。","parts":[],"data":{"checks_passed":12,"checks_total":12,"missing_citations":2,"errors":0}},"run_id":"33333333-3333-4333-8333-333333333333","ts":"2026-11-08T14:41:33Z","seq":13}

id: 14
event: a2a.task
data: {"task_id":"88888888-8888-4888-8888-888888888888","a2a_task_id":"task_9b2a","agent":"data-analyst","agent_detail":{"id":"77777777-7777-4777-8777-777777777777","slug":"data-analyst","name":"Data Analyst"},"state":"completed","progress":1.0,"result_summary":"12/12 项数字核对通过","duration_ms":1200,"run_id":"33333333-3333-4333-8333-333333333333","ts":"2026-11-08T14:41:33Z","seq":14}

id: 15
event: approval.required
data: {"approval_id":"66666666-6666-4666-8666-666666666666","tool":"mcp__slack_mcp__post_message","tool_display_name":"Slack · 发送消息","reason":"外部写操作触发 HITL，等待人工确认","payload":{"channel":"C08F3K2","text":"Q3 客服工单周报"},"source":"mcp","executor":"slack-mcp","target":"#support-weekly · 12 名成员","side_effect":"外部写操作；发布后可在 Slack 中删除","risk":"write","expires_at":"2026-11-08T15:13:00Z","run_id":"33333333-3333-4333-8333-333333333333","ts":"2026-11-08T14:43:00Z","seq":15}
```

> 此时连接保持（D8 推荐方案），前端显示审批卡；用户调用 `POST /approvals/{id}/decision`。

### 2.3 第二段：批准后继续

```text
id: 16
event: message.delta
data: {"message_id":"55555555-5555-4555-8555-555555555555","delta":"已批准，正在发布到 #support-weekly。","run_id":"33333333-3333-4333-8333-333333333333","ts":"2026-11-08T14:43:05Z","seq":16}

id: 17
event: tool.start
data: {"tool_call_id":"call_2","tool":"mcp__slack_mcp__post_message","display_name":"Slack · 发送消息","args":{"channel":"C08F3K2"},"args_preview":"channel=C08F3K2","source":"mcp","source_id":"dddddddd-dddd-4ddd-8ddd-dddddddddddd","server":"slack-mcp","risk":"write","requires_approval":true,"run_id":"33333333-3333-4333-8333-333333333333","ts":"2026-11-08T14:43:05Z","seq":17}

id: 18
event: tool.result
data: {"tool_call_id":"call_2","status":"ok","summary":"已发布到 #support-weekly","result_preview":"message_ts=1731067385.123","duration_ms":400,"source":"mcp","run_id":"33333333-3333-4333-8333-333333333333","ts":"2026-11-08T14:43:06Z","seq":18}

id: 19
event: message.done
data: {"run_id":"33333333-3333-4333-8333-333333333333","message_id":"55555555-5555-4555-8555-555555555555","usage":{"input_tokens":6842,"output_tokens":1236,"reasoning_tokens":642,"total_tokens":8078},"finish_reason":"stop","model":"deepseek-chat","first_token_ms":120,"duration_ms":108000,"active_duration_ms":42000,"citations":[{"index":1,"document_id":"99999999-9999-4999-8999-999999999999","chunk_id":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","title":"Q3 客服复盘 v2","category":"客服","score":0.94,"updated_at":"2026-09-30T00:00:00Z"}],"artifacts":[{"id":"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee","name":"Q3 客服工单周报.md","mime_type":"text/markdown","size_bytes":2457,"kind":"markdown","content":"# Q3 客服工单周报","download_url":null}],"reasoning":{"duration_ms":12000,"tokens":642,"summary":"先固定统计口径；数字交 data-analyst 核对；Slack 发布前必须审批。"},"ts":"2026-11-08T14:43:06Z","seq":19}
```

### 2.4 顺序断言

```text
conversation.created → run.started → message.created → message.started
→ reasoning.delta* → reasoning.done? → skill.activated* → tool.start/result*
→ a2a.task/artifact* → approval.required? → （用户决定）
→ message.delta* → tool.start/result* → message.done
```

- `run.started` 之前不得出现任何带 `run_id` 的业务事件（`conversation.created` 除外）；
- `message.started` 之前不得出现 `message.delta` / `reasoning.delta`；
- `message.done` 之后不得再发同一 `message_id` 的增量；
- `seq` 连续递增，允许跳号但不得回退。

---

## 3. 关键响应样例

> 为节省篇幅，部分列表只列 2 条 `items`，但 `stats` 是全集统计；后端种子数据可按第 1 节补足。

### 3.1 会话列表

```json
{
  "items": [
    {
      "id": "22222222-2222-4222-8222-222222222222",
      "title": "Q3 客服工单周报",
      "status": "active",
      "message_count": 24,
      "last_message_preview": "周报已经定稿，发布前需要你确认。",
      "last_message_at": "2026-11-08T14:43:06Z",
      "pending_approval_count": 1,
      "created_at": "2026-11-08T14:41:18Z",
      "updated_at": "2026-11-08T14:43:06Z"
    },
    {
      "id": "22222222-2222-4222-8222-222222222223",
      "title": "退款政策变更的影响面",
      "status": "active",
      "message_count": 37,
      "last_message_preview": "退款高峰集中在 8 月第二周。",
      "last_message_at": "2026-11-08T14:20:00Z",
      "pending_approval_count": 0,
      "created_at": "2026-11-07T10:00:00Z",
      "updated_at": "2026-11-08T14:20:00Z"
    }
  ],
  "next_cursor": "cursor_conv_2",
  "has_more": true,
  "stats": {"total": 7, "active": 6, "archived": 1, "pending_approval": 1}
}
```

### 3.2 运行详情

```json
{
  "id": "33333333-3333-4333-8333-333333333333",
  "conversation_id": "22222222-2222-4222-8222-222222222222",
  "status": "succeeded",
  "source": "user",
  "model": "deepseek-chat",
  "reasoning_effort": "low",
  "workflow": {"id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "name": "客服周报", "version": 2},
  "capabilities": {
    "skills": [],
    "mcp_servers": [],
    "mcp_tools": [],
    "knowledge_categories": []
  },
  "usage": {"input_tokens": 6842, "output_tokens": 1236, "reasoning_tokens": 642, "total_tokens": 8078},
  "started_at": "2026-11-08T14:41:18Z",
  "finished_at": "2026-11-08T14:43:06Z",
  "duration_ms": 108000,
  "active_duration_ms": 42000,
  "first_token_ms": 120,
  "pending": null,
  "message_ids": {
    "user": "44444444-4444-4444-8444-444444444444",
    "assistant": "55555555-5555-4555-8555-555555555555"
  },
  "agents": [
    {"kind": "local", "id": "main-agent", "name": "main-agent", "model": "deepseek-chat", "state": "online"},
    {"kind": "a2a", "id": "77777777-7777-4777-8777-777777777777", "slug": "data-analyst", "name": "Data Analyst", "skill_id": "verify_numbers", "state": "idle"}
  ],
  "error": null
}
```

### 3.3 运行事件（节选）

```json
{
  "items": [
    {
      "id": "evt_01",
      "seq": 1,
      "ts": "2026-11-08T14:41:18Z",
      "type": "request",
      "status": "ok",
      "title": "用户消息",
      "subtitle": "Q3 客服工单周报",
      "duration_ms": null,
      "tokens": {"input": 6842},
      "payload": {
        "method": "POST",
        "path": "/api/v1/chat/stream",
        "conversation_id": "22222222-2222-4222-8222-222222222222",
        "message_id": "44444444-4444-4444-8444-444444444444",
        "client_message_id": "c-001",
        "model": "deepseek-chat",
        "reasoning_effort": "low",
        "attachments": [],
        "skills": [],
        "mcp_servers": [],
        "knowledge_categories": ["客服"],
        "workflow_id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
      },
      "error": null
    },
    {
      "id": "evt_02",
      "seq": 2,
      "ts": "2026-11-08T14:41:30Z",
      "type": "skill",
      "status": "ok",
      "title": "加载技能",
      "subtitle": "weekly-report@1.2",
      "duration_ms": 100,
      "tokens": null,
      "payload": {
        "skill_id": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        "slug": "weekly-report",
        "name": "周报生成",
        "scope": "system",
        "source": "builtin",
        "estimated_tokens": 820
      },
      "error": null
    },
    {
      "id": "evt_03",
      "seq": 3,
      "ts": "2026-11-08T14:41:31Z",
      "type": "tool",
      "status": "ok",
      "title": "search_knowledge",
      "subtitle": "3 hits · pgvector",
      "duration_ms": 800,
      "tokens": null,
      "payload": {
        "tool_call_id": "call_1",
        "tool": "search_knowledge",
        "display_name": "知识检索",
        "source": "knowledge",
        "source_id": null,
        "args": {"query": "Q3 客服复盘 · 工单分类口径", "top_k": 5},
        "result": {"hits": 3}
      },
      "error": null
    },
    {
      "id": "evt_04",
      "seq": 4,
      "ts": "2026-11-08T14:41:32Z",
      "type": "a2a",
      "status": "ok",
      "title": "data-analyst",
      "subtitle": "task_9b2a · 12/12",
      "duration_ms": 1200,
      "tokens": null,
      "payload": {
        "task_id": "88888888-8888-4888-8888-888888888888",
        "a2a_task_id": "task_9b2a",
        "agent": "data-analyst",
        "agent_detail": {"id": "77777777-7777-4777-8777-777777777777", "slug": "data-analyst", "name": "Data Analyst"},
        "state": "completed",
        "progress": 1.0,
        "artifact": {"type": "text", "summary": "12/12 项数字核对通过"}
      },
      "error": null
    },
    {
      "id": "evt_05",
      "seq": 5,
      "ts": "2026-11-08T14:43:00Z",
      "type": "approval",
      "status": "ok",
      "title": "发送审批",
      "subtitle": "mcp__slack_mcp__post_message",
      "duration_ms": 5000,
      "tokens": null,
      "payload": {
        "approval_id": "66666666-6666-4666-8666-666666666666",
        "tool_name": "mcp__slack_mcp__post_message",
        "source": "mcp",
        "executor": "slack-mcp",
        "target": "#support-weekly · 12 名成员",
        "side_effect": "外部写操作；发布后可在 Slack 中删除",
        "risk": "write",
        "reason": "外部写操作触发 HITL",
        "decision": "approve",
        "decided_at": "2026-11-08T14:43:04Z"
      },
      "error": null
    }
  ],
  "next_cursor": "cursor_evt_5",
  "has_more": true
}
```

### 3.4 审批详情

```json
{
  "id": "66666666-6666-4666-8666-666666666666",
  "run_id": "33333333-3333-4333-8333-333333333333",
  "conversation_id": "22222222-2222-4222-8222-222222222222",
  "conversation_title": "Q3 客服工单周报",
  "status": "approved",
  "tool_name": "mcp__slack_mcp__post_message",
  "tool_display_name": "Slack · 发送消息",
  "source": "mcp",
  "executor": "slack-mcp",
  "target": "#support-weekly · 12 名成员",
  "side_effect": "外部写操作；发布后可在 Slack 中删除",
  "risk": "write",
  "reason": "外部写操作触发 HITL，等待人工确认",
  "payload": {"channel": "C08F3K2", "text": "Q3 客服工单周报"},
  "payload_preview": "{\"channel\":\"C08F3K2\",\"text\":\"Q3 客服工单周报\"}",
  "expires_at": "2026-11-08T15:13:00Z",
  "created_at": "2026-11-08T14:43:00Z",
  "decided_at": "2026-11-08T14:43:04Z",
  "decided_by": {"id": "11111111-1111-4111-8111-111111111111", "display_name": "周丹"},
  "decision_note": "确认执行"
}
```

### 3.5 智能体列表

```json
{
  "items": [
    {
      "id": "77777777-7777-4777-8777-777777777777",
      "slug": "data-analyst",
      "name": "Data Analyst",
      "description": "数据分析与数字核对",
      "url": "https://data.example.com/a2a",
      "protocol_version": "1.0",
      "skills": [{"id": "verify_numbers", "name": "数字核对"}, {"id": "analyze_tickets", "name": "工单分析"}],
      "skill_count": 2,
      "auth_type": "api_key",
      "auth_scheme": "bearer",
      "auth_hint": "env:DATA_AGENT_KEY",
      "capabilities": {"streaming": true, "push_notifications": false},
      "health_status": "healthy",
      "enabled": true,
      "last_checked_at": "2026-11-08T15:41:08Z",
      "last_latency_ms": 142,
      "last_error": null,
      "recent_task": {"id": "88888888-8888-4888-8888-888888888888", "a2a_task_id": "task_9b2a", "state": "completed", "duration_ms": 1200, "finished_at": "2026-11-08T14:41:33Z"}
    },
    {
      "id": "77777777-7777-4777-8777-777777777778",
      "slug": "code-assistant",
      "name": "Code Assistant",
      "description": "代码审查与解释",
      "url": "https://code.example.com/a2a",
      "protocol_version": "1.0",
      "skills": [{"id": "review_code", "name": "代码审查"}],
      "skill_count": 1,
      "auth_type": "api_key",
      "auth_scheme": "bearer",
      "auth_hint": "env:CODE_AGENT_KEY",
      "capabilities": {"streaming": true, "push_notifications": false},
      "health_status": "degraded",
      "enabled": true,
      "last_checked_at": "2026-11-08T15:39:52Z",
      "last_latency_ms": null,
      "last_error": "502 a2a_unavailable",
      "recent_task": {"id": "88888888-8888-4888-8888-888888888889", "a2a_task_id": "task_1a77", "state": "failed", "duration_ms": 6400, "finished_at": "2026-11-08T15:38:17Z"}
    }
  ],
  "next_cursor": "cursor_agent_2",
  "has_more": true,
  "stats": {"total": 3, "healthy": 2, "degraded": 1, "unhealthy": 0, "disabled": 0, "enabled": 3}
}
```

### 3.6 任务列表（节选）

```json
{
  "items": [
    {
      "id": "88888888-8888-4888-8888-888888888880",
      "a2a_task_id": "task_2e91",
      "agent": {"id": "77777777-7777-4777-8777-777777777778", "slug": "editorial-reviewer", "name": "Editorial Reviewer"},
      "run_id": "33333333-3333-4333-8333-333333333334",
      "conversation": {"id": "22222222-2222-4222-8222-222222222223", "title": "退款政策变更的影响面"},
      "state": "working",
      "progress": 0.3,
      "duration_ms": 12000,
      "request_summary": "审阅「退款政策变更说明」的措辞",
      "error_summary": null,
      "available_actions": ["cancel"],
      "created_at": "2026-11-08T15:44:02Z",
      "updated_at": "2026-11-08T15:44:15Z"
    },
    {
      "id": "88888888-8888-4888-8888-888888888881",
      "a2a_task_id": "task_4d18",
      "agent": {"id": "77777777-7777-4777-8777-777777777777", "slug": "data-analyst", "name": "Data Analyst"},
      "run_id": "33333333-3333-4333-8333-333333333334",
      "conversation": {"id": "22222222-2222-4222-8222-222222222223", "title": "退款政策变更的影响面"},
      "state": "input_required",
      "progress": null,
      "duration_ms": 61000,
      "request_summary": "核对 9 月退款工单统计口径",
      "error_summary": null,
      "available_actions": ["resume", "cancel"],
      "created_at": "2026-11-08T15:43:20Z",
      "updated_at": "2026-11-08T15:44:21Z"
    },
    {
      "id": "88888888-8888-4888-8888-888888888882",
      "a2a_task_id": "task_6f02",
      "agent": {"id": "77777777-7777-4777-8777-777777777778", "slug": "code-assistant", "name": "Code Assistant"},
      "run_id": "33333333-3333-4333-8333-333333333335",
      "conversation": {"id": "22222222-2222-4222-8222-222222222224", "title": "审查：payment 模块重试逻辑"},
      "state": "auth_required",
      "progress": null,
      "duration_ms": 1000,
      "request_summary": "审查 payment 模块重试逻辑",
      "error_summary": null,
      "available_actions": ["authorize", "reject", "cancel"],
      "created_at": "2026-11-08T15:37:40Z",
      "updated_at": "2026-11-08T15:37:41Z"
    }
  ],
  "next_cursor": "cursor_task_3",
  "has_more": true,
  "stats": {"total": 8, "submitted": 1, "working": 1, "input_required": 1, "auth_required": 1, "completed": 1, "failed": 1, "canceled": 1, "rejected": 1}
}
```

### 3.7 任务详情：`input_required`

```json
{
  "id": "88888888-8888-4888-8888-888888888881",
  "a2a_task_id": "task_4d18",
  "agent": {"id": "77777777-7777-4777-8777-777777777777", "slug": "data-analyst", "name": "Data Analyst"},
  "run_id": "33333333-3333-4333-8333-333333333334",
  "conversation": {"id": "22222222-2222-4222-8222-222222222223", "title": "退款政策变更的影响面"},
  "tool_call_id": "call_2",
  "state": "input_required",
  "progress": null,
  "request": {
    "tool": "send_message",
    "args": {"task": "核对 9 月退款工单统计口径"},
    "summary": "核对 9 月退款工单统计口径"
  },
  "result": null,
  "error": null,
  "input_request": {
    "question": "请补充 9 月退款工单的统计口径：按创建时间还是完成时间？",
    "input_schema": {"type": "string", "maxLength": 2000},
    "expires_at": "2026-11-08T16:30:00Z"
  },
  "auth_request": null,
  "timeline": [
    {"state": "submitted", "at": "2026-11-08T15:43:20Z", "duration_ms": 1000, "note": ""},
    {"state": "working", "at": "2026-11-08T15:43:21Z", "duration_ms": 60000, "note": ""},
    {"state": "input_required", "at": "2026-11-08T15:44:21Z", "duration_ms": null, "note": "等待你的补充"}
  ],
  "available_actions": ["resume", "cancel"],
  "created_at": "2026-11-08T15:43:20Z",
  "updated_at": "2026-11-08T15:44:21Z",
  "started_at": "2026-11-08T15:43:20Z",
  "finished_at": null,
  "duration_ms": 61000
}
```

### 3.8 任务详情：`auth_required`

```json
{
  "id": "88888888-8888-4888-8888-888888888882",
  "a2a_task_id": "task_6f02",
  "agent": {"id": "77777777-7777-4777-8777-777777777778", "slug": "code-assistant", "name": "Code Assistant"},
  "run_id": "33333333-3333-4333-8333-333333333335",
  "conversation": {"id": "22222222-2222-4222-8222-222222222224", "title": "审查：payment 模块重试逻辑"},
  "tool_call_id": "call_3",
  "state": "auth_required",
  "progress": null,
  "request": {
    "tool": "send_message",
    "args": {"task": "审查 payment 模块重试逻辑"},
    "summary": "审查 payment 模块重试逻辑"
  },
  "result": null,
  "error": null,
  "input_request": null,
  "auth_request": {
    "scopes": ["repo:read"],
    "authorization_url": "https://github.com/login/oauth/authorize?client_id=...",
    "expires_at": "2026-11-08T16:30:00Z"
  },
  "timeline": [
    {"state": "submitted", "at": "2026-11-08T15:37:40Z", "duration_ms": 1000, "note": ""},
    {"state": "auth_required", "at": "2026-11-08T15:37:41Z", "duration_ms": null, "note": "等待授权"}
  ],
  "available_actions": ["authorize", "reject", "cancel"],
  "created_at": "2026-11-08T15:37:40Z",
  "updated_at": "2026-11-08T15:37:41Z",
  "started_at": "2026-11-08T15:37:40Z",
  "finished_at": null,
  "duration_ms": 1000
}
```

### 3.9 知识库列表

```json
{
  "items": [
    {
      "id": "99999999-9999-4999-8999-999999999999",
      "title": "Q3 客服复盘 v2",
      "category": "客服",
      "status": "ready",
      "chunk_count": 24,
      "size_bytes": 184320,
      "source_uri": "data/q3-review.md",
      "owner": {"id": "11111111-1111-4111-8111-111111111111", "display_name": "周丹"},
      "error": null,
      "created_at": "2026-09-30T00:00:00Z",
      "updated_at": "2026-09-30T00:00:00Z"
    },
    {
      "id": "99999999-9999-4999-8999-999999999998",
      "title": "产品发布说明 Q3",
      "category": "产品",
      "status": "failed",
      "chunk_count": 0,
      "size_bytes": 20480,
      "source_uri": "data/q3-release.pdf",
      "owner": null,
      "error": "PDF 解析失败：字体嵌入异常",
      "created_at": "2026-07-15T00:00:00Z",
      "updated_at": "2026-07-15T00:05:00Z"
    }
  ],
  "next_cursor": "cursor_doc_2",
  "has_more": true,
  "stats": {"documents": 128, "chunks": 1842, "ready": 124, "indexing": 2, "pending": 1, "failed": 1}
}
```

### 3.10 知识库检索

```json
{
  "hits": [
    {
      "chunk_id": "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      "document_id": "99999999-9999-4999-8999-999999999997",
      "title": "退款政策",
      "document_title": "退款政策",
      "document_filename": "退款政策.md",
      "category": "售后",
      "chunk_index": 3,
      "content": "退货需要保留吊牌与包装，签收后 7 天内可申请退款……",
      "score": 0.83,
      "updated_at": "2026-09-18T00:00:00Z"
    }
  ],
  "elapsed_ms": 42
}
```

### 3.11 工作流列表

```json
{
  "items": [
    {
      "id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      "slug": "customer-weekly",
      "name": "客服周报",
      "description": "检索复盘与工单表，生成周报草稿，交给数据分析与措辞审阅，校验 Slack 频道后审批发布。",
      "scope": "user",
      "status": "published",
      "version": 2,
      "step_count": 7,
      "run_count": 12,
      "updated_at": "2026-10-30T00:00:00Z"
    },
    {
      "id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab",
      "slug": "knowledge-audit",
      "name": "知识库巡检",
      "description": "列出知识库文档，检查索引与分块状态，重建过期索引并生成巡检报告。",
      "scope": "user",
      "status": "draft",
      "version": 1,
      "step_count": 3,
      "run_count": 0,
      "updated_at": "2026-11-05T00:00:00Z"
    }
  ],
  "next_cursor": "cursor_wf_2",
  "has_more": true,
  "stats": {"total": 3, "published": 2, "draft": 1, "disabled": 0, "avg_steps": 5}
}
```

### 3.12 管理概览

```json
{
  "kpis": {
    "users": {"total": 6, "new_this_week": 2},
    "runs_today": {"total": 42, "delta_pct": 18},
    "approvals": {"pending": 1},
    "agents": {"total": 3, "degraded": 1, "healthy": 2},
    "knowledge": {"documents": 128, "failed": 2, "ready": 126}
  },
  "run_volume": [
    {"date": "2026-11-02", "runs": 186},
    {"date": "2026-11-03", "runs": 204},
    {"date": "2026-11-04", "runs": 176},
    {"date": "2026-11-05", "runs": 214},
    {"date": "2026-11-06", "runs": 198},
    {"date": "2026-11-07", "runs": 230},
    {"date": "2026-11-08", "runs": 284}
  ],
  "pending_items": [
    {"kind": "approval", "count": 1, "label": "审批等待决定"},
    {"kind": "agent_degraded", "count": 1, "label": "code-assistant 处于降级状态"},
    {"kind": "knowledge_failed", "count": 2, "label": "2 篇知识文档入库失败"}
  ],
  "recent_audit": []
}
```

### 3.13 个人能力层（节选）

`GET /api/v1/instructions`

```json
{
  "effective": "回答先给结论，再给依据；涉及数据时标注来源，不确定时明确说明。",
  "source": "user",
  "user_value": "回答先给结论，再给依据；涉及数据时标注来源，不确定时明确说明。",
  "default_value": "回答使用中文；专业问题给出依据。",
  "max_chars": 4000,
  "updated_at": "2026-11-05T10:00:00Z"
}
```

`GET /api/v1/memories?limit=20`

```json
{
  "items": [
    {
      "id": "mem_9f2c",
      "kind": "preference",
      "title": "称呼偏好",
      "content": "希望被称为「老赵」，回答保持简洁，先给结论。",
      "pinned": true,
      "status": "active",
      "source": {
        "kind": "conversation",
        "label": "Q3 客服工单周报",
        "conversation_id": "22222222-2222-4222-8222-222222222222",
        "conversation_title": "Q3 客服工单周报",
        "created_by": "agent"
      },
      "created_at": "2026-11-05T10:00:00Z",
      "updated_at": "2026-11-05T10:00:00Z"
    },
    {
      "id": "mem_9f2d",
      "kind": "fact",
      "title": "团队周报口径",
      "content": "客服周报按主标签聚合，多标签工单只计一次。",
      "pinned": false,
      "status": "active",
      "source": {"kind": "manual", "label": "手动保存", "created_by": "user"},
      "created_at": "2026-11-03T10:00:00Z",
      "updated_at": "2026-11-03T10:00:00Z"
    }
  ],
  "next_cursor": "cursor_mem_2",
  "has_more": true,
  "stats": {"total": 3, "profile": 0, "preference": 2, "fact": 1, "active": 3, "archived": 0}
}
```

`GET /api/v1/skills`

```json
{
  "items": [
    {
      "id": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      "slug": "weekly-report",
      "name": "周报生成",
      "description": "固定章节、口径引用规则与团队语气。",
      "scope": "system",
      "source": "builtin",
      "enabled": true,
      "effective_enabled": true,
      "editable": false,
      "file_count": 3,
      "size_bytes": 1229,
      "estimated_tokens": 820,
      "updated_at": "2026-10-30T00:00:00Z"
    }
  ],
  "next_cursor": "cursor_skill_1",
  "has_more": true,
  "stats": {"total": 3, "system": 2, "user": 1, "enabled": 3}
}
```

`GET /api/v1/mcp/servers`

```json
{
  "items": [
    {
      "id": "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      "slug": "slack-mcp",
      "name": "Slack",
      "scope": "system",
      "transport": "streamable_http",
      "enabled": true,
      "effective_enabled": true,
      "health_status": "healthy",
      "tool_count": 12,
      "write_tools_allowed": false,
      "admin_only_write_tools": true,
      "credentials_hint": "Bearer ****xxx",
      "last_checked_at": "2026-11-08T15:41:08Z",
      "last_error": null
    }
  ],
  "next_cursor": "cursor_mcp_1",
  "has_more": true,
  "stats": {"total": 2, "system": 1, "user": 1, "enabled": 2}
}
```

### 3.14 管理端（节选）

`GET /api/v1/admin/users?limit=20`

```json
{
  "items": [
    {
      "id": "11111111-1111-4111-8111-111111111111",
      "display_name": "周丹",
      "email": "you@example.com",
      "roles": [{"id": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1", "key": "superadmin", "name": "超级管理员"}],
      "status": "active",
      "last_login_at": "2026-11-08T01:42:00Z",
      "session_count": 12,
      "created_at": "2026-10-01T08:00:00Z"
    },
    {
      "id": "11111111-1111-4111-8111-111111111112",
      "display_name": "王砚",
      "email": "wang.yan@example.com",
      "roles": [{"id": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3", "key": "auditor", "name": "只读审计"}],
      "status": "disabled",
      "last_login_at": "2026-10-28T11:20:00Z",
      "session_count": 3,
      "created_at": "2026-10-01T08:00:00Z"
    }
  ],
  "next_cursor": "cursor_user_2",
  "has_more": true,
  "stats": {"total": 6, "active": 4, "disabled": 1, "pending": 1}
}
```

`GET /api/v1/admin/roles`

```json
{
  "items": [
    {"id": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1", "key": "superadmin", "name": "超级管理员", "description": "拥有全部权限，系统内置。", "builtin": true, "permission_count": 28, "user_count": 1},
    {"id": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2", "key": "ops", "name": "运营管理员", "description": "管理工作流、智能体、任务和知识库。", "builtin": false, "permission_count": 19, "user_count": 1}
  ],
  "next_cursor": "cursor_role_2",
  "has_more": true
}
```

`GET /api/v1/admin/menus/tree?scope=admin`

```json
{
  "items": [
    {
      "id": "cccccccc-cccc-4ccc-8ccc-ccccccccccc1",
      "parent_id": null,
      "name": "管理控制台",
      "path": "/admin",
      "type": "directory",
      "icon": "console",
      "permission_key": null,
      "sort": 2,
      "visible": true,
      "enabled": true,
      "children": [
        {"id": "cccccccc-cccc-4ccc-8ccc-ccccccccccc2", "name": "用户管理", "path": "/admin/users", "type": "page", "icon": "users", "permission_key": "admin:user:read", "sort": 2, "visible": true, "enabled": true, "children": []}
      ]
    }
  ]
}
```

`GET /api/v1/admin/dictionaries`

```json
{
  "items": [
    {
      "id": "dddddddd-dddd-4ddd-8ddd-ddddddddddd2",
      "code": "task_status",
      "name": "任务状态",
      "description": "任务与运行状态",
      "item_count": 8,
      "items": [
        {"label": "已提交", "value": "submitted", "color": "gray", "sort": 1, "enabled": true},
        {"label": "运行中", "value": "working", "color": "blue", "sort": 2, "enabled": true},
        {"label": "等待输入", "value": "input_required", "color": "amber", "sort": 3, "enabled": true},
        {"label": "需要授权", "value": "auth_required", "color": "purple", "sort": 4, "enabled": true},
        {"label": "已完成", "value": "completed", "color": "green", "sort": 5, "enabled": true},
        {"label": "失败", "value": "failed", "color": "red", "sort": 6, "enabled": true},
        {"label": "已取消", "value": "canceled", "color": "gray", "sort": 7, "enabled": true},
        {"label": "已拒绝", "value": "rejected", "color": "red", "sort": 8, "enabled": true}
      ]
    }
  ],
  "next_cursor": "cursor_dict_2",
  "has_more": true
}
```

`GET /api/v1/admin/audit?limit=20`

```json
{
  "items": [
    {
      "id": 12345,
      "created_at": "2026-11-08T09:42:00Z",
      "actor": {"id": "11111111-1111-4111-8111-111111111111", "name": "周丹", "type": "user"},
      "category": "menu",
      "action": "menu.update",
      "action_label": "更新菜单",
      "resource": {"type": "menu", "id": "cccccccc-cccc-4ccc-8ccc-ccccccccccc2", "label": "管理控制台 / 用户管理"},
      "ip": "10.0.12.4",
      "result": "success",
      "error_code": null,
      "request_id": "req_..."
    }
  ],
  "next_cursor": "cursor_audit_1",
  "has_more": true
}
```

---

## 4. 原型 → API 字段映射

| 原型显示 | API 字段 | 备注 |
|---|---|---|
| 会话「37 条消息」 | `conversations[].message_count` | 不含 tool/system |
| 会话「待审批」 | `pending_approval_count > 0` | 也可用 `approvals.stats.pending` |
| 会话分组「今天/昨天/10 月」 | `last_message_at` / `created_at` | 前端按本地时区分组 |
| 运行条「7 步」 | `workflow.step_count` 或事件数 | 原型是工作流步骤数 |
| 运行条「思考 12s · 642 tokens」 | `reasoning.done` / `message.done.reasoning` | |
| 「输入 6,842 / 输出 1,236」 | `usage.input_tokens/output_tokens` | |
| 工具卡「0.8s · 3 hits」 | `tool.result.duration_ms/summary` | |
| A2A 卡「task_9b2a · 完成」 | `a2a_task_id`、`state` | 路径用本地 `id` |
| 审批卡「执行方/目标/副作用」 | `approvals.executor/target/side_effect` | |
| 审批卡「超时」 | `expires_at` | 前端倒计时 |
| 智能体「2 健康 / 1 降级」 | `agents.stats.healthy/degraded` | |
| 智能体「142ms」 | `last_latency_ms` | |
| 任务「等待输入」 | `state=input_required` | |
| 任务「补充信息」 | `available_actions` 含 `resume` | |
| 知识库「128 文档 / 1,842 片段」 | `knowledge.stats.documents/chunks` | |
| 检索「0.83」 | `hits[].score` | |
| 检索「chunk_51de · 退款政策.md」 | `chunk_id` + `title` / `document_filename` | |
| 工作流「12 次」 | `run_count` | |
| 管理概览「99.98%」 | `system/health.status` 或可用率 | 无监控时显示 `—` |

---

## 5. 契约测试用例

> 建议后端用 pytest + `httpx.ASGITransport`，前端用同一批 fixtures 做 mock。

### 5.1 认证

| ID | 用例 | 期望 |
|---|---|---|
| AUTH-01 | 重复邮箱注册 | `409 conflict` |
| AUTH-02 | 错误密码登录 | `401 unauthorized` |
| AUTH-03 | access 过期 + 有效 refresh | 换发新 access，旧 refresh 失效 |
| AUTH-04 | 登出后使用 refresh | `401` |
| AUTH-05 | 普通用户访问 `/admin/*` | `403 forbidden` |
| AUTH-06 | 访问他人会话 | `404 not_found` |

### 5.2 会话

| ID | 用例 | 期望 |
|---|---|---|
| CONV-01 | 列表默认排序 | `last_message_at desc` |
| CONV-02 | `q` 搜索标题 | 大小写不敏感，最多 100 字符 |
| CONV-03 | 消息分页翻两页 | 不重不漏 |
| CONV-04 | 软删除后列表 | 不再出现 |
| CONV-05 | `message_count` | 与消息表一致，不含 tool/system |

### 5.3 聊天与 SSE

| ID | 用例 | 期望 |
|---|---|---|
| CHAT-01 | 新会话首帧 | `conversation.created` 在 `run.started` 前 |
| CHAT-02 | 响应头 | `X-Run-ID` 存在且等于 run |
| CHAT-03 | 事件顺序 | 符合 2.4 断言 |
| CHAT-04 | 取消 | `message.done.finish_reason=canceled`，内容保留 |
| CHAT-05 | 同一会话并发 | 第二个请求 `409 run_in_progress`，带 `run_id` |
| CHAT-06 | 非法模型 | `422 model_not_allowed` |
| CHAT-07 | 工作流 + 技能同时传 | `422 workflow_context_conflict` |
| CHAT-08 | 附件未就绪 | `422 attachment_not_ready` |
| CHAT-09 | 未知 SSE 事件 | 前端忽略，不中断 |
| CHAT-10 | HITL 批准后 | 同一连接继续输出，最终 `message.done` |
| CHAT-11 | HITL 超时 | `finish_reason=interrupted`，run 可恢复 |

### 5.4 审批

| ID | 用例 | 期望 |
|---|---|---|
| APR-01 | 批准 | `resumed=true`，run 继续 |
| APR-02 | 拒绝 | 工具不执行，run 结束 |
| APR-03 | 重复决定 | `409 approval_already_decided` |
| APR-04 | 过期决定 | `409 approval_expired` |
| APR-05 | 两个并发决定 | 只有一个成功 |
| APR-06 | 过期扫描 | `status=expired`，run 取消 |

### 5.5 任务

| ID | 用例 | 期望 |
|---|---|---|
| TASK-01 | 8 状态列表 | `stats` 与过滤后全量一致；items 为节选时 `has_more=true` |
| TASK-02 | `input_required` 调 resume | 同一 `a2a_task_id` 继续，不新建 |
| TASK-03 | `working` 调 resume | `409 task_not_resumable` |
| TASK-04 | `auth_required` 调 authorize | 状态推进 |
| TASK-05 | `auth_required` 调 reject | `state=rejected`，不重试 |
| TASK-06 | 终态调 cancel | `409 task_not_cancelable` |
| TASK-07 | `available_actions` | 与状态矩阵一致 |

### 5.6 智能体

| ID | 用例 | 期望 |
|---|---|---|
| AGENT-01 | preview 不落库 | 列表数量不变 |
| AGENT-02 | Card 同源校验失败 | `422 agent_card_invalid` |
| AGENT-03 | SSRF 地址 | `403/422`，不发起请求 |
| AGENT-04 | 健康检查失败 | `health_status=degraded/unhealthy` |
| AGENT-05 | 删除有运行任务 | `409 conflict` |

### 5.7 知识库

| ID | 用例 | 期望 |
|---|---|---|
| KB-01 | 上传不支持类型 | `422 unsupported_file_type` |
| KB-02 | 上传超限 | `413 payload_too_large` |
| KB-03 | 重复 checksum | `409 conflict` + `existing_document_id` |
| KB-04 | failed 重试 | 状态回 `indexing` |
| KB-05 | 非所有者重建（D7=B） | `403/404` |
| KB-06 | 检索结果 | 含 `title/document_filename/chunk_index/score` |

### 5.8 工作流 / 管理端

| ID | 用例 | 期望 |
|---|---|---|
| WF-01 | 发布空步骤工作流 | `422 workflow_invalid` |
| WF-02 | 引用不存在的技能 | `422 workflow_ref_not_found` |
| WF-03 | 使用未发布工作流 | `409 workflow_disabled` |
| ADM-01 | 删除有子节点的菜单 | `409 conflict` |
| ADM-02 | 修改已上线字典 `value` | `422/409`（按策略） |
| ADM-03 | 删除内置角色 | `409 conflict` |
| ADM-04 | 审计筛选 | 时间/类别/结果正确 |

---

## 6. 前端 mock 建议

1. 把本文第 3 节 JSON 拆成 `fixtures/` 下的独立文件（或一个 `fixtures.json` 的命名空间）；
2. MSW handler 按路径返回对应 fixture；
3. SSE 用 `ReadableStream` 逐帧推送第 2 节文本，帧间延迟 100–300ms；
4. 对降级路径单独准备 `*-missing.json`（缺 `citations`、缺 `stats`、缺 `reasoning`）；
5. mock 的枚举值必须与后端一致，不要自造 `input-required`；
6. 切换真实后端时只改 base URL，不改组件逻辑。

## 7. 后端种子数据建议

- 用固定 UUID 灌入 6 个用户、3 个 Agent、6 个任务、5 个文档、3 个工作流；
- 会话与消息用第 2 节内容生成，保证轨迹页有数据；
- 审批保留 1 条 pending，便于演示；
- Agent 保留 1 条 degraded，知识库保留 1 条 failed，便于演示异常态；
- 种子脚本幂等（按 UUID upsert），可重复执行。

---

## 8. 一致性检查

交付前跑一遍：

- [ ] 所有 JSON 示例可被 `python -m json.tool` 解析；
- [ ] 示例中的 UUID 都是合法格式；
- [ ] 同一实体在不同示例中的 ID/名称一致；
- [ ] 枚举值与 `contract-delta.md`、原型文案映射一致；
- [ ] SSE 的 `seq` 连续，`event` 与 `data` 字段匹配；
- [ ] 列表示例都带 `items/next_cursor/has_more`；
- [ ] 时间都是 UTC ISO 8601；
- [ ] 没有把原型短 ID（`task_9b2a`）当作 API 主键。
