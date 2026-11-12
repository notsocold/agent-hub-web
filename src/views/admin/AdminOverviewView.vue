<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import AppIcon from '@/components/common/AppIcon.vue'
import ErrorState from '@/components/common/ErrorState.vue'
import LoadingSkeleton from '@/components/common/LoadingSkeleton.vue'
import { adminApi } from '@/api/admin'
import { approvalsApi } from '@/api/approvals'
import { auditApi } from '@/api/audit'
import { systemApi } from '@/api/system'
import { formatBytes, formatClock, formatDateTime } from '@/utils/format'
import type { AdminOverview, AuditLog, SystemInfo } from '@/types'

/**
 * 管理概览：只呈现后端真实可得的计数。
 * - 运行量柱状图（按日聚合）后端无契约，整块省略；
 * - 系统状态取自 GET /system/info；
 * - 最近管理操作取审计日志前 10 条；
 * - 待处理聚合审批 pending / 降级 Agent / 知识库入库失败，任一数据源不可用则不计入。
 */

const router = useRouter()

const overview = ref<AdminOverview | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)

const recentAudit = ref<AuditLog[]>([])
const auditFailed = ref(false)
const systemInfo = ref<SystemInfo | null>(null)
const pendingApprovals = ref<number | null>(null)
const degradedAgents = ref<number | null>(null)
const agentTotal = ref<number | null>(null)

const runRows = computed(() => {
  const runs = overview.value?.runs
  if (!runs) return []
  return [
    { label: '排队', value: runs.queued, tone: '' },
    { label: '运行中', value: runs.running, tone: 'ok' },
    { label: '成功', value: runs.succeeded, tone: 'ok' },
    { label: '失败', value: runs.failed, tone: runs.failed > 0 ? 'bad' : '' },
    { label: '已取消', value: runs.canceled, tone: '' },
    { label: '等待审批', value: runs.interrupted, tone: runs.interrupted > 0 ? 'warn' : '' },
  ]
})

const taskRows = computed(() => {
  const tasks = overview.value?.a2a_tasks
  if (!tasks) return []
  return [
    { label: '已提交', value: tasks.submitted, tone: '' },
    { label: '运行中', value: tasks.working, tone: 'ok' },
    { label: '等待输入', value: tasks.input_required, tone: tasks.input_required > 0 ? 'warn' : '' },
    { label: '需要授权', value: tasks.auth_required, tone: tasks.auth_required > 0 ? 'warn' : '' },
    { label: '已完成', value: tasks.completed, tone: 'ok' },
    { label: '失败', value: tasks.failed, tone: tasks.failed > 0 ? 'bad' : '' },
    { label: '已取消', value: tasks.canceled, tone: '' },
    { label: '已拒绝', value: tasks.rejected, tone: tasks.rejected > 0 ? 'bad' : '' },
  ]
})

const systemRows = computed(() => {
  const info = systemInfo.value
  if (!info) return []
  return [
    { name: 'API 服务', meta: '/api/v1', state: '正常', tone: 'ok' },
    { name: '运行环境', meta: info.environment || '—', state: '在线', tone: 'ok' },
    { name: '后端版本', meta: `${info.version}${info.build ? ` · ${info.build}` : ''}`, state: '正常', tone: 'ok' },
    { name: '默认模型', meta: info.default_model || '—', state: '可用', tone: 'ok' },
    {
      name: '向量模型',
      meta: `${info.embedding?.model || '—'} · ${info.embedding?.dim ?? '—'} 维`,
      state: '就绪',
      tone: 'ok',
    },
  ]
})

const systemOk = computed(() => systemRows.value.length > 0)

