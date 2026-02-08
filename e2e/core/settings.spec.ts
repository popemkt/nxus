import { test, expect } from '../fixtures/base.fixture.js'

test.describe('Core Settings Page', () => {
  test('C9 — Navigate to Settings and verify layout', async ({ page }) => {
    await page.goto('/core')
    await page.waitForLoadState('networkidle')

    // Click Settings link in HUD
    await page.getByRole('link', { name: 'Settings' }).click()
    await page.waitForURL('**/core/settings')
    await page.waitForLoadState('networkidle')

    // Verify Settings heading
    await expect(
      page.getByRole('heading', { name: 'Settings', level: 1 })
    ).toBeVisible()

    // Verify sidebar sections are present
    await expect(page.getByRole('button', { name: 'General' })).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Keyboard Shortcuts' })
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Command Aliases' })
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'App Configurations' })
    ).toBeVisible()

    // Verify General section is active by default (Appearance card visible)
    await expect(page.getByText('Appearance')).toBeVisible()
    await expect(page.getByText('Choose your preferred theme')).toBeVisible()

    // Click on Keyboard Shortcuts section
    await page.getByRole('button', { name: 'Keyboard Shortcuts' }).click()
    await expect(page.getByText('Global Shortcuts')).toBeVisible()
    await expect(
      page.getByText('Command Palette', { exact: true })
    ).toBeVisible()

    // Click on Command Aliases section
    await page.getByRole('button', { name: 'Command Aliases' }).click()
    await expect(page.getByText('Add Alias')).toBeVisible()
    await expect(page.getByText('Configured Aliases')).toBeVisible()
  })

  test('C10 — Theme toggle between light and dark', async ({ page }) => {
    await page.goto('/core/settings')
    await page.waitForLoadState('networkidle')

    // Wait for General section to load (default active section)
    await expect(page.getByText('Appearance')).toBeVisible()

    // Verify theme chooser is visible in General section
    await expect(page.getByText('Color Mode')).toBeVisible()

    // The Light and Dark buttons contain text "Light" and "Dark"
    const lightBtn = page.getByRole('button', { name: 'Light' })
    const darkBtn = page.getByRole('button', { name: 'Dark' })
    await expect(lightBtn).toBeVisible()
    await expect(darkBtn).toBeVisible()

    // Click Dark mode
    await darkBtn.click()
    // Verify the <html> element has 'dark' class
    await expect(page.locator('html')).toHaveClass(/dark/)

    // Click Light mode
    await lightBtn.click()
    // Verify the <html> element does NOT have 'dark' class
    await expect(page.locator('html')).not.toHaveClass(/dark/)
  })
})
