import { test, expect } from '../fixtures/base.fixture.js'

test.describe('Recall Dashboard', () => {
  test.beforeEach(async ({ navigateToApp }) => {
    await navigateToApp('recall')
  })

  test('R1 — Dashboard loads with header, stats, and navigation', async ({
    page,
  }) => {
    // Verify header
    await expect(
      page.getByRole('heading', { name: 'nXus Recall', level: 1 }),
    ).toBeVisible()

    // Verify navigation links in header (use exact to avoid matching empty-state links)
    const header = page.locator('header')
    await expect(
      header.getByRole('link', { name: 'Explore', exact: true }),
    ).toBeVisible()
    await expect(
      header.getByRole('link', { name: 'Review' }),
    ).toBeVisible()

    // Verify stats cards are present (use uppercase labels which are unique)
    await expect(page.getByText('Topics', { exact: true })).toBeVisible()
    await expect(page.getByText('Concepts', { exact: true })).toBeVisible()
    await expect(page.getByText('Due Now')).toBeVisible()
    await expect(page.getByText('Reviewed Today')).toBeVisible()
  })

  test('R2 — Empty state shows explore CTA when no topics exist', async ({
    page,
  }) => {
    // Wait for data to load
    await page.waitForLoadState('networkidle')

    // Check for empty state or topics grid
    const emptyState = page.getByText('No topics yet')
    const topicsHeading = page.getByText('Topics', { exact: true })

    await expect(emptyState.or(topicsHeading)).toBeVisible({ timeout: 10000 })

    if (await emptyState.isVisible()) {
      // Verify the empty state has an explore link
      await expect(
        page.getByRole('link', { name: 'Explore Topics' }),
      ).toBeVisible()
    }
  })

  test('R3 — Navigate to Explore page from dashboard', async ({ page }) => {
    // Use header nav link to avoid strict mode violation with empty-state link
    await page.locator('header').getByRole('link', { name: 'Explore', exact: true }).click()
    await page.waitForURL('**/recall/explore')
    await expect(
      page.getByRole('heading', { name: 'Explore Topics' }),
    ).toBeVisible()
  })

  test('R4 — Navigate to Review session from dashboard', async ({ page }) => {
    await page.locator('header').getByRole('link', { name: 'Review' }).click()
    await page.waitForURL('**/recall/review/session')
    await expect(
      page.getByRole('heading', { name: 'Review Session' }),
    ).toBeVisible()
  })
})
