import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect } from '../fixtures/base.fixture.js'
import type { FieldSystemId } from '../../libs/nxus-db/src/server.js'

const E2E_DB_PATH = join(tmpdir(), 'nxus-e2e.db')

test.describe('Formula Fields', () => {
  test('formula field computes from two number fields and updates after reload', async ({ page }) => {
    const { nodeId, quantityFieldSystemId } = await seedFormulaStory()

    await page.goto(`/editor?node=${nodeId}`)
    await page.waitForLoadState('networkidle')
    await page.getByText('Loading').waitFor({ state: 'hidden', timeout: 15_000 }).catch(() => {})

    const totalRow = page.locator('[data-field-name="Total"]').first()
    await expect(totalRow).toBeVisible({ timeout: 10_000 })
    await expect(totalRow).toContainText('30')

    await updateQuantity(nodeId, quantityFieldSystemId, 5)
    await page.reload({ waitUntil: 'networkidle' })
    await page.getByText('Loading').waitFor({ state: 'hidden', timeout: 15_000 }).catch(() => {})

    await expect(page.locator('[data-field-name="Total"]').first()).toContainText('50')
  })
})

async function seedFormulaStory(): Promise<{ nodeId: string; quantityFieldSystemId: FieldSystemId }> {
  process.env.NXUS_DB_PATH = E2E_DB_PATH
  const {
    initDatabaseWithBootstrap,
    createNode,
    addNodeSupertag,
    setProperty,
    SYSTEM_FIELDS,
    SYSTEM_SUPERTAGS,
  } = await import('../../libs/nxus-db/src/server.js')

  const db = await initDatabaseWithBootstrap()
  const suffix = Date.now().toString(36)
  const priceFieldSystemId = `field:formula_price_${suffix}` as FieldSystemId
  const quantityFieldSystemId = `field:formula_quantity_${suffix}` as FieldSystemId
  const totalFieldSystemId = `field:formula_total_${suffix}` as FieldSystemId

  const productTag = createNode(db, {
    content: `#FormulaProduct${suffix}`,
    systemId: `supertag:formula_product_${suffix}`,
  })
  addNodeSupertag(db, productTag, SYSTEM_SUPERTAGS.SUPERTAG)

  const priceField = createNode(db, {
    content: 'Price',
    systemId: priceFieldSystemId,
  })
  addNodeSupertag(db, priceField, SYSTEM_SUPERTAGS.FIELD)
  setProperty(db, priceField, SYSTEM_FIELDS.FIELD_TYPE, 'number')

  const quantityField = createNode(db, {
    content: 'Quantity',
    systemId: quantityFieldSystemId,
  })
  addNodeSupertag(db, quantityField, SYSTEM_SUPERTAGS.FIELD)
  setProperty(db, quantityField, SYSTEM_FIELDS.FIELD_TYPE, 'number')

  const totalField = createNode(db, {
    content: 'Total',
    systemId: totalFieldSystemId,
  })
  addNodeSupertag(db, totalField, SYSTEM_SUPERTAGS.FIELD)
  setProperty(db, totalField, SYSTEM_FIELDS.FIELD_TYPE, 'formula')
  setProperty(db, totalField, SYSTEM_FIELDS.FORMULA, '{Price} * {Quantity}')

  setProperty(db, productTag, priceFieldSystemId, null)
  setProperty(db, productTag, quantityFieldSystemId, null)
  setProperty(db, productTag, totalFieldSystemId, null)

  const nodeId = createNode(db, { content: `Formula story ${suffix}` })
  addNodeSupertag(db, nodeId, `supertag:formula_product_${suffix}`)
  setProperty(db, nodeId, priceFieldSystemId, 10)
  setProperty(db, nodeId, quantityFieldSystemId, 3)

  return { nodeId, quantityFieldSystemId }
}

async function updateQuantity(
  nodeId: string,
  quantityFieldSystemId: FieldSystemId,
  quantity: number,
): Promise<void> {
  process.env.NXUS_DB_PATH = E2E_DB_PATH
  const { initDatabaseWithBootstrap, setProperty } = await import('../../libs/nxus-db/src/server.js')
  const db = await initDatabaseWithBootstrap()
  setProperty(db, nodeId, quantityFieldSystemId, quantity)
}
