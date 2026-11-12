import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

import { login } from './fixtures'

/**
 * 可访问性门禁：critical / serious 必须为 0。
 * 只扫用户实际会停留的主要界面与高风险新交互（命令面板）。
 */
/** 等异步数据加载完（骨架屏消失）再扫描，避免只扫到加载态。 */
async function waitReady(page: Page): Promise<void> {
  // 骨架屏消失即视为异步数据已就绪（页面本就没有骨架屏时立即通过）。
  await page
    .locator('.loading-skeleton')
    .waitFor({ state: 'detached', timeout: 15_000 })
    .catch(() => undefined)
}

async function scan(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  return results.violations.filter(
    (violation) => violation.impact === 'critical' || violation.impact === 'serious',
  )
}

function describeViolations(violations: Awaited<ReturnType<typeof scan>>): string[] {
  return violations.flatMap((violation) =>
    violation.nodes.map(
      (node) =>
        `${violation.id} (${violation.impact}): ${node.target.join(' > ')} — ${node.html.slice(0, 160)}`,
    ),
  )
}

test.describe('可访问性扫描', () => {
  test('登录页', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByRole('button', { name: '登录', exact: true })).toBeVisible()
    expect(describeViolations(await scan(page))).toEqual([])
  })

  test('对话页空态与消息态', async ({ page }) => {
    await login(page)
    expect(describeViolations(await scan(page))).toEqual([])

    await page.getByRole('textbox', { name: '输入消息' }).fill('可访问性扫描样本')
    await page.getByRole('button', { name: '发送' }).click()
    await expect(page.getByRole('button', { name: '发送' })).toBeVisible({ timeout: 30_000 })
    await waitReady(page)
    expect(describeViolations(await scan(page))).toEqual([])

    // >1180px 时运行轨迹常驻右栏，包含 9px 工具徽标，单独覆盖一次。
    await expect(page.getByRole('complementary', { name: '运行详情' })).toBeVisible({
      timeout: 5_000,
    })
    expect(describeViolations(await scan(page))).toEqual([])
  })

  test('命令面板打开态', async ({ page }) => {
    await login(page)
    await page.keyboard.press('Control+K')
    await expect(page.getByRole('dialog', { name: '全局搜索' })).toBeVisible()

    // 输入关键词让 combobox + option 组合真正出现。
    await page
      .getByRole('combobox', { name: '搜索页面、会话或当前会话消息' })
      .fill('设置')
    await expect(page.getByRole('option', { name: /设置/ })).toBeVisible()
    expect(describeViolations(await scan(page))).toEqual([])
  })

  test('知识库页', async ({ page }) => {
    await login(page)
    await page.goto('/knowledge')
    await expect(page.getByRole('heading', { name: '知识库', level: 1 })).toBeVisible()
    await waitReady(page)
    expect(describeViolations(await scan(page))).toEqual([])
  })

  test('设置页', async ({ page }) => {
    await login(page)
    await page.goto('/settings')
    await expect(page.getByRole('heading', { name: '设置', level: 1 })).toBeVisible()
    await waitReady(page)
    expect(describeViolations(await scan(page))).toEqual([])
  })

  test('智能体页与任务页', async ({ page }) => {
    await login(page)

    await page.goto('/agents')
    await expect(page.getByRole('heading', { name: '智能体', level: 1 })).toBeVisible()
    await waitReady(page)
    expect(describeViolations(await scan(page))).toEqual([])

    await page.goto('/tasks')
    await expect(page.getByRole('heading', { name: '任务', level: 1 })).toBeVisible()
    await waitReady(page)
    expect(describeViolations(await scan(page))).toEqual([])
  })
})

test.describe('可访问性扫描 · 管理台（M8）', () => {
  test('管理概览页', async ({ page }) => {
    await login(page)
    await page.goto('/admin')
    await expect(page.getByRole('heading', { name: '管理概览', level: 1 })).toBeVisible()
    await waitReady(page)
    expect(describeViolations(await scan(page))).toEqual([])
  })

  test('用户管理页', async ({ page }) => {
    await login(page)
    await page.goto('/admin/users')
    await expect(page.getByRole('heading', { name: '用户管理', level: 1 })).toBeVisible()
    await waitReady(page)
    expect(describeViolations(await scan(page))).toEqual([])
  })

  test('系统设置页', async ({ page }) => {
    await login(page)
    await page.goto('/admin/settings')
    await expect(page.getByRole('heading', { name: '系统设置', level: 1 })).toBeVisible()
    await waitReady(page)
    expect(describeViolations(await scan(page))).toEqual([])
  })

  test('无权限页', async ({ page }) => {
    await login(page)
    await page.goto('/admin/forbidden')
    await expect(page.getByRole('heading', { name: '需要管理员权限' })).toBeVisible()
    expect(describeViolations(await scan(page))).toEqual([])
  })
})
