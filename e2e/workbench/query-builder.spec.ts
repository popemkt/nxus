import { test, expect } from '../fixtures/base.fixture.js'

test.describe('Workbench Query Builder', () => {
  test.beforeEach(async ({ navigateToApp }) => {
    await navigateToApp('workbench')
  })

  test('W7 — Switch to Query view shows query builder panel', async ({
    page,
  }) => {
    // Verify we start in Node Browser (list) view
    await expect(
      page.getByPlaceholder('Search all nodes...')
    ).toBeVisible()

    // Click the Query Builder button in the sidebar
    await page.getByRole('button', { name: 'Query Builder' }).click()

    // Verify the query builder panel becomes visible
    // Look for the "Add filter" button which is unique to the query builder view
    await expect(
      page.getByRole('button', { name: 'Add filter' })
    ).toBeVisible({ timeout: 5000 })

    // Verify the empty state prompt text
    await expect(
      page.getByText('Add filters to search')
    ).toBeVisible()

    // Verify list view search input is no longer visible
    await expect(
      page.getByPlaceholder('Search all nodes...')
    ).toBeHidden()

    // Inspector should still be visible with fallback text
    await expect(
      page.getByText('Select a node to inspect')
    ).toBeVisible()
  })
})
