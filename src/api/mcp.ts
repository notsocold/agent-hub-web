import { apiClient } from './client'
import type {
  McpAvailable,
  McpAvailableServer,
  McpAvailableTool,
  McpCheckResult,
  McpServer,
  McpServerCreateRequest,
  McpServerUpdateRequest,
  McpTool,
  McpToolUpdateRequest,
} from '@/types'

export interface McpServerListParams {
  scope?: 'system' | 'user' | 'all'
  enabled?: boolean
  health_status?: string
  q?: string
}

export interface McpServerListResult {
  items: McpServer[]
  stats: Record<string, number>
}

interface RawCheckResult {
  id?: string
  health_status: McpCheckResult['health_status']
  latency_ms: number | null
  message?: string | null
  tools_discovered?: number
  last_checked_at?: string | null
  /** 兼容早期草稿字段。 */
  checked_at?: string | null
  tool_count?: number
  error?: string | null
}

function normalizeServer(raw: McpServer): McpServer {
  return {
    ...raw,
    enabled: raw.effective_enabled ?? raw.enabled,
    auth_hint: raw.auth_hint ?? raw.credentials_hint ?? '',
  }
}

function normalizeCheck(raw: RawCheckResult): McpCheckResult {
  return {
    health_status: raw.health_status,
    latency_ms: raw.latency_ms,
    tool_count: raw.tools_discovered ?? raw.tool_count ?? 0,
    checked_at: raw.last_checked_at ?? raw.checked_at ?? null,
    error: raw.error ?? raw.message ?? null,
  }
}

type RawList<T> = { items: T[]; stats?: Record<string, number> } | T[]

export const mcpApi = {
  async listServers(params: McpServerListParams = {}): Promise<McpServerListResult> {
    const { data } = await apiClient.get<RawList<McpServer>>('/mcp/servers', { params })
    if (Array.isArray(data)) {
      return { items: data.map(normalizeServer), stats: { total: data.length } }
    }
    return { items: data.items.map(normalizeServer), stats: data.stats ?? {} }
  },

  async createServer(body: McpServerCreateRequest): Promise<McpServer> {
    const { data } = await apiClient.post<McpServer>('/mcp/servers', body)
    return normalizeServer(data)
  },

  async getServer(id: string): Promise<McpServer> {
    const { data } = await apiClient.get<McpServer>(`/mcp/servers/${id}`)
    return normalizeServer(data)
  },

  async updateServer(id: string, body: McpServerUpdateRequest): Promise<McpServer> {
    const { data } = await apiClient.patch<McpServer>(`/mcp/servers/${id}`, body)
    return normalizeServer(data)
  },

  async removeServer(id: string): Promise<void> {
    await apiClient.delete(`/mcp/servers/${id}`)
  },

  async setEnabled(id: string, enabled: boolean): Promise<McpServer> {
    const { data } = await apiClient.put<McpServer>(`/mcp/servers/${id}/enabled`, { enabled })
    return normalizeServer(data)
  },

  async check(id: string): Promise<McpCheckResult> {
    const { data } = await apiClient.post<RawCheckResult>(`/mcp/servers/${id}/check`)
    return normalizeCheck(data)
  },

  async refreshTools(id: string): Promise<McpCheckResult> {
    const { data } = await apiClient.post<RawCheckResult>(`/mcp/servers/${id}/refresh-tools`)
    return normalizeCheck(data)
  },

  async tools(id: string): Promise<McpTool[]> {
    const { data } = await apiClient.get<{ items: McpTool[] } | McpTool[]>(
      `/mcp/servers/${id}/tools`,
    )
    return Array.isArray(data) ? data : data.items
  },

  async updateTool(id: string, body: McpToolUpdateRequest): Promise<McpTool> {
    const { data } = await apiClient.patch<McpTool>(`/mcp/tools/${id}`, body)
    return data
  },

  /**
   * 后端只返回服务器目录（`{items}`）；工具按需通过 `tools(serverId)` 拉取。
   * 兼容早期 `{servers,tools}` 形态，便于 mock 与旧契约并存。
   */
  async available(): Promise<McpAvailable> {
    const { data } = await apiClient.get<
      | { items: McpAvailableServer[] }
      | { servers: McpAvailableServer[]; tools: McpAvailableTool[] }
    >('/mcp/available')
    if ('servers' in data) {
      return {
        servers: data.servers.map((item) => ({
          ...item,
          enabled: item.effective_enabled ?? item.enabled,
        })),
        tools: data.tools,
      }
    }
    return {
      servers: data.items.map((item) => ({
        ...item,
        enabled: item.effective_enabled ?? item.enabled,
      })),
      tools: [],
    }
  },
}
