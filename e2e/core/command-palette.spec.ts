import { test, expect } from '../fixtures/base.fixture.js'

test.describe('Core Command Palette', () => {
  test.beforeEach(async ({ navigateToApp }) => {
    await navigateToApp('core')
  })

  test('C11 — Open and close command palette', async ({ page }) => {
    // Wait for HUD to be ready
    await expect(page.getByPlaceholder('Search apps...')).toBeVisible()

    // Open command palette by clicking the ⌘K button in the HUD
    await page.locator('[title="Open command palette"]').click()

    // Verify palette is open — search input with "Search commands..." placeholder
    const paletteInput = page.getByPlaceholder('Search commands...')
    await expect(paletteInput).toBeVisible({ timeout: 5000 })

    // Close with Escape
    await page.keyboard.press('Escape')

    // Verify palette is closed
    await expect(paletteInput).toBeHidden({ timeout: 3000 })

    // Also verify keyboard shortcut works — default is Ctrl+Shift+P
    await page.keyboard.press('Control+Shift+p')
    await expect(paletteInput).toBeVisible({ timeout: 5000 })

    // Close again
    await page.keyboard.press('Escape')
    await expect(paletteInput).toBeHidden({ timeout: 3000 })
  })

  test('C12 — Command palette search filters results', async ({ page }) => {
    // Wait for HUD to be ready
    await expect(page.getByPlaceholder('Search apps...')).toBeVisible()

    // Open command palette
    await page.locator('[title="Open command palette"]').click()

    const paletteInput = page.getByPlaceholder('Search commands...')
    await expect(paletteInput).toBeVisible({ timeout: 5000 })

    // Wait for command list to populate
    await page.waitForTimeout(500)

    // Type a nonsense query that shouldn't match any commands
    await paletteInput.fill('zzznonexistent999')
    await page.waitForTimeout(300)

    // Should show "No commands found"
    await expect(page.getByText('No commands found')).toBeVisible()

    // Clear and type a real query
    await paletteInput.fill('')
    await page.waitForTimeout(300)

    // Type something that should match (e.g. "thumbnail" for generate thumbnail)
    await paletteInput.fill('thumbnail')
    await page.waitForTimeout(300)

    // "No commands found" should NOT be visible when there's a match
    await expect(page.getByText('No commands found')).toBeHidden()

    // Close palette
    await page.keyboard.press('Escape')
    await expect(paletteInput).toBeHidden()
  })
})
