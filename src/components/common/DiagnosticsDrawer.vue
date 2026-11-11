<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'

import {
  getBuildInfo,
  getRecentErrors,
  getRecentRequests,
  getRuntimeContext,
  getWebVitals,
} from '@/utils/diagnostics'
import type { BuildInfo, ErrorRecord, RequestRecord, VitalRecord } from '@/utils/diagnostics'
import { formatDuration, formatTime } from '@/utils/format'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

const build = ref<BuildInfo>(getBuildInfo())
const runtime = ref(getRuntimeContext())
const requests = ref<RequestRecord[]>([])
const errors = ref<ErrorRecord[]>([])
const vitals = ref<VitalRecord[]>([])

function refresh(): void {
  build.value = getBuildInfo()
  runtime.value = getRuntimeContext()
  requests.value = getRecentRequests()
  errors.value = getRecentErrors()
  vitals.value = getWebVitals()
}

// 每次打开都重新取快照：关闭期间产生的请求/错误/指标在再次打开时可见。
watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) refresh()
  },
  { immediate: true },
)

function onUpdate(value: boolean): void {
  if (!value) emit('close')
}

/** 环形缓冲里的 at 是毫秒时间戳，展示时统一成本地时分秒。 */
function formatAt(ms: number): string {
  return formatTime(new Date(ms).toISOString())
}

function formatVital(record: VitalRecord): string {
  // CLS 是无量纲小数，其余指标是毫秒；分开格式化避免 CLS 被四舍五入成 0ms。
  return record.name === 'CLS' ? record.value.toFixed(3) : `${Math.round(record.value)}ms`
}

const buildText = computed(() =>
  [
    `版本: ${build.value.version}`,
    `构建时间: ${build.value.buildTime || '未知'}`,
    `Git SHA: ${build.value.gitSha}`,
    `API base: ${build.value.apiBase}`,
    `Mock: ${build.value.mock ? '开启' : '关闭'}`,
  ].join('\n'),
)

const runtimeText = computed(() =>
  [
    `run_id: ${runtime.value.runId || '未记录'}`,
    `conversation_id: ${runtime.value.conversationId || '未记录'}`,
  ].join('\n'),
)

const requestsText = computed(() =>
  requests.value
    .map((item) =>
      [formatAt(item.at), item.status, formatDuration(item.durationMs), item.requestId || '无 request_id'].join(
        ' · ',
      ),
    )
    .join('\n'),
)

const errorsText = computed(() =>
  errors.value
    .map((item) =>
      [formatAt(item.at), item.code, item.message, item.requestId || '无 request_id'].join(' · '),
    )
    .join('\n'),
)

const vitalsText = computed(() =>
  vitals.value.map((item) => [formatAt(item.at), item.name, formatVital(item)].join(' · ')).join('\n'),
)

async function copy(label: string, text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
    ElMessage.success(`已复制${label}`)
  } catch {
    ElMessage.warning('复制失败，请手动选中文本后复制')
  }
}
</script>

