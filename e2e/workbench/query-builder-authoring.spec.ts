import { test, expect } from '../fixtures/base.fixture.js'
import type { Page } from '@playwright/test'
import type { FieldSystemId } from '../../libs/nxus-db/src/server.js'
import { openSeedBackend } from '../helpers/seed-backend.js'

const isGraphMode = process.env.ARCHITECTURE_TYPE === 'graph'

/**
 * Tana-gap #4 — query builder nested groups + path-filter authoring.
 *
 * QueryDefinition already supports arbitrary recursive and/or/not and `path`
 * filters (libs/nxus-db/src/types/query.ts); these specs prove the
 * @nxus/workbench UI can actually AUTHOR both shapes end-to-end (build via
 * clicks, evaluate, get the correct result set) rather than only display
 * them. See spec/product/apps/workbench.md "Query builder" section.
 */


/**
 * Switch the workbench sidebar to the Query Builder view, retrying on a cold
 * parallel start: the pre-existing `e2e/workbench/query-builder.spec.ts`
 * exhibits the same flake against unmodified `main` (verified by stashing
 * this change's tracked files and rerunning) — the "Add filter" button can
 * fail to mount on the first attempt against a freshly-booted dev server +
 * freshly-seeded DB. Same resilience idea as outline-editor.spec.ts's
 * waitForSeededEditor / inline-mentions.spec.ts's gotoEditorWithRetry.
 */
async function openQueryBuilderView(page: Page): Promise<void> {
  for (let attempt = 0; attempt < 4; attempt++) {
    await page.getByRole('button', { name: 'Query Builder' }).click()
    const ok = await page
      .getByRole('button', { name: 'Add filter' })
      .isVisible({ timeout: 5_000 })
      .catch(() => false)
    if (ok) return
    await page.reload({ waitUntil: 'networkidle' }).catch(() => {})
  }
  // Final attempt — let this one throw with Playwright's own error if it still fails.
  await page.getByRole('button', { name: 'Query Builder' }).click()
  await expect(page.getByRole('button', { name: 'Add filter' })).toBeVisible({ timeout: 10_000 })
}

/**
 * Wait for a filter editor popup (identified by its title) to be visible,
 * then let its 100ms open/close CSS transition settle before interacting
 * with controls inside it. Without this, a click on a combobox immediately
 * after opening the popup can occasionally land while the just-closed
 * AddFilterMenu dropdown (equal z-index, same ~100ms exit animation,
 * `libs/nxus-ui/src/components/dropdown-menu.tsx`) is still intercepting
 * pointer events during its fade-out.
 */
async function waitForEditorPopup(page: Page, title: string): Promise<void> {
  await expect(page.getByText(title)).toBeVisible()
  await page.waitForTimeout(150)
}

/**
 * Open a Base UI Select combobox identified by its `data-testid`.
 *
 * Testids rather than text/name locators, for two hard-won reasons:
 *
 * 1. Base UI's Select trigger does not expose its placeholder text as the
 *    accessible name, so `getByRole('combobox', { name })` never matches.
 * 2. Text-based locators stop matching the moment the select acquires a
 *    value — including a value it acquired ACCIDENTALLY. Under CPU load,
 *    Base UI can treat a click's delayed mouseup as press-and-release-over-
 *    an-item (`alignItemWithTrigger` puts the option list under the cursor)
 *    and instantly select the first list entry — observed silently choosing
 *    "# Field" / "automationDefinition". With a testid the trigger stays
 *    addressable regardless, and the subsequent pickOption simply overrides
 *    any accidental selection.
 *
 * Waits for enabled first: the field/supertag editors render their trigger
 * `disabled` until the options query resolves, and a cold vite dev server can
 * take seconds to compile + answer the first server-fn call — interacting
 * with a disabled trigger silently does nothing.
 *
 * `waitFor` (not `isVisible`, which returns instantly) between attempts, so
 * retries don't toggle-storm the trigger.
 */
async function openCombobox(page: Page, testId: string): Promise<void> {
  const trigger = page.getByTestId(testId)
  await trigger.waitFor({ state: 'visible', timeout: 10_000 })
  await expect(trigger).toBeEnabled({ timeout: 30_000 })
  for (let attempt = 0; attempt < 3; attempt++) {
    await trigger.click({ timeout: 5_000 }).catch(() => {})
    const open = await page
      .getByRole('listbox')
      .waitFor({ state: 'visible', timeout: 3_000 })
      .then(() => true)
      .catch(() => false)
    if (open) return
  }
  // Final attempt — let this one throw with Playwright's own error if it still fails.
  await trigger.click()
  await expect(page.getByRole('listbox')).toBeVisible({ timeout: 5_000 })
}

