import { expect, test } from '@playwright/test'

import { login } from './fixtures'

test.describe('认证与登录态', () => {
  test('登录成功进入对话页', async ({ page }) => {
    await login(page)

    await expect(page.getByRole('textbox', { name: '输入消息' })).toBeVisible()
    await expect(page.getByRole('heading', { name: '今天要调度什么？' })).toBeVisible()
    await expect(page.getByTestId('account-menu')).toBeVisible()
  })

  test('错误密码给出提示并停留在登录页', async ({ page }) => {
    await page.goto('/login')
    await page.getByPlaceholder('you@example.com').fill('admin@example.com')
    // mock 约定：wrong-password 触发 401，其余 ≥8 位密码均登录成功。
    await page.getByPlaceholder('至少 8 位').fill('wrong-password')
    await page.getByRole('button', { name: '登录', exact: true }).click()

    // 登录失败的 401 会被全局拦截器统一转成「登录已过期，请重新登录」，
    // 这里只断言「出现可见提示且没有进入对话页」，不把当前文案写死。
    await expect(page.getByRole('alert')).toBeVisible({ timeout: 10_000 })
    await expect(page).toHaveURL(/\/login(?:\?.*)?$/)
    await expect(page.getByRole('heading', { name: '登录 Agent Hub' })).toBeVisible()
    await expect(page.getByRole('textbox', { name: '输入消息' })).toHaveCount(0)
  })

  test('登出后回到登录页', async ({ page }) => {
    await login(page)

    await page.getByTestId('account-menu').click()
    await page.getByRole('menuitem', { name: '退出登录' }).click()
    // 确认弹窗的「退出」与菜单项「退出登录」文字相近，必须用 exact 区分。
    await page.getByRole('button', { name: '退出', exact: true }).click()

    await expect(page).toHaveURL(/\/login(?:\?.*)?$/, { timeout: 15_000 })
    await expect(page.getByRole('heading', { name: '登录 Agent Hub' })).toBeVisible()
  })
})
