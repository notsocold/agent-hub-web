import { expect, test } from '@playwright/test'

import { login } from './fixtures'

test.describe('移动端布局', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('导航抽屉可打开并关闭', async ({ page }) => {
    await login(page)

    // 原型把抽屉态放在 .app 根上（.app.sidebar-open .sidebar 滑出），侧栏本身不再加 is-open。
    const shell = page.locator('.app')
    const nav = page.locator('aside.sidebar')
    await page.getByRole('button', { name: '打开导航' }).click()
    await expect(shell).toHaveClass(/sidebar-open/)
    await expect(nav).toBeVisible()

    // 遮罩只覆盖侧栏右侧，点右侧区域关闭（点中心会落在 288px 侧栏内）。
    await page.locator('.sidebar-scrim').click({ position: { x: 340, y: 400 } })
    await expect(shell).not.toHaveClass(/sidebar-open/)
  })

  test('抽屉内可新建并切换会话（原型单侧栏）', async ({ page }) => {
    await login(page)

    await page.getByRole('button', { name: '打开导航' }).click()
    const nav = page.locator('aside.sidebar')
    await expect(nav.getByRole('button', { name: '新建会话' })).toBeVisible()

    const target = nav.locator('button.session', { hasText: 'Q3 客服工单周报' })
    await expect(target).toBeVisible({ timeout: 10_000 })
    await target.click()

    await expect(page).toHaveURL(/\/chat\?c=/)
    await expect(page.getByRole('heading', { name: 'Q3 客服工单周报', level: 1 })).toBeVisible()
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
