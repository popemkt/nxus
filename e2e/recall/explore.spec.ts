import { test, expect } from '../fixtures/base.fixture.js'
import { mockAIServerFunctions, MOCK_CONCEPTS } from './mock-ai.js'

test.describe('Recall Explore & Concept Generation', () => {
  test.beforeEach(async ({ page, navigateToApp }) => {
    await mockAIServerFunctions(page)
    await navigateToApp('recall')
    await page.getByRole('link', { name: 'Explore' }).click()
    await page.waitForURL('**/recall/explore')
  })

  test('R5 — Explore page loads with search input and generate button', async ({
    page,
  }) => {
    await expect(
      page.getByRole('heading', { name: 'Explore Topics' }),
    ).toBeVisible()

    // Search input
    await expect(
      page.getByPlaceholder(/distributed systems/i),
    ).toBeVisible()

    // Generate button (disabled when input empty)
    const generateBtn = page.getByRole('button', { name: 'Generate' })
    await expect(generateBtn).toBeVisible()
    await expect(generateBtn).toBeDisabled()
  })

  test('R6 — Generate concepts with mocked AI and see concept cards', async ({
    page,
  }) => {
    // Type a topic
    const searchInput = page.getByPlaceholder(/distributed systems/i)
    await searchInput.fill('Distributed Systems')

    // Generate button should now be enabled
    const generateBtn = page.getByRole('button', { name: 'Generate' })
    await expect(generateBtn).toBeEnabled()

    // Click generate
    await generateBtn.click()

    // Wait for concepts to appear (mocked AI returns instantly)
    await expect(
      page.getByRole('heading', { name: 'Generated Concepts' }),
    ).toBeVisible({ timeout: 15000 })

    // Verify all mock concepts are rendered
    for (const concept of MOCK_CONCEPTS) {
      await expect(page.getByText(concept.title)).toBeVisible()
      await expect(page.getByText(concept.summary)).toBeVisible()
    }

    // Verify Bloom's level badges are shown
    await expect(page.getByText('analyze')).toBeVisible()
    await expect(page.getByText('evaluate')).toBeVisible()
    await expect(page.getByText('apply')).toBeVisible()
  })

  test('R7 — Save a concept card', async ({ page }) => {
    // Generate concepts first
    const searchInput = page.getByPlaceholder(/distributed systems/i)
    await searchInput.fill('Distributed Systems')
    await page.getByRole('button', { name: 'Generate' }).click()

    // Wait for concepts
    await expect(
      page.getByRole('heading', { name: 'Generated Concepts' }),
    ).toBeVisible({ timeout: 15000 })

    // Find the first Save button and click it
    const saveButtons = page.getByRole('button', { name: 'Save' })
    await expect(saveButtons.first()).toBeVisible()
    await saveButtons.first().click()

    // The saved concept should show "Saved" badge
    await expect(page.getByText('Saved').first()).toBeVisible({
      timeout: 10000,
    })

    // "View Topic" link should appear after saving
    await expect(page.getByText(/View Topic/)).toBeVisible()
  })

  test('R8 — Dismiss a concept card', async ({ page }) => {
    // Generate concepts first
    const searchInput = page.getByPlaceholder(/distributed systems/i)
    await searchInput.fill('Distributed Systems')
    await page.getByRole('button', { name: 'Generate' }).click()

    // Wait for concepts
    await expect(
      page.getByRole('heading', { name: 'Generated Concepts' }),
    ).toBeVisible({ timeout: 15000 })

    // Get the first concept title before dismissing
    const firstConceptTitle = MOCK_CONCEPTS[0]!.title

    // Click dismiss button (X icon) on the first concept
    const dismissBtn = page.getByRole('button', { name: 'Dismiss' }).first()
    await expect(dismissBtn).toBeVisible()
    await dismissBtn.click()

    // The dismissed concept should no longer be visible
    await expect(page.getByText(firstConceptTitle)).toBeHidden()
  })
})
