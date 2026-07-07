import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect } from '../fixtures/base.fixture.js'
import type { Page } from '@playwright/test'

const E2E_DB_PATH = join(tmpdir(), 'nxus-e2e.db')

/**
 * Navigate with retry-on-cold-boot: on a parallel cold start the editor app
 * may still be compiling when the gateway proxies the first request (blank
 * page or gateway 404). Same resilience idea as outline-editor.spec.ts's
 * waitForSeededEditor.
 */
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

test.describe('Inline Mention Backlinks', () => {
  test.describe.configure({ mode: 'serial' })
  // Cold parallel start: warm-up navigation + waiting out the server's demo
  // auto-seed can exceed the default 30s budget before assertions even begin.
  test.setTimeout(120_000)

  test('a [[node:<id>]] token renders as a clickable chip and the target lists it under Mentioned', async ({
    page,
  }) => {
    // Warm the editor server BEFORE seeding: the server's auto-seed check
    // (initDatabaseWithBootstrap, master-client.ts) only seeds demo data when
    // no non-system node exists yet — writing our story nodes first would
    // suppress it and starve demo-data-dependent tests in the parallel
    // schedule. This also absorbs the cold-boot compile race.
    await gotoEditorWithRetry(page, '/editor')

    const { parentId, targetId, targetContent, sourceId, sourceContent } = await seedMentionStory()

    // 1. Zoom into the parent — both target and source render as sibling rows,
    //    so the source row's content is rendered through NodeContent (chip-aware).
    await gotoEditorWithRetry(page, `/editor?node=${parentId}`)
    await page.locator('.node-block').first().waitFor({ state: 'visible', timeout: 10_000 })

    const chip = page.locator(`[data-mention-chip="${targetId}"]`)
    await expect(chip).toBeVisible({ timeout: 10_000 })
    await expect(chip).toContainText(targetContent)

    // 2. Clicking the chip navigates to the target node.
    await chip.click()
    await page.waitForURL((url) => url.searchParams.get('node') === targetId, { timeout: 10_000 })
    await expect(page.locator('h1')).toContainText(targetContent)

    // 3. The target's References panel lists the source under "Mentioned",
    //    classified as an inline-mention (not double-counted as "Referenced").
    await page.evaluate(() => {
      const container = document.querySelector('.outline-body')
      if (container) container.scrollTop = container.scrollHeight
    })
    await page.waitForTimeout(500)
    await page.evaluate(() => {
      const container = document.querySelector('.outline-body')
      if (container) container.scrollTop = container.scrollHeight
    })

    const mentionedSection = page.locator('[data-reference-section="mentioned"]')
    await expect(mentionedSection.getByRole('button').first()).toContainText(
      /Mentioned\s*\(1\)/,
      { timeout: 10_000 },
    )
    await expect(mentionedSection).toContainText(sourceContent)

    // field:mentions itself must never surface as a "Referenced" field-value group.
    const referencedSection = page.locator('[data-reference-section="referenced"]')
    await expect(referencedSection).not.toContainText('mentions')

    // 4. Clicking the Mentioned row navigates back to the source node.
    await mentionedSection.getByText(sourceContent).click()
    await page.waitForURL((url) => url.searchParams.get('node') === sourceId, { timeout: 10_000 })
  })
})

async function seedMentionStory(): Promise<{
  parentId: string
  targetId: string
  targetContent: string
  sourceId: string
  sourceContent: string
}> {
  process.env.NXUS_DB_PATH = E2E_DB_PATH
  const { initDatabaseWithBootstrap, createNode, sql } = await import(
    '../../libs/nxus-db/src/server.js'
  )

  const db = await initDatabaseWithBootstrap()

  // Wait for the SERVER's demo auto-seed before writing any non-system node:
  // initDatabaseWithBootstrap only auto-seeds demo data while zero non-system
  // nodes exist (master-client.ts:351-362). If this story's nodes landed
  // first, demo seeding would be silently skipped for the whole parallel e2e
  // schedule, starving the search-palette and node-rendering specs. The
  // warm-up navigation in the test triggers the server's seed; here we just
  // wait until it is visible. Falls through after the deadline so a solo run
  // against an intentionally minimal DB still works.
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    const row = db.get<{ count: number }>(
      sql`SELECT COUNT(*) as count FROM nodes WHERE system_id LIKE 'item:%'`,
    )
    if ((row?.count ?? 0) > 0) break
    await new Promise((resolve) => setTimeout(resolve, 500))
  }

  const suffix = Date.now().toString(36)

  const parentId = createNode(db, { content: `Mention story parent ${suffix}` })
  const targetContent = `Mention target ${suffix}`
  const targetId = createNode(db, { content: targetContent, ownerId: parentId })
  const sourceContent = `Mentions target inline [[node:${targetId}]] — see above`
  const sourceId = createNode(db, { content: sourceContent, ownerId: parentId })

  return { parentId, targetId, targetContent, sourceId, sourceContent }
}
