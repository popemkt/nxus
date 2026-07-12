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

async function waitForCalendarReady(page: Page) {
  const loadingOverlay = page.locator('.nxus-calendar .absolute.inset-0.z-10')
  await expect(loadingOverlay).toBeHidden({ timeout: 15_000 }).catch(() => {})
}

test.describe.serial('Supertag base type calendar behavior', () => {
  test.setTimeout(120_000)

  test('BT1 - user supertag configured as Event appears on calendar', async ({ page }) => {
    await gotoEditorWithRetry(page, '/editor')
    const story = await seedBaseTypeCalendarStory()

    await gotoEditorWithRetry(page, `/editor?node=${story.zoomNodeId}`)
    // Locate by rendered tag name, not id: in graph mode the badge carries
    // the supertag CATALOG id while the seed returns the definition-node id.
    const badge = page
      .locator('[data-supertag-badge]')
      .filter({ hasText: story.tagName })
      .first()
    await expect(badge).toBeVisible({ timeout: 10_000 })
    await badge.hover()
    await badge.getByRole('button', { name: 'Configure supertag' }).click()

    // The base-type select lives in the panel's Settings tab.
    await page.getByRole('button', { name: 'Settings' }).click()
    const baseTypeSelect = page.getByTestId('supertag-base-type-select')
    await expect(baseTypeSelect).toBeVisible({ timeout: 10_000 })
    await baseTypeSelect.click()
    await page.getByRole('option', { name: 'Event' }).click()
    await expect(baseTypeSelect).toContainText('Event')

    await page.goto('/calendar', { waitUntil: 'networkidle' })
    await expect(page.locator('.nxus-calendar, .calendar-empty')).toBeVisible({ timeout: 15_000 })
    await waitForCalendarReady(page)

    await expect(page.getByText(story.title)).toBeVisible({ timeout: 15_000 })
  })
})

async function seedBaseTypeCalendarStory(): Promise<{
  zoomNodeId: string
  tagName: string
  title: string
}> {
  // Mode-aware backend (node → shared SQLite file, graph → SurrealDB the
  // app servers read) — replaces the direct SQLite import + raw SQL poll.
  const backend = await openSeedBackend()
  const { SYSTEM_FIELDS, SYSTEM_SUPERTAGS } = backend

  // Wait for the server's demo auto-seed (backend-agnostic readiness check)
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    const items = await backend.getNodesBySupertags([SYSTEM_SUPERTAGS.ITEM])
    if (items.length > 0) break
    await new Promise((resolve) => setTimeout(resolve, 500))
  }

  const suffix = Date.now().toString(36)
  const supertagSystemId = `supertag:calendar_marker_${suffix}`
  const supertagId = await backend.createNode({
    content: `#CalendarMarker${suffix}`,
    systemId: supertagSystemId,
  })
  await backend.addNodeSupertag(supertagId, SYSTEM_SUPERTAGS.SUPERTAG)

  const title = `Base type calendar story ${suffix}`
  // The tagged node needs a parent: supertag badges render on node ROWS, and a
  // zoomed node's own badges don't appear in the zoomed header — the test
  // zooms the parent and interacts with the child row's badge.
  const parentId = await backend.createNode({ content: `Base type story parent ${suffix}` })
  const nodeId = await backend.createNode({ content: title, ownerId: parentId, supertagId: supertagSystemId })
  await backend.setProperty(nodeId, SYSTEM_FIELDS.START_DATE, new Date().toISOString())
  await backend.setProperty(nodeId, SYSTEM_FIELDS.END_DATE, new Date(Date.now() + 60 * 60 * 1000).toISOString())

  return { zoomNodeId: parentId, tagName: `CalendarMarker${suffix}`, title }
}
