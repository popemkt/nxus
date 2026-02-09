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

  test('W9 — Graph view inspector overlay opens on node click and closes', async ({
    page,
  }) => {
    // Switch to graph view
    await page.getByRole('button', { name: 'Graph View' }).click()

    // Wait for graph to render
    const reactFlowContainer = page.locator('.react-flow')
    const canvasElement = page.locator('canvas').first()
    const emptyGraph = page.getByText('No nodes to display')
    const loadingGraph = page.getByText('Loading graph data...')

    if (await loadingGraph.isVisible({ timeout: 1000 }).catch(() => false)) {
      await expect(loadingGraph).toBeHidden({ timeout: 15000 })
    }

    await expect(
      reactFlowContainer.or(canvasElement).or(emptyGraph)
    ).toBeVisible({ timeout: 15000 })

    // If there are no nodes, skip the test
    if (await emptyGraph.isVisible().catch(() => false)) {
      test.skip(true, 'No nodes in graph to click')
      return
    }

    // Inspector should not be visible initially in graph view
    const inspector = page.getByTestId('node-inspector-panel')
    await expect(inspector).toBeHidden()

    // Click a graph node — ReactFlow nodes have the class .react-flow__node
    const graphNode = page.locator('.react-flow__node').first()
    if (!(await graphNode.isVisible({ timeout: 5000 }).catch(() => false))) {
      test.skip(true, 'No visible graph nodes to click')
      return
    }
    await graphNode.click()

    // Inspector overlay should now be visible
    await expect(inspector).toBeVisible({ timeout: 5000 })

    // Close the inspector via the close button
    const closeButton = inspector.locator('..').getByRole('button', { name: 'Close inspector' })
    await closeButton.click()

    // Inspector should be hidden again
    await expect(inspector).toBeHidden({ timeout: 3000 })
  })

  test('W10 — Graph canvas remains full-width when inspector overlay opens', async ({
    page,
  }) => {
    // Switch to graph view
    await page.getByRole('button', { name: 'Graph View' }).click()

    // Wait for graph to render
    const reactFlowContainer = page.locator('.react-flow')
    const canvasElement = page.locator('canvas').first()
    const emptyGraph = page.getByText('No nodes to display')
    const loadingGraph = page.getByText('Loading graph data...')

    if (await loadingGraph.isVisible({ timeout: 1000 }).catch(() => false)) {
      await expect(loadingGraph).toBeHidden({ timeout: 15000 })
    }

    await expect(
      reactFlowContainer.or(canvasElement).or(emptyGraph)
    ).toBeVisible({ timeout: 15000 })

    if (await emptyGraph.isVisible().catch(() => false)) {
      test.skip(true, 'No nodes in graph')
      return
    }

    // Measure graph container width before clicking a node
    const graphContainer = reactFlowContainer.or(canvasElement)
    const widthBefore = await graphContainer.evaluate(
      (el) => el.getBoundingClientRect().width
    )

    // Click a graph node to open the overlay inspector
    const graphNode = page.locator('.react-flow__node').first()
    if (!(await graphNode.isVisible({ timeout: 5000 }).catch(() => false))) {
      test.skip(true, 'No visible graph nodes to click')
      return
    }
    await graphNode.click()

    // Wait for the inspector to appear
    const inspector = page.getByTestId('node-inspector-panel')
    await expect(inspector).toBeVisible({ timeout: 5000 })

    // Measure graph container width after — should remain the same (overlay, not resize)
    const widthAfter = await graphContainer.evaluate(
      (el) => el.getBoundingClientRect().width
    )

    expect(widthAfter).toBe(widthBefore)
  })
})
