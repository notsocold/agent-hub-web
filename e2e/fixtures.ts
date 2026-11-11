import { expect, type Page } from '@playwright/test'

/** 登录成功后默认落地在对话页，允许带 query（如 ?c=...）。 */
const CHAT_URL = /\/chat(?:\?.*)?$/

/**
 * 使用 mock 沙盒管理员账号登录，并等到对话页可见。
 *
 * mock 登录规则（src/api/mock/routers.ts）：admin@example.com 为管理员；
 * 密码任意 ≥8 位且不等于 wrong-password 即可登录。
 */
export async function login(page: Page): Promise<void> {
  await page.goto('/login')

  // 优先使用 placeholder / role 定位，避免依赖 Element Plus 生成的类名与 DOM 层级。
  await page.getByPlaceholder('you@example.com').fill('admin@example.com')
  await page.getByPlaceholder('至少 8 位').fill('12345678')
  await page.getByRole('button', { name: '登录', exact: true }).click()

  await expect(page).toHaveURL(CHAT_URL, { timeout: 15_000 })
  // 输入框只在对话页渲染，作为「对话页已可见」的稳定标志，替代固定时长等待。
  await expect(page.getByRole('textbox', { name: '输入消息' })).toBeVisible({ timeout: 15_000 })
}
