import { test, expect } from '../fixtures/base.fixture.js'

test.describe('Workbench Graph View', () => {
  test.beforeEach(async ({ navigateToApp }) => {
    await navigateToApp('workbench')
  })

  test('W6 — Switch to Graph view renders graph canvas', async ({
    page,
  }) => {
    // Verify we start in Node Browser (list) view
    await expect(
      page.getByPlaceholder('Search all nodes...')
    ).toBeVisible()

    // Click the Graph View button in the sidebar
    await page.getByRole('button', { name: 'Graph View' }).click()

    // Wait for graph to render — look for ReactFlow container or canvas
    const reactFlowContainer = page.locator('.react-flow')
    const canvasElement = page.locator('canvas').first()
    const emptyGraph = page.getByText('No nodes to display')
    const loadingGraph = page.getByText('Loading graph data...')

    // Wait for loading to finish if it appears
    if (await loadingGraph.isVisible({ timeout: 1000 }).catch(() => false)) {
      await expect(loadingGraph).toBeHidden({ timeout: 15000 })
    }

    // Either graph canvas renders or empty state shows
    await expect(
      reactFlowContainer.or(canvasElement).or(emptyGraph)
    ).toBeVisible({ timeout: 15000 })

    // Verify the search input from list view is no longer visible
    // (supertag sidebar hides in graph view)
    await expect(
      page.getByPlaceholder('Search all nodes...')
    ).toBeHidden()
  })
})