<template>
  <el-drawer
    :model-value="open"
    title="诊断信息"
    size="520px"
    :append-to-body="true"
    @update:model-value="onUpdate"
  >
    <p class="hint">
      仅展示排障元数据：id、状态、耗时与版本；不包含 token、消息正文或审批 payload。
    </p>

    <section class="group" aria-label="构建信息">
      <header class="group-head">
        <h3>构建信息</h3>
        <button type="button" class="copy" aria-label="复制构建信息" @click="copy('构建信息', buildText)">
          复制
        </button>
      </header>
      <dl class="kv">
        <div class="kv-row">
          <dt>版本</dt>
          <dd class="mono">{{ build.version }}</dd>
        </div>
        <div class="kv-row">
          <dt>构建时间</dt>
          <dd class="mono">{{ build.buildTime || '未知' }}</dd>
        </div>
        <div class="kv-row">
          <dt>Git SHA</dt>
          <dd class="mono">{{ build.gitSha }}</dd>
        </div>
        <div class="kv-row">
          <dt>API base</dt>
          <dd class="mono">{{ build.apiBase }}</dd>
        </div>
        <div class="kv-row">
          <dt>Mock</dt>
          <dd>{{ build.mock ? '开启' : '关闭' }}</dd>
        </div>
      </dl>
    </section>

    <section class="group" aria-label="运行时上下文">
      <header class="group-head">
        <h3>运行时上下文</h3>
        <button
          type="button"
          class="copy"
          aria-label="复制运行时上下文"
          @click="copy('运行时上下文', runtimeText)"
        >
          复制
        </button>
      </header>
      <dl class="kv">
        <div class="kv-row">
          <dt>run_id</dt>
          <dd class="mono">{{ runtime.runId || '未记录' }}</dd>
        </div>
        <div class="kv-row">
          <dt>conversation_id</dt>
          <dd class="mono">{{ runtime.conversationId || '未记录' }}</dd>
        </div>
      </dl>
    </section>

    <section class="group" aria-label="最近请求">
      <header class="group-head">
        <h3>最近请求 <span class="count">{{ requests.length }}</span></h3>
        <button type="button" class="copy" aria-label="复制最近请求" @click="copy('最近请求', requestsText)">
          复制
        </button>
      </header>
      <p v-if="!requests.length" class="empty">暂无请求记录</p>
      <ul v-else class="rows">
        <li v-for="(item, index) in requests" :key="`req-${item.at}-${index}`" class="row">
          <span class="mono time">{{ formatAt(item.at) }}</span>
          <span class="mono status" :class="item.status >= 400 ? 'is-bad' : 'is-ok'">
            {{ item.status }}
          </span>
          <span class="mono duration">{{ formatDuration(item.durationMs) }}</span>
          <span class="mono id">{{ item.requestId || '无 request_id' }}</span>
        </li>
      </ul>
    </section>

    <section class="group" aria-label="最近错误">
      <header class="group-head">
        <h3>最近错误 <span class="count">{{ errors.length }}</span></h3>
        <button type="button" class="copy" aria-label="复制最近错误" @click="copy('最近错误', errorsText)">
          复制
        </button>
      </header>
      <p v-if="!errors.length" class="empty">暂无错误记录</p>
      <ul v-else class="rows">
        <li v-for="(item, index) in errors" :key="`err-${item.at}-${index}`" class="row error-row">
          <span class="mono time">{{ formatAt(item.at) }}</span>
          <span class="mono code">{{ item.code }}</span>
          <span class="message">{{ item.message }}</span>
          <span class="mono id">{{ item.requestId || '无 request_id' }}</span>
        </li>
      </ul>
    </section>

    <section class="group" aria-label="Web Vitals">
      <header class="group-head">
        <h3>Web Vitals <span class="count">{{ vitals.length }}</span></h3>
        <button type="button" class="copy" aria-label="复制 Web Vitals" @click="copy('Web Vitals', vitalsText)">
          复制
        </button>
      </header>
      <p v-if="!vitals.length" class="empty">暂无 Web Vitals 记录</p>
      <ul v-else class="rows">
        <li v-for="(item, index) in vitals" :key="`vital-${item.name}-${item.at}-${index}`" class="row">
          <span class="mono time">{{ formatAt(item.at) }}</span>
          <span class="mono name">{{ item.name }}</span>
          <span class="mono value">{{ formatVital(item) }}</span>
        </li>
      </ul>
    </section>

    <div class="foot">
      <button type="button" class="btn" @click="refresh">刷新</button>
      <button type="button" class="btn is-primary" aria-label="关闭诊断抽屉" @click="emit('close')">
        关闭
      </button>
    </div>
  </el-drawer>
</template>

<style scoped>
.hint {
  margin: 0 0 14px;
  color: var(--ink-3);
  font-size: 11.5px;
  line-height: 1.6;
}

.group {
  margin-bottom: 18px;
}

.group-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}

.group-head h3 {
  margin: 0;
  color: var(--ink);
  font-size: 12.5px;
  font-weight: 650;
}

.count {
  margin-left: 4px;
  color: var(--ink-3);
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 400;
}

.copy {
  flex: none;
  padding: 2px 8px;
  border: 1px solid var(--line);
  border-radius: 4px;
  background: transparent;
  color: var(--ink-2);
  font-size: 11px;
}

.copy:hover {
  color: var(--ink);
}

.kv {
  display: flex;
  flex-direction: column;
  gap: 5px;
  margin: 0;
  padding: 10px 12px;
  border: 1px solid var(--line-2);
  border-radius: 7px;
  background: var(--surface-2);
}

.kv-row {
  display: flex;
  align-items: baseline;
  gap: 12px;
}

.kv-row dt {
  flex: none;
  width: 84px;
  color: var(--ink-3);
  font-size: 11px;
}

.kv-row dd {
  min-width: 0;
  margin: 0;
  color: var(--ink);
  font-size: 11.5px;
  overflow-wrap: anywhere;
}

.rows {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.row {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 5px 8px;
  border-radius: 5px;
  background: var(--surface-2);
  font-size: 11px;
}

.time {
  flex: none;
  color: var(--ink-3);
  font-size: 10px;
}

.status {
  flex: none;
  min-width: 26px;
  font-weight: 600;
}

.status.is-ok {
  color: var(--green);
}

.status.is-bad {
  color: var(--red);
}

.duration {
  flex: none;
  width: 48px;
  color: var(--ink-2);
}

.id {
  min-width: 0;
  color: var(--ink-2);
  overflow-wrap: anywhere;
}

.code {
  flex: none;
  color: var(--red);
}

.message {
  flex: 1;
  min-width: 0;
  color: var(--ink-2);
  overflow-wrap: anywhere;
}

.name {
  flex: none;
  width: 42px;
  color: var(--ink);
  font-weight: 600;
}

.value {
  flex: none;
  color: var(--ink-2);
}

.empty {
  margin: 0;
  padding: 10px 12px;
  border: 1px dashed var(--line);
  border-radius: 7px;
  color: var(--ink-3);
  font-size: 11.5px;
}

.error-row {
  align-items: flex-start;
}

.mono {
  font-family: var(--font-mono);
}

.foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 4px;
}

.btn {
  padding: 5px 12px;
  border: 1px solid var(--line);
  border-radius: 5px;
  background: var(--surface);
  color: var(--ink-2);
  font-size: 11.5px;
}

.btn:hover {
  color: var(--ink);
}

.btn.is-primary {
  border-color: var(--prussian);
  color: var(--prussian);
}
</style>
