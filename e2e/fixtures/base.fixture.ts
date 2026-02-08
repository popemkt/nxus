import { test as base, expect } from '@playwright/test'

type CustomFixtures = {
  /** Navigate to an app and wait for it to load */
  navigateToApp: (app: 'core' | 'workbench' | 'calendar') => Promise<void>
}

export const test = base.extend<CustomFixtures>({
  navigateToApp: async ({ page }, use) => {
    const navigate = async (app: 'core' | 'workbench' | 'calendar') => {
      await page.goto(`/${app}`)
      await page.waitForLoadState('networkidle')
    }
    await use(navigate)
  },
})

export { expect }
