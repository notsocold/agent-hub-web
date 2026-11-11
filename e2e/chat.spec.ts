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

test.describe('长会话虚拟滚动', () => {
  const LONG_CONVERSATION_ID = '22222222-2222-4222-8222-222222222299'

  test('1000 条消息只渲染可视区域，加载更早不跳视口', async ({ page }) => {
    await login(page)
    await page.goto(`/chat?c=${LONG_CONVERSATION_ID}`)

    const rows = page.locator('.message-row')
    await expect(rows.first()).toBeVisible({ timeout: 20_000 })

    const latest = page.getByText('第 500 轮回答：第 999 条工单字段映射一致。')
    await expect(latest).toBeVisible({ timeout: 20_000 })

    // 虚拟滚动：DOM 里只保留视口附近的行，而不是整页 100 条（设计阈值 < 50）。
    expect(await rows.count()).toBeLessThan(50)

    const before = await latest.boundingBox()
    const list = page.locator('.message-list')
    const heightBefore = await list.evaluate((element) => element.scrollHeight)
    await page.getByRole('button', { name: '加载更早消息' }).click()

    // mock 是内存实现、不发网络请求：以列表总高度增长作为「更早消息已 prepend」的信号。
    await expect
      .poll(async () => list.evaluate((element) => element.scrollHeight), { timeout: 10_000 })
      .toBeGreaterThan(heightBefore)

    // 前置插入后视口内容不应跳动（shift 锚定）。
    const after = await latest.boundingBox()
    expect(before && after).toBeTruthy()
    if (before && after) expect(Math.abs(after.y - before.y)).toBeLessThan(40)
  })

  test('上滑阅读时发送新消息不拉回底部', async ({ page }) => {
    await login(page)
    await page.goto(`/chat?c=${LONG_CONVERSATION_ID}`)
    await expect(page.locator('.message-row').first()).toBeVisible({ timeout: 20_000 })

    const list = page.locator('.message-list')
    await list.evaluate((element) => {
      element.scrollTop = Math.max(0, element.scrollTop - 1200)
    })
    const offsetBefore = await list.evaluate((element) => element.scrollTop)

    await page.getByRole('textbox', { name: '输入消息' }).fill('上滑后发送的消息')
    await page.getByRole('button', { name: '发送' }).click()
    await expect(page.getByRole('button', { name: '发送' })).toBeVisible({ timeout: 30_000 })

    // append 用户消息、流式 assistant 与执行过程行都不应把正在阅读的视口拉走。
    const offsetAfter = await list.evaluate((element) => element.scrollTop)
    expect(Math.abs(offsetAfter - offsetBefore)).toBeLessThan(80)
  })

  test('上滑离开底部后出现回到底部按钮', async ({ page }) => {
    await login(page)
    await page.goto(`/chat?c=${LONG_CONVERSATION_ID}`)
    await expect(page.locator('.message-row').first()).toBeVisible({ timeout: 20_000 })

    await page.locator('.message-list').evaluate((element) => {
      element.scrollTop = 0
    })
    await expect(page.getByRole('button', { name: '回到底部' })).toBeVisible({ timeout: 5_000 })

    await page.getByRole('button', { name: '回到底部' }).click()
    await expect(page.getByRole('button', { name: '回到底部' })).toHaveCount(0, { timeout: 5_000 })
  })
})
