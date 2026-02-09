import { test, expect } from '../fixtures/base.fixture.js'

test.describe('Core Inbox Page', () => {
  test('C6 — Navigate to Inbox page', async ({ page }) => {
    await page.goto('/core')
    await page.waitForLoadState('domcontentloaded')

    // Click the Inbox link in the HUD (it's a link, not a button)
    await page.getByRole('link', { name: /Inbox|^\d/ }).click()
    await page.waitForURL('**/core/inbox')
    await page.waitForLoadState('domcontentloaded')

    // Verify Inbox heading
    await expect(
      page.getByRole('heading', { name: 'Inbox', level: 1 })
    ).toBeVisible()

    // Verify "Add Item" button
    await expect(page.getByText('Add Item')).toBeVisible()
  })

  test('C7 — Add inbox item via modal', async ({ page }) => {
    await page.goto('/core/inbox')
    await page.waitForLoadState('domcontentloaded')

    // Wait for page to load
    await expect(
      page.getByRole('heading', { name: 'Inbox', level: 1 })
    ).toBeVisible()

    // Click "Add Item" button
    await page.getByText('Add Item').click()

    // Verify modal opens with correct heading
    await expect(
      page.getByRole('heading', { name: 'Add to Inbox' })
    ).toBeVisible()

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
    await page.goto('/core/inbox')
    await page.waitForLoadState('domcontentloaded')

    // Wait for items to load — there should be existing pending items
    await expect(
      page.getByRole('heading', { name: 'Inbox', level: 1 })
    ).toBeVisible()

    // Wait for at least one item card to appear
    const editButtons = page.locator('[title="Edit item"]')
    await expect(editButtons.first()).toBeVisible({ timeout: 10000 })

    // Get the title of the first pending item before editing
    const firstItemCard = editButtons.first().locator('ancestor::div[class*="flex items-start"]').first()

    // Click the edit button on the first item
    await editButtons.first().click()

    // Verify the edit modal opens
    await expect(
      page.getByRole('heading', { name: 'Edit Inbox Item' })
    ).toBeVisible()

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
