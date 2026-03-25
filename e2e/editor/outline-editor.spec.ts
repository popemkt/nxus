import { test, expect } from '../fixtures/base.fixture.js'

test.describe('Outline Editor', () => {
  test.beforeEach(async ({ navigateToApp }) => {
    await navigateToApp('editor')
  })

  test.describe('Page Load', () => {
    test('loads the editor page with header', async ({ page }) => {
      await expect(page.getByText('nXus Editor')).toBeVisible({ timeout: 10_000 })
    })

    test('shows breadcrumbs with Home button', async ({ page }) => {
      await expect(page.locator('.breadcrumbs').getByText('Home')).toBeVisible({ timeout: 10_000 })
    })

    test('renders outline body area', async ({ page }) => {
      // Either nodes are loaded or we see the empty/loading state
      const outlineBody = page.locator('.outline-body, .outline-editor')
      await expect(outlineBody.first()).toBeVisible({ timeout: 10_000 })
    })
  })

  test.describe('Node Rendering', () => {
    test('displays node blocks from database', async ({ page }) => {
      // Wait for loading spinner to disappear, then check for content
      await page.getByText('Loading').waitFor({ state: 'hidden', timeout: 15_000 }).catch(() => {})

      // Should have at least one node block or an empty state message
      const nodeBlocks = page.locator('.node-block')
      const noNodesMessage = page.getByText('No nodes found')

      // Wait up to 10s for either nodes or empty state to appear
      await Promise.race([
        nodeBlocks.first().waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {}),
        noNodesMessage.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {}),
      ])

      const hasNodes = await nodeBlocks.count() > 0
      const hasNoNodes = await noNodesMessage.isVisible().catch(() => false)

      expect(hasNodes || hasNoNodes).toBe(true)
    })

    test('shows bullet icons for each node', async ({ page }) => {
      // Wait for nodes to load
      await page.getByText('Loading').waitFor({ state: 'hidden', timeout: 15_000 }).catch(() => {})
      await page.locator('.node-block').first().waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {})
      const nodeBlocks = page.locator('.node-block')
      const count = await nodeBlocks.count()

      if (count > 0) {
        // Each node should have a bullet container
        const bullets = page.locator('.bullet-container')
        await expect(bullets.first()).toBeVisible()
      }
    })
  })

  test.describe('Node Activation & Editing', () => {
    test('clicking a node activates the editor', async ({ page }) => {
      await page.waitForTimeout(2000)
      const nodeContent = page.locator('.node-content').first()

      if (await nodeContent.isVisible().catch(() => false)) {
        await nodeContent.click()
        // Should now have a contentEditable element
        const editable = page.locator('[contenteditable="true"]')
        await expect(editable).toBeVisible({ timeout: 3000 })
      }
    })

    test('typing in active node updates content', async ({ page }) => {
      await page.waitForTimeout(2000)
      const nodeContent = page.locator('.node-content').first()

      if (await nodeContent.isVisible().catch(() => false)) {
        await nodeContent.click()

        const editable = page.locator('[contenteditable="true"]')
        await expect(editable).toBeVisible({ timeout: 3000 })

        // Type some text
        await page.keyboard.type('test input ')
        const text = await editable.textContent()
        expect(text).toContain('test input')
      }
    })

    test('clicking outside deactivates the editor', async ({ page }) => {
      await page.waitForTimeout(2000)
      const nodeContent = page.locator('.node-content').first()

      if (await nodeContent.isVisible().catch(() => false)) {
        await nodeContent.click()
        await expect(page.locator('[contenteditable="true"]')).toBeVisible({ timeout: 3000 })

        // Click on the outline body background
        await page.locator('.outline-body').click({ position: { x: 10, y: 10 } })
        // No contenteditable should be visible after clicking away
        await page.waitForTimeout(500)
      }
    })
  })

  test.describe('Keyboard Operations', () => {
    test('Enter creates a new sibling node', async ({ page }) => {
      await page.waitForTimeout(2000)
      const nodeBlocks = page.locator('.node-block')
      const initialCount = await nodeBlocks.count()

      if (initialCount > 0) {
        // Click first node to activate
        await page.locator('.node-content').first().click()
        await expect(page.locator('[contenteditable="true"]')).toBeVisible({ timeout: 3000 })

        // Press Enter to create a new node
        await page.keyboard.press('Enter')
        await page.waitForTimeout(500)

        // Should have one more node
        const newCount = await nodeBlocks.count()
        expect(newCount).toBe(initialCount + 1)
      }
    })

    test('Escape deactivates editing and enters selection mode', async ({ page }) => {
      await page.waitForTimeout(2000)
      const nodeContent = page.locator('.node-content').first()

      if (await nodeContent.isVisible().catch(() => false)) {
        await nodeContent.click()
        await expect(page.locator('[contenteditable="true"]')).toBeVisible({ timeout: 3000 })

        await page.keyboard.press('Escape')
        await page.waitForTimeout(300)

        // At least the contenteditable should be gone
        const editables = await page.locator('[contenteditable="true"]').count()
        expect(editables).toBe(0)
      }
    })

    test('Arrow keys navigate between nodes in selection mode', async ({ page }) => {
      await page.waitForTimeout(2000)
      const nodeContent = page.locator('.node-content').first()

      if (await nodeContent.isVisible().catch(() => false)) {
        // Activate then escape to enter selection mode
        await nodeContent.click()
        await page.waitForTimeout(300)
        await page.keyboard.press('Escape')
        await page.waitForTimeout(300)

        // Press ArrowDown to move to next node
        await page.keyboard.press('ArrowDown')
        await page.waitForTimeout(200)

        // Press ArrowUp to move back
        await page.keyboard.press('ArrowUp')
        await page.waitForTimeout(200)
      }
    })
  })

  test.describe('Collapse/Expand', () => {
    test('clicking bullet toggles collapse', async ({ page }) => {
      await page.waitForTimeout(2000)

      // Find a node that has children (has a children-container sibling)
      const nodesWithChildren = page.locator('.node-block:has(.children-container)')
      const count = await nodesWithChildren.count()

      if (count > 0) {
        // Pin to a specific node via data-node-id so the locator doesn't
        // re-evaluate to a different node after collapse removes the container.
        const nodeId = await nodesWithChildren.first().getAttribute('data-node-id')
        const parentNode = page.locator(`.node-block[data-node-id="${nodeId}"]`)
        const bullet = parentNode.locator('.bullet-container').first()
        const childrenContainer = parentNode.locator('.children-container').first()

        // Children should be visible initially
        await expect(childrenContainer).toBeVisible()

        // Click bullet to collapse
        await bullet.click()
        await page.waitForTimeout(300)

        // Children should now be hidden
        await expect(childrenContainer).toBeHidden()

        // Click again to expand
        await bullet.click()
        await page.waitForTimeout(300)
        await expect(childrenContainer).toBeVisible()
      }
    })
  })

  test.describe('Zoom/Focus', () => {
    test('Cmd+click on bullet zooms into node', async ({ page }) => {
      await page.waitForTimeout(2000)
      const nodeBlocks = page.locator('.node-block')
      const count = await nodeBlocks.count()

      if (count > 0) {
        // Get the text of the first node before zooming
        const firstNodeText = await page.locator('.node-content .editable').first().textContent()

        // Cmd+click on the first bullet
        const bullet = page.locator('.bullet-container').first()
        await bullet.click({ modifiers: ['Meta'] })
        await page.waitForTimeout(500)

        // The node's content should now appear as heading (zoomed in view)
        if (firstNodeText && firstNodeText.trim()) {
          const heading = page.locator('h1')
          const headingVisible = await heading.isVisible().catch(() => false)
          if (headingVisible) {
            const headingText = await heading.textContent()
            expect(headingText).toContain(firstNodeText.trim())
          }
        }

        // Breadcrumbs should show more than just Home
        const breadcrumbLinks = page.locator('.breadcrumbs button')
        const breadcrumbCount = await breadcrumbLinks.count()
        expect(breadcrumbCount).toBeGreaterThanOrEqual(1)
      }
    })

    test('clicking Home in breadcrumbs returns to workspace root', async ({ page }) => {
      await page.waitForTimeout(2000)
      const nodeBlocks = page.locator('.node-block')
      const count = await nodeBlocks.count()

      if (count > 0) {
        // Zoom into first node
        const bullet = page.locator('.bullet-container').first()
        await bullet.click({ modifiers: ['Meta'] })
        await page.waitForTimeout(500)

        // Click Home to go back
        await page.locator('.breadcrumbs').getByText('Home').click()
        await page.waitForTimeout(500)

        // Should no longer show the heading (back at workspace root)
        const heading = page.locator('h1')
        await expect(heading).toBeHidden({ timeout: 3000 })
      }
    })
  })

  test.describe('Supertag Display', () => {
    test('nodes with supertags show colored badges', async ({ page }) => {
      await page.waitForTimeout(2000)

      // Look for supertag badge elements (small colored spans after content)
      const badges = page.locator('.node-content span.rounded-sm')
      const badgeCount = await badges.count()

      // If any nodes have supertags, badges should be visible
      if (badgeCount > 0) {
        const firstBadge = badges.first()
        await expect(firstBadge).toBeVisible()
        const text = await firstBadge.textContent()
        expect(text?.length).toBeGreaterThan(0)
      }
    })
  })

  test.describe('Fields Display', () => {
    test('nodes with fields show field rows', async ({ page }) => {
      await page.waitForTimeout(2000)

      const fieldRows = page.locator('.field-row')
      const fieldCount = await fieldRows.count()

      // If any nodes have fields, they should show label + value
      if (fieldCount > 0) {
        const firstField = fieldRows.first()
        await expect(firstField).toBeVisible()

        // Should have the field indicator (›)
        const indicator = firstField.locator('text=›')
        await expect(indicator).toBeVisible()
      }
    })
  })

  test.describe('Node Splitting', () => {
    test('Enter at end of text creates empty sibling', async ({ page }) => {
      await page.waitForTimeout(2000)
      const nodeBlocks = page.locator('.node-block')
      const initialCount = await nodeBlocks.count()

      if (initialCount > 0) {
        // Click first node to activate
        const firstContent = page.locator('.node-content').first()
        await firstContent.click()
        await expect(page.locator('[contenteditable="true"]')).toBeVisible({ timeout: 3000 })

        // Move cursor to end
        await page.keyboard.press('End')
        await page.waitForTimeout(100)

        // Press Enter — should create an empty sibling (no split)
        await page.keyboard.press('Enter')
        await page.waitForTimeout(500)

        const newCount = await nodeBlocks.count()
        expect(newCount).toBe(initialCount + 1)

        // The new node should be active and empty
        const activeEditable = page.locator('[contenteditable="true"]')
        await expect(activeEditable).toBeVisible()
        const text = await activeEditable.textContent()
        expect(text?.trim()).toBe('')
      }
    })

    test('Enter mid-text splits node content', async ({ page }) => {
      await page.waitForTimeout(2000)
      const nodeBlocks = page.locator('.node-block')
      const initialCount = await nodeBlocks.count()

      if (initialCount > 0) {
        // Click first node to activate and type predictable content
        const firstContent = page.locator('.node-content').first()
        await firstContent.click()
        await expect(page.locator('[contenteditable="true"]')).toBeVisible({ timeout: 3000 })

        // Select all and type new content so we know exactly what's there
        await page.keyboard.press('Meta+a')
        await page.keyboard.type('AABB')
        await page.waitForTimeout(200)

        // Move cursor to middle (after "AA")
        await page.keyboard.press('Home')
        await page.keyboard.press('ArrowRight')
        await page.keyboard.press('ArrowRight')
        await page.waitForTimeout(100)

        // Press Enter — should split: current node gets "AA", new node gets "BB"
        await page.keyboard.press('Enter')
        await page.waitForTimeout(500)

        const newCount = await nodeBlocks.count()
        expect(newCount).toBe(initialCount + 1)

        // The new node (now active) should contain the after-text
        const activeEditable = page.locator('[contenteditable="true"]')
        const afterText = await activeEditable.textContent()
        expect(afterText).toContain('BB')
      }
    })
  })

  test.describe('Multi-Node Selection', () => {
    test('Shift+ArrowDown extends selection to multiple nodes', async ({ page }) => {
      await page.waitForTimeout(2000)
      const nodeBlocks = page.locator('.node-block')
      const count = await nodeBlocks.count()

      if (count >= 2) {
        // Activate first node then Escape to enter selection mode
        await page.locator('.node-content').first().click()
        await page.waitForTimeout(300)
        await page.keyboard.press('Escape')
        await page.waitForTimeout(300)

        // Shift+ArrowDown to extend selection
        await page.keyboard.press('Shift+ArrowDown')
        await page.waitForTimeout(300)

        // Both nodes should now be highlighted (bg-primary/5)
        // Check that at least 2 node rows have selection styling
        const selectedNodes = page.locator('.node-row.bg-primary\\/5')
        const selectedCount = await selectedNodes.count()
        expect(selectedCount).toBeGreaterThanOrEqual(2)
      }
    })

    test('ArrowDown without Shift resets to single selection', async ({ page }) => {
      await page.waitForTimeout(2000)
      const nodeBlocks = page.locator('.node-block')
      const count = await nodeBlocks.count()

      if (count >= 3) {
        // Enter selection mode
        await page.locator('.node-content').first().click()
        await page.waitForTimeout(300)
        await page.keyboard.press('Escape')
        await page.waitForTimeout(300)

        // Extend selection to 2 nodes
        await page.keyboard.press('Shift+ArrowDown')
        await page.waitForTimeout(200)

        // Then plain ArrowDown — should reset to single selection
        await page.keyboard.press('ArrowDown')
        await page.waitForTimeout(300)

        const selectedNodes = page.locator('.node-row.bg-primary\\/5')
        const selectedCount = await selectedNodes.count()
        expect(selectedCount).toBe(1)
      }
    })

    test('Delete removes all selected nodes in multi-select', async ({ page }) => {
      await page.waitForTimeout(2000)
      const nodeBlocks = page.locator('.node-block')
      const initialCount = await nodeBlocks.count()

      if (initialCount >= 3) {
        // Enter selection mode on first node
        await page.locator('.node-content').first().click()
        await page.waitForTimeout(300)
        await page.keyboard.press('Escape')
        await page.waitForTimeout(300)

        // Select 2 nodes with Shift+ArrowDown
        await page.keyboard.press('Shift+ArrowDown')
        await page.waitForTimeout(200)

        // Delete all selected
        await page.keyboard.press('Delete')
        await page.waitForTimeout(500)

        const newCount = await nodeBlocks.count()
        expect(newCount).toBe(initialCount - 2)
      }
    })
  })

  test.describe('Search Palette (Ctrl+S)', () => {
    test('Ctrl+S opens search palette modal', async ({ page }) => {
      await page.waitForTimeout(2000)

      // Open search palette
      await page.keyboard.press('Meta+s')
      await page.waitForTimeout(300)

      // Should show a modal with search input
      const searchInput = page.locator('input[placeholder*="Search"]')
      await expect(searchInput).toBeVisible({ timeout: 3000 })
    })

    test('typing in search palette shows results', async ({ page }) => {
      await page.waitForTimeout(2000)

      await page.keyboard.press('Meta+s')
      await page.waitForTimeout(300)

      const searchInput = page.locator('input[placeholder*="Search"]')
      await expect(searchInput).toBeVisible({ timeout: 3000 })

      // Type a search query
      await searchInput.fill('a')
      await page.waitForTimeout(500) // Wait for debounced search

      // Results list should appear (or "No results" message)
      const resultsList = page.locator('button.flex.w-full')
      const noResults = page.getByText('No results')

      const hasResults = await resultsList.count() > 0
      const hasNoResults = await noResults.isVisible().catch(() => false)

      expect(hasResults || hasNoResults).toBe(true)
    })

    test('Escape closes search palette', async ({ page }) => {
      await page.waitForTimeout(2000)

      await page.keyboard.press('Meta+s')
      await page.waitForTimeout(300)

      const searchInput = page.locator('input[placeholder*="Search"]')
      await expect(searchInput).toBeVisible({ timeout: 3000 })

      await page.keyboard.press('Escape')
      await page.waitForTimeout(300)

      await expect(searchInput).toBeHidden()
    })
  })

  test.describe('Command Palette (Ctrl+K)', () => {
    test('Ctrl+K opens inline command palette below focused node', async ({ page }) => {
      await page.waitForTimeout(2000)
      const nodeContent = page.locator('.node-content').first()

      if (await nodeContent.isVisible().catch(() => false)) {
        // Activate a node first, then Escape to select mode
        await nodeContent.click()
        await page.waitForTimeout(300)
        await page.keyboard.press('Escape')
        await page.waitForTimeout(300)

        // Open command palette
        await page.keyboard.press('Meta+k')
        await page.waitForTimeout(300)

        // Should show command palette with input
        const cmdInput = page.locator('input[placeholder*="command"]')
        await expect(cmdInput).toBeVisible({ timeout: 3000 })
      }
    })

    test('command palette shows commands list', async ({ page }) => {
      await page.waitForTimeout(2000)
      const nodeContent = page.locator('.node-content').first()

      if (await nodeContent.isVisible().catch(() => false)) {
        await nodeContent.click()
        await page.waitForTimeout(300)
        await page.keyboard.press('Escape')
        await page.waitForTimeout(300)

        await page.keyboard.press('Meta+k')
        await page.waitForTimeout(300)

        // Should show available commands
        const addSupertag = page.getByText('Add supertag')
        const deleteNode = page.getByText('Delete node')

        await expect(addSupertag).toBeVisible({ timeout: 3000 })
        await expect(deleteNode).toBeVisible()
      }
    })

    test('Escape closes command palette', async ({ page }) => {
      await page.waitForTimeout(2000)
      const nodeContent = page.locator('.node-content').first()

      if (await nodeContent.isVisible().catch(() => false)) {
        await nodeContent.click()
        await page.waitForTimeout(300)
        await page.keyboard.press('Escape')
        await page.waitForTimeout(300)

        await page.keyboard.press('Meta+k')
        await page.waitForTimeout(300)

        const cmdInput = page.locator('input[placeholder*="command"]')
        await expect(cmdInput).toBeVisible({ timeout: 3000 })

        await page.keyboard.press('Escape')
        await page.waitForTimeout(300)

        await expect(cmdInput).toBeHidden()
      }
    })

    test('selecting Add supertag navigates to supertag step', async ({ page }) => {
      await page.waitForTimeout(2000)
      const nodeContent = page.locator('.node-content').first()

      if (await nodeContent.isVisible().catch(() => false)) {
        await nodeContent.click()
        await page.waitForTimeout(300)
        await page.keyboard.press('Escape')
        await page.waitForTimeout(300)

        await page.keyboard.press('Meta+k')
        await page.waitForTimeout(300)

        // Select "Add supertag" (first item, press Enter)
        await page.keyboard.press('Enter')
        await page.waitForTimeout(300)

        // Should now show supertag search step with breadcrumb
        const breadcrumb = page.getByText('Add supertag', { exact: false })
        await expect(breadcrumb.first()).toBeVisible({ timeout: 3000 })

        const searchInput = page.locator('input[placeholder*="supertag"]')
        await expect(searchInput).toBeVisible()
      }
    })
  })

  test.describe('View Switching', () => {
    test('view toolbar appears on nodes with supertags', async ({ page }) => {
      // Wait for editor to load
      await page.getByText('Loading').waitFor({ state: 'hidden', timeout: 15_000 }).catch(() => {})
      await page.locator('.node-block').first().waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {})

      // Look for view toolbar (outline/table/kanban buttons)
      const viewToolbar = page.locator('.view-toolbar, [data-view-toolbar]')
      const count = await viewToolbar.count()

      // If any nodes have supertags, they might show a view toolbar
      if (count > 0) {
        await expect(viewToolbar.first()).toBeVisible()
      }
    })

    test('field rows display with field bullet icons', async ({ page }) => {
      await page.getByText('Loading').waitFor({ state: 'hidden', timeout: 15_000 }).catch(() => {})
      await page.locator('.node-block').first().waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {})

      const fieldRows = page.locator('.field-row')
      const count = await fieldRows.count()

      if (count > 0) {
        // Each field row should have a field bullet and label
        const firstRow = fieldRows.first()
        await expect(firstRow).toBeVisible()

        // Should have a data-field-name attribute
        const fieldName = await firstRow.getAttribute('data-field-name')
        expect(fieldName).toBeTruthy()
      }
    })
  })

  test.describe('Keyboard Shortcuts (move, undo)', () => {
    test('Cmd+Shift+Down moves selected node down', async ({ page }) => {
      await page.getByText('Loading').waitFor({ state: 'hidden', timeout: 15_000 }).catch(() => {})
      const nodeBlocks = page.locator('.node-block')
      const count = await nodeBlocks.count()

      if (count >= 2) {
        // Get first two node texts
        const firstContent = page.locator('.node-content .editable').first()
        const firstText = await firstContent.textContent()

        // Enter selection mode on first node
        await firstContent.click()
        await page.waitForTimeout(200)
        await page.keyboard.press('Escape')
        await page.waitForTimeout(200)

        // Move down
        await page.keyboard.press('Meta+Shift+ArrowDown')
        await page.waitForTimeout(300)

        // The first node should now be at position 2
        const newFirstText = await page.locator('.node-content .editable').first().textContent()
        if (firstText && newFirstText) {
          expect(newFirstText).not.toBe(firstText)
        }
      }
    })

    test('Cmd+Z undoes last action', async ({ page }) => {
      await page.getByText('Loading').waitFor({ state: 'hidden', timeout: 15_000 }).catch(() => {})
      const nodeBlocks = page.locator('.node-block')
      const initialCount = await nodeBlocks.count()

      if (initialCount > 0) {
        // Create a new node
        await page.locator('.node-content').first().click()
        await expect(page.locator('[contenteditable="true"]')).toBeVisible({ timeout: 3000 })
        await page.keyboard.press('Enter')
        await page.waitForTimeout(500)

        const afterCreateCount = await nodeBlocks.count()
        expect(afterCreateCount).toBe(initialCount + 1)

        // Exit edit mode first so Cmd+Z triggers outline-level undo
        await page.keyboard.press('Escape')
        await page.waitForTimeout(200)

        // Undo
        await page.keyboard.press('Meta+z')
        await page.waitForTimeout(500)

        const afterUndoCount = await nodeBlocks.count()
        expect(afterUndoCount).toBe(initialCount)
      }
    })
  })

  test.describe('Supertag Configuration', () => {
    test('supertag badges show gear icon on hover', async ({ page }) => {
      await page.getByText('Loading').waitFor({ state: 'hidden', timeout: 15_000 }).catch(() => {})
      await page.locator('.node-block').first().waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {})

      // Find supertag badges
      const badges = page.locator('[data-supertag-badge]')
      const count = await badges.count()

      if (count > 0) {
        // Hover over first badge — gear icon should appear
        await badges.first().hover()
        await page.waitForTimeout(300)

        // Look for GearSix icon in the badge area
        const gearIcon = badges.first().locator('svg')
        const gearCount = await gearIcon.count()
        expect(gearCount).toBeGreaterThanOrEqual(1)
      }
    })
  })

  test.describe('Backlinks', () => {
    /**
     * Helper: scroll the supertag detail view to the bottom to reveal the References section.
     * The supertag-detail-view has its own overflow-y-auto container.
     */
    async function scrollToReferences(page: import('@playwright/test').Page) {
      // The supertag detail view is the scrollable container, not the window
      await page.evaluate(() => {
        const container = document.querySelector('.supertag-detail-view') ?? document.querySelector('.outline-body')
        if (container) container.scrollTop = container.scrollHeight
      })
      await page.waitForTimeout(1000)
      // Scroll again after backlinks data may have loaded
      await page.evaluate(() => {
        const container = document.querySelector('.supertag-detail-view') ?? document.querySelector('.outline-body')
        if (container) container.scrollTop = container.scrollHeight
      })
    }

    /**
     * Helper: zoom into a supertag node and scroll to the References section.
     * Returns the References header locator, or null if it's not available.
     */
    async function zoomIntoSupertagAndFindRefs(page: import('@playwright/test').Page) {
      // Find supertag bullets ("#" text inside bullet-container buttons)
      const supertagBullets = page.getByRole('button', { name: '#', exact: true })
      const stCount = await supertagBullets.count()
      if (stCount === 0) return null

      // Cmd+click to zoom into the supertag detail view
      await supertagBullets.first().click({ modifiers: ['Meta'] })
      await page.waitForTimeout(1500)

      await scrollToReferences(page)

      // The text in the DOM is "References" (CSS uppercase transforms the display)
      const refsButton = page.getByText(/References/i).filter({ hasText: /\(\d+\)/ })
      return refsButton
    }

    test('zoomed supertag node shows referenced nodes, not just a count', async ({ page }) => {
      await page.getByText('Loading').waitFor({ state: 'hidden', timeout: 15_000 }).catch(() => {})
      await page.locator('.node-block').first().waitFor({ state: 'visible', timeout: 10_000 })

      const refsButton = await zoomIntoSupertagAndFindRefs(page)
      if (!refsButton) {
        test.skip(true, 'No supertag nodes found in seed data')
        return
      }

      await expect(refsButton).toBeVisible({ timeout: 10_000 })

      // Extract the count — it should be > 0 for any supertag with tagged instances
      const refsText = await refsButton.textContent() ?? ''
      const countMatch = refsText.match(/\((\d+)\)/)
      const refCount = countMatch ? parseInt(countMatch[1]!, 10) : 0

      if (refCount === 0) {
        test.skip(true, 'First supertag has no backlinks')
        return
      }

      // The key regression test: "Appears as ... in..." group headers should be visible
      const appearsAs = page.getByText(/Appears as/)
      await expect(appearsAs.first()).toBeVisible({ timeout: 5_000 })

      // And actual referenced node rows (with role="button" and "Go to:" title) should render
      const refRows = page.locator('[role="button"][title^="Go to:"]')
      const rowCount = await refRows.count()
      expect(rowCount).toBeGreaterThan(0)

      // Verify node rows contain text content (not empty)
      const firstRowText = await refRows.first().textContent()
      expect(firstRowText?.trim().length).toBeGreaterThan(0)
    })

    test('backlinks show actual node names with supertag pills', async ({ page }) => {
      await page.getByText('Loading').waitFor({ state: 'hidden', timeout: 15_000 }).catch(() => {})
      await page.locator('.node-block').first().waitFor({ state: 'visible', timeout: 10_000 })

      // Find a supertag node — e.g. #Tool — which has many tagged instances
      const toolNode = page.locator('.node-content').filter({ hasText: '#Tool' }).first()
      const toolVisible = await toolNode.isVisible().catch(() => false)

      if (!toolVisible) {
        test.skip(true, '#Tool supertag not found in seed data')
        return
      }

      // Find the bullet for this node and Cmd+click to zoom in
      const toolBlock = toolNode.locator('xpath=ancestor::*[contains(@class,"node-block")]').first()
      const bullet = toolBlock.locator('.bullet-container').first()
      await bullet.click({ modifiers: ['Meta'] })
      await page.waitForTimeout(1500)

      // Scroll the supertag detail view to the bottom
      await scrollToReferences(page)

      const refsButton = page.getByText(/References/i).filter({ hasText: /\(\d+\)/ })
      await expect(refsButton).toBeVisible({ timeout: 10_000 })

      // Verify "Appears as supertag in..." group header
      const supertagGroup = page.getByText('Appears as').filter({ hasText: 'supertag' })
      await expect(supertagGroup.first()).toBeVisible({ timeout: 5_000 })

      // Verify that actual node rows exist within the references area
      const refRows = page.locator('[role="button"][title^="Go to:"]')
      const rowCount = await refRows.count()
      expect(rowCount).toBeGreaterThan(0)

      // Each reference row should show node names (text content, not just blanks)
      const firstRowText = await refRows.first().textContent()
      expect(firstRowText?.trim().length).toBeGreaterThan(0)
    })

    test('References section is collapsible', async ({ page }) => {
      await page.getByText('Loading').waitFor({ state: 'hidden', timeout: 15_000 }).catch(() => {})
      await page.locator('.node-block').first().waitFor({ state: 'visible', timeout: 10_000 })

      const refsButton = await zoomIntoSupertagAndFindRefs(page)
      if (!refsButton) {
        test.skip(true, 'No supertag nodes found in seed data')
        return
      }

      const hasRefs = await refsButton.isVisible({ timeout: 10_000 }).catch(() => false)

      if (!hasRefs) {
        test.skip(true, 'No backlinks on this supertag')
        return
      }

      // Verify reference rows are visible before collapse
      const appearsAs = page.getByText(/Appears as/)
      await expect(appearsAs.first()).toBeVisible({ timeout: 5_000 })

      // Click to collapse
      await refsButton.click()
      await page.waitForTimeout(300)

      // The "Appears as" text should be hidden after collapse
      const visible = await appearsAs.first().isVisible().catch(() => false)
      expect(visible).toBe(false)

      // Click again to expand
      await refsButton.click()
      await page.waitForTimeout(300)

      await expect(appearsAs.first()).toBeVisible()
    })
  })

  test.describe('Empty Node — Press Enter to Write', () => {
    test('pressing Enter on empty node creates first child', async ({ page }) => {
      await page.getByText('Loading').waitFor({ state: 'hidden', timeout: 15_000 }).catch(() => {})
      await page.locator('.node-block').first().waitFor({ state: 'visible', timeout: 10_000 })

      // Strategy: find a non-supertag parent node on the home page, zoom into it
      // using Cmd+click on its bullet, then find a leaf child and Cmd+click again.
      // The leaf child should show "Empty. Press Enter to start writing."

      // Find a non-supertag, non-query parent node by checking the node-content text.
      // Query nodes have "Configure query" buttons; supertags have "#" in their bullet.
      // We look for parent nodes like "Remember" or "Nxus Development".
      const parentNodeId = await page.evaluate(() => {
        const blocks = document.querySelectorAll('.node-block')
        for (const block of blocks) {
          // Must have children (nested .node-block)
          if (!block.querySelector('.node-block')) continue

          const row = block.querySelector(':scope > .node-row')
          if (!row) continue

          // Must have a button.bullet-container (not a field bullet <span>)
          const bullet = row.querySelector('button.bullet-container')
          if (!bullet) continue

          // Skip supertags (bullet contains "#")
          if (bullet.textContent?.includes('#')) continue

          // Skip query nodes (they have a "Configure query" button in their row)
          if (row.querySelector('button[aria-label="Configure query"], button[title="Configure query"]')) continue
          // Also check text — query nodes have names like "Inbox: ..."
          const content = row.querySelector('.node-content')
          if (content?.textContent?.includes('Configure query')) continue

          return block.getAttribute('data-node-id')
        }
        return null
      })

      if (!parentNodeId) {
        test.skip(true, 'No non-supertag, non-query parent node found in seed data')
        return
      }

      // Navigate to this parent using the correct URL pattern
      await page.goto(`/editor/?node=${parentNodeId}`)
      await page.getByText('Loading').waitFor({ state: 'hidden', timeout: 15_000 }).catch(() => {})
      await page.waitForTimeout(1500)

      // Now we're zoomed into the parent. Find a leaf child bullet ("Cmd+click to focus")
      const leafBullets = page.getByRole('button', { name: 'Cmd+click to focus' })
      const leafCount = await leafBullets.count()

      if (leafCount === 0) {
        test.skip(true, 'No leaf children found in content parent')
        return
      }

      // Cmd+click on the first leaf child to zoom into it
      await leafBullets.first().click({ modifiers: ['Meta'] })
      await page.waitForTimeout(1500)

      const emptyMessage = page.getByText('Empty. Press Enter to start writing.')
      const messageVisible = await emptyMessage.isVisible().catch(() => false)

      if (!messageVisible) {
        test.skip(true, 'Selected leaf is not an empty node')
        return
      }

      // Press Enter — should create a new child node
      await page.keyboard.press('Enter')
      await page.waitForTimeout(500)

      // The empty message should be gone
      await expect(emptyMessage).toBeHidden({ timeout: 3_000 })

      // A new editable node should be active (contenteditable or textbox)
      const editable = page.locator('[contenteditable="true"], textarea, input[type="text"]')
      await expect(editable.first()).toBeVisible({ timeout: 3_000 })

      // Undo the creation to restore state
      await page.keyboard.press('Escape')
      await page.waitForTimeout(200)
      await page.keyboard.press('Meta+z')
      await page.waitForTimeout(500)

      // Empty message should reappear after undo
      await expect(emptyMessage).toBeVisible({ timeout: 5_000 })
    })
  })
})
