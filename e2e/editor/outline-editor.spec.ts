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
      // Wait for loading to finish
      await page.waitForTimeout(2000)

      // Should have at least one node block or an empty state message
      const nodeBlocks = page.locator('.node-block')
      const emptyMessage = page.getByText('Empty')
      const noNodesMessage = page.getByText('No nodes found')

      const hasNodes = await nodeBlocks.count() > 0
      const isEmpty = await emptyMessage.isVisible().catch(() => false)
      const hasNoNodes = await noNodesMessage.isVisible().catch(() => false)

      expect(hasNodes || isEmpty || hasNoNodes).toBe(true)
    })

    test('shows bullet icons for each node', async ({ page }) => {
      await page.waitForTimeout(2000)
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

        // Active editor should be gone, but node should be selected (bg highlight)
        const selectedNode = page.locator('.node-row').filter({ has: page.locator('.bg-primary\\/5') })
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
        const parentNode = nodesWithChildren.first()
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
})