/**
 * Wait until the dev server has finished bootstrapping the shared e2e DB.
 *
 * The supertag sidebar lists system supertags fetched through a server fn
 * that runs `nodeFacade.init()` (→ `initDatabaseWithBootstrap`) to completion
 * before answering, so "#Item" being visible proves the server's bootstrap
 * transaction is done. Without this gate, the test worker's own
 * `initDatabaseWithBootstrap` (in the seed helpers) races the server's
 * check-then-insert bootstrap of the same fresh DB file, and whichever
 * process loses throws `SQLITE_CONSTRAINT_UNIQUE` on `nodes.system_id` —
 * observed in both directions (worker's seed throwing, and the server's
 * `getSupertags` server fn 500ing, which then feeds the supertag picker a
 * failed/refetching list mid-interaction).
 */
async function waitForServerBootstrap(page: Page): Promise<void> {
  await expect(page.getByRole('button', { name: '#Item', exact: true })).toBeVisible({
    timeout: 30_000,
  })
}

/**
 * Click an option inside an open Base UI Select popup.
 *
 * The popup opens with a zoom/fade animation AND `alignItemWithTrigger`
 * auto-scrolls the list right after opening. Clicking an option immediately
 * races that motion: Playwright first reports "element is not stable", then a
 * retried click can land on whichever option has scrolled under the original
 * coordinates — observed selecting "# Field" when the target was the last
 * option in the list, which closes the popup and strands the test. Wait for
 * the option to attach, let the open animation + auto-scroll settle, scroll
 * the target into view ourselves, and only then click.
 */
async function pickOption(page: Page, name: string | RegExp): Promise<void> {
  const option = page.getByRole('option', { name })
  await option.waitFor({ state: 'visible', timeout: 10_000 })
  await page.waitForTimeout(250)
  await option.scrollIntoViewIfNeeded()
  await option.click()
}

