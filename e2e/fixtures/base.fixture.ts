import { test as base, expect } from '@playwright/test'
import type { Page } from '@playwright/test'

/**
 * Wait for an app to be ready by checking for app-specific DOM elements
 * instead of relying on `networkidle` which can hang with WebSockets/polling.
 */
async function waitForAppReady(page: Page, app: 'core' | 'workbench' | 'calendar') {
  await page.waitForLoadState('domcontentloaded')

  switch (app) {
    case 'core':
      // Core app renders a search input or app cards on the gallery page,
      // or "No apps found" as an empty state
      await expect(
        page.getByPlaceholder('Search apps...').or(
          page.getByText('No apps found')
        )
      ).toBeVisible({ timeout: 15000 })
      break
    case 'workbench':
      // Workbench always renders a search input in the sidebar
      await expect(
        page.getByPlaceholder('Search all nodes...').or(
          page.getByText('No nodes found')
        )
      ).toBeVisible({ timeout: 15000 })
      break
    case 'calendar':
      // Calendar renders either the full calendar or an empty state
      await expect(
        page.locator('.nxus-calendar').or(
          page.locator('.calendar-empty')
        )
      ).toBeVisible({ timeout: 15000 })
      break
  }
}

type CustomFixtures = {
  /** Navigate to an app and wait for it to load */
  navigateToApp: (app: 'core' | 'workbench' | 'calendar') => Promise<void>
}

export const test = base.extend<CustomFixtures>({
  navigateToApp: async ({ page }, use) => {
    const navigate = async (app: 'core' | 'workbench' | 'calendar') => {
      await page.goto(`/${app}`)
      await waitForAppReady(page, app)
    }
    await use(navigate)
  },
})

export { expect, waitForAppReady }
