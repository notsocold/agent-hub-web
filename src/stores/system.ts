import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import { systemApi } from '@/api/system'
import type { ReasoningEffortId, SystemCapabilities, SystemInfo, SystemLimits } from '@/types'

const EMPTY_CAPABILITIES: SystemCapabilities = {
  instructions: false,
  memories: false,
  skills: false,
  mcp: false,
  knowledge: false,
  attachments: false,
  workflows: false,
  approvals: false,
  agents: false,
  tasks: false,
}

const EMPTY_LIMITS: SystemLimits = {
  skills_per_message: 3,
  mcp_servers_per_message: 5,
  mcp_tools_per_message: 10,
  knowledge_categories_per_message: 5,
  attachments_per_message: 5,
  attachment_max_bytes: 20 * 1024 * 1024,
  message_max_chars: 8000,
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '无法加载系统信息'
}

export const useSystemStore = defineStore('system', () => {
  const info = ref<SystemInfo | null>(null)
  const loading = ref(false)
  const loaded = ref(false)
  const error = ref<string | null>(null)

  const models = computed(() => info.value?.models ?? [])
  const reasoningEfforts = computed(() => info.value?.reasoning_efforts ?? [])
  const capabilities = computed(() => info.value?.capabilities ?? EMPTY_CAPABILITIES)
  const limits = computed(() => info.value?.limits ?? EMPTY_LIMITS)
  const defaultModel = computed(() => info.value?.default_model ?? '')
  const defaultReasoningEffort = computed<ReasoningEffortId>(
    () => info.value?.default_reasoning_effort ?? 'low',
  )
  const a2a = computed(() => info.value?.a2a ?? null)

  function enabled(capability: keyof SystemCapabilities): boolean {
    return capabilities.value[capability] === true
  }

  async function load(force = false): Promise<void> {
    if (loading.value) return
    if (loaded.value && !force) return
    loading.value = true
    error.value = null
    try {
      info.value = await systemApi.info()
      loaded.value = true
    } catch (cause) {
      error.value = errorMessage(cause)
    } finally {
      loading.value = false
    }
  }

  return {
    info,
    loading,
    loaded,
    error,
    models,
    reasoningEfforts,
    capabilities,
    limits,
    defaultModel,
    defaultReasoningEffort,
    a2a,
    enabled,
    load,
  }
})
