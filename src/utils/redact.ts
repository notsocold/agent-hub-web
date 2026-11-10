/**
 * 敏感字段遮罩（前端展示层）。
 *
 * 后端 M5 已保证平台密钥接口与审计 detail 不回显明文/密文；这里再对
 * 审批 payload、审计 detail 中可能由用户/工具带入的敏感键做一层展示遮罩，
 * 默认折叠，用户可显式展开本地数据。
 */

const SENSITIVE_KEY_PARTS = [
  'password',
  'passwd',
  'pwd',
  'passphrase',
  'secret',
  'token',
  'apikey',
  'accesskey',
  'privatekey',
  'authorization',
  'cookie',
  'credential',
]

const MASK = '••••'

/** 归一化 key（去分隔符、小写）后按敏感词族匹配，覆盖 camelCase/kebab-case/header。 */
export function isSensitiveKey(key: string): boolean {
  const normalized = key.replace(/[_\-\s]/g, '').toLowerCase()
  return SENSITIVE_KEY_PARTS.some((part) => normalized.includes(part))
}

/** 递归遮罩对象/数组中的敏感键；不修改入参。 */
export function redactValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item))
  }
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      result[key] = isSensitiveKey(key) ? MASK : redactValue(item)
    }
    return result
  }
  return value
}

/** 是否包含敏感键（用于提示「已遮罩」）。 */
export function containsSensitiveKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some((item) => containsSensitiveKey(item))
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).some(
      ([key, item]) => isSensitiveKey(key) || containsSensitiveKey(item),
    )
  }
  return false
}

/**
 * 字符串级遮罩：后端 `payload_preview` 是原始 args 的 JSON 字符串，
 * 无法通过对象键递归处理；先尝试解析，失败时用正则替换敏感键的值。
 */
export function redactText(text: string): string {
  if (!text) return text
  try {
    return JSON.stringify(redactValue(JSON.parse(text) as unknown))
  } catch {
    // 非 JSON 预览：保守替换 `key: value` / `key=value` 形式。
  }
  return text.replace(
    /(("?[A-Za-z0-9_-]*(?:password|passwd|pwd|secret|token|api[_-]?key|authorization|cookie|credential)[A-Za-z0-9_-]*"?)\s*[:=]\s*)(?:(?:Bearer|Basic|Token)\s+)?("[^"]*"|'[^']*'|[^,;}\s]+)/gi,
    '$1"••••"',
  )
}
