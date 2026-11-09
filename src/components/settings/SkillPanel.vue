<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'

import EmptyState from '@/components/common/EmptyState.vue'
import ErrorState from '@/components/common/ErrorState.vue'
import LoadingBlock from '@/components/common/LoadingBlock.vue'
import { skillsApi } from '@/api/skills'
import { useCapabilitiesStore } from '@/stores/capabilities'
import { useSystemStore } from '@/stores/system'
import { SKILL_SCOPE_LABELS } from '@/types'
import { formatBytes, formatDateTime, formatTokens } from '@/utils/format'
import type { Skill, SkillFile } from '@/types'
import CapabilityGate from './CapabilityGate.vue'

const system = useSystemStore()
const capabilities = useCapabilitiesStore()
const enabled = computed(() => system.enabled('skills'))

const items = ref<Skill[]>([])
const loading = ref(false)
const loaded = ref(false)
const error = ref<string | null>(null)
const togglingId = ref<string | null>(null)

const fileInput = ref<HTMLInputElement | null>(null)
const importing = ref(false)

const createOpen = ref(false)
const createForm = reactive({ name: '', description: '', content: '' })
const creating = ref(false)

const detailOpen = ref(false)
const detail = ref<Skill | null>(null)
const detailLoading = ref(false)
const detailError = ref<string | null>(null)
const files = ref<SkillFile[]>([])
const activeFile = ref<{ path: string; content: string } | null>(null)
const activeFileLoading = ref(false)

const editOpen = ref(false)
const editForm = reactive({ name: '', description: '', content: '' })
const editing = ref(false)

watch(
  enabled,
  (on) => {
    if (on && !loaded.value && !loading.value) void load()
  },
  { immediate: true },
)

async function load(): Promise<void> {
  loading.value = true
  error.value = null
  try {
    const page = await skillsApi.list()
    items.value = page.items
    loaded.value = true
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '加载技能失败'
  } finally {
    loading.value = false
  }
}

function onToggle(row: unknown, value: string | number | boolean): void {
  void toggleEnabled(row as Skill, value === true)
}

async function toggleEnabled(skill: Skill, next: boolean): Promise<void> {
  togglingId.value = skill.id
  try {
    const updated = await skillsApi.setEnabled(skill.id, next)
    Object.assign(skill, updated)
    capabilities.invalidate()
    ElMessage.success(next ? '已启用' : '已禁用')
  } catch (cause) {
    ElMessage.error(cause instanceof Error ? cause.message : '启停失败')
  } finally {
    togglingId.value = null
  }
}

function pickFile(): void {
  fileInput.value?.click()
}

async function onFileChange(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  importing.value = true
  try {
    const result = await skillsApi.importZip(file)
    if (result.warnings.length > 0) {
      ElMessage.warning(`导入成功，但有 ${result.warnings.length} 条警告：${result.warnings.join('；')}`)
    } else {
      ElMessage.success(`已导入技能「${result.skill.name}」`)
    }
    capabilities.invalidate()
    await load()
  } catch (cause) {
    ElMessage.error(cause instanceof Error ? cause.message : '导入失败')
  } finally {
    importing.value = false
  }
}

function openCreate(): void {
  createForm.name = ''
  createForm.description = ''
  createForm.content = ''
  createOpen.value = true
}

async function submitCreate(): Promise<void> {
  if (creating.value) return
  const name = createForm.name.trim()
  const description = createForm.description.trim()
  const content = createForm.content.trim()
  if (!name || !description || !content) {
    ElMessage.warning('名称、描述与正文均为必填')
    return
  }
  creating.value = true
  try {
    await skillsApi.create({ name, description, content })
    createOpen.value = false
    capabilities.invalidate()
    await load()
    ElMessage.success('已创建技能')
  } catch (cause) {
    ElMessage.error(cause instanceof Error ? cause.message : '创建失败')
  } finally {
    creating.value = false
  }
}

async function openDetail(skill: Skill): Promise<void> {
  detail.value = skill
  detailOpen.value = true
  detailError.value = null
  files.value = []
  activeFile.value = null
  detailLoading.value = true
  try {
    const [full, fileList] = await Promise.all([skillsApi.get(skill.id), skillsApi.files(skill.id)])
    detail.value = full
    files.value = fileList
  } catch (cause) {
    detailError.value = cause instanceof Error ? cause.message : '加载技能详情失败'
  } finally {
    detailLoading.value = false
  }
}