test.describe('Workbench Query Builder — nested groups & path filters', () => {
  test.describe.configure({ mode: 'serial' })
  test.setTimeout(60_000)

  test('builds a nested (A AND (B OR C)) query and returns exactly the matching nodes', async ({
    page,
    navigateToApp,
  }) => {
    // Warm the workbench server BEFORE seeding: initDatabaseWithBootstrap only
    // auto-seeds demo data while the DB has zero non-system nodes
    // (learnings/e2e-autoseed-suppression.md) — seeding first would starve
    // every demo-dependent spec running in the same parallel Playwright run.
    await navigateToApp('workbench')
    await waitForServerBootstrap(page)

    const story = await seedNestedGroupStory()

    // Fresh navigation so the query builder's field/supertag pickers
    // (React Query, fetched on mount) see the newly-seeded nodes.
    await navigateToApp('workbench')
    await openQueryBuilderView(page)

    // --- Top-level filter: supertag = our seeded story supertag ---
    await page.getByRole('button', { name: 'Add filter' }).click()
    await page.getByRole('menuitem', { name: /^Supertag\b/ }).click()

    await page.getByRole('button', { name: 'Select supertag... Remove filter' }).click()
    await waitForEditorPopup(page, 'Supertag Filter')
    await openCombobox(page, 'supertag-filter-select')
    await pickOption(page, new RegExp(story.supertagSuffix, 'i'))
    await page.getByRole('button', { name: 'Done' }).first().click()

    // --- Top-level filter: OR group (nested) ---
    await page.getByRole('button', { name: 'Add filter' }).click()
    await page.getByRole('menuitem', { name: /^OR Group\b/ }).click()

    await page.getByRole('button', { name: 'OR (0 filters) Remove filter' }).click()
    await waitForEditorPopup(page, 'Logical Filter Group')

    // Nested filter 1: category = catB (reuses the same AddFilterMenu +
    // PropertyFilterEditor as the top level — this recursion is the fix).
    await page.getByRole('button', { name: 'Add nested filter' }).click()
    await page.getByRole('menuitem', { name: /^Property\b/ }).click()
    await page.getByRole('button', { name: 'Select property... Remove filter' }).click()
    await waitForEditorPopup(page, 'Property Filter')
    await openCombobox(page, 'property-filter-field-select')
    await pickOption(page, story.categoryLabel)
    await page.getByPlaceholder('Enter value...').fill('catB')
    await page.getByRole('button', { name: 'Done' }).first().click()

    // Nested filter 2: category = catC
    await page.getByRole('button', { name: 'Add nested filter' }).click()
    await page.getByRole('menuitem', { name: /^Property\b/ }).click()
    await page.getByRole('button', { name: 'Select property... Remove filter' }).click()
    await waitForEditorPopup(page, 'Property Filter')
    await openCombobox(page, 'property-filter-field-select')
    await pickOption(page, story.categoryLabel)
    await page.getByPlaceholder('Enter value...').fill('catC')
    await page.getByRole('button', { name: 'Done' }).first().click()

    // Close the OR group editor itself.
    await page.getByRole('button', { name: 'Done' }).first().click()

    // Query is now: supertag(story) AND (category = catB OR category = catC).
    await expect(page.getByText('2 results').first()).toBeVisible({ timeout: 10_000 })
    await expect(page.getByRole('button', { name: story.matchA, exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: story.matchB, exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: story.excluded, exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: story.untagged, exact: true })).toHaveCount(0)
  })

  test('authors a path filter (Owner.Color = "Red") and returns exactly the matching node', async ({
    page,
    navigateToApp,
  }) => {
    await navigateToApp('workbench')
    await waitForServerBootstrap(page)

    const story = await seedPathFilterStory()

    await navigateToApp('workbench')
    await openQueryBuilderView(page)

    // --- Scope to the seeded supertag first (avoids matching unrelated demo nodes) ---
    await page.getByRole('button', { name: 'Add filter' }).click()
    await page.getByRole('menuitem', { name: /^Supertag\b/ }).click()
    await page.getByRole('button', { name: 'Select supertag... Remove filter' }).click()
    await waitForEditorPopup(page, 'Supertag Filter')
    await openCombobox(page, 'supertag-filter-select')
    await pickOption(page, new RegExp(story.supertagSuffix, 'i'))
    await page.getByRole('button', { name: 'Done' }).first().click()

    // --- Author a path filter: Owner -> Color = "Red" ---
    await page.getByRole('button', { name: 'Add filter' }).click()
    await page.getByRole('menuitem', { name: /^Path\b/ }).click()
    await page.getByRole('button', { name: 'Select path... Remove filter' }).click()
    await waitForEditorPopup(page, 'Path Filter')

    // First hop: the reference field (Owner). Only reference-typed fields
    // (instance/node/nodes) are offered here.
    await openCombobox(page, 'path-filter-hop-0')
    await pickOption(page, story.ownerLabel)

    await page.getByRole('button', { name: 'Add hop' }).click()

    // Second (terminal) hop: the field to compare — Color.
    await openCombobox(page, 'path-filter-hop-1')
    await pickOption(page, story.colorLabel)

    // Switch the condition from the "isEmpty" default to "equals" and fill a
    // value. Anchored regex: a bare 'equals' would substring-match "not equals".
    await openCombobox(page, 'path-filter-op-select')
    await pickOption(page, /^equals$/)
    await page.getByPlaceholder('Enter value...').fill('Red')
    await page.getByRole('button', { name: 'Done' }).first().click()

    // Query is now: supertag(story) AND Owner.Color = "Red".
    await expect(page.getByText('1 result', { exact: true }).first()).toBeVisible({ timeout: 10_000 })
    await expect(page.getByRole('button', { name: story.matchNode, exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: story.noMatchNode, exact: true })).toHaveCount(0)

    // --- Round-trip: reopen the chip and confirm the chain/op/value survived ---
    // The chip/linter render path segments via formatFilterIdentifier
    // (filter-format.ts), which derives its label from the field's systemId
    // suffix — not its content/label (that's only used in the field picker
    // dropdown) — so the expected chip text is systemId-derived, not
    // story.ownerLabel/colorLabel.
    const ownerIdentifier = capitalizeLastSegment(story.ownerFieldSystemId)
    const colorIdentifier = capitalizeLastSegment(story.colorFieldSystemId)
    // No `exact`: the chip's accessible name ends with the embedded
    // "Remove filter" button's text (e.g. `Owner.Color = "Red" Remove filter`).
    await page
      .getByRole('button', { name: `${ownerIdentifier}.${colorIdentifier} = "Red"` })
      .click()
    await waitForEditorPopup(page, 'Path Filter')
    await expect(page.getByTestId('path-filter-hop-0')).toContainText(story.ownerLabel)
    await expect(page.getByTestId('path-filter-hop-1')).toContainText(story.colorLabel)
    await expect(page.getByTestId('path-filter-op-select')).toContainText('equals')
    await expect(page.getByPlaceholder('Enter value...')).toHaveValue('Red')
  })
})

/** Mirrors filter-format.ts's formatFilterIdentifier for systemId-shaped ids. */
function capitalizeLastSegment(systemId: string): string {
  const name = systemId.split(':').at(-1) ?? ''
  return name.charAt(0).toUpperCase() + name.slice(1)
}

// ============================================================================
// Seed helpers (mode-aware facade writes)
// ============================================================================

