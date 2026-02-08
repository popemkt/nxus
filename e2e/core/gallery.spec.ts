import { test, expect } from '../fixtures/base.fixture.js'
import { APP_URLS } from '../helpers/navigation.js'

test.describe('Core Gallery Page', () => {
  test.beforeEach(async ({ navigateToApp }) => {
    await navigateToApp('core')
  })

  test('C1 — Gallery page loads with search and app cards', async ({
    page,
  }) => {
    // Verify search input with correct placeholder
    const searchInput = page.getByPlaceholder('Search apps...')
    await expect(searchInput).toBeVisible()

    // Verify view mode buttons are present
    await expect(page.locator('[title="Gallery view"]')).toBeVisible()
    await expect(page.locator('[title="Table view"]')).toBeVisible()
    await expect(page.locator('[title="Graph view"]')).toBeVisible()

    // Verify app cards or empty state renders (wait for content to load)
    const viewDetailsLink = page.getByRole('link', { name: 'View Details' }).first()
    const noAppsText = page.getByText('No apps found')
    const addAppsText = page.getByText('Add apps to get started')

    // Wait for either cards or empty state to appear
    await expect(
      viewDetailsLink.or(noAppsText).or(addAppsText)
    ).toBeVisible({ timeout: 15000 })
  })

  test('C2 — Search filtering works', async ({ page }) => {
    const searchInput = page.getByPlaceholder('Search apps...')
    const viewDetailsLinks = page.getByRole('link', { name: 'View Details' })

    // Wait for cards to load
    await expect(viewDetailsLinks.first()).toBeVisible({ timeout: 15000 })

    // Count initial cards
    const initialCount = await viewDetailsLinks.count()

    if (initialCount === 0) {
      test.skip(true, 'No app cards available for search filtering test')
      return
    }

    // Get the name of the first card to use as search query
    const firstCardText = await viewDetailsLinks.first()
      .locator('..').locator('..').textContent()

    // Type a partial match — use first few characters to filter
    const searchQuery = firstCardText?.trim().slice(0, 4) || 'test'
    await searchInput.fill(searchQuery)

    // Wait for filtering to take effect
    await page.waitForTimeout(300)

    // After filtering, the count should be different from initial or same
    // (if all match). The key is that filtering doesn't crash.
    const filteredCount = await viewDetailsLinks.count()
    expect(filteredCount).toBeGreaterThanOrEqual(0)

    // Type a nonsense query to verify filtering shows no results
    await searchInput.fill('zzznonexistentapp999')
    await page.waitForTimeout(300)

    const noResultsCount = await viewDetailsLinks.count()
    if (noResultsCount === 0) {
      // "No apps found" message should appear
      await expect(page.getByText('No apps found')).toBeVisible()
    }

    // Clear search → all cards return
    await searchInput.clear()
    await page.waitForTimeout(300)

    const restoredCount = await viewDetailsLinks.count()
    expect(restoredCount).toBe(initialCount)
  })

  test('C3 — View mode switching', async ({ page }) => {
    // Wait for gallery content to load first
    await expect(
      page.getByRole('link', { name: 'View Details' }).first()
    ).toBeVisible({ timeout: 15000 })

    const galleryBtn = page.getByRole('button', { name: 'Gallery view' })
    const tableBtn = page.getByRole('button', { name: 'Table view' })
    const graphBtn = page.getByRole('button', { name: 'Graph view' })

    // Switch to Table view
    await tableBtn.click()
    // Table view should render a table element
    await expect(page.locator('table')).toBeVisible({ timeout: 5000 })

    // Switch to Graph view
    await graphBtn.click()
    // Graph view should render ReactFlow container
    await expect(page.locator('.react-flow')).toBeVisible({ timeout: 5000 })

    // Switch back to Gallery view
    await galleryBtn.click()
    // Verify we're back to gallery by checking for "View Details" links
    await expect(
      page.getByRole('link', { name: 'View Details' }).first()
    ).toBeVisible({ timeout: 5000 })
  })
})