async function readFile(path: string): Promise<void> {
  if (!detail.value) return
  activeFileLoading.value = true
  try {
    activeFile.value = await skillsApi.readFile(detail.value.id, path)
  } catch (cause) {
    ElMessage.error(cause instanceof Error ? cause.message : '读取文件失败')
  } finally {
    activeFileLoading.value = false
  }
}

function canEdit(skill: Skill): boolean {
  return skill.editable ?? skill.scope === 'user'
}

function openEdit(): void {
  if (!detail.value) return
  editForm.name = detail.value.name
  editForm.description = detail.value.description
  editForm.content = detail.value.content ?? ''
  editOpen.value = true
}

async function submitEdit(): Promise<void> {
  if (editing.value || !detail.value) return
  const name = editForm.name.trim()
  if (!name) {
    ElMessage.warning('名称不能为空')
    return
  }
  editing.value = true
  try {
    const updated = await skillsApi.update(detail.value.id, {
      name,
      description: editForm.description.trim(),
      content: editForm.content,
    })
    detail.value = { ...detail.value, ...updated }
    const existing = items.value.find((item) => item.id === updated.id)
    if (existing) Object.assign(existing, updated)
    capabilities.invalidate()
    editOpen.value = false
    ElMessage.success('已保存技能')
  } catch (cause) {
    ElMessage.error(cause instanceof Error ? cause.message : '保存失败')
  } finally {
    editing.value = false
  }
}

