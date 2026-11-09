export type UserRole = 'user' | 'admin'
export type UserStatus = 'active' | 'disabled'

export interface User {
  id: string
  email: string
  display_name: string
  status: UserStatus
  role: UserRole
  created_at: string
  last_login_at: string | null
}

export interface AuthTokens {
  access_token: string
  refresh_token: string
  token_type: 'bearer'
  expires_in: number
}

export interface LoginRequest {
  email: string
  password: string
}

export interface RegisterRequest {
  email: string
  password: string
  display_name: string
}

export interface UpdateMeRequest {
  display_name: string
}

export interface ChangePasswordRequest {
  current_password: string
  new_password: string
}
