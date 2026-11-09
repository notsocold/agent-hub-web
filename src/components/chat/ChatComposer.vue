<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'

import { attachmentsApi } from '@/api/attachments'
import type {
  Attachment,
  ChatContextSelection,
  McpAvailableServer,
  McpAvailableTool,
  ModelInfo,
  ReasoningEffortId,
  ReasoningEffortOption,
  SkillCatalogItem,
  SystemCapabilities,
  SystemLimits,
} from '@/types'

const props = withDefaults(
  defineProps<{
    streaming: boolean
    disabled?: boolean
    model: string
    reasoningEffort: ReasoningEffortId
    models: ModelInfo[]
    reasoningEfforts: ReasoningEffortOption[]
    maxChars?: number
    /** 输入栏「+」菜单的候选；由父级从能力目录加载。 */
    skills?: SkillCatalogItem[]
    mcpServers?: McpAvailableServer[]
    mcpTools?: McpAvailableTool[]
    limits?: SystemLimits
    capabilities?: SystemCapabilities
    conversationId?: string | null
    /** 正在按需加载工具的 MCP 服务器 id。 */
    toolsLoading?: string[]
  }>(),
  {
    disabled: false,
    maxChars: 8000,
    skills: () => [],
    mcpServers: () => [],
    mcpTools: () => [],
    toolsLoading: () => [],
  },
)

const emit = defineEmits<{
  send: [payload: { text: string; context: ChatContextSelection }]
  stop: []
  'update:model': [value: string]
  'update:reasoningEffort': [value: ReasoningEffortId]
  'load-mcp-tools': [serverId: string]
}>()

const text = ref('')
const textarea = ref<HTMLTextAreaElement | null>(null)
const root = ref<HTMLElement | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const menuOpen = ref(false)
const panel = ref<'skill' | 'mcp' | null>(null)
const search = ref('')
const expandedServer = ref<string | null>(null)

const attachments = ref<Array<Attachment & { progress?: number; localId: string }>>([])
const selectedSkills = ref<SkillCatalogItem[]>([])
const selectedServers = ref<McpAvailableServer[]>([])
const selectedTools = ref<McpAvailableTool[]>([])

const uploading = computed(() => attachments.value.some((item) => item.status === 'processing'))
const hasContext = computed(
  () =>
    attachments.value.length > 0 ||
    selectedSkills.value.length > 0 ||
    selectedServers.value.length > 0 ||
    selectedTools.value.length > 0,
)

const canSend = computed(
  () =>
    !props.streaming &&
    !props.disabled &&
    !uploading.value &&
    text.value.trim().length > 0,
)
const count = computed(() => text.value.length)

const limits = computed<SystemLimits>(
  () =>
    props.limits ?? {
      skills_per_message: 3,
      mcp_servers_per_message: 5,
      mcp_tools_per_message: 10,
      knowledge_categories_per_message: 5,
      attachments_per_message: 5,
      attachment_max_bytes: 20 * 1024 * 1024,
      message_max_chars: props.maxChars,
    },
)

function capabilityOn(key: keyof SystemCapabilities): boolean {
  return props.capabilities?.[key] === true
}

const skillLimitReached = computed(
  () => selectedSkills.value.length >= limits.value.skills_per_message,
)
const serverLimitReached = computed(
  () => selectedServers.value.length >= limits.value.mcp_servers_per_message,
)
const attachmentLimitReached = computed(
  () => attachments.value.length >= limits.value.attachments_per_message,
)

const filteredSkills = computed(() => {
  const keyword = search.value.trim().toLowerCase()
  if (!keyword) return props.skills
  return props.skills.filter((item) =>
    `${item.name} ${item.slug} ${item.description}`.toLowerCase().includes(keyword),
  )
})

const filteredServers = computed(() => {
  const keyword = search.value.trim().toLowerCase()
  if (!keyword) return props.mcpServers
  return props.mcpServers.filter((item) =>
    `${item.name} ${item.slug}`.toLowerCase().includes(keyword),
  )
})

function autoResize(): void {
  const element = textarea.value
  if (!element) return
  element.style.height = 'auto'
  element.style.height = `${Math.min(element.scrollHeight, 180)}px`
}

watch(text, () => {
  void nextTick(autoResize)
})

