import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

import { login } from './fixtures'

/**
 * D1 / WP2：运行轨迹抽屉全量交互。
 *
 * mock 构建下发送一条普通消息会生成 tool.start / tool.result，抽屉里能拿到
 * 与原型一致的“时间线 + 图例 + 类型筛选 + 搜索 + 可展开事件行”。
 */
test.describe('运行轨迹抽屉', () => {
  // <=1180px 时运行轨迹从常驻右栏回退为抽屉，入口是头部的“打开运行详情”。
  test.use({ viewport: { width: 1100, height: 900 } })

  test('打开抽屉 → 筛选工具 → 搜索命中 → 展开一行 → 图例可见', async ({ page }) => {
    await login(page)

    await page.getByRole('textbox', { name: '输入消息' }).fill('整理本周客服工单')
    await page.getByRole('button', { name: '发送' }).click()
    // 等流结束，确保 run 的 tool.start / tool.result 已经落库。
    await expect(page.getByRole('button', { name: '发送' })).toBeVisible({ timeout: 30_000 })

    await page.getByRole('button', { name: '打开运行详情' }).click()
    const drawer = page.getByRole('dialog', { name: '运行事件' })
    await expect(drawer).toBeVisible()

    // 抽屉打开态 0 critical/serious（aria-label/role 语义门禁）。
    const violations = (
      await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze()
    ).violations.filter(
      (violation) => violation.impact === 'critical' || violation.impact === 'serious',
    )
    expect(
      violations.flatMap((violation) =>
        violation.nodes.map(
          (node) =>
            `${violation.id} (${violation.impact}): ${node.target.join(' > ')} — ${node.html.slice(0, 160)}`,
        ),
      ),
    ).toEqual([])

    // 图例（8 类 + 计数）可见。
    const legend = drawer.getByRole('list', { name: '事件类型图例' })
    await expect(legend).toBeVisible()
    await expect(legend.getByText('消息', { exact: true })).toBeVisible()
    await expect(legend.getByText('工具', { exact: true })).toBeVisible()
    await expect(legend.getByText('审批', { exact: true })).toBeVisible()

    // 先等实时过程/服务端事件任一行出现，再做筛选。
    const rows = drawer.locator('.trace-row')
    await expect(rows.first()).toBeVisible({ timeout: 15_000 })

    // 类型筛选：只保留工具行，aria-pressed 同步。
    const toolFilter = drawer.getByRole('button', { name: /^工具/ })
    await toolFilter.click()
    await expect(toolFilter).toHaveAttribute('aria-pressed', 'true')
    await expect(rows.first()).toBeVisible()
    expect(await rows.count()).toBe(1)

    // 搜索命中“知识检索”。
    const search = drawer.getByRole('searchbox', { name: '搜索运行事件' })
    await search.fill('检索')
    await expect(rows).toHaveCount(1)
    await expect(drawer.getByText('知识检索').first()).toBeVisible()

    // 展开事件行，显示 redacted JSON 详情。
    await rows.first().getByRole('button').click()
    const code = rows.first().locator('pre.trace-code')
    await expect(code).toBeVisible()
    await expect(code).toContainText('tool_call_id')
    await expect(rows.first().getByRole('button')).toHaveAttribute('aria-expanded', 'true')
  })
})
