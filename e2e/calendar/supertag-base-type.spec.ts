import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect } from '../fixtures/base.fixture.js'
import type { Page } from '@playwright/test'

const E2E_DB_PATH = join(tmpdir(), 'nxus-e2e.db')
const isGraphMode = process.env.ARCHITECTURE_TYPE === 'graph'

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
  test.skip(isGraphMode, 'Calendar base-type resolution is implemented for node-mode storage')
  test.setTimeout(120_000)

  test('BT1 - user supertag configured as Event appears on calendar', async ({ page }) => {
    await gotoEditorWithRetry(page, '/editor')
    const story = await seedBaseTypeCalendarStory()

    await gotoEditorWithRetry(page, `/editor?node=${story.zoomNodeId}`)
    const badge = page.locator(`[data-supertag-badge="${story.supertagId}"]`).first()
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
  supertagId: string
  title: string
}> {
  process.env.NXUS_DB_PATH = E2E_DB_PATH
  const {
    initDatabaseWithBootstrap,
    createNode,
    addNodeSupertag,
    setProperty,
    SYSTEM_FIELDS,
    SYSTEM_SUPERTAGS,
    sql,
  } = await import('../../libs/nxus-db/src/server.js')

  const db = await initDatabaseWithBootstrap()
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    const row = db.get<{ count: number }>(
      sql`SELECT COUNT(*) as count FROM nodes WHERE system_id LIKE 'item:%'`,
    )
    if ((row?.count ?? 0) > 0) break
    await new Promise((resolve) => setTimeout(resolve, 500))
  }

  const suffix = Date.now().toString(36)
  const supertagSystemId = `supertag:calendar_marker_${suffix}`
  const supertagId = createNode(db, {
    content: `#CalendarMarker${suffix}`,
    systemId: supertagSystemId,
  })
  addNodeSupertag(db, supertagId, SYSTEM_SUPERTAGS.SUPERTAG)

  const title = `Base type calendar story ${suffix}`
  // The tagged node needs a parent: supertag badges render on node ROWS, and a
  // zoomed node's own badges don't appear in the zoomed header — the test
  // zooms the parent and interacts with the child row's badge.
  const parentId = createNode(db, { content: `Base type story parent ${suffix}` })
  const nodeId = createNode(db, { content: title, ownerId: parentId, supertagId: supertagSystemId })
  setProperty(db, nodeId, SYSTEM_FIELDS.START_DATE, new Date().toISOString())
  setProperty(db, nodeId, SYSTEM_FIELDS.END_DATE, new Date(Date.now() + 60 * 60 * 1000).toISOString())

  return { zoomNodeId: parentId, supertagId, title }
}
