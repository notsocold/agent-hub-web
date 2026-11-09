import { AxiosError, type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios'

import { handleMockRequest } from './routers'

const MIN_DELAY = 120
const MAX_DELAY = 320

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function parseBody(data: unknown): unknown {
  if (typeof FormData !== 'undefined' && data instanceof FormData) {
    const fields: Record<string, string> = {}
    let file: { name: string; type: string; size: number } | null = null
    data.forEach((value, key) => {
      if (typeof value === 'string') {
        fields[key] = value
        return
      }
      if (typeof File !== 'undefined' && value instanceof File) {
        file = { name: value.name, type: value.type, size: value.size }
      }
    })
    return { __mockForm: true, fields, file }
  }
  if (typeof data !== 'string') return data
  try {
    return JSON.parse(data) as unknown
  } catch {
    return data
  }
}

function readHeaders(config: InternalAxiosRequestConfig): Record<string, string> {
  const headers: Record<string, string> = {}
  const authorization = config.headers.get('Authorization')
  if (typeof authorization === 'string') headers.authorization = authorization
  const contentType = config.headers.get('Content-Type')
  if (typeof contentType === 'string') headers['content-type'] = contentType
  return headers
}

export const mockAdapter: AxiosAdapter = async (config) => {
  const [rawPath = '/', rawQuery = ''] = (config.url ?? '/').split('?')
  const query = new URLSearchParams(rawQuery)
  const params = config.params as Record<string, unknown> | undefined
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        query.set(key, String(value))
      }
    }
  }

  const result = await handleMockRequest({
    method: (config.method ?? 'get').toUpperCase(),
    path: rawPath,
    query,
    body: parseBody(config.data),
    headers: readHeaders(config),
  })

  await delay(MIN_DELAY + Math.random() * (MAX_DELAY - MIN_DELAY))

  if (result.status >= 400) {
    throw new AxiosError(`Mock 请求失败：${result.status}`, 'ERR_BAD_REQUEST', config, undefined, {
      status: result.status,
      statusText: 'Mock Error',
      data: result.data,
      headers: {},
      config,
    })
  }

  return {
    data: result.data,
    status: result.status,
    statusText: 'OK',
    headers: {},
    config,
  }
}