const ACTION_TEXT: Record<string, string> = {
  'agent.created': '注册远程智能体',
  'agent.deleted': '删除远程智能体',
  'agent.health_check': '执行智能体健康检查',
  'agent.refreshed': '刷新远程智能体',
  'agent.updated': '更新远程智能体',
  'approval.decide': '处理审批决定',
  'attachment.upload': '上传附件',
  'instruction.update': '更新平台指令',
  'mcp.server.create': '新建 MCP Server',
  'mcp.server.delete': '删除 MCP Server',
  'mcp.server.update': '更新 MCP Server',
  'secret.create': '新建平台密钥',
  'secret.delete': '删除平台密钥',
  'secret.update': '更新平台密钥',
  'security.injection_suspected': '记录疑似提示词注入',
  'security.output_redacted': '记录输出脱敏',
  'skill.create': '创建技能',
  'skill.delete': '删除技能',
  'skill.enable': '启停技能',
  'skill.import': '导入技能',
  'skill.update': '更新技能',
  'task.authorized': '任务授权',
  'task.canceled': '取消任务',
  'task.rejected': '拒绝任务',
  'task.resumed': '恢复任务',
}

function actionText(action: string): string {
  return ACTION_TEXT[action] ?? action
}

const knowledgeFailed = computed(() => overview.value?.knowledge.documents_failed ?? 0)

const pendingCount = computed(() => {
  const parts = [pendingApprovals.value, degradedAgents.value]
  const known = parts.filter((value): value is number => value !== null)
  return known.reduce((total, value) => total + value, 0) + knowledgeFailed.value
})

const pendingAvailable = computed(
  () =>
    overview.value !== null ||
    pendingApprovals.value !== null ||
    degradedAgents.value !== null,
)

const pendingRows = computed(() => {
  const rows: Array<{
    key: string
    icon: string
    text: string
    linkLabel: string
    to: string
  }> = []

  if (pendingApprovals.value && pendingApprovals.value > 0) {
    rows.push({
      key: 'approval',
      icon: 'shield',
      text: `${pendingApprovals.value} 个审批等待决定`,
      linkLabel: '查看任务',
      to: '/tasks',
    })
  }
  if (degradedAgents.value && degradedAgents.value > 0) {
    rows.push({
      key: 'agent',
      icon: 'bot',
      text: `${degradedAgents.value} 个远程智能体处于降级状态`,
      linkLabel: '查看智能体',
      to: '/agents',
    })
  }
  if (knowledgeFailed.value > 0) {
    rows.push({
      key: 'knowledge',
      icon: 'db',
      text: `${knowledgeFailed.value} 篇知识文档入库失败`,
      linkLabel: '查看知识库',
      to: '/knowledge',
    })
  }
  return rows
})

function navigate(path: string): void {
  if (router) void router.push(path)
  else window.location.assign(path)
}

function actorName(log: AuditLog): string {
  if (log.actor_type === 'system') return '系统'
  if (log.actor_type === 'admin') return '管理员'
  if (log.actor_type === 'user') return `用户 ${log.actor_id.slice(0, 8)}`
  return log.actor_id ? log.actor_id.slice(0, 8) : '—'
}

function resourceText(log: AuditLog): string {
  const type = log.resource_type || '—'
  const id = log.resource_id ? ` · ${log.resource_id.slice(0, 20)}` : ''
  return `${log.action} · ${type}${id}`
}

async function loadSideData(): Promise<void> {
  recentAudit.value = []
  auditFailed.value = false
  systemInfo.value = null
  pendingApprovals.value = null
  degradedAgents.value = null
  agentTotal.value = null

  const tasks = [
    (async () => {
      recentAudit.value = (await auditApi.all({ limit: 10 })).items
    })(),
    (async () => {
      systemInfo.value = await systemApi.info()
    })(),
    (async () => {
      const page = await approvalsApi.list({ status: 'pending', limit: 1 })
      pendingApprovals.value = page.stats?.pending ?? page.items.length
    })(),
    (async () => {
      const page = await adminApi.agents({ limit: 1 })
      degradedAgents.value = page.stats.degraded ?? null
      agentTotal.value = page.stats.total ?? null
    })(),
  ]
  const results = await Promise.allSettled(tasks)
  auditFailed.value = results[0]?.status === 'rejected'
}

