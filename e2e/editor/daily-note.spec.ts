import { test, expect } from '../fixtures/base.fixture.js'

/**
 * Daily notes (#Day nodes) — spec/product/data-model.md, day-node section.
 * DN1: the Today button zooms to today's #Day node, creating it on first
 * visit; a second click resolves to the SAME node (deterministic per date).
 */
test.describe('Daily notes', () => {
  test('DN1 — Today button opens (and reuses) the day node', async ({ page }) => {
    await page.goto('/editor', { waitUntil: 'networkidle' })

    const todayButton = page.getByTestId('today-button')
    await expect(todayButton).toBeVisible({ timeout: 15_000 })
    await todayButton.click()

    // Zoom navigation puts ?node=<id> in the URL.
    await page.waitForURL(/node=/, { timeout: 15_000 })
    const firstUrl = new URL(page.url())
    const firstNodeId = firstUrl.searchParams.get('node')
    expect(firstNodeId).toBeTruthy()

    // The zoomed header shows the day node's content: today's ISO date.
    const now = new Date()
    const iso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    await expect(page.getByText(iso).first()).toBeVisible({ timeout: 10_000 })

    // Navigate home, click again — must resolve to the SAME node id.
    await page.goto('/editor', { waitUntil: 'networkidle' })
    await page.getByTestId('today-button').click()
    await page.waitForURL(/node=/, { timeout: 15_000 })
    const secondNodeId = new URL(page.url()).searchParams.get('node')
    expect(secondNodeId).toBe(firstNodeId)
  })
})
