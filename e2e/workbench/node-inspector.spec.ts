import { test, expect } from '../fixtures/base.fixture.js'

test.describe('Workbench Node Inspector', () => {
  test.beforeEach(async ({ navigateToApp }) => {
    await navigateToApp('workbench')
  })

  test('W4 — Select node shows details in inspector', async ({ page }) => {
    // Wait for nodes to load
    const emptyState = page.getByText('No nodes found')
    const nodeCount = page.getByText(/\d+ nodes/)

    await expect(nodeCount.or(emptyState)).toBeVisible({ timeout: 15000 })

    if (await emptyState.isVisible()) {
      test.skip(true, 'No nodes available for node selection test')
      return
    }

    // Verify inspector shows fallback text initially
    await expect(
      page.getByText('Select a node to inspect')
    ).toBeVisible()

    // First group auto-expands — find and click the first NodeBadge item directly
    // NodeBadge buttons are inside ".ml-5" containers under group sections
    const nodeItems = page.locator('.ml-5 button').first()
    await expect(nodeItems).toBeVisible({ timeout: 5000 })
    await nodeItems.click()

    // Verify inspector now shows node details instead of fallback
    await expect(
      page.getByText('Select a node to inspect')
    ).toBeHidden({ timeout: 5000 })

    // Inspector panel is the right side panel with w-[480px]
    const inspector = page.locator('.w-\\[480px\\]')

    // Verify inspector has section headers (Properties, Supertags, etc.)
    await expect(
      inspector.getByRole('button', { name: /Properties/ })
    ).toBeVisible({ timeout: 5000 })
    await expect(
      inspector.getByRole('button', { name: /Supertags/ })
    ).toBeVisible()
  })

  test('W8 — Inline node title edit', async ({ page }) => {
    // Wait for nodes to load
    const emptyState = page.getByText('No nodes found')
    const nodeCount = page.getByText(/\d+ nodes/)

    await expect(nodeCount.or(emptyState)).toBeVisible({ timeout: 15000 })

    if (await emptyState.isVisible()) {
      test.skip(true, 'No nodes available for inline edit test')
      return
    }

    // Inspector panel is the right side panel with w-[480px]
    const inspector = page.locator('.w-\\[480px\\]')

    // System nodes can't be edited. We need to find a non-system node.
    // First, wait for supertags to load in the sidebar, then filter to a
    // non-system supertag (e.g., "Item", "Tool", "Repo") which should have editable nodes.
    const allNodesBtn = page.getByRole('button', { name: 'All Nodes' })
    await expect(allNodesBtn).toBeVisible()
    const sidebarContainer = allNodesBtn.locator('xpath=..')
    const secondSidebarBtn = sidebarContainer.locator('button').nth(1)

    // Wait for at least one supertag button to appear
    if (
      !(await secondSidebarBtn
        .isVisible({ timeout: 5000 })
        .catch(() => false))
    ) {
      test.skip(true, 'No supertags loaded for inline edit test')
      return
    }

    const allSupertagBtns = sidebarContainer.locator('button')
    const btnCount = await allSupertagBtns.count()

    // System-related supertags whose nodes all have systemId (thus not editable)
    const systemSupertags = new Set(['All Nodes', 'Field', 'System', 'Supertag', ''])
    let foundEditable = false

    // Try each non-system supertag until we find an editable node
    for (let i = 0; i < btnCount; i++) {
      const btnText = (await allSupertagBtns.nth(i).textContent())?.trim() || ''
      if (systemSupertags.has(btnText)) continue

      // Click this supertag to filter
      await allSupertagBtns.nth(i).click()
      await page.waitForTimeout(500)

      // Check if any nodes appeared
      const nodeItem = page.locator('.ml-5 button').first()
      if (!(await nodeItem.isVisible({ timeout: 2000 }).catch(() => false))) {
        continue
      }

      // Click the first node
      await nodeItem.click()
      await page.waitForTimeout(300)

      // Check if inspector loaded and the node title is an h2
      const titleHeading = inspector.locator('h2').first()
      if (!(await titleHeading.isVisible({ timeout: 2000 }).catch(() => false))) {
        continue
      }

      // Try to double-click to edit — non-system nodes will show an input
      await titleHeading.dblclick()
      const editInput = inspector.locator('input[type="text"]')
      if (await editInput.isVisible({ timeout: 1500 }).catch(() => false)) {
        // Cancel the current edit by pressing Escape
        await editInput.press('Escape')
        foundEditable = true
        break
      }
    }

    if (!foundEditable) {
      test.skip(true, 'No editable (non-system) nodes found')
      return
    }

    // Now we have an editable node selected. Perform the edit test.
    const titleHeading = inspector.locator('h2').first()
    await expect(titleHeading).toBeVisible()
    const originalTitle = await titleHeading.textContent()

    // Double-click to enter edit mode
    await titleHeading.dblclick()

    // An input should appear for editing — scoped to inspector panel
    const editInput = inspector.locator('input[type="text"]')
    await expect(editInput).toBeVisible({ timeout: 3000 })

    // Type a new title
    const newTitle = `E2E Edited ${Date.now()}`
    await editInput.fill(newTitle)
    await editInput.press('Enter')

    // Verify the title was updated in the inspector
    await expect(
      inspector.locator('h2').filter({ hasText: newTitle })
    ).toBeVisible({ timeout: 5000 })

    // Restore the original title
    await inspector.locator('h2').filter({ hasText: newTitle }).dblclick()
    const restoreInput = inspector.locator('input[type="text"]')
    await expect(restoreInput).toBeVisible({ timeout: 3000 })
    await restoreInput.fill(originalTitle?.trim() || 'Restored Node')
    await restoreInput.press('Enter')

    // Verify restored
    await expect(
      inspector
        .locator('h2')
        .filter({ hasText: originalTitle?.trim() || 'Restored Node' })
    ).toBeVisible({ timeout: 5000 })
  })
})
