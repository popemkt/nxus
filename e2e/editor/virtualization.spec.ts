import { test, expect } from '../fixtures/base.fixture.js'
import type { Page } from '@playwright/test'
import { openSeedBackend } from '../helpers/seed-backend.js'

async function gotoEditorWithRetry(page: Page, path: string) {
  for (let attempt = 0; attempt < 4; attempt++) {
    await page.goto(path, { waitUntil: 'networkidle' }).catch(() => {})
    await page.getByText('Loading').waitFor({ state: 'hidden', timeout: 15_000 }).catch(() => {})
    const ok = await page
      .locator('.outline-body, .node-block, h1')
      .first()
      .isVisible()
      .catch(() => false)
    if (ok) return
    await page.waitForTimeout(1500)
  }
}

test.describe('Outline child-list virtualization', () => {
  test.setTimeout(120_000)

  test('windows wide child lists while preserving interaction', async ({ page }) => {
    await gotoEditorWithRetry(page, '/editor')
    const seeded = await seedWideChildList()

    await gotoEditorWithRetry(page, `/editor?node=${seeded.parentId}`)

    await expect(page.locator('h1')).toContainText(seeded.parentText, {
      timeout: 10_000,
    })
    await expect(page.getByText(seeded.firstChildText)).toBeVisible({
      timeout: 10_000,
    })

    const nodeBlockCount = await page.locator('.node-block').count()
    expect(nodeBlockCount).toBeLessThan(250)

    const outlineBody = page.locator('.outline-body')
    await outlineBody.evaluate((element) => {
      element.scrollTop = element.scrollHeight
    })
    await expect(page.getByText(seeded.lastChildText)).toBeVisible({
      timeout: 10_000,
    })

    await outlineBody.evaluate((element) => {
      element.scrollTop = element.scrollHeight / 2
    })
    await expect(page.getByText(seeded.midChildText)).toBeVisible({
      timeout: 10_000,
    })
    await page.getByText(seeded.midChildText).click()
    await expect(
      page.locator(`[data-node-id="${seeded.midChildId}"] [contenteditable="true"]`),
    ).toBeVisible({ timeout: 5_000 })
  })
})

async function seedWideChildList(): Promise<{
  parentId: string
  parentText: string
  firstChildText: string
  midChildId: string
  midChildText: string
  lastChildText: string
}> {
  const { createNode, setProperty, SYSTEM_FIELDS } = await openSeedBackend()
  const suffix = Date.now().toString(36)
  const parentText = `virtual-parent-${suffix}`
  const parentId = await createNode({ content: parentText })
  await setProperty(parentId, SYSTEM_FIELDS.ORDER, '00001000')

  let midChildId = ''
  const firstChildText = `virtual-child-000-${suffix}`
  const midChildText = `virtual-child-250-${suffix}`
  const lastChildText = `virtual-child-499-${suffix}`

  for (let index = 0; index < 500; index++) {
    const text = `virtual-child-${String(index).padStart(3, '0')}-${suffix}`
    const childId = await createNode({ content: text, ownerId: parentId })
    await setProperty(
      childId,
      SYSTEM_FIELDS.ORDER,
      String((index + 1) * 1000).padStart(8, '0'),
    )
    if (index === 250) midChildId = childId
  }

  return {
    parentId,
    parentText,
    firstChildText,
    midChildId,
    midChildText,
    lastChildText,
  }
}
