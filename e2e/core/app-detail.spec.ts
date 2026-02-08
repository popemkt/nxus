import { test, expect } from '../fixtures/base.fixture.js'

test.describe('Core App Detail Page', () => {
  test.beforeEach(async ({ navigateToApp }) => {
    await navigateToApp('core')
  })

  test('C4 — Navigate to app detail from gallery', async ({ page }) => {
    // Wait for gallery cards to load
    const appLinks = page.getByRole('link', { name: 'View Details' })
    await expect(appLinks.first()).toBeVisible({ timeout: 15000 })

    // Get the href to verify navigation
    const href = await appLinks.first().getAttribute('href')
    await appLinks.first().click()

    // Wait for detail page to load
    await page.waitForURL(`**${href}`)
    await page.waitForLoadState('domcontentloaded')

    // Verify app detail page loads with a title heading
    await expect(page.locator('h1')).toBeVisible()

    // Verify back button is visible
    await expect(page.getByText('Back to Gallery')).toBeVisible()
  })

  test('C5 — App detail content renders correctly', async ({ page }) => {
    // Wait for gallery cards to load then navigate to first app detail
    const appLinks = page.getByRole('link', { name: 'View Details' })
    await expect(appLinks.first()).toBeVisible({ timeout: 15000 })

    await appLinks.first().click()
    await page.waitForLoadState('domcontentloaded')

    // Verify main heading (app name)
    const heading = page.locator('h1')
    await expect(heading).toBeVisible()
    const appName = await heading.textContent()
    expect(appName?.trim().length).toBeGreaterThan(0)

    // Verify Quick Actions card
    await expect(page.getByText('Quick Actions')).toBeVisible()
    await expect(
      page.getByText('Interact with this application')
    ).toBeVisible()

    // Verify "Generate Thumbnail" button is present (available for all apps)
    await expect(page.getByText('Generate Thumbnail')).toBeVisible()

    // Verify Information sidebar card
    await expect(page.getByText('Information')).toBeVisible()

    // Verify metadata fields exist (at least Created and Updated should always be present)
    await expect(page.getByText('Created')).toBeVisible()
    await expect(page.getByText('Updated')).toBeVisible()

    // Verify Back to Gallery button works
    await page.getByText('Back to Gallery').click()
    // Wait for URL to change back to gallery (may be /core or /core/)
    await page.waitForLoadState('domcontentloaded')
    expect(page.url()).toMatch(/\/core\/?$/)
  })
})
