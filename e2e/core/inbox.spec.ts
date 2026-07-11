import { test, expect } from '../fixtures/base.fixture.js'

const isGraphMode = process.env.ARCHITECTURE_TYPE === 'graph'

test.describe('Core Inbox Page', () => {
  test('C6 — Navigate to Inbox page', async ({ page }) => {
    await page.goto('/core')

    // Click the Inbox link in the HUD (it's a link, not a button)
    await page.getByRole('link', { name: /Inbox|^\d/ }).click()
    await page.waitForURL('**/core/inbox')

    // Verify Inbox heading
    await expect(
      page.getByRole('heading', { name: 'Inbox', level: 1 })
    ).toBeVisible({ timeout: 20_000 })

    // Verify "Add Item" button
    await expect(page.getByText('Add Item')).toBeVisible()
  })

  test('C7 — Add inbox item via modal', async ({ page }) => {
    test.skip(isGraphMode, 'Inbox item mutation depends on reactive inbox queries that are not yet stable in graph mode')

    await page.goto('/core/inbox')

    // Wait for page to load
    await expect(
      page.getByRole('heading', { name: 'Inbox', level: 1 })
    ).toBeVisible({ timeout: 20_000 })

    // Wait for all items to fully load before interacting
    const pendingHeading = page.getByRole('heading', { level: 2 }).filter({ hasText: /Pending/ })
    await expect(pendingHeading).toBeVisible({ timeout: 10000 })

    // Wait for full client-side hydration to complete — the TanStack Devtools
    // button is only interactive after React hydration finishes
    await expect(page.getByRole('button', { name: 'Open TanStack Devtools' })).toBeVisible({ timeout: 5000 })

    // Click "+ Add Item" button in the page header
    const addItemBtn = page.getByRole('button', { name: /Add Item/ })
    await expect(addItemBtn).toBeEnabled({ timeout: 10_000 })
    await addItemBtn.click()

    // Verify modal opens — retry click if zustand store wasn't connected yet
    const modalHeading = page.getByRole('heading', { name: 'Add to Inbox' })
    for (let attempt = 0; attempt < 3; attempt++) {
      if (await modalHeading.isVisible({ timeout: 2000 }).catch(() => false)) break
      await addItemBtn.click()
    }
    await expect(modalHeading).toBeVisible({ timeout: 5000 })

    // Verify modal description
    await expect(
      page.getByText('Quick note for a tool to add later')
    ).toBeVisible()

    // Verify form fields are present
    await expect(page.locator('#inbox-title')).toBeVisible()
    await expect(page.locator('#inbox-notes')).toBeVisible()

    // Verify submit button is disabled when title is empty
    const submitBtn = page.getByRole('button', { name: 'Add to Inbox' })
    await expect(submitBtn).toBeDisabled()

    // Fill in the title
    const testTitle = `E2E Test Item ${Date.now()}`
    await page.locator('#inbox-title').fill(testTitle)

    // Verify submit button is now enabled
    await expect(submitBtn).toBeEnabled()

    // Fill notes
    await page.locator('#inbox-notes').fill('Created by E2E test')

    // Submit the form
    await submitBtn.click()

    // Wait for modal to close (confirms server function was called and modal dismissed)
    await expect(
      page.getByRole('heading', { name: 'Add to Inbox' })
    ).toBeHidden({ timeout: 5000 })

    // Verify we're back on the Inbox page
    await expect(
      page.getByRole('heading', { name: 'Inbox', level: 1 })
    ).toBeVisible()
  })

  test('C8 — Edit and delete inbox item', async ({ page }) => {
    test.skip(isGraphMode, 'Inbox item properties not yet queryable in graph mode')

    await page.goto('/core/inbox')
    await page.waitForLoadState('networkidle')

    await expect(
      page.getByRole('heading', { name: 'Inbox', level: 1 })
    ).toBeVisible()

    // Wait for all items to fully load
    const pendingHeading = page.getByRole('heading', { level: 2 }).filter({ hasText: /Pending/ })
    await expect(pendingHeading).toBeVisible({ timeout: 10000 })

    // Wait for full client-side hydration
    await expect(page.getByRole('button', { name: 'Open TanStack Devtools' })).toBeVisible({ timeout: 5000 })

    // Seed our own pending item via the Add Item modal — the demo seed creates
    // no inbox items, and tests run fully parallel, so C8 must not depend on
    // leftovers from other specs (this was an order-dependent flake).
    const addItemBtn = page.getByRole('button', { name: /Add Item/ })
    const addModalHeading = page.getByRole('heading', { name: 'Add to Inbox' })
    await addItemBtn.click()
    for (let attempt = 0; attempt < 3; attempt++) {
      if (await addModalHeading.isVisible({ timeout: 2000 }).catch(() => false)) break
      await addItemBtn.click()
    }
    await expect(addModalHeading).toBeVisible({ timeout: 5000 })
    const c8Title = `C8 Edit-Delete Item ${Date.now()}`
    await page.locator('#inbox-title').fill(c8Title)
    await page.getByRole('button', { name: 'Add to Inbox' }).click()
    await expect(addModalHeading).toBeHidden({ timeout: 5000 })

    // Wait for our item to render — at least one editable pending item is now
    // guaranteed regardless of what other specs did to the shared DB
    await expect(page.getByText(c8Title)).toBeVisible({ timeout: 10000 })
    const editButtons = page.getByRole('button', { name: 'Edit item' })
    await expect(editButtons.first()).toBeVisible({ timeout: 10000 })

    // Wait for any pending refetch to settle
    await page.waitForLoadState('networkidle')

    // Click the edit button — retry if modal didn't appear (hydration race)
    const editModalHeading = page.getByRole('heading', { name: 'Edit Inbox Item' })
    await editButtons.first().click()
    for (let attempt = 0; attempt < 3; attempt++) {
      if (await editModalHeading.isVisible({ timeout: 2000 }).catch(() => false)) break
      await editButtons.first().click()
    }
    await expect(editModalHeading).toBeVisible({ timeout: 5000 })

    // Verify edit form fields are present
    await expect(page.locator('#edit-title')).toBeVisible()
    await expect(page.locator('#edit-notes')).toBeVisible()
    await expect(page.locator('#edit-status')).toBeVisible()

    // Verify "Delete this item" button is visible
    await expect(page.getByText('Delete this item')).toBeVisible()

    // Click "Delete this item"
    await page.getByText('Delete this item').click()

    // Verify confirmation appears with "Are you sure?"
    await expect(page.getByText('Are you sure?')).toBeVisible()

    // Verify "Delete" confirmation button appears
    const deleteBtn = page.getByRole('button', { name: 'Delete', exact: true })
    await expect(deleteBtn).toBeVisible()

    // Confirm deletion
    await deleteBtn.click()

    // Wait for the edit modal to close after deletion
    await expect(
      page.getByRole('heading', { name: 'Edit Inbox Item' })
    ).toBeHidden({ timeout: 5000 })

    // Verify we're back on the Inbox page
    await expect(
      page.getByRole('heading', { name: 'Inbox', level: 1 })
    ).toBeVisible()
  })
})
