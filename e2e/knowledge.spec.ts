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

  test('粘贴文本上传后出现在文档列表', async ({ page }) => {
    await login(page)
    await page.getByRole('link', { name: '知识库' }).click()

    await expect(page.getByRole('region', { name: '文档列表' })).toBeVisible({ timeout: 15_000 })
    await page.getByRole('button', { name: '上传文档' }).click()

    await page.getByRole('tab', { name: '粘贴文本' }).click()
    await page
      .getByRole('textbox', { name: '粘贴知识库文本' })
      .fill('# 退货说明\n\n退货需保留吊牌，7 天内可退。')
    await page.getByPlaceholder('留空则用文件名').fill('E2E 退货说明')
    await page.getByRole('button', { name: '上传并入库' }).click()

    await expect(page.getByText('文档已上传，入库完成')).toBeVisible({ timeout: 20_000 })
    // 标题按钮与来源路径都包含标题文本，用 role 精确到标题按钮。
    await expect(
      page.getByRole('region', { name: '文档列表' }).getByRole('button', { name: 'E2E 退货说明' }),
    ).toBeVisible({ timeout: 20_000 })
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
