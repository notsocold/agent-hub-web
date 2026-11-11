import { expect, test } from '@playwright/test'

import { login } from './fixtures'

test.describe('界面偏好', () => {
  test('消息密度选择在整页刷新后仍生效', async ({ page }) => {
    await login(page)
    await page.goto('/settings')
    await expect(page.getByRole('heading', { name: '设置', level: 1 })).toBeVisible()

    // 默认分区是「个人能力」，先切到「界面」。
    await page
      .getByRole('navigation', { name: '设置分区' })
      .getByRole('button', { name: '界面' })
      .click()
    await page.getByRole('button', { name: '紧凑', exact: true }).click()
    await expect(page.getByRole('button', { name: '紧凑', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    // 刷新后直接打开对话页：偏好必须在入口初始化，不能依赖设置页懒加载。
    await page.reload()
    await expect(page.getByRole('heading', { name: '设置', level: 1 })).toBeVisible()
    await page.goto('/chat')

    await expect(page.locator('html')).toHaveAttribute('data-density', 'compact')
  })
})
