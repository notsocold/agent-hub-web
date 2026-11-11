<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'

import ErrorState from '@/components/common/ErrorState.vue'
import LoadingSkeleton from '@/components/common/LoadingSkeleton.vue'
import RedactedJson from '@/components/common/RedactedJson.vue'
import StatusBadge from '@/components/common/StatusBadge.vue'
import { ApiRequestError } from '@/api/client'
import { approvalsApi } from '@/api/approvals'
import { formatDateTime } from '@/utils/format'
import { containsSensitiveKey, redactText } from '@/utils/redact'
import {
  approvalRiskLabel,
  approvalRiskTone,
  approvalStatusLabel,
  approvalStatusTone,
} from './approvalMeta'
import type { Approval } from '@/types'

const props = defineProps<{
  modelValue: boolean
  approvalId: string | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const open = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
})

const detail = ref<Approval | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)
const drawerSize = ref('480px')

const hasSensitivePayload = computed(
  () => detail.value !== null && containsSensitiveKey(detail.value.payload),
)
// 预览字符串同样遮罩：payload 结构可能被后端截断/脱敏，不能只靠对象键判断。
const safePreview = computed(() =>
  detail.value?.payload_preview ? redactText(detail.value.payload_preview) : '',
)

let loadSeq = 0

function syncDrawerSize(): void {
  drawerSize.value = window.innerWidth < 700 ? '100%' : '480px'
}

function toolName(approval: Approval): string {
  return approval.tool_display_name || approval.tool_name
}

async function load(id: string): Promise<void> {
  const seq = ++loadSeq
  loading.value = true
  error.value = null
  detail.value = null
  try {
    const next = await approvalsApi.detail(id)
    if (seq !== loadSeq) return
    detail.value = next
  } catch (cause) {
    if (seq !== loadSeq) return
    if (cause instanceof ApiRequestError && (cause.status === 404 || cause.code === 'not_found')) {
      ElMessage.warning('审批不存在或已被删除')
      emit('update:modelValue', false)
      return
    }
    error.value = cause instanceof Error ? cause.message : '加载审批详情失败'
  } finally {
    if (seq === loadSeq) loading.value = false
  }
}

watch(
  () => [props.modelValue, props.approvalId] as const,
  ([isOpen, id]) => {
    if (isOpen && id) {
      void load(id)
      return
    }
    if (!isOpen) {
      loadSeq += 1
      loading.value = false
      error.value = null
      detail.value = null
    }
  },
  { immediate: true },
)

onMounted(() => {
  syncDrawerSize()
  window.addEventListener('resize', syncDrawerSize)
})

onUnmounted(() => {
  loadSeq += 1
  window.removeEventListener('resize', syncDrawerSize)
})
</script>

