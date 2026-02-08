import { test, expect } from '../fixtures/base.fixture.js'
import { APP_URLS, APP_NAMES } from '../helpers/navigation.js'

test.describe('Gateway Landing Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(APP_URLS.gateway)
  })

  test('G1 — Landing page loads with correct content', async ({ page }) => {
    // Verify page title
    await expect(page).toHaveTitle('nXus Gateway')

    // Verify main heading contains "nXus"
    await expect(
      page.getByRole('heading', { level: 1 })
    ).toContainText('nXus')

    // Verify subtitle
    await expect(
      page.getByText('Select an application to get started')
    ).toBeVisible()

    // Verify all 3 mini app cards are visible
    await expect(page.getByText(APP_NAMES.core)).toBeVisible()
    await expect(page.getByText(APP_NAMES.workbench)).toBeVisible()
    await expect(page.getByText(APP_NAMES.calendar)).toBeVisible()
  })

  test('G2 — Navigation to nXus Core', async ({ page }) => {
    await page.locator(`a[href="${APP_URLS.core}"]`).click()
    await page.waitForURL(`**${APP_URLS.core}`)
    await page.waitForLoadState('domcontentloaded')
    await expect(page.locator('body')).not.toBeEmpty()
  })

  test('G2 — Navigation to nXus Workbench', async ({ page }) => {
    await page.locator(`a[href="${APP_URLS.workbench}"]`).click()
    await page.waitForURL(`**${APP_URLS.workbench}`)
    await page.waitForLoadState('domcontentloaded')
    await expect(page.locator('body')).not.toBeEmpty()
  })

  test('G2 — Navigation to nXus Calendar', async ({ page }) => {
    await page.locator(`a[href="${APP_URLS.calendar}"]`).click()
    await page.waitForURL(`**${APP_URLS.calendar}`)
    await page.waitForLoadState('domcontentloaded')
    await expect(page.locator('body')).not.toBeEmpty()
  })
})
