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

  test('W9 — Graph view takes full width with no inspector initially', async ({
    page,
  }) => {
    // Switch to graph view
    await page.getByRole('button', { name: 'Graph View' }).click()

    // Wait for graph to render
    const reactFlowContainer = page.locator('.react-flow')
    const emptyGraph = page.getByText('No nodes to display')
    const loadingGraph = page.getByText('Loading graph data...')

    if (await loadingGraph.isVisible({ timeout: 1000 }).catch(() => false)) {
      await expect(loadingGraph).toBeHidden({ timeout: 15000 })
    }
    await expect(reactFlowContainer.or(emptyGraph)).toBeVisible({ timeout: 15000 })

    if (await emptyGraph.isVisible().catch(() => false)) {
      test.skip(true, 'No nodes in graph')
      return
    }

    // The inspector panel should NOT be visible in graph view without a selection
    const inspector = page.getByTestId('node-inspector-panel')
    await expect(inspector).toBeHidden()

    // The graph (ReactFlow) container should take the full available width
    // (no inspector panel eating into the space)
    const viewportWidth = page.viewportSize()?.width ?? 1280
    const rfBox = await reactFlowContainer.boundingBox()
    expect(rfBox).toBeTruthy()

    // The ReactFlow container should span most of the viewport
    // (minus the sidebar ~60px)
    expect(rfBox!.width).toBeGreaterThan(viewportWidth * 0.8)
  })
})