<template>
  <el-drawer v-model="open" title="审批详情" :size="drawerSize" :append-to-body="true">
    <LoadingSkeleton v-if="loading" variant="card" />
    <ErrorState v-else-if="error" :message="error" @retry="approvalId && load(approvalId)" />

    <div v-else-if="detail" class="detail">
      <header class="head">
        <StatusBadge
          :tone="approvalStatusTone(detail.status)"
          :label="approvalStatusLabel(detail.status)"
        />
        <StatusBadge
          :tone="approvalRiskTone(detail.risk)"
          :label="approvalRiskLabel(detail.risk)"
        />
        <span class="mono approval-id">{{ detail.id }}</span>
      </header>

      <section class="tool-card">
        <h3>{{ toolName(detail) }}</h3>
        <p class="mono muted">{{ detail.tool_name }}</p>
        <p v-if="detail.reason" class="reason">{{ detail.reason }}</p>
        <p v-else class="reason muted">未提供调用原因。</p>
      </section>

      <dl class="facts">
        <div>
          <dt>来源</dt>
          <dd>{{ detail.source || '—' }}</dd>
        </div>
        <div>
          <dt>执行方</dt>
          <dd>{{ detail.executor || '—' }}</dd>
        </div>
        <div>
          <dt>目标</dt>
          <dd class="wrap">{{ detail.target || '—' }}</dd>
        </div>
        <div>
          <dt>副作用</dt>
          <dd class="wrap">{{ detail.side_effect || '—' }}</dd>
        </div>
        <div>
          <dt>所属会话</dt>
          <dd>{{ detail.conversation_title || '—' }}</dd>
        </div>
        <div>
          <dt>会话 ID</dt>
          <dd class="mono wrap">{{ detail.conversation_id }}</dd>
        </div>
        <div>
          <dt>Run</dt>
          <dd class="mono wrap">{{ detail.run_id }}</dd>
        </div>
        <div>
          <dt>创建时间</dt>
          <dd class="mono">{{ formatDateTime(detail.created_at) }}</dd>
        </div>
        <div>
          <dt>到期时间</dt>
          <dd class="mono">{{ formatDateTime(detail.expires_at) }}</dd>
        </div>
      </dl>

      <section>
        <h3>请求预览</h3>
        <template v-if="safePreview">
          <pre class="preview mono">{{ safePreview }}</pre>
          <p v-if="hasSensitivePayload" class="muted">预览中的敏感字段已遮罩。</p>
        </template>
        <p v-else-if="hasSensitivePayload" class="muted">
          Payload 含敏感字段；请展开下方 Payload 查看遮罩后的内容。
        </p>
        <p v-else class="muted">—</p>
      </section>

      <section>
        <h3>Payload</h3>
        <RedactedJson :value="detail.payload" max-height="360px" />
      </section>

      <section>
        <h3>决策记录</h3>
        <dl class="facts is-decision">
          <div>
            <dt>决策人</dt>
            <dd>
              {{ detail.decided_by?.display_name ?? '—' }}
              <span v-if="detail.decided_by" class="mono muted"> · {{ detail.decided_by.id }}</span>
            </dd>
          </div>
          <div>
            <dt>决策时间</dt>
            <dd class="mono">{{ formatDateTime(detail.decided_at) }}</dd>
          </div>
        </dl>
        <p class="note">
          <span class="note-label">决策备注</span>
          <span class="note-body">{{ detail.decision_note || '—' }}</span>
        </p>
      </section>
    </div>
  </el-drawer>
</template>

<style scoped>
.detail {
  display: flex;
  flex-direction: column;
  gap: 16px;
  color: var(--ink-2);
  font-size: 12px;
}

.head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 7px;
}

.approval-id {
  margin-left: auto;
  overflow: hidden;
  max-width: 100%;
  color: var(--ink-3);
  font-size: 10.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tool-card {
  padding: 12px 14px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
}

.tool-card h3 {
  margin: 0;
  color: var(--ink);
  font-size: 14px;
  font-weight: 650;
}

.tool-card .muted {
  margin-top: 2px;
  font-size: 10px;
}

.reason {
  margin: 9px 0 0;
  color: var(--ink-2);
  font-size: 12px;
  line-height: 1.7;
}

.facts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 9px 16px;
  margin: 0;
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
}

.facts div {
  min-width: 0;
}

.facts dt {
  color: var(--ink-3);
  font-size: 10px;
}

.facts dd {
  margin: 2px 0 0;
  overflow-wrap: anywhere;
  color: var(--ink);
  font-size: 11.5px;
}

.facts.is-decision {
  margin-bottom: 8px;
}

h3 {
  margin: 0 0 6px;
  color: var(--ink);
  font-size: 11.5px;
  font-weight: 600;
}

.preview {
  max-height: 180px;
  margin: 0;
  padding: 9px 10px;
  overflow: auto;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--surface-2);
  color: var(--ink-2);
  font-size: 10.5px;
  line-height: 1.6;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.note {
  display: flex;
  gap: 10px;
  margin: 0;
  padding: 9px 10px;
  border: 1px solid var(--line-2);
  border-radius: 6px;
  background: var(--surface-2);
  line-height: 1.7;
}

.note-label {
  flex: none;
  color: var(--ink-3);
  font-size: 10.5px;
}

.note-body {
  color: var(--ink-2);
  overflow-wrap: anywhere;
}

.muted {
  color: var(--ink-3);
  font-size: 10.5px;
}

.wrap {
  overflow-wrap: anywhere;
}

@media (max-width: 520px) {
  .facts {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
