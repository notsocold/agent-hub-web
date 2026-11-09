import { apiClient } from './client'
import type {
  AuthTokens,
  ChangePasswordRequest,
  LoginRequest,
  RegisterRequest,
  UpdateMeRequest,
  User,
} from '@/types'

export const authApi = {
  async login(body: LoginRequest): Promise<AuthTokens> {
    const { data } = await apiClient.post<AuthTokens>('/auth/login', body)
    return data
  },

  async register(body: RegisterRequest): Promise<AuthTokens> {
    const { data } = await apiClient.post<AuthTokens>('/auth/register', body)
    return data
  },

  async refresh(refreshToken: string): Promise<AuthTokens> {
    const { data } = await apiClient.post<AuthTokens>('/auth/refresh', {
      refresh_token: refreshToken,
    })
    return data
  },

  async logout(): Promise<void> {
    await apiClient.post('/auth/logout')
  },

  async me(): Promise<User> {
    const { data } = await apiClient.get<User>('/auth/me')
    return data
  },

  async updateMe(body: UpdateMeRequest): Promise<User> {
    const { data } = await apiClient.patch<User>('/auth/me', body)
    return data
  },

  async changePassword(body: ChangePasswordRequest): Promise<void> {
    await apiClient.post('/auth/change-password', body)
  },
}
