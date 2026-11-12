import { expect, test, type Page } from '@playwright/test'

import { login } from './fixtures'

/**
 * M8 管理台 E2E：mock 沙盒下 admin@example.com 登录即为管理员。
 * 覆盖：入口与守卫、七页导航、用户页自己的行禁用、系统设置五分区、无权限页。
 */

/** mock 沙盒普通账号（非 admin@example.com 即 user 角色）。 */
async function loginAsUser(page: Page): Promise<void> {
  await page.goto('/login')
  await page.getByPlaceholder('you@example.com').fill('user@example.com')
  await page.getByPlaceholder('至少 8 位').fill('12345678')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page).toHaveURL(/\/chat(?:\?.*)?$/, { timeout: 15_000 })
}

async function waitReady(page: Page): Promise<void> {
  await page
    .locator('.loading-skeleton')
    .waitFor({ state: 'detached', timeout: 15_000 })
    .catch(() => undefined)
}

const ADMIN_PAGES: Array<{ nav: string; heading: string }> = [
  { nav: '管理概览', heading: '管理概览' },
  { nav: '用户管理', heading: '用户管理' },
  { nav: '角色与权限', heading: '角色与权限' },
  { nav: '菜单管理', heading: '菜单管理' },
  { nav: '字典管理', heading: '字典管理' },
  { nav: '审计日志', heading: '审计日志' },
  { nav: '系统设置', heading: '系统设置' },
]

test.describe('M8 管理台', () => {
  test('管理员从侧栏进入管理台并看到概览统计', async ({ page }) => {
    await login(page)

    await page.getByRole('link', { name: '管理控制台' }).click()
    await expect(page).toHaveURL(/\/admin$/)
    await expect(page.getByRole('heading', { name: '管理概览', level: 1 })).toBeVisible()
    await waitReady(page)

    // 概览统计卡与手动刷新按钮。
    await expect(page.getByText('数据时间：')).toBeVisible()
    await expect(page.getByRole('button', { name: '刷新' })).toBeVisible()
  })

  test('七页均可从管理侧栏导航', async ({ page }) => {
    await login(page)
    await page.goto('/admin')

    for (const { nav, heading } of ADMIN_PAGES) {
      await page.getByRole('link', { name: nav, exact: true }).click()
      await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible()
    }
  })

  test('用户页展示统计摘要与自己行禁用控件', async ({ page }) => {
    await login(page)
    await page.goto('/admin/users')
    await waitReady(page)

    // stats 摘要行（mock 数据：admin@example.com 是管理员）。
    await expect(page.getByText('管理员（含停用）')).toBeVisible()

    // 当前账号行的角色下拉与停用按钮均禁用。
    const selfRow = page.getByRole('row', { name: /当前账号/ })
    await expect(selfRow).toBeVisible()
    await expect(selfRow.getByRole('combobox')).toBeDisabled()
    await expect(selfRow.getByRole('button', { name: '停用' })).toBeDisabled()
  })

  test('用户页确认后可调整其他用户状态', async ({ page }) => {
    await login(page)
    await page.goto('/admin/users')
    await waitReady(page)

    // 找一行非当前账号的「停用」按钮并确认停用。
    const stopButtons = page
      .getByRole('row')
      .filter({ hasNot: page.getByText('当前账号') })
      .getByRole('button', { name: '停用', exact: true })
    const count = await stopButtons.count()
    test.skip(count === 0, 'mock 数据没有其他可停用用户')

    await stopButtons.first().click()
    await page.getByRole('dialog').getByRole('button', { name: '确认停用' }).click()
    await expect(page.getByText('账号已停用')).toBeVisible()
  })

  test('系统设置页展示五个分区', async ({ page }) => {
    await login(page)
    await page.goto('/admin/settings')
    await waitReady(page)

    await expect(page.getByRole('heading', { name: '平台默认指令', level: 2 })).toBeVisible()
    await expect(page.getByRole('heading', { name: '系统技能', level: 2 })).toBeVisible()
    await expect(page.getByRole('heading', { name: '系统 MCP', level: 2 })).toBeVisible()
    await expect(page.getByRole('heading', { name: '全局 Agent', level: 2 })).toBeVisible()
    // SecretPanel 的分区标题（M5 平台密钥）。
    await expect(page.getByText('平台密钥', { exact: false }).first()).toBeVisible()
  })

  test('三个无契约页展示只读提示', async ({ page }) => {
    await login(page)

    for (const [path, heading, note] of [
      ['/admin/roles', '角色与权限', '只读'],
      ['/admin/menus', '菜单管理', '只读'],
      ['/admin/dictionaries', '字典管理', '只读'],
    ] as const) {
      await page.goto(path)
      await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible()
      await expect(page.getByText(note).first()).toBeVisible()
    }
  })

  test('普通用户访问管理台进入无权限页并可返回工作台', async ({ page }) => {
    await loginAsUser(page)

    await page.goto('/admin')
    await expect(page.getByRole('heading', { name: '需要管理员权限' })).toBeVisible()

    await page.getByRole('button', { name: '返回工作台' }).click()
    await expect(page).toHaveURL(/\/chat(?:\?.*)?$/)
  })

  test('普通用户侧栏不出现管理控制台入口', async ({ page }) => {
    await loginAsUser(page)
    await expect(page.getByRole('link', { name: '管理控制台' })).toHaveCount(0)
  })
})
