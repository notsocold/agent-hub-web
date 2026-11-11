import { expect, test } from '@playwright/test'

import { login } from './fixtures'

test.describe('对话主链路', () => {
  test('发送消息后流式回复并恢复发送按钮', async ({ page }) => {
    await login(page)

    const input = page.getByRole('textbox', { name: '输入消息' })
    await input.fill('整理本周客服工单')
    await page.getByRole('button', { name: '发送' }).click()

    // 用户消息上屏，输入框清空（发送即清空是既有交互）。
    await expect(page.getByText('整理本周客服工单').first()).toBeVisible({ timeout: 10_000 })
    await expect(input).toHaveValue('')

    // 流式期间发送按钮切换为停止按钮。
    await expect(page.getByRole('button', { name: '停止生成' })).toBeVisible({ timeout: 10_000 })

    // 流结束后恢复发送按钮，并渲染 mock 助手回复的关键内容。
    await expect(page.getByRole('button', { name: '发送' })).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText('128 条').first()).toBeVisible({ timeout: 10_000 })
  })

  test('生成中可停止并恢复输入', async ({ page }) => {
    await login(page)

    await page.getByRole('textbox', { name: '输入消息' }).fill('写一段较长的复盘总结')
    await page.getByRole('button', { name: '发送' }).click()

    await expect(page.getByRole('button', { name: '停止生成' })).toBeVisible({ timeout: 10_000 })
    await page.getByRole('button', { name: '停止生成' }).click()

    // 停止后停止按钮消失、发送按钮恢复，可以继续输入。
    await expect(page.getByRole('button', { name: '停止生成' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: '发送' })).toBeVisible({ timeout: 10_000 })
    await expect(page.getByRole('textbox', { name: '输入消息' })).toBeEnabled()
  })
})