async function load(): Promise<void> {
  if (loading.value) return
  loading.value = true
  error.value = null
  try {
    overview.value = await adminApi.overview()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '加载管理概览失败'
  } finally {
    loading.value = false
  }
  if (overview.value) void loadSideData()
}

onMounted(() => {
  void load()
})
</script>

<template>
  <div class="admin-page">
    <header class="admin-page-head">
      <div>
        <h1 class="page-title">管理概览</h1>
        <p class="page-sub">平台运行、用户与智能体的当前状态。仅超级管理员可见。</p>
      </div>
      <div class="head-actions">
        <a class="btn btn-outline" href="/chat" @click.prevent="navigate('/chat')">
          <AppIcon name="external" />
          打开工作台
        </a>
        <button type="button" class="btn btn-primary" :disabled="loading" @click="load">
          <AppIcon name="refresh" />
          {{ loading ? '刷新中…' : '刷新' }}
        </button>
      </div>
    </header>

    <div class="prototype-note" role="note">
      <AppIcon name="alert" />
      <span>
        <b>原型范围</b>：用户、角色、菜单、字典与审计查询依赖管理端契约；当前后端已提供系统指令、系统
        MCP 与系统技能管理接口。按日运行量图表暂无契约，已省略；待处理按真实审批、Agent 健康与失败文档聚合。
      </span>
    </div>

    <LoadingSkeleton v-if="loading && !overview" :rows="4" />

    <ErrorState v-else-if="error" :message="error" :retryable="true" @retry="load" />

    <template v-else-if="overview">
      <p class="generated-line mono">
        数据时间：{{ formatDateTime(overview.generated_at) }} · 全表计数（含软删/终态行）
      </p>

      <section class="metric-strip" aria-label="关键计数">
        <div class="metric">
          <span class="metric-label">用户</span>
          <span class="metric-value">{{ overview.users.total }}</span>
          <span class="metric-foot">
            {{ overview.users.active }} 活跃 · {{ overview.users.admins }} 管理员
          </span>
        </div>
        <div class="metric">
          <span class="metric-label">会话</span>
          <span class="metric-value">{{ overview.conversations.total }}</span>
          <span class="metric-foot">
            {{ overview.conversations.active }} 活跃 · {{ overview.conversations.archived }} 已归档
          </span>
        </div>
        <div class="metric">
          <span class="metric-label">运行</span>
          <span class="metric-value">{{ overview.runs.total }}</span>
          <span class="metric-foot">
            <span class="delta">{{ overview.runs.running }}</span> 运行中 ·
            <span class="delta is-bad">{{ overview.runs.failed }}</span> 失败
          </span>
        </div>
        <div class="metric">
          <span class="metric-label">待审批</span>
          <span class="metric-value">{{ pendingApprovals ?? '—' }}</span>
          <span class="metric-foot"><span class="delta is-warn">HITL</span> 等待决定</span>
        </div>
        <div class="metric">
          <span class="metric-label">知识文档</span>
          <span class="metric-value">{{ overview.knowledge.documents }}</span>
          <span class="metric-foot">
            <span class="delta is-bad">{{ overview.knowledge.documents_failed }} 失败</span>
            {{ overview.knowledge.documents_ready }} 就绪
          </span>
        </div>
      </section>

      <div class="grid-2 overview-grid">
        <section class="panel">
          <div class="panel-head">
            <div>
              <h2>运行状态</h2>
              <p>对话、工作流与 A2A 任务计数</p>
            </div>
            <span class="spacer"></span>
            <span class="panel-meta mono">{{ overview.runs.total }} 次运行</span>
          </div>
          <div class="panel-body">
            <div class="split-lists">
              <div>
                <h3 class="list-title">运行状态</h3>
                <div class="status-list">
                  <div v-for="row in runRows" :key="row.label" class="status-row">
                    <span class="status-dot" :class="row.tone" aria-hidden="true"></span>
                    <span class="status-name">{{ row.label }}</span>
                    <span class="status-meta mono">{{ row.value }}</span>
                  </div>
                </div>
              </div>
              <div>
                <h3 class="list-title">A2A 任务状态</h3>
                <div class="status-list">
                  <div v-for="row in taskRows" :key="row.label" class="status-row">
                    <span class="status-dot" :class="row.tone" aria-hidden="true"></span>
                    <span class="status-name">{{ row.label }}</span>
                    <span class="status-meta mono">{{ row.value }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div class="panel-foot">
            <span>
              知识文档 {{ overview.knowledge.documents }} 篇 · 失败
              {{ knowledgeFailed }} · 附件存储 {{ formatBytes(overview.attachments.storage_bytes) }}
            </span>
            <span class="spacer"></span>
            <span>{{ overview.attachments.total }} 个附件</span>
          </div>
        </section>

        <section class="panel">
          <div class="panel-head">
            <div>
              <h2>系统状态</h2>
              <p>核心依赖与外部连接</p>
            </div>
            <span class="spacer"></span>
            <span v-if="systemOk" class="st st-ok"><span class="dot"></span>正常</span>
            <span v-else class="st st-muted">未获取</span>
          </div>
          <div class="panel-body">
            <div v-if="systemOk" class="status-list">
              <div v-for="row in systemRows" :key="row.name" class="status-row">
                <span class="status-dot ok" aria-hidden="true"></span>
                <span class="status-name">{{ row.name }}</span>
                <span class="status-meta mono">{{ row.meta }}</span>
                <span class="status-state">{{ row.state }}</span>
              </div>
            </div>
            <p v-else class="empty-state">系统信息暂不可用（GET /system/info 未返回）。</p>
          </div>
          <div class="panel-foot">
            <span>远程智能体 {{ agentTotal ?? '—' }} 个</span>
            <span class="spacer"></span>
            <span :class="{ 'status-state warn': (degradedAgents ?? 0) > 0 }">
              {{ degradedAgents === null ? '健康数据未获取' : `${degradedAgents} 个降级 · ${agentTotal ?? '—'} 个注册` }}
            </span>
          </div>
        </section>
      </div>

      <div class="grid-2" :class="{ 'is-single': !pendingAvailable }">
        <section class="panel">
          <div class="panel-head">
            <div>
              <h2>最近管理操作</h2>
              <p>来自审计日志</p>
            </div>
            <span class="spacer"></span>
            <a class="text-link" href="/admin/audit" @click.prevent="navigate('/admin/audit')">
              全部审计
              <AppIcon name="arrow" />
            </a>
          </div>
          <div class="panel-body">
            <div v-if="recentAudit.length > 0" class="audit-mini">
              <div v-for="log in recentAudit" :key="log.id" class="audit-mini-row">
                <span class="audit-mini-time mono">{{ formatClock(log.created_at) }}</span>
                <div class="audit-mini-main">
                  <b>{{ actorName(log) }}</b> {{ actionText(log.action) }}
                  <div class="audit-mini-res">{{ resourceText(log) }}</div>
                </div>
              </div>
            </div>
            <p v-else class="empty-state">
              {{ auditFailed ? '审计日志暂不可用。' : '暂无审计记录。' }}
            </p>
          </div>
        </section>

        <section v-if="pendingAvailable" class="panel">
          <div class="panel-head">
            <div>
              <h2>待处理</h2>
              <p>需要管理员关注</p>
            </div>
            <span class="spacer"></span>
            <span class="badge">{{ pendingCount }} 项</span>
          </div>
          <div class="panel-body">
            <div v-if="pendingRows.length > 0" class="todo-list">
              <a
                v-for="row in pendingRows"
                :key="row.key"
                class="todo-row"
                :href="row.to"
                @click.prevent="navigate(row.to)"
              >
                <AppIcon :name="row.icon" />
                <span>{{ row.text }}</span>
                <span class="spacer"></span>
                <span class="text-link">{{ row.linkLabel }}</span>
              </a>
            </div>
            <p v-else class="empty-state">暂无需要管理员关注的事项。</p>
          </div>
        </section>
      </div>
    </template>
  </div>
</template>
