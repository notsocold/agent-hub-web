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

    // M7：登录/注册的 401 不再进 refresh/登出流程，直接展示后端「邮箱或密码错误」，
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

  // 回归：ElMessageBox 是脚本中调用的函数式组件，不经过模板解析，
  // 一旦入口漏引 message-box 样式，弹窗会平铺整行且按钮小到无法操作。
  test('退出登录确认弹窗样式正常且按钮可操作', async ({ page }) => {
    await login(page)

    await page.getByTestId('account-menu').click()
    await page.getByRole('menuitem', { name: '退出登录' }).click()

    const dialog = page.locator('.el-message-box')
    await expect(dialog).toBeVisible()
    const box = await dialog.boundingBox()
    expect(box).not.toBeNull()
    // 正常样式下是设计宽度 420px；样式缺失时会被拉成整行宽。
    expect(box!.width).toBeGreaterThan(300)
    expect(box!.width).toBeLessThan(600)

    // 遮罩必须覆盖整个视口，否则弹窗没有模态语义、背景可被误触。
    const overlay = page.locator('.el-overlay.is-message-box')
    await expect(overlay).toBeVisible()
    const overlayBox = await overlay.boundingBox()
    const viewport = page.viewportSize()
    expect(overlayBox).not.toBeNull()
    expect(viewport).not.toBeNull()
    expect(Math.round(overlayBox!.width)).toBe(viewport!.width)
    expect(Math.round(overlayBox!.height)).toBe(viewport!.height)

    // 按钮尺寸正常才说明 el-button 样式一并加载；点「取消」应关闭弹窗且不登出。
    const cancel = page.getByRole('button', { name: '取消', exact: true })
    const cancelBox = await cancel.boundingBox()
    expect(cancelBox).not.toBeNull()
    expect(cancelBox!.width).toBeGreaterThanOrEqual(40)
    expect(cancelBox!.height).toBeGreaterThanOrEqual(28)

    await cancel.click()
    await expect(dialog).toBeHidden()
    await expect(page).toHaveURL(/\/chat(?:\?.*)?$/)
  })
})
