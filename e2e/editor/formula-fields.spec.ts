import { test, expect } from '../fixtures/base.fixture.js'
import type { FieldSystemId } from '../../libs/nxus-db/src/server.js'
import { openSeedBackend } from '../helpers/seed-backend.js'

const isGraphMode = process.env.ARCHITECTURE_TYPE === 'graph'

test.describe('Formula Fields', () => {
  test.describe.configure({ mode: 'serial' })

  test('formula field computes from two number fields and updates after reload', async ({ page }) => {
    test.skip(isGraphMode, 'Formula EVALUATION is not implemented in SurrealBackend assembly — fixtures now seed backend-agnostically; see spec/tech/persistence.md DRIFT: graph-formula-evaluation')

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
    test.skip(isGraphMode, 'Formula EVALUATION is not implemented in SurrealBackend assembly — fixtures now seed backend-agnostically; see spec/tech/persistence.md DRIFT: graph-formula-evaluation')

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
  const { createNode, addNodeSupertag, setProperty, SYSTEM_FIELDS, SYSTEM_SUPERTAGS } =
    await openSeedBackend()
  const suffix = Date.now().toString(36)
  const priceFieldSystemId = `field:formula_price_${suffix}` as FieldSystemId
  const quantityFieldSystemId = `field:formula_quantity_${suffix}` as FieldSystemId
  const totalFieldSystemId = `field:formula_total_${suffix}` as FieldSystemId

  const productTag = await createNode({
    content: `#FormulaProduct${suffix}`,
    systemId: `supertag:formula_product_${suffix}`,
  })
  await addNodeSupertag(productTag, SYSTEM_SUPERTAGS.SUPERTAG)

  const priceField = await createNode({
    content: 'Price',
    systemId: priceFieldSystemId,
  })
  await addNodeSupertag(priceField, SYSTEM_SUPERTAGS.FIELD)
  await setProperty(priceField, SYSTEM_FIELDS.FIELD_TYPE, 'number')

  const quantityField = await createNode({
    content: 'Quantity',
    systemId: quantityFieldSystemId,
  })
  await addNodeSupertag(quantityField, SYSTEM_SUPERTAGS.FIELD)
  await setProperty(quantityField, SYSTEM_FIELDS.FIELD_TYPE, 'number')

  const totalField = await createNode({
    content: 'Total',
    systemId: totalFieldSystemId,
  })
  await addNodeSupertag(totalField, SYSTEM_SUPERTAGS.FIELD)
  await setProperty(totalField, SYSTEM_FIELDS.FIELD_TYPE, 'formula')
  await setProperty(totalField, SYSTEM_FIELDS.FORMULA, '{Price} * {Quantity}')

  await setProperty(productTag, priceFieldSystemId, null)
  await setProperty(productTag, quantityFieldSystemId, null)
  await setProperty(productTag, totalFieldSystemId, null)

  const nodeId = await createNode({ content: `Formula story ${suffix}` })
  await addNodeSupertag(nodeId, `supertag:formula_product_${suffix}`)
  await setProperty(nodeId, priceFieldSystemId, 10)
  await setProperty(nodeId, quantityFieldSystemId, 3)

  return { nodeId, quantityFieldSystemId }
}

async function updateQuantity(
  nodeId: string,
  quantityFieldSystemId: FieldSystemId,
  quantity: number,
): Promise<void> {
  const { setProperty } = await openSeedBackend()
  await setProperty(nodeId, quantityFieldSystemId, quantity)
}

async function seedMultiParentStory(): Promise<{ nodeId: string }> {
  const {
    createNode, addNodeSupertag, addPropertyValue, setProperty, SYSTEM_FIELDS, SYSTEM_SUPERTAGS,
  } = await openSeedBackend()
  const suffix = Date.now().toString(36)
  const alphaFieldSystemId = `field:multi_parent_alpha_${suffix}` as FieldSystemId
  const betaFieldSystemId = `field:multi_parent_beta_${suffix}` as FieldSystemId

  const alphaTag = await createNode({
    content: `#MultiParentAlpha${suffix}`,
    systemId: `supertag:multi_parent_alpha_${suffix}`,
  })
  await addNodeSupertag(alphaTag, SYSTEM_SUPERTAGS.SUPERTAG)

  const betaTag = await createNode({
    content: `#MultiParentBeta${suffix}`,
    systemId: `supertag:multi_parent_beta_${suffix}`,
  })
  await addNodeSupertag(betaTag, SYSTEM_SUPERTAGS.SUPERTAG)

  const childTag = await createNode({
    content: `#MultiParentChild${suffix}`,
    systemId: `supertag:multi_parent_child_${suffix}`,
  })
  await addNodeSupertag(childTag, SYSTEM_SUPERTAGS.SUPERTAG)
  await addPropertyValue(childTag, SYSTEM_FIELDS.EXTENDS, alphaTag)
  await addPropertyValue(childTag, SYSTEM_FIELDS.EXTENDS, betaTag)

  const alphaField = await createNode({
    content: 'Alpha Code',
    systemId: alphaFieldSystemId,
  })
  await addNodeSupertag(alphaField, SYSTEM_SUPERTAGS.FIELD)
  await setProperty(alphaField, SYSTEM_FIELDS.FIELD_TYPE, 'text')

  const betaField = await createNode({
    content: 'Beta Code',
    systemId: betaFieldSystemId,
  })
  await addNodeSupertag(betaField, SYSTEM_SUPERTAGS.FIELD)
  await setProperty(betaField, SYSTEM_FIELDS.FIELD_TYPE, 'text')

  await setProperty(alphaTag, alphaFieldSystemId, 'alpha inherited')
  await setProperty(betaTag, betaFieldSystemId, 'beta inherited')

  const nodeId = await createNode({ content: `Multi-parent story ${suffix}` })
  await addNodeSupertag(nodeId, `supertag:multi_parent_child_${suffix}`)

  return { nodeId }
}
