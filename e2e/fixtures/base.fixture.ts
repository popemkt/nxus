import { test as base, expect } from '@playwright/test'

type CustomFixtures = {
  /** Navigate to an app and wait for it to load */
  navigateToApp: (app: 'core' | 'workbench' | 'calendar' | 'recall' | 'editor') => Promise<void>
}

export const test = base.extend<CustomFixtures>({
  navigateToApp: async ({ page }, use) => {
    const navigate = async (app: 'core' | 'workbench' | 'calendar' | 'recall' | 'editor') => {
      // Retry navigation if the upstream app returns a 502 (not ready yet).
      // The gateway health check passes before upstream apps finish starting.
      const maxRetries = 3
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        const response = await page.goto(`/${app}`)
        if (response && response.status() === 502 && attempt < maxRetries - 1) {
          await page.waitForTimeout(3000)
          continue
        }
        break
      }
      await page.waitForLoadState('networkidle')
    }
    await use(navigate)
  },
})

export { expect }
