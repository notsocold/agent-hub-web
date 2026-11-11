import { expect, test } from '@playwright/test'

import { login } from './fixtures'

test.describe('知识库主链路', () => {
  test('文档列表可见并可检索命中', async ({ page }) => {
    await login(page)
    await page.getByRole('link', { name: '知识库' }).click()

    await expect(page).toHaveURL(/\/knowledge(?:\?.*)?$/)
    const docs = page.getByRole('region', { name: '文档列表' })
    await expect(docs).toBeVisible({ timeout: 15_000 })
    await expect(docs.getByText('Q3 客服复盘 v2')).toBeVisible({ timeout: 15_000 })

    // 检索调试：mock 的命中规则是标题/分类/路径包含查询词。
    const panel = page.getByRole('region', { name: '检索调试' })
    await expect(panel).toBeVisible()
    await panel.getByTestId('debug-query').fill('退款')
    await panel.getByRole('button', { name: '检索', exact: true }).click()

    await expect(panel.getByText('退款政策').first()).toBeVisible({ timeout: 15_000 })
  })

  test('检索无命中时给出空态提示', async ({ page }) => {
    await login(page)
    await page.getByRole('link', { name: '知识库' }).click()

    const panel = page.getByRole('region', { name: '检索调试' })
    await expect(panel).toBeVisible({ timeout: 15_000 })
    await panel.getByTestId('debug-query').fill('不存在的检索词-xyz')
    await panel.getByRole('button', { name: '检索', exact: true }).click()

    await expect(panel.getByText('没有命中片段')).toBeVisible({ timeout: 15_000 })
  })
})
