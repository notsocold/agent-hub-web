import { expect, test } from '@playwright/test'

import { login } from './fixtures'

test.describe('移动端布局', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('导航抽屉可打开并关闭', async ({ page }) => {
    await login(page)

    const nav = page.getByRole('complementary', { name: '主导航' })
    await page.getByRole('button', { name: '打开导航' }).click()
    await expect(nav).toHaveClass(/is-open/)

    await page.locator('.scrim').click()
    await expect(nav).not.toHaveClass(/is-open/)
  })

  test('发送消息与输入框在窄屏可用', async ({ page }) => {
    await login(page)

    const input = page.getByRole('textbox', { name: '输入消息' })
    await expect(input).toBeVisible()
    await input.fill('移动端冒烟')
    await page.getByRole('button', { name: '发送' }).click()

    await expect(page.getByText('移动端冒烟').first()).toBeVisible({ timeout: 10_000 })
    await expect(page.getByRole('button', { name: '发送' })).toBeVisible({ timeout: 30_000 })
  })
})