function submit(): void {
  if (!canSend.value) return
  emit('send', { text: text.value.trim(), context: buildContext() })
  resetComposer()
}

function buildContext(): ChatContextSelection {
  const context: ChatContextSelection = {}
  if (attachments.value.length > 0) {
    context.attachments = attachments.value.map((item) => item.id)
  }
  if (selectedSkills.value.length > 0) {
    context.skills = selectedSkills.value.map((item) => item.id)
  }
  if (selectedServers.value.length > 0) {
    context.mcp_servers = selectedServers.value.map((item) => item.id)
  }
  if (selectedTools.value.length > 0) {
    context.mcp_tools = selectedTools.value.map((item) => item.id)
  }
  return context
}

function resetComposer(): void {
  text.value = ''
  attachments.value = []
  selectedSkills.value = []
  selectedServers.value = []
  selectedTools.value = []
  panel.value = null
  search.value = ''
  expandedServer.value = null
  void nextTick(autoResize)
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault()
    submit()
    return
  }
  // `@` 只用于选择文件（与产品约定一致），不进入技能/MCP 选择。
  if (event.key === '@' && !event.isComposing) {
    const before = text.value.slice(0, (event.target as HTMLTextAreaElement).selectionStart ?? 0)
    if (!before.trim() || /\s$/.test(before)) {
      event.preventDefault()
      openFilePicker()
    }
  }
}

function onStop(): void {
  emit('stop')
}

function openMenu(): void {
  if (props.disabled) return
  menuOpen.value = !menuOpen.value
  panel.value = null
  search.value = ''
}

function openPanel(next: 'skill' | 'mcp'): void {
  panel.value = next
  search.value = ''
  expandedServer.value = null
}

function openFilePicker(): void {
  if (props.disabled || !capabilityOn('attachments')) {
    ElMessage.info('附件能力未启用')
    return
  }
  if (attachmentLimitReached.value) {
    ElMessage.warning(`每轮最多 ${limits.value.attachments_per_message} 个附件`)
    return
  }
  fileInput.value?.click()
}

async function onFilesPicked(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  input.value = ''
  menuOpen.value = false
  for (const file of files) {
    await uploadOne(file)
  }
}

async function uploadOne(file: File): Promise<void> {
  if (attachmentLimitReached.value) {
    ElMessage.warning(`每轮最多 ${limits.value.attachments_per_message} 个附件`)
    return
  }
  if (file.size > limits.value.attachment_max_bytes) {
    ElMessage.error(`${file.name} 超过 ${formatBytes(limits.value.attachment_max_bytes)} 上限`)
    return
  }
  const localId = crypto.randomUUID()
  const placeholder: Attachment & { progress?: number; localId: string } = {
    id: localId,
    filename: file.name,
    mime_type: file.type || 'application/octet-stream',
    size_bytes: file.size,
    checksum: '',
    status: 'processing',
    created_at: new Date().toISOString(),
    expires_at: null,
    progress: 0,
    localId,
  }
  attachments.value = [...attachments.value, placeholder]
  try {
    const uploaded = await attachmentsApi.upload(file, {
      conversation_id: props.conversationId ?? undefined,
      onProgress: (percent) => {
        const target = attachments.value.find((item) => item.localId === localId)
        if (target) target.progress = percent
      },
    })
    attachments.value = attachments.value.map((item) =>
      item.localId === localId ? { ...uploaded, localId } : item,
    )
  } catch (error) {
    attachments.value = attachments.value.filter((item) => item.localId !== localId)
    ElMessage.error(error instanceof Error ? error.message : `${file.name} 上传失败`)
  }
}

function toggleSkill(skill: SkillCatalogItem): void {
  if (selectedSkills.value.some((item) => item.id === skill.id)) {
    selectedSkills.value = selectedSkills.value.filter((item) => item.id !== skill.id)
    return
  }
  if (skillLimitReached.value) {
    ElMessage.warning(`每轮最多 ${limits.value.skills_per_message} 个技能`)
    return
  }
  selectedSkills.value = [...selectedSkills.value, skill]
}

