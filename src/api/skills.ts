import { apiClient } from './client'
import type {
  Skill,
  SkillCatalogItem,
  SkillFile,
  SkillImportResult,
  SkillListResult,
} from '@/types'

export interface SkillListParams {
  scope?: 'system' | 'user' | 'all'
  enabled?: boolean
  q?: string
}

export interface SkillCreateRequest {
  name: string
  /** 后端要求描述非空（1–500 字）。 */
  description: string
  content: string
  /** 可选；后端未接受 slug 时会被忽略。 */
  slug?: string
}

export interface SkillUpdateRequest {
  name?: string
  description?: string
  content?: string
}

/** 后端旧字段名 `effective_enabled` 是有效启停；系统项的用户覆盖已折算进去。 */
function normalizeSkill(raw: Skill): Skill {
  return {
    ...raw,
    enabled: raw.effective_enabled ?? raw.enabled,
    editable: raw.editable ?? raw.scope === 'user',
  }
}

type RawSkillList = { items: Skill[]; stats: SkillListResult['stats'] } | Skill[]

export const skillsApi = {
  async list(params: SkillListParams = {}): Promise<SkillListResult> {
    const { data } = await apiClient.get<RawSkillList>('/skills', { params })
    if (Array.isArray(data)) {
      return { items: data.map(normalizeSkill), stats: emptyStats(data) }
    }
    return { items: data.items.map(normalizeSkill), stats: data.stats }
  },

  async create(body: SkillCreateRequest): Promise<Skill> {
    const { data } = await apiClient.post<Skill>('/skills', body)
    return normalizeSkill(data)
  },

  /** 后端导入响应直接返回技能（含 `ignored`），这里归一化为 `{skill,warnings}`。 */
  async importZip(file: File): Promise<SkillImportResult> {
    const form = new FormData()
    form.append('file', file, file.name)
    const { data } = await apiClient.post<
      Skill & { imported?: boolean; ignored?: string[] }
    >('/skills/import', form, { timeout: 120_000 })
    return {
      skill: normalizeSkill(data),
      warnings: data.ignored ?? [],
    }
  },

  async get(id: string): Promise<Skill> {
    const { data } = await apiClient.get<Skill>(`/skills/${id}`)
    return normalizeSkill(data)
  },

  async update(id: string, body: SkillUpdateRequest): Promise<Skill> {
    const { data } = await apiClient.patch<Skill>(`/skills/${id}`, body)
    return normalizeSkill(data)
  },

  async remove(id: string): Promise<void> {
    await apiClient.delete(`/skills/${id}`)
  },

  async setEnabled(id: string, enabled: boolean): Promise<Skill> {
    const { data } = await apiClient.put<Skill>(`/skills/${id}/enabled`, { enabled })
    return normalizeSkill(data)
  },

  async files(id: string): Promise<SkillFile[]> {
    const { data } = await apiClient.get<{ items: SkillFile[] } | SkillFile[]>(
      `/skills/${id}/files`,
    )
    return Array.isArray(data) ? data : data.items
  },

  async readFile(id: string, path: string): Promise<{ path: string; content: string }> {
    const { data } = await apiClient.get<{ path: string; content: string }>(
      `/skills/${id}/files/${encodeURIComponent(path)}`,
    )
    return data
  },

  async catalog(): Promise<SkillCatalogItem[]> {
    type RawCatalogItem = Omit<SkillCatalogItem, 'enabled'> & {
      enabled?: boolean
      effective_enabled?: boolean
    }
    const { data } = await apiClient.get<
      { items: RawCatalogItem[] } | RawCatalogItem[]
    >('/skills/catalog')
    const items = Array.isArray(data) ? data : data.items
    return items.map((item) => ({
      ...item,
      enabled: item.enabled ?? item.effective_enabled ?? false,
    }))
  },
}

function emptyStats(items: Skill[]): SkillListResult['stats'] {
  return {
    total: items.length,
    system: items.filter((item) => item.scope === 'system').length,
    user: items.filter((item) => item.scope === 'user').length,
    enabled: items.filter((item) => item.effective_enabled ?? item.enabled).length,
  }
}