async function removeSkill(): Promise<void> {
  if (!detail.value) return
  const target = detail.value
  try {
    await ElMessageBox.confirm(
      `将删除技能「${target.name}」，其正文与参考文件一并移除，该操作不可撤销。`,
      '删除技能？',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  try {
    await skillsApi.remove(target.id)
    capabilities.invalidate()
    detailOpen.value = false
    await load()
    ElMessage.success('已删除技能')
  } catch (cause) {
    ElMessage.error(cause instanceof Error ? cause.message : '删除失败')
  }
}
</script>

<template>
  <section class="card">
    <header class="card-head">
      <div class="head-title">
        <h3>技能</h3>
        <span class="tag mono">{{ items.length }} 个</span>
      </div>
      <span class="mono hint">/api/v1/skills</span>
    </header>

    <CapabilityGate :enabled="enabled" name="技能" hint="后端尚未开启技能能力，无法查看或管理技能。">
      <div class="toolbar">
        <button type="button" class="btn" :disabled="importing" @click="pickFile">
          {{ importing ? '导入中…' : '导入技能包（zip）' }}
        </button>
        <button type="button" class="btn primary" @click="openCreate">手写创建</button>
        <span class="muted">技能正文与参考文件按不可信内容渲染。</span>
      </div>

      <ErrorState v-if="error" :message="error" @retry="load" />
      <LoadingBlock v-else-if="loading" label="正在加载技能…" />
      <EmptyState
        v-else-if="items.length === 0"
        title="暂无技能"
        description="导入技能包或手写创建，系统技能只能启停、不能修改正文。"
      />

      <ul v-else class="skill-list">
        <li
          v-for="skill in items"
          :key="skill.id"
          class="skill-item"
          role="button"
          tabindex="0"
          @click="openDetail(skill)"
          @keydown.enter="openDetail(skill)"
        >
          <div class="skill-main">
            <p class="skill-title">
              {{ skill.name }}
              <span class="mono slug">{{ skill.slug }}</span>
              <span class="chip">{{ SKILL_SCOPE_LABELS[skill.scope] ?? skill.scope }}</span>
              <span v-if="skill.scope === 'system'" class="chip chip-locked">系统 · 只读</span>
            </p>
            <p v-if="skill.description" class="skill-desc">{{ skill.description }}</p>
            <p class="skill-meta">
              <span class="mono">≈ {{ formatTokens(skill.estimated_tokens) }} tokens</span>
              <span>{{ skill.file_count }} 个文件 · {{ formatBytes(skill.size_bytes) }}</span>
              <span v-if="skill.updated_at" class="mono">更新于 {{ formatDateTime(skill.updated_at) }}</span>
            </p>
          </div>
          <span class="switch-wrap" @click.stop>
            <el-switch
              :model-value="skill.effective_enabled ?? skill.enabled"
              :loading="togglingId === skill.id"
              size="small"
              :aria-label="`${(skill.effective_enabled ?? skill.enabled) ? '禁用' : '启用'} ${skill.name}`"
              @change="onToggle(skill, $event)"
            />
          </span>
        </li>
      </ul>
    </CapabilityGate>

    <input
      ref="fileInput"
      type="file"
      accept=".zip,application/zip"
      class="sr-only"
      aria-hidden="true"
      @change="onFileChange"
    />

    <el-dialog v-model="createOpen" title="手写创建技能" width="560px" :append-to-body="true">
      <form class="form" @submit.prevent="submitCreate">
        <label class="form-row">
          <span class="form-label">名称</span>
          <input v-model="createForm.name" class="input" placeholder="例如：代码审查" />
        </label>
        <label class="form-row">
          <span class="form-label">描述</span>
          <input v-model="createForm.description" class="input" placeholder="一句话说明技能用途（必填）" />
        </label>
        <label class="form-row">
          <span class="form-label">正文（SKILL.md）</span>
          <textarea
            v-model="createForm.content"
            class="input textarea"
            rows="8"
            placeholder="# 技能标题&#10;&#10;1. 步骤一&#10;2. 步骤二"
          />
        </label>
        <div class="dialog-actions">
          <button type="button" class="btn" @click="createOpen = false">取消</button>
          <button type="submit" class="btn primary" :disabled="creating">
            {{ creating ? '创建中…' : '创建' }}
          </button>
        </div>
      </form>
    </el-dialog>

    <el-drawer v-model="detailOpen" title="技能详情" size="480px" :append-to-body="true">
      <LoadingBlock v-if="detailLoading" label="正在加载技能详情…" />
      <ErrorState v-else-if="detailError" :message="detailError" @retry="detail && openDetail(detail)" />

      <div v-else-if="detail" class="detail">
        <header class="detail-head">
          <div>
            <h4>{{ detail.name }}</h4>
            <span class="mono slug">{{ detail.slug }}</span>
          </div>
          <span class="chip">{{ SKILL_SCOPE_LABELS[detail.scope] ?? detail.scope }}</span>
        </header>

        <p v-if="detail.description" class="detail-desc">{{ detail.description }}</p>

        <dl class="facts">
          <div>
            <dt>Token 估算</dt>
            <dd class="mono">{{ formatTokens(detail.estimated_tokens) }}</dd>
          </div>
          <div>
            <dt>文件数</dt>
            <dd class="mono">{{ detail.file_count }}</dd>
          </div>
          <div>
            <dt>大小</dt>
            <dd class="mono">{{ formatBytes(detail.size_bytes) }}</dd>
          </div>
          <div v-if="detail.version">
            <dt>版本</dt>
            <dd class="mono">{{ detail.version }}</dd>
          </div>
        </dl>

        <section>
          <h5>正文</h5>
          <pre v-if="detail.content" class="body">{{ detail.content }}</pre>
          <p v-else class="muted">该技能没有正文。</p>
        </section>

        <section>
          <h5>参考文件（{{ files.length }}）</h5>
          <ul v-if="files.length > 0" class="files">
            <li v-for="file in files" :key="file.path">
              <button
                type="button"
                class="file-link"
                :class="{ 'is-active': activeFile?.path === file.path }"
                @click="readFile(file.path)"
              >
                <span class="mono">{{ file.path }}</span>
                <span class="mono muted">{{ formatBytes(file.size_bytes) }}</span>
              </button>
            </li>
          </ul>
          <p v-else class="muted">没有参考文件。</p>
          <pre v-if="activeFile" class="body file-body">{{ activeFile.content }}</pre>
        </section>

        <div v-if="canEdit(detail)" class="detail-actions">
          <button type="button" class="btn" @click="openEdit">编辑</button>
          <button type="button" class="btn danger" @click="removeSkill">删除</button>
        </div>
        <p v-else class="muted">系统技能不可编辑或删除，只能启停。</p>
      </div>
    </el-drawer>

    <el-dialog v-model="editOpen" title="编辑技能" width="560px" :append-to-body="true">
      <form class="form" @submit.prevent="submitEdit">
        <label class="form-row">
          <span class="form-label">名称</span>
          <input v-model="editForm.name" class="input" />
        </label>
        <label class="form-row">
          <span class="form-label">描述</span>
          <input v-model="editForm.description" class="input" />
        </label>
        <label class="form-row">
          <span class="form-label">正文（SKILL.md）</span>
          <textarea v-model="editForm.content" class="input textarea" rows="10" />
        </label>
        <div class="dialog-actions">
          <button type="button" class="btn" @click="editOpen = false">取消</button>
          <button type="submit" class="btn primary" :disabled="editing">
            {{ editing ? '保存中…' : '保存' }}
          </button>
        </div>
      </form>
    </el-dialog>
  </section>
</template>

<style scoped>
.card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  border: 1px solid var(--line);
  border-radius: 9px;
  background: var(--surface);
  box-shadow: var(--shadow-sm);
}

.card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.head-title {
  display: flex;
  align-items: center;
  gap: 8px;
}

h3 {
  font-size: 14px;
  font-weight: 650;
}

.hint {
  color: var(--ink-3);
  font-size: 9.5px;
}

.tag {
  padding: 1px 7px;
  border: 1px solid var(--line-2);
  border-radius: 99px;
  color: var(--ink-3);
  font-size: 9.5px;
}

.toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.muted {
  color: var(--ink-3);
  font-size: 10.5px;
}

.skill-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.skill-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--line-2);
  border-radius: 7px;
  background: var(--surface-2);
  cursor: pointer;
  transition: border-color 0.15s;
}