function toggleServer(server: McpAvailableServer): void {
  if (selectedServers.value.some((item) => item.id === server.id)) {
    selectedServers.value = selectedServers.value.filter((item) => item.id !== server.id)
    selectedTools.value = selectedTools.value.filter((item) => item.server_id !== server.id)
    return
  }
  if (serverLimitReached.value) {
    ElMessage.warning(`每轮最多 ${limits.value.mcp_servers_per_message} 个 MCP 服务器`)
    return
  }
  selectedServers.value = [...selectedServers.value, server]
}

function toolsOf(serverId: string): McpAvailableTool[] {
  return props.mcpTools.filter((item) => item.server_id === serverId)
}

function toggleServerTools(server: McpAvailableServer): void {
  const next = expandedServer.value === server.id ? null : server.id
  expandedServer.value = next
  if (next && toolsOf(next).length === 0) emit('load-mcp-tools', next)
}

function toggleTool(tool: McpAvailableTool): void {
  if (selectedTools.value.some((item) => item.id === tool.id)) {
    selectedTools.value = selectedTools.value.filter((item) => item.id !== tool.id)
    return
  }
  if (selectedTools.value.length >= limits.value.mcp_tools_per_message) {
    ElMessage.warning(`每轮最多 ${limits.value.mcp_tools_per_message} 个 MCP 工具`)
    return
  }
  if (!selectedServers.value.some((item) => item.id === tool.server_id)) {
    const server = props.mcpServers.find((item) => item.id === tool.server_id)
    if (server) selectedServers.value = [...selectedServers.value, server]
  }
  selectedTools.value = [...selectedTools.value, tool]
}

function removeAttachment(localId: string): void {
  attachments.value = attachments.value.filter((item) => item.localId !== localId)
}

function removeSkill(id: string): void {
  selectedSkills.value = selectedSkills.value.filter((item) => item.id !== id)
}

function removeServer(id: string): void {
  selectedServers.value = selectedServers.value.filter((item) => item.id !== id)
  selectedTools.value = selectedTools.value.filter((item) => item.server_id !== id)
}

