import { expect, test, type Page } from '@playwright/test'

import { login } from './fixtures'

/**
 * M9 工作流 E2E（mock 构建）：主链路 + 能力关闭门控。
 *
 * - mock 数据：4 条模板（客服周报 v2 / 知识库巡检 / 发布简报（停用）/ 客户访谈纪要（系统）），
 *   capabilities.workflows=true；`workflows=false` 用例通过 localStorage 覆盖钩子模拟。
 * - 主链路发送的消息不含审批关键词（审批/发布/slack/写操作），走普通脚本：
 *   非 approval 步骤（检索 + a2a）会播放 workflow.step 帧；审批步骤卡只在审批流出现。
 */

/** 主链路新建的三步模板名称（每次用例跑在全新 mock context，无重跑冲突）。 */
const NEW_WORKFLOW_NAME = 'E2E 三步工作流'
/** fixture 中带运行历史演示数据的模板（挂 3 条 workflow_runs）。 */
const WEEKLY_WORKFLOW_NAME = '客服周报'

/** 编辑器添加一个步骤并填写字段；approval/tool 步骤需要补工具名（回车提交）。 */
async function addStep(
  page: Page,
  type: 'knowledge_search' | 'a2a' | 'approval',
  title: string,
  instruction: string,
  tool?: string,
): Promise<void> {
  await page.getByTestId('step-add-type').selectOption(type)
  await page.getByTestId('step-add').click()
  const card = page.getByTestId('step-card').last()
  await card.getByTestId('step-title').fill(title)
  await card.getByTestId('step-instruction').fill(instruction)
  if (tool) {
    await card.getByTestId('step-tool-input').fill(tool)
    await card.getByTestId('step-tool-input').press('Enter')
    await expect(card.getByTestId('step-tool-tag')).toHaveCount(1)
  }
}

test.describe('工作流主链路', () => {
  test('新建三步模板并在对话中使用，时间线出现工作流步骤卡', async ({ page }) => {
    await login(page)
    await page.goto('/workflows')

    // 1. 列表卡片渲染（mock fixture 四条，含系统模板与停用模板）。
    await expect(page.getByTestId('workflow-card')).toHaveCount(4)
    await expect(page.getByText(WEEKLY_WORKFLOW_NAME)).toBeVisible()

    // 2. 新建 → 编辑器填写名称/描述。
    await page.getByTestId('workflow-new').click()
    await expect(page).toHaveURL(/\/workflows\/new$/)
    await page.getByTestId('editor-name').fill(NEW_WORKFLOW_NAME)
    await page.getByTestId('editor-description').fill('检索 → 远程智能体 → 审批的 E2E 主链路模板')

    // 3. 添加三步（检索 / a2a / 审批）；审批步骤必须提供工具清单。
    await addStep(page, 'knowledge_search', '检索工单', '检索本周工单与复盘文档')
    await addStep(page, 'a2a', '数据核对', '交给数据核对智能体核对数字')
    await addStep(page, 'approval', '审批发布', '发布前人工确认', 'send_message')
    await expect(page.getByTestId('step-card')).toHaveCount(3)

    // 4. 保存 → 回列表 → 新模板卡片出现（v1、3 步）。
    await page.getByTestId('editor-save').click()
    await expect(page).toHaveURL(/\/workflows$/)
    const newCard = page.locator('[data-testid="workflow-card"]', { hasText: NEW_WORKFLOW_NAME })
    await expect(newCard).toBeVisible()
    await expect(newCard).toContainText('v1')
    await expect(newCard).toContainText('3 步')

    // 5. 在对话中使用 → composer chip 出现（文案 = 名称 · vN · 步数）。
    await newCard.getByTestId('workflow-use').click()
    await expect(page).toHaveURL(/\/chat\?/)
    await expect(page.getByTestId('chip-workflow')).toContainText(
      `${NEW_WORKFLOW_NAME} · v1 · 3 步`,
      { timeout: 15_000 },
    )
    // chip 下方步骤预览也同步出现。
    await expect(page.getByTestId('workflow-steps')).toBeVisible()

    // 6. 发送（不含审批关键词）→ 时间线出现 workflow.step 步骤卡（检索步骤命中）。
    await page.getByRole('textbox', { name: '输入消息' }).fill('整理本周客服工单，检索相关规范并总结')
    await page.getByRole('button', { name: '发送' }).click()
    const workflowCard = page.locator('.entry.kind-workflow', { hasText: '检索工单' })
    await expect(workflowCard.first()).toBeVisible({ timeout: 30_000 })

    // 7. 运行历史：SPA 导航回列表（goto 整页重载会重置 mock 内存数据，新建模板会消失）。
    //    新模板页可达（mock 不登记新运行 → 空态，属已知限制）；fixture 模板（客服周报）
    //    有 3 条演示记录，证明运行历史页渲染真实数据。
    const navWorkflows = page.getByRole('navigation').getByRole('link', { name: '工作流' })
    await navWorkflows.click()
    await expect(page).toHaveURL(/\/workflows$/)
    await newCard.getByTestId('workflow-runs').click()
    await expect(page).toHaveURL(/\/runs$/)
    await expect(page.getByText('该模板还没有运行记录')).toBeVisible({ timeout: 10_000 })

    await navWorkflows.click()
    const weeklyCard = page.locator('[data-testid="workflow-card"]', {
      hasText: WEEKLY_WORKFLOW_NAME,
    })
    await weeklyCard.getByTestId('workflow-runs').click()
    await expect(page).toHaveURL(/\/runs$/)
    await expect(page.getByTestId('run-row')).toHaveCount(3)
    await expect(page.getByText('成功').first()).toBeVisible()
  })
})

test.describe('能力关闭门控', () => {
  test('capabilities.workflows=false 时导航置灰、路由退回并提示未启用', async ({ page }) => {
    // E2E 专用钩子：addInitScript 在文档加载前写入 mock 能力覆盖。
    await page.addInitScript(() => {
      localStorage.setItem('mock-capability-override', JSON.stringify({ workflows: false }))
    })
    await login(page)

    // 1. 侧栏「工作流」导航按钮置灰（守卫口径：能力关闭的页面不可进入）。
    await expect(
      page.getByRole('navigation').getByRole('button', { name: /工作流/ }),
    ).toBeDisabled()

    // 2. 直接访问 /workflows 被路由守卫退回对话页（blocked 提示展示后被 replace 掉）。
    await page.goto('/workflows')
    await expect(page.getByText('工作流能力当前关闭，将在后续里程碑开放。')).toBeVisible()
    await expect(page).toHaveURL(/\/chat(?:\?.*)?$/)

    // 3. 对话页：「+ 上下文」菜单里工作流入口显示「未启用」。
    await page.getByRole('button', { name: '添加上下文' }).click()
    await expect(page.getByTestId('ctx-workflow')).toContainText('未启用')
  })
})
