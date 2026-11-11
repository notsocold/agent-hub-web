import { expect, test } from '@playwright/test'

import { login } from './fixtures'

test.describe('审批主链路', () => {
  test('发布类操作触发审批卡并可批准', async ({ page }) => {
    await login(page)

    // mock 约定：消息命中 /审批|发布|slack|写操作/ 时走 HITL 审批脚本。
    await page
      .getByRole('textbox', { name: '输入消息' })
      .fill('帮我发布这周的客服周报到 Slack')
    await page.getByRole('button', { name: '发送' }).click()

    // 审批卡出现，等待人工决定。
    const approve = page.getByRole('button', { name: '批准并执行' })
    await expect(approve).toBeVisible({ timeout: 20_000 })
    await expect(page.getByRole('button', { name: '拒绝' }).first()).toBeVisible()

    // 状态胶囊定位审批卡并聚焦批准按钮（审批只在对话内完成）。
    await page.getByRole('button', { name: '待审批' }).click()
    await expect(approve).toBeFocused()

    await approve.click()

    // 批准后同一 SSE 流继续输出，卡片标记已批准。
    await expect(page.getByText('已批准，正在发布到 #support-weekly')).toBeVisible({
      timeout: 20_000,
    })
    await expect(page.getByRole('button', { name: '批准并执行' })).toHaveCount(0)
  })

  test('拒绝后不执行写操作', async ({ page }) => {
    await login(page)

    await page.getByRole('textbox', { name: '输入消息' }).fill('帮我发布这周的客服周报到 Slack')
    await page.getByRole('button', { name: '发送' }).click()

    await expect(page.getByRole('button', { name: '拒绝' }).first()).toBeVisible({
      timeout: 20_000,
    })
    await page.getByRole('button', { name: '拒绝' }).first().click()

    await expect(page.getByText('已拒绝发布，周报草稿保留在会话中，未写入 Slack。')).toBeVisible({
      timeout: 20_000,
    })
  })
})

test('审批页已删除，访问 /approvals 显示 404', async ({ page }) => {
  await login(page)
  await page.goto('/approvals')
  await expect(page.getByRole('heading', { name: '页面不存在', level: 1 })).toBeVisible()
})
