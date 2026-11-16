import { expect, test } from '@playwright/test'

import { login } from './fixtures'

test.describe('命令面板', () => {
  test('Ctrl+K 打开、Esc 关闭并可用键盘跳转页面', async ({ page }) => {
    await login(page)

    await page.keyboard.press('Control+K')
    const dialog = page.getByRole('dialog', { name: '全局搜索' })
    await expect(dialog).toBeVisible()

    const input = page.getByRole('combobox', { name: '搜索页面、会话或当前会话消息' })
    await input.fill('设置')
    await page.getByRole('option', { name: /设置/ }).click()

    await expect(page).toHaveURL(/\/settings$/)

    await page.keyboard.press('Control+K')
    await expect(dialog).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
  })

  test('从非对话页搜索会话并跳转到对话', async ({ page }) => {
    await login(page)
    await page.goto('/settings')
    // goto 是整页加载：等设置页渲染完成，AppLayout 的快捷键监听才一定注册好。
    await expect(page.getByRole('heading', { name: '设置', level: 1 })).toBeVisible()

    await page.keyboard.press('Control+K')
    const input = page.getByRole('combobox', { name: '搜索页面、会话或当前会话消息' })
    await input.fill('Q3')

    // 会话搜索走 250ms 防抖，等结果出现再点。
    await page.getByRole('option', { name: /Q3 客服工单周报/ }).click()
    await expect(page).toHaveURL(/\/chat\?c=/)
    await expect(page.getByRole('heading', { name: 'Q3 客服工单周报', level: 1 })).toBeVisible()
  })

  test('在当前会话内搜索消息并定位', async ({ page }) => {
    await login(page)
    await page.goto('/chat?c=22222222-2222-4222-8222-222222222222')
    await expect(page.getByRole('heading', { name: 'Q3 客服工单周报', level: 1 })).toBeVisible()

    await page.keyboard.press('Control+K')
    const input = page.getByRole('combobox', { name: '搜索页面、会话或当前会话消息' })
    await input.fill('data-analyst')

    // 页面组没有该文本，命中的只可能是当前会话消息；两条消息都提到它，取最近一条。
    const messageOption = page.getByRole('option', { name: /data-analyst/ }).first()
    await expect(messageOption).toBeVisible()
    await messageOption.click()

    await expect(page.getByRole('dialog', { name: '全局搜索' })).toHaveCount(0)
    // 用消息行断言真正滚进了视口，避免被页面标题「Q3 客服工单周报」误判为通过。
    await expect(
      page.locator('.message-row', { hasText: 'data-analyst' }).first(),
    ).toBeInViewport()
  })

  test('移动端顶栏搜索按钮可以打开面板', async ({ page }) => {
    await login(page)
    await page.setViewportSize({ width: 390, height: 844 })

    await page.getByRole('button', { name: '全局搜索' }).click()
    await expect(page.getByRole('dialog', { name: '全局搜索' })).toBeVisible()
  })
})

test.describe('管理台命令面板', () => {
  test('顶栏搜索：用户与审计动作跳转、快捷键打开', async ({ page }) => {
    await login(page)
    await page.goto('/admin')
    await expect(page.getByRole('heading', { name: '管理概览', level: 1 })).toBeVisible()

    await page.getByRole('button', { name: '搜索管理台（Ctrl+K 或 /）' }).click()
    const dialog = page.getByRole('dialog', { name: '管理台搜索' })
    await expect(dialog).toBeVisible()

    const input = page.getByRole('combobox', { name: '搜索管理台页面、用户或审计动作' })
    await input.fill('alice')
    // 用户搜索走 400ms 防抖，等结果出现再点。
    const userOption = page.getByRole('option', { name: /Alice Chen/ })
    await expect(userOption).toBeVisible()
    await userOption.click()
    await expect(page).toHaveURL(/\/admin\/users\?q=alice$/)

    // 关闭后焦点回到搜索按钮；'/' 可重新打开。
    await page.keyboard.press('/')
    await expect(dialog).toBeVisible()
    await input.fill('approval.decide')
    await page.getByRole('option', { name: /审批决定/ }).click()
    await expect(page).toHaveURL(/\/admin\/audit\?action=approval\.decide$/)
  })
})
