/** M5 平台密钥：对应后端 `SecretOut`，永不回显明文/密文。 */
export interface PlatformSecret {
  name: string
  description: string
  enabled: boolean
  created_at: string
  updated_at: string
}

export interface PlatformSecretCreateRequest {
  name: string
  /** 明文只用于写入，响应不会回显。 */
  value: string
  description?: string
}

export interface PlatformSecretUpdateRequest {
  /** 轮换密钥时提供。 */
  value?: string
  description?: string
  enabled?: boolean
}

/** 后端校验规则：`^[A-Za-z_][A-Za-z0-9_]{0,63}$`。 */
export const SECRET_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/