function removeTool(id: string): void {
  selectedTools.value = selectedTools.value.filter((item) => item.id !== id)
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function onModelChange(event: Event): void {
  emit('update:model', (event.target as HTMLSelectElement).value)
}

function onEffortChange(event: Event): void {
  emit('update:reasoningEffort', (event.target as HTMLSelectElement).value as ReasoningEffortId)
}

function onDocumentClick(event: MouseEvent): void {
  if (!menuOpen.value) return
  const target = event.target as Node | null
  if (root.value && target && !root.value.contains(target)) {
    menuOpen.value = false
    panel.value = null
  }
}

onMounted(() => {
  document.addEventListener('click', onDocumentClick)
  autoResize()
})

onUnmounted(() => {
  document.removeEventListener('click', onDocumentClick)
})
</script>

<template>
  <footer ref="root" class="composer">
    <div class="composer-box">
      <div v-if="hasContext" class="context-chips" aria-label="本轮上下文">
        <span
          v-for="item in attachments"
          :key="item.localId"
          class="chip is-attachment"
          :class="{ 'is-uploading': item.status === 'processing' }"
        >
          <span class="chip-kind">附件</span>
          <span class="chip-label">{{ item.filename }}</span>
          <span v-if="item.status === 'processing'" class="chip-meta mono">
            {{ item.progress ?? 0 }}%
          </span>
          <button
            type="button"
            class="chip-remove"
            :aria-label="`移除附件 ${item.filename}`"
            @click="removeAttachment(item.localId)"
          >
            ×
          </button>
        </span>

        <span
          v-for="skill in selectedSkills"
          :key="skill.id"
          class="chip is-skill"
          data-testid="chip-skill"
        >
          <span class="chip-kind">技能</span>
          <span class="chip-label">{{ skill.name }}</span>
          <button
            type="button"
            class="chip-remove"
            :aria-label="`移除技能 ${skill.name}`"
            @click="removeSkill(skill.id)"
          >
            ×
          </button>
        </span>

        <span v-for="server in selectedServers" :key="server.id" class="chip is-mcp">
          <span class="chip-kind">MCP</span>
          <span class="chip-label">{{ server.name }}</span>
          <button
            type="button"
            class="chip-remove"
            :aria-label="`移除 MCP ${server.name}`"
            @click="removeServer(server.id)"
          >
            ×
          </button>
        </span>

        <span v-for="tool in selectedTools" :key="tool.id" class="chip is-mcp-tool">
          <span class="chip-kind">工具</span>
          <span class="chip-label mono">{{ tool.name }}</span>
          <button
            type="button"
            class="chip-remove"
            :aria-label="`移除工具 ${tool.name}`"
            @click="removeTool(tool.id)"
          >
            ×
          </button>
        </span>
      </div>

      <div class="composer-toolbar">
        <div class="toolbar-left">
          <button
            class="icon-btn"
            type="button"
            aria-label="添加上下文"
            data-testid="composer-plus"
            aria-haspopup="menu"
            :aria-expanded="menuOpen"
            title="添加上下文"
            @click.stop="openMenu"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>

          <input
            ref="fileInput"
            class="file-input"
            type="file"
            multiple
            tabindex="-1"
            aria-hidden="true"
            @change="onFilesPicked"
          />

          <div v-if="menuOpen" class="ctx-menu" role="menu">
            <template v-if="panel === null">
              <p class="ctx-title">本轮上下文</p>
              <button
                type="button"
                role="menuitem"
                class="ctx-item"
                data-testid="ctx-attachment"
                :class="{ 'is-disabled': !capabilityOn('attachments') }"
                @click.stop="openFilePicker"
              >
                <span>附件</span>
                <span class="ctx-stage">{{ capabilityOn('attachments') ? '上传' : '未启用' }}</span>
              </button>
              <button
                type="button"
                role="menuitem"
                class="ctx-item"
                data-testid="ctx-skill"
                :class="{ 'is-disabled': !capabilityOn('skills') }"
                @click.stop="openPanel('skill')"
              >
                <span>技能</span>
                <span class="ctx-stage">
                  {{ capabilityOn('skills') ? `${selectedSkills.length}/${limits.skills_per_message}` : '未启用' }}
                </span>
              </button>
              <button
                type="button"
                role="menuitem"
                class="ctx-item"
                data-testid="ctx-mcp"
                :class="{ 'is-disabled': !capabilityOn('mcp') }"
                @click.stop="openPanel('mcp')"
              >
                <span>MCP</span>
                <span class="ctx-stage">
                  {{ capabilityOn('mcp') ? `${selectedServers.length}/${limits.mcp_servers_per_message}` : '未启用' }}
                </span>
              </button>
              <button type="button" role="menuitem" class="ctx-item is-disabled" disabled>
                <span>工作流</span>
                <span class="ctx-stage">M5+</span>
              </button>
              <button type="button" role="menuitem" class="ctx-item is-disabled" disabled>
                <span>知识库</span>
                <span class="ctx-stage">M4</span>
              </button>
              <p class="ctx-foot">选择只影响当次请求，发送后清空。</p>
            </template>

            <template v-else-if="panel === 'skill'">
              <div class="ctx-subhead">
                <button type="button" class="ctx-back" aria-label="返回" @click.stop="panel = null">
                  ←
                </button>
                <span>选择技能</span>
                <span class="ctx-stage">{{ selectedSkills.length }}/{{ limits.skills_per_message }}</span>
              </div>
              <input
                v-model="search"
                class="ctx-search"
                type="search"
                placeholder="搜索技能"
                @click.stop
              />
              <div class="ctx-list">
                <button
                  v-for="skill in filteredSkills"
                  :key="skill.id"
                  type="button"
                  class="ctx-row"
                  data-testid="skill-option"
                  :class="{ 'is-selected': selectedSkills.some((item) => item.id === skill.id) }"
                  @click.stop="toggleSkill(skill)"
                >
                  <span class="ctx-row-main">
                    <span class="ctx-row-name">{{ skill.name }}</span>
                    <span class="ctx-row-desc">{{ skill.description }}</span>
                  </span>
                  <span class="ctx-row-meta mono">
                    {{ skill.estimated_tokens }}t
                  </span>
                </button>
                <p v-if="filteredSkills.length === 0" class="ctx-empty">没有可用技能</p>
              </div>
              <p class="ctx-foot">技能正文只在本轮显式激活，不写回账号设置。</p>
            </template>

            <template v-else>
              <div class="ctx-subhead">
                <button type="button" class="ctx-back" aria-label="返回" @click.stop="panel = null">
                  ←
                </button>
                <span>选择 MCP</span>
                <span class="ctx-stage">{{ selectedServers.length }}/{{ limits.mcp_servers_per_message }}</span>
              </div>
              <input
                v-model="search"
                class="ctx-search"
                type="search"
                placeholder="搜索 MCP 服务器"
                @click.stop
              />
              <div class="ctx-list">
                <div v-for="server in filteredServers" :key="server.id" class="ctx-server">
                  <div class="ctx-row is-server">
                    <button
                      type="button"
                      class="ctx-row-main"
                      data-testid="server-option"
                      :class="{ 'is-selected': selectedServers.some((item) => item.id === server.id) }"
                      @click.stop="toggleServer(server)"
                    >
                      <span class="ctx-row-name">{{ server.name }}</span>
                      <span class="ctx-row-desc">
                        {{ server.tool_count }} 个工具 ·
                        {{ server.scope === 'system' ? '系统' : '用户' }}
                      </span>
                    </button>
                    <button
                      v-if="server.tool_count > 0"
                      type="button"
                      class="ctx-expand"
                      data-testid="server-tools"
                      :aria-label="`展开 ${server.name} 的工具`"
                      @click.stop="toggleServerTools(server)"
                    >
                      {{ expandedServer === server.id ? '收起' : '工具' }}
                    </button>
                  </div>
                  <div v-if="expandedServer === server.id" class="ctx-tools">
                    <p v-if="toolsLoading.includes(server.id)" class="ctx-empty">正在加载工具…</p>
                    <p v-else-if="toolsOf(server.id).length === 0" class="ctx-empty">
                      该服务器没有可用工具
                    </p>
                    <button
                      v-for="tool in toolsOf(server.id)"
                      :key="tool.id"
                      type="button"
                      class="ctx-tool"
                      :class="{ 'is-selected': selectedTools.some((item) => item.id === tool.id) }"
                      @click.stop="toggleTool(tool)"
                    >
                      <span class="mono">{{ tool.name }}</span>
                      <span class="ctx-tool-risk">{{ tool.risk }}</span>
                    </button>
                  </div>
                </div>
                <p v-if="filteredServers.length === 0" class="ctx-empty">没有可用 MCP 服务器</p>
              </div>
              <p class="ctx-foot">写/破坏性工具仍需审批；普通用户不能使用系统 MCP 写工具。</p>
            </template>
          </div>
        </div>

        <div class="toolbar-right">
          <label v-if="models.length > 0" class="picker">
            <span class="sr-only">模型</span>
            <select :value="model" :disabled="streaming" @change="onModelChange">
              <option v-for="item in models" :key="item.id" :value="item.id">
                {{ item.name }}
              </option>
            </select>
          </label>

          <label v-if="reasoningEfforts.length > 0" class="picker">
            <span class="sr-only">推理等级</span>
            <select :value="reasoningEffort" :disabled="streaming" @change="onEffortChange">
              <option v-for="item in reasoningEfforts" :key="item.id" :value="item.id">
                {{ item.name }}
              </option>
            </select>
          </label>
        </div>
      </div>

      <textarea
        ref="textarea"
        v-model="text"
        class="composer-input"
        rows="1"
        :maxlength="maxChars"
        :placeholder="
          streaming
            ? '正在生成，可点击停止…'
            : '输入消息，或点 + 选择附件/技能/MCP（Enter 发送，Shift+Enter 换行）'
        "
        aria-label="输入消息"
        @input="autoResize"
        @keydown="onKeydown"
      ></textarea>

      <div class="composer-footer">
        <span class="hint">Enter 发送 · Shift+Enter 换行 · @ 选择文件</span>
        <span v-if="uploading" class="hint is-uploading">附件上传中…</span>
        <span class="count mono">{{ count }} / {{ maxChars }}</span>

        <button
          v-if="streaming"
          type="button"
          class="send is-stop"
          aria-label="停止生成"
          title="停止生成"
          @click="onStop"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="7" y="7" width="10" height="10" rx="1.5" />
          </svg>
        </button>
        <button
          v-else
          type="button"
          class="send"
          aria-label="发送"
          title="发送"
          :disabled="!canSend"
          @click="submit"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 19V5M6 11l6-6 6 6" />
          </svg>
        </button>
      </div>
    </div>
  </footer>
</template>

<style scoped>
.composer {
  position: relative;
  flex: none;
  padding: 8px 32px 18px;
  background: linear-gradient(to bottom, transparent, var(--paper) 24%);
}

.composer-box {
  width: min(100%, var(--content-max));
  margin: 0 auto;
  padding: 6px 8px 6px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--surface);
  box-shadow: var(--shadow-md);
  transition: border-color 0.15s;
}