.skill-item:hover {
  border-color: var(--ink-3);
}

.skill-main {
  flex: 1;
  min-width: 0;
}

.skill-title {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  color: var(--ink);
  font-size: 12px;
  font-weight: 600;
}

.slug {
  color: var(--ink-3);
  font-size: 10px;
  font-weight: 400;
}

.chip {
  padding: 0 6px;
  border: 1px solid var(--line-2);
  border-radius: 99px;
  background: var(--surface);
  color: var(--ink-3);
  font-size: 9px;
  font-weight: 500;
}

.chip-locked {
  color: var(--amber-text);
  border-color: var(--amber-soft);
  background: var(--amber-soft);
}

.skill-desc {
  margin-top: 4px;
  color: var(--ink-2);
  font-size: 11.5px;
  line-height: 1.6;
}

.skill-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  margin-top: 5px;
  color: var(--ink-3);
  font-size: 10px;
}

.switch-wrap {
  flex: none;
}

.form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.form-row {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.form-label {
  color: var(--ink-2);
  font-size: 11.5px;
  font-weight: 550;
}

.textarea {
  display: block;
  width: 100%;
  height: auto;
  padding: 8px 10px;
  resize: vertical;
  line-height: 1.6;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 4px;
}

.btn.danger {
  border-color: var(--red-soft);
  color: var(--red);
}

.btn.danger:hover:not(:disabled) {
  border-color: var(--red);
}

.detail {
  display: flex;
  flex-direction: column;
  gap: 16px;
  color: var(--ink-2);
  font-size: 12px;
}

.detail-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.detail-head h4 {
  color: var(--ink);
  font-size: 15px;
  font-weight: 650;
}

.detail-desc {
  line-height: 1.7;
}

.facts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px 14px;
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
}

.facts dt {
  color: var(--ink-3);
  font-size: 10px;
}

.facts dd {
  margin: 2px 0 0;
  color: var(--ink);
  font-size: 11.5px;
}

h5 {
  margin-bottom: 6px;
  color: var(--ink);
  font-size: 11.5px;
  font-weight: 600;
}

.body {
  max-height: 320px;
  margin: 0;
  padding: 10px;
  overflow: auto;
  border: 1px solid var(--line-2);
  border-radius: 6px;
  background: var(--surface);
  font-family: var(--font-mono);
  font-size: 11px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}

.files {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.file-link {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  width: 100%;
  padding: 6px 8px;
  border: 1px solid var(--line-2);
  border-radius: 6px;
  color: var(--ink-2);
  font-size: 11px;
  text-align: left;
}

.file-link:hover,
.file-link.is-active {
  border-color: var(--prussian);
}

.file-body {
  margin-top: 8px;
}

.detail-actions {
  display: flex;
  gap: 8px;
  padding-top: 4px;
}
</style>
