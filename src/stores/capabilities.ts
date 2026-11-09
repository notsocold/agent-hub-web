import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import { mcpApi } from '@/api/mcp'
import { skillsApi } from '@/api/skills'
import type { McpAvailableServer, McpAvailableTool, SkillCatalogItem } from '@/types'

/**
 * 输入栏「+」菜单与设置页共用的能力目录。
 *
 * 目录只包含当前可用（已启用、当前用户可调用）的条目；系统项的用户级覆盖
 * 已由后端在 `enabled` 中折算。这里不做本地过滤，避免前后端判断分叉。
 */
export const useCapabilitiesStore = defineStore('capabilities', () => {
  const skills = ref<SkillCatalogItem[]>([])
  const mcpServers = ref<McpAvailableServer[]>([])
  const mcpTools = ref<McpAvailableTool[]>([])
  /** 已按需加载过工具的服务器 id；避免重复请求。 */
  const loadedServerTools = ref<string[]>([])
  const loadingTools = ref<string[]>([])
  const loading = ref(false)
  const loaded = ref(false)
  const error = ref<string | null>(null)

  const enabledSkills = computed(() => skills.value.filter((item) => item.enabled))
  const enabledMcpServers = computed(() => mcpServers.value.filter((item) => item.enabled))

  async function load(force = false): Promise<void> {
    if (loading.value) return
    if (loaded.value && !force) return
    loading.value = true
    error.value = null
    try {
      const [catalog, available] = await Promise.all([skillsApi.catalog(), mcpApi.available()])
      skills.value = catalog
      mcpServers.value = available.servers
      mcpTools.value = available.tools
      loadedServerTools.value = available.tools.length > 0 ? available.servers.map((s) => s.id) : []
      loaded.value = true
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : '无法加载能力目录'
    } finally {
      loading.value = false
    }
  }

  /** 设置页改动后让下一次选择重新拉取。 */
  function invalidate(): void {
    loaded.value = false
  }

  function toolsOfServer(serverId: string): McpAvailableTool[] {
    return mcpTools.value.filter((item) => item.server_id === serverId)
  }

  /**
   * 后端 `/mcp/available` 只返回服务器；工具在展开服务器时按需拉取。
   * 失败时保留空列表并记录错误，不阻断选择服务器本身。
   */
  async function loadTools(serverId: string, force = false): Promise<void> {
    if (loadingTools.value.includes(serverId)) return
    if (!force && loadedServerTools.value.includes(serverId)) return
    loadingTools.value = [...loadingTools.value, serverId]
    try {
      const tools = await mcpApi.tools(serverId)
      const others = mcpTools.value.filter((item) => item.server_id !== serverId)
      mcpTools.value = [
        ...others,
        ...tools.map((tool) => ({
          id: tool.id,
          server_id: tool.server_id,
          name: tool.name,
          exposed_name: tool.exposed_name,
          risk: tool.risk,
          requires_approval: tool.requires_approval,
        })),
      ]
      loadedServerTools.value = [...new Set([...loadedServerTools.value, serverId])]
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : '加载 MCP 工具失败'
    } finally {
      loadingTools.value = loadingTools.value.filter((item) => item !== serverId)
    }
  }

  return {
    skills,
    mcpServers,
    mcpTools,
    loading,
    loaded,
    error,
    enabledSkills,
    enabledMcpServers,
    loadedServerTools,
    loadingTools,
    load,
    loadTools,
    invalidate,
    toolsOfServer,
  }
})