.composer-box:focus-within {
  border-color: var(--ink-3);
}

.context-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  padding: 2px 2px 6px;
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  max-width: 260px;
  height: 24px;
  padding: 0 4px 0 7px;
  border: 1px solid var(--line-2);
  border-radius: 5px;
  background: var(--surface-2);
  color: var(--ink-2);
  font-size: 10.5px;
}

.chip.is-attachment {
  border-color: var(--kind-vector);
  background: var(--kind-vector-soft);
  color: var(--kind-vector);
}

.chip.is-skill {
  border-color: var(--kind-skill);
  background: var(--kind-skill-soft);
  color: var(--kind-skill);
}

.chip.is-mcp,
.chip.is-mcp-tool {
  border-color: var(--kind-mcp);
  background: var(--kind-mcp-soft);
  color: var(--kind-mcp);
}

.chip.is-uploading {
  opacity: 0.7;
}

.chip-kind {
  font-size: 9px;
  opacity: 0.8;
}

.chip-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chip-meta {
  font-size: 9px;
  opacity: 0.8;
}

.chip-remove {
  display: grid;
  place-items: center;
  width: 16px;
  height: 16px;
  border-radius: 3px;
  color: inherit;
  font-size: 13px;
  line-height: 1;
  opacity: 0.7;
}

