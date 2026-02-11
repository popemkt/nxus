import { test, expect } from '../fixtures/base.fixture.js'

test.describe('Workbench Node Browser', () => {
  test.beforeEach(async ({ navigateToApp }) => {
    await navigateToApp('workbench')
  })

  test('W1 — Page loads with sidebar, node browser, and inspector', async ({
    page,
  }) => {
    // Verify sidebar navigation buttons are visible
    await expect(
      page.getByRole('button', { name: 'Node Browser' })
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Graph View' })
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Query Builder' })
    ).toBeVisible()

    // Verify node browser search input is visible
    await expect(
      page.getByPlaceholder('Search all nodes...')
    ).toBeVisible()

    // Verify inspector panel shows fallback text (no node selected)
    await expect(
      page.getByText('Select a node to inspect')
    ).toBeVisible()
  })

  test('W2 — Node list renders grouped by supertag', async ({ page }) => {
    // Wait for nodes to load — either node count in stats bar or empty state
    const emptyState = page.getByText('No nodes found')
    const nodeCount = page.getByText(/\d+ nodes/)

    // Wait for either nodes loaded or empty state
    await expect(nodeCount.or(emptyState)).toBeVisible({ timeout: 15000 })

    if (await emptyState.isVisible()) {
      // Empty state is valid — no nodes in DB
      return
    }

    // Verify at least one group header is visible
    // Group headers are buttons with supertag name(s) and count in parentheses
    // Format: "SupertagName (count)" e.g. "Field, System (51)"
    const groupHeader = page.locator('button').filter({ hasText: /\(\d+\)/ }).first()
    await expect(groupHeader).toBeVisible()

    // Verify node count is shown in stats bar
    await expect(nodeCount).toBeVisible()
  })

  test('W3 — Search filters nodes in real time', async ({ page }) => {
    // This test involves multiple server round-trips which can be slow in CI
    test.setTimeout(60_000)

    const searchInput = page.getByPlaceholder('Search all nodes...')

    // Wait for nodes to load
    const emptyState = page.getByText('No nodes found')
    const nodeCount = page.getByText(/\d+ nodes/)
    const loadingIndicator = page.getByText('Loading nodes...')

    // Wait for initial load to complete
    await expect(nodeCount.or(emptyState)).toBeVisible({ timeout: 15000 })

    if (await emptyState.isVisible()) {
      test.skip(true, 'No nodes available for search test')
      return
    }

    // Capture that we have nodes initially
    const initialCountText = await nodeCount.textContent()

    // Type a nonsense query to get no results
    await searchInput.fill('zzznonexistentnode999')

    // Verify search indicator appears (confirms React state updated)
    await expect(
      page.getByText(/Searching: "zzznonexistentnode999"/)
    ).toBeVisible({ timeout: 10_000 })

    // Wait for loading to finish, then verify empty state
    await expect(loadingIndicator).toBeHidden({ timeout: 20_000 })
    await expect(page.getByText('No nodes found')).toBeVisible({
      timeout: 5_000,
    })

    // Clear search → all nodes return
    await searchInput.clear()

    // Search indicator should be gone and nodes should be back
    await expect(page.getByText(/Searching:/)).toBeHidden({ timeout: 10_000 })
    await expect(nodeCount).toBeVisible({ timeout: 10_000 })

    // Verify we got back to the original count
    await expect(nodeCount).toHaveText(initialCountText!, { timeout: 5_000 })
  })

  test('W5 — Supertag filter narrows node list', async ({ page }) => {
    // Wait for nodes to load
    const emptyState = page.getByText('No nodes found')
    const nodeCount = page.getByText(/\d+ nodes/)

    await expect(nodeCount.or(emptyState)).toBeVisible({ timeout: 15000 })

    if (await emptyState.isVisible()) {
      test.skip(true, 'No nodes available for supertag filter test')
      return
    }

    // Verify "All Nodes" is the default selection in supertag sidebar
    const allNodesBtn = page.getByRole('button', { name: 'All Nodes' })
    await expect(allNodesBtn).toBeVisible()

    // Wait for supertag buttons to load in the sidebar (loaded async, separate from nodes)
    const sidebarContainer = allNodesBtn.locator('xpath=..')
    const secondButton = sidebarContainer.locator('button').nth(1)
    const noSupertagsText = page.getByText('No supertags found')

    // Wait for either a supertag button or "No supertags" to appear
    await expect(secondButton.or(noSupertagsText)).toBeVisible({
      timeout: 10000,
    })

    if (await noSupertagsText.isVisible().catch(() => false)) {
      test.skip(true, 'No supertags in database')
      return
    }

    // Capture initial node count AFTER supertags have loaded (ensures nodes are loaded too)
    const initialCountText = await nodeCount.textContent()

    // Get all buttons in the sidebar container
    const siblingButtons = sidebarContainer.locator('button')
    const siblingCount = await siblingButtons.count()

    // Click the second button (first supertag after "All Nodes")
    if (siblingCount < 2) {
      test.skip(true, 'No supertags available for filter test')
      return
    }

    await siblingButtons.nth(1).click()
    await page.waitForTimeout(500)

    // Verify node count changed (filtered list should have fewer nodes)
    const filteredCountText = await nodeCount.textContent()
    expect(filteredCountText).not.toBe(initialCountText)

    // Click "All Nodes" to clear the filter
    await allNodesBtn.click()
    await page.waitForTimeout(500)

    // Verify count is restored to initial
    const restoredCountText = await nodeCount.textContent()
    expect(restoredCountText).toBe(initialCountText)
  })
})
