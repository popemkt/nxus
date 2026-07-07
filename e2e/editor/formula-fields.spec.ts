import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect } from '../fixtures/base.fixture.js'
import type { FieldSystemId } from '../../libs/nxus-db/src/server.js'

const E2E_DB_PATH = join(tmpdir(), 'nxus-e2e.db')

test.describe('Formula Fields', () => {
  test.describe.configure({ mode: 'serial' })

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

  test('multi-parent supertag inheritance shows fields from both parent supertags', async ({ page }) => {
    const { nodeId } = await seedMultiParentStory()

    await page.goto(`/editor?node=${nodeId}`)
    await page.waitForLoadState('networkidle')
    await page.getByText('Loading').waitFor({ state: 'hidden', timeout: 15_000 }).catch(() => {})

    const alphaRow = page.locator('[data-field-name="Alpha Code"]').first()
    const betaRow = page.locator('[data-field-name="Beta Code"]').first()
    await expect(alphaRow).toBeVisible({ timeout: 10_000 })
    await expect(betaRow).toBeVisible({ timeout: 10_000 })
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

async function seedMultiParentStory(): Promise<{ nodeId: string }> {
  process.env.NXUS_DB_PATH = E2E_DB_PATH
  const {
    initDatabaseWithBootstrap,
    createNode,
    addNodeSupertag,
    addPropertyValue,
    setProperty,
    SYSTEM_FIELDS,
    SYSTEM_SUPERTAGS,
  } = await import('../../libs/nxus-db/src/server.js')

  const db = await initDatabaseWithBootstrap()
  const suffix = Date.now().toString(36)
  const alphaFieldSystemId = `field:multi_parent_alpha_${suffix}` as FieldSystemId
  const betaFieldSystemId = `field:multi_parent_beta_${suffix}` as FieldSystemId

  const alphaTag = createNode(db, {
    content: `#MultiParentAlpha${suffix}`,
    systemId: `supertag:multi_parent_alpha_${suffix}`,
  })
  addNodeSupertag(db, alphaTag, SYSTEM_SUPERTAGS.SUPERTAG)

  const betaTag = createNode(db, {
    content: `#MultiParentBeta${suffix}`,
    systemId: `supertag:multi_parent_beta_${suffix}`,
  })
  addNodeSupertag(db, betaTag, SYSTEM_SUPERTAGS.SUPERTAG)

  const childTag = createNode(db, {
    content: `#MultiParentChild${suffix}`,
    systemId: `supertag:multi_parent_child_${suffix}`,
  })
  addNodeSupertag(db, childTag, SYSTEM_SUPERTAGS.SUPERTAG)
  addPropertyValue(db, childTag, SYSTEM_FIELDS.EXTENDS, alphaTag)
  addPropertyValue(db, childTag, SYSTEM_FIELDS.EXTENDS, betaTag)

  const alphaField = createNode(db, {
    content: 'Alpha Code',
    systemId: alphaFieldSystemId,
  })
  addNodeSupertag(db, alphaField, SYSTEM_SUPERTAGS.FIELD)
  setProperty(db, alphaField, SYSTEM_FIELDS.FIELD_TYPE, 'text')

  const betaField = createNode(db, {
    content: 'Beta Code',
    systemId: betaFieldSystemId,
  })
  addNodeSupertag(db, betaField, SYSTEM_SUPERTAGS.FIELD)
  setProperty(db, betaField, SYSTEM_FIELDS.FIELD_TYPE, 'text')

  setProperty(db, alphaTag, alphaFieldSystemId, 'alpha inherited')
  setProperty(db, betaTag, betaFieldSystemId, 'beta inherited')

  const nodeId = createNode(db, { content: `Multi-parent story ${suffix}` })
  addNodeSupertag(db, nodeId, `supertag:multi_parent_child_${suffix}`)

  return { nodeId }
}