.chip-remove:hover {
  background: rgba(0, 0, 0, 0.08);
  opacity: 1;
}

.composer-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 0 2px;
}

.toolbar-left,
.toolbar-right {
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
}

.icon-btn {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 5px;
  color: var(--ink-3);
}

.icon-btn:hover {
  background: var(--surface-2);
  color: var(--ink);
}

.icon-btn svg {
  width: 17px;
  height: 17px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
}

.file-input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}

.ctx-menu {
  position: absolute;
  bottom: 34px;
  left: 0;
  z-index: 40;
  width: 288px;
  max-height: 420px;
  padding: 6px;
  overflow: auto;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
  box-shadow: var(--shadow-md);
}

.ctx-title {
  padding: 4px 7px 5px;
  color: var(--ink-3);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.04em;
}

.ctx-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  height: 31px;
  padding: 0 7px;
  border-radius: 5px;
  color: var(--ink-2);
  font-size: 12px;
  text-align: left;
}

.ctx-item:hover {
  background: var(--surface-2);
  color: var(--ink);
}

.ctx-item.is-disabled {
  color: var(--ink-3);
  cursor: not-allowed;
}

.ctx-item.is-disabled:hover {
  background: transparent;
}

.ctx-stage {
  padding: 1px 5px;
  border: 1px solid var(--line-2);
  border-radius: 4px;
  color: var(--ink-3);
  font-family: var(--font-mono);
  font-size: 9px;
}

.ctx-foot {
  margin-top: 4px;
  padding: 5px 7px 2px;
  border-top: 1px solid var(--line-2);
  color: var(--ink-3);
  font-size: 9.5px;
  line-height: 1.5;
}

.ctx-subhead {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 4px 6px;
  color: var(--ink);
  font-size: 11.5px;
  font-weight: 600;
}

.ctx-subhead .ctx-stage {
  margin-left: auto;
}

.ctx-back {
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  border-radius: 4px;
  color: var(--ink-3);
}

.ctx-back:hover {
  background: var(--surface-2);
  color: var(--ink);
}

.ctx-search {
  width: 100%;
  height: 27px;
  margin-bottom: 5px;
  padding: 0 8px;
  border: 1px solid var(--line);
  border-radius: 5px;
  outline: none;
  background: var(--surface-2);
  color: var(--ink);
  font: inherit;
  font-size: 11px;
}

.ctx-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.ctx-row {
  display: flex;
  align-items: center;
  width: 100%;
  padding: 6px 7px;
  border-radius: 5px;
  color: var(--ink-2);
  text-align: left;
}

