import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect } from '../fixtures/base.fixture.js'
import type { Page } from '@playwright/test'

const E2E_DB_PATH = join(tmpdir(), 'nxus-e2e.db')

async function gotoEditorWithRetry(page: Page, path = '/editor') {
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

test.describe('Outline lazy tree loading', () => {
  test.describe.configure({ mode: 'serial' })
  test.setTimeout(120_000)

  test('loads a depth-bounded workspace tree and fetches children on expand', async ({
    page,
  }) => {
    await gotoEditorWithRetry(page)
    const chain = await seedDeepChain()

    await gotoEditorWithRetry(page)

    await expect(page.getByText(chain.cText)).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(chain.dText)).toHaveCount(0)

    const boundaryBullet = page.locator(
      `[data-node-id="${chain.cId}"] > .node-row .bullet-container`,
    )
    await expect(boundaryBullet).toBeVisible({ timeout: 10_000 })

    await boundaryBullet.click()
    await expect(page.getByText(chain.dText)).toBeVisible({ timeout: 10_000 })

    await boundaryBullet.click()
    await expect(page.getByText(chain.dText)).toBeHidden({ timeout: 10_000 })

    await boundaryBullet.click()
    await expect(page.getByText(chain.dText)).toBeVisible({ timeout: 10_000 })
  })

  test('fetches an unloaded subtree when zooming directly to a boundary node', async ({
    page,
  }) => {
    await gotoEditorWithRetry(page)
    const chain = await seedDeepChain()

    await gotoEditorWithRetry(page, `/editor?node=${chain.cId}`)

    await expect(page.locator('h1')).toContainText(chain.cText, {
      timeout: 10_000,
    })
    await expect(page.getByText(chain.dText)).toBeVisible({ timeout: 10_000 })
  })
})

async function seedDeepChain(): Promise<{
  cId: string
  cText: string
  dText: string
}> {
  process.env.NXUS_DB_PATH = E2E_DB_PATH
  const { initDatabaseWithBootstrap, createNode, setProperty, SYSTEM_FIELDS } =
    await import('../../libs/nxus-db/src/server.js')

  const db = await initDatabaseWithBootstrap()
  const suffix = Date.now().toString(36)

  const rootId = createNode(db, { content: `lazy-root-${suffix}` })
  const aId = createNode(db, { content: `lazy-a-${suffix}`, ownerId: rootId })
  const bId = createNode(db, { content: `lazy-b-${suffix}`, ownerId: aId })
  const cText = `lazy-c-${suffix}`
  const cId = createNode(db, { content: cText, ownerId: bId })
  const dText = `lazy-d-${suffix}`
  const dId = createNode(db, { content: dText, ownerId: cId })

  for (const [index, nodeId] of [rootId, aId, bId, cId, dId].entries()) {
    setProperty(db, nodeId, SYSTEM_FIELDS.ORDER, String(index).padStart(8, '0'))
  }

  return { cId, cText, dText }
}