async function seedNestedGroupStory(): Promise<{
  supertagSuffix: string
  categoryLabel: string
  matchA: string
  matchB: string
  excluded: string
  untagged: string
}> {
  const { createNode, addNodeSupertag, setProperty, SYSTEM_SUPERTAGS, SYSTEM_FIELDS } =
    await openSeedBackend()

  const suffix = `qbnest${Date.now().toString(36)}`
  const categoryFieldSystemId = `field:${suffix}_category` as FieldSystemId
  const storySupertagSystemId = `supertag:${suffix}`

  const storyTag = await createNode({
    content: `QbStory_${suffix}`,
    systemId: storySupertagSystemId,
  })
  await addNodeSupertag(storyTag, SYSTEM_SUPERTAGS.SUPERTAG)

  const categoryLabel = `QB Category ${suffix}`
  const categoryField = await createNode({
    content: categoryLabel,
    systemId: categoryFieldSystemId,
  })
  await addNodeSupertag(categoryField, SYSTEM_SUPERTAGS.FIELD)
  await setProperty(categoryField, SYSTEM_FIELDS.FIELD_TYPE, 'text')

  // Declare the field on the supertag's schema (pure-declaration default).
  await setProperty(storyTag, categoryFieldSystemId, null)

  const matchA = `QB Nested Match A ${suffix}`
  const nodeA = await createNode({ content: matchA })
  await addNodeSupertag(nodeA, storySupertagSystemId)
  await setProperty(nodeA, categoryFieldSystemId, 'catB')

  const matchB = `QB Nested Match B ${suffix}`
  const nodeB = await createNode({ content: matchB })
  await addNodeSupertag(nodeB, storySupertagSystemId)
  await setProperty(nodeB, categoryFieldSystemId, 'catC')

  const excluded = `QB Nested Excluded ${suffix}`
  const nodeC = await createNode({ content: excluded })
  await addNodeSupertag(nodeC, storySupertagSystemId)
  await setProperty(nodeC, categoryFieldSystemId, 'other')

  // Control: right category value, but NOT tagged with the story supertag —
  // must be excluded by the top-level AND.
  const untagged = `QB Nested Untagged ${suffix}`
  const nodeD = await createNode({ content: untagged })
  await setProperty(nodeD, categoryFieldSystemId, 'catB')

  return { supertagSuffix: suffix, categoryLabel, matchA, matchB, excluded, untagged }
}

async function seedPathFilterStory(): Promise<{
  supertagSuffix: string
  ownerLabel: string
  colorLabel: string
  ownerFieldSystemId: FieldSystemId
  colorFieldSystemId: FieldSystemId
  matchNode: string
  noMatchNode: string
}> {
  const { createNode, addNodeSupertag, setProperty, SYSTEM_SUPERTAGS, SYSTEM_FIELDS } =
    await openSeedBackend()

  const suffix = `qbpath${Date.now().toString(36)}`
  const ownerFieldSystemId = `field:${suffix}_owner` as FieldSystemId
  const colorFieldSystemId = `field:${suffix}_color` as FieldSystemId
  const itemSupertagSystemId = `supertag:${suffix}`

  const itemTag = await createNode({
    content: `QbPathItem_${suffix}`,
    systemId: itemSupertagSystemId,
  })
  await addNodeSupertag(itemTag, SYSTEM_SUPERTAGS.SUPERTAG)

  const ownerLabel = `QB Owner ${suffix}`
  const ownerField = await createNode({ content: ownerLabel, systemId: ownerFieldSystemId })
  await addNodeSupertag(ownerField, SYSTEM_SUPERTAGS.FIELD)
  await setProperty(ownerField, SYSTEM_FIELDS.FIELD_TYPE, 'node')

  const colorLabel = `QB Color ${suffix}`
  const colorField = await createNode({ content: colorLabel, systemId: colorFieldSystemId })
  await addNodeSupertag(colorField, SYSTEM_SUPERTAGS.FIELD)
  await setProperty(colorField, SYSTEM_FIELDS.FIELD_TYPE, 'text')

  await setProperty(itemTag, ownerFieldSystemId, null)

  const hatRed = await createNode({ content: `QB Hat Red ${suffix}` })
  await setProperty(hatRed, colorFieldSystemId, 'Red')

  const hatBlue = await createNode({ content: `QB Hat Blue ${suffix}` })
  await setProperty(hatBlue, colorFieldSystemId, 'Blue')

  const matchNode = `QB Path Match ${suffix}`
  const itemMatch = await createNode({ content: matchNode })
  await addNodeSupertag(itemMatch, itemSupertagSystemId)
  await setProperty(itemMatch, ownerFieldSystemId, hatRed)

  const noMatchNode = `QB Path NoMatch ${suffix}`
  const itemNoMatch = await createNode({ content: noMatchNode })
  await addNodeSupertag(itemNoMatch, itemSupertagSystemId)
  await setProperty(itemNoMatch, ownerFieldSystemId, hatBlue)

  return {
    supertagSuffix: suffix,
    ownerLabel,
    colorLabel,
    ownerFieldSystemId,
    colorFieldSystemId,
    matchNode,
    noMatchNode,
  }
}