.ctx-row:hover {
  background: var(--surface-2);
}

.ctx-row.is-selected {
  background: var(--prussian-soft);
  color: var(--ink);
}

.ctx-row-main {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  gap: 1px;
}

.ctx-row-name {
  color: var(--ink);
  font-size: 11.5px;
  font-weight: 550;
}

.ctx-row-desc {
  overflow: hidden;
  color: var(--ink-3);
  font-size: 9.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ctx-row-meta {
  flex: none;
  margin-left: 6px;
  color: var(--ink-3);
  font-size: 9px;
}

.ctx-server {
  border-radius: 5px;
}

.ctx-row.is-server {
  gap: 4px;
  padding: 0;
}

.ctx-row.is-server .ctx-row-main {
  padding: 6px 7px;
  border-radius: 5px;
}

.ctx-row.is-server .ctx-row-main:hover {
  background: var(--surface-2);
}

.ctx-expand {
  flex: none;
  margin-right: 5px;
  padding: 2px 5px;
  border: 1px solid var(--line-2);
  border-radius: 4px;
  color: var(--ink-3);
  font-size: 9px;
}

.ctx-expand:hover {
  color: var(--ink);
}

.ctx-tools {
  display: flex;
  flex-direction: column;
  gap: 1px;
  margin: 1px 0 4px 14px;
  padding-left: 7px;
  border-left: 1px solid var(--line-2);
}

.ctx-tool {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  padding: 4px 6px;
  border-radius: 4px;
  color: var(--ink-2);
  font-size: 10px;
  text-align: left;
}

.ctx-tool:hover {
  background: var(--surface-2);
}

.ctx-tool.is-selected {
  background: var(--kind-mcp-soft);
  color: var(--kind-mcp);
}

.ctx-tool-risk {
  flex: none;
  color: var(--ink-3);
  font-size: 8.5px;
  text-transform: uppercase;
}

.ctx-empty {
  padding: 10px 7px;
  color: var(--ink-3);
  font-size: 10.5px;
  text-align: center;
}

.picker select {
  height: 24px;
  padding: 0 20px 0 7px;
  border: 1px solid transparent;
  border-radius: 5px;
  outline: none;
  background:
    linear-gradient(45deg, transparent 50%, var(--ink-3) 50%) no-repeat right 9px center / 4px 4px,
    linear-gradient(135deg, var(--ink-3) 50%, transparent 50%) no-repeat right 6px center / 4px 4px,
    var(--surface-2);
  color: var(--ink-2);
  font: inherit;
  font-size: 10.5px;
  appearance: none;
  cursor: pointer;
}

.picker select:hover:not(:disabled) {
  border-color: var(--line);
  color: var(--ink);
}

.picker select:disabled {
  cursor: not-allowed;
  opacity: 0.7;
}

.composer-input {
  display: block;
  width: 100%;
  max-height: 180px;
  min-height: 46px;
  padding: 8px 8px 4px;
  border: 0;
  outline: none;
  resize: none;
  background: transparent;
  color: var(--ink);
  font: inherit;
  font-size: 13.5px;
  line-height: 1.65;
}

.composer-input::placeholder {
  color: var(--ink-3);
}

.composer-footer {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 2px 1px 8px;
}

.hint {
  flex: 1;
  overflow: hidden;
  color: var(--ink-3);
  font-size: 9.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hint.is-uploading {
  flex: none;
  color: var(--amber-text);
}

.count {
  color: var(--ink-3);
  font-size: 9px;
}

.send {
  display: grid;
  place-items: center;
  flex: none;
  width: 30px;
  height: 30px;
  border-radius: 7px;
  background: var(--btn-bg);
  color: var(--btn-fg);
  transition:
    opacity 0.15s,
    filter 0.15s;
}

.send:hover:not(:disabled) {
  filter: brightness(1.12);
}

.send:disabled {
  cursor: not-allowed;
  opacity: 0.4;
}

.send.is-stop {
  background: var(--red);
  color: var(--surface);
}

.send svg {
  width: 15px;
  height: 15px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.9;
  stroke-linecap: round;
  stroke-linejoin: round;
}

@media (max-width: 900px) {
  .composer {
    padding: 6px 14px 12px;
  }
}
</style>
