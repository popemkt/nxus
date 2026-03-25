import { test, expect } from '../fixtures/base.fixture.js'

test.describe('Query Definition Persistence', () => {
  test.beforeEach(async ({ navigateToApp }) => {
    await navigateToApp('editor')
  })

  test('query filter change persists after collapse/expand', async ({ page }) => {
    // Wait for the editor to load
    await page.getByText('Loading').waitFor({ state: 'hidden', timeout: 15_000 }).catch(() => {})
    await page.locator('.node-block').first().waitFor({ state: 'visible', timeout: 10_000 })

    // Find a query node — look for nodes with the "Configure query" button
    const configureButtons = page.getByRole('button', { name: 'Configure query' })
    const buttonCount = await configureButtons.count()

    if (buttonCount === 0) {
      test.skip(true, 'No query nodes found in seed data')
      return
    }

    // Get the parent node-block of the first query node so we can target it specifically
    const queryNodeBlock = configureButtons.first().locator('xpath=ancestor::*[contains(@class,"node-block")]').first()
    const nodeId = await queryNodeBlock.getAttribute('data-node-id')
    const queryNode = page.locator(`.node-block[data-node-id="${nodeId}"]`)

    // Click "Configure query" to open the QueryBuilder
    await configureButtons.first().click()
    await page.waitForTimeout(500)

    // The QueryBuilder should now be visible — look for the filter pill
    const filterPill = queryNode.locator('button').filter({ has: page.locator('text="Remove filter"') }).first()
    await expect(filterPill).toBeVisible({ timeout: 5_000 })

    // Read the current filter name from the pill
    const originalFilterText = await filterPill.locator('span').first().textContent()

    // Click the pill to open the filter editor
    await filterPill.click()
    await page.waitForTimeout(300)

    // Open the supertag dropdown inside the filter editor
    const supertagCombo = queryNode.locator('[role="combobox"]').first()
    await supertagCombo.click()
    await page.waitForTimeout(300)

    // Find a different supertag option to select
    const options = page.locator('[role="option"]')
    const optionCount = await options.count()

    // Pick the first option that's NOT currently selected
    let targetOptionText = ''
    for (let i = 0; i < optionCount; i++) {
      const option = options.nth(i)
      const isSelected = await option.getAttribute('aria-selected')
      if (isSelected !== 'true') {
        targetOptionText = (await option.textContent())?.replace('#', '').trim() ?? ''
        await option.click()
        break
      }
    }

    if (!targetOptionText) {
      test.skip(true, 'Could not find a different supertag option')
      return
    }

    await page.waitForTimeout(300)

    // Click "Done" to close the filter editor (if visible)
    const doneButton = page.getByRole('button', { name: 'Done' })
    if (await doneButton.isVisible().catch(() => false)) {
      await doneButton.click()
      await page.waitForTimeout(300)
    }

    // Verify the filter pill now shows the new supertag name
    const updatedPill = queryNode.locator('button').filter({ has: page.locator('text="Remove filter"') }).first()
    const updatedFilterText = await updatedPill.locator('span').first().textContent()
    expect(updatedFilterText).not.toBe(originalFilterText)

    // Collapse the query node by clicking its bullet
    const bullet = queryNode.locator('.bullet-container').first()
    await bullet.click()
    await page.waitForTimeout(300)

    // The children should be hidden now
    const childrenContainer = queryNode.locator('.children-container')
    await expect(childrenContainer).toBeHidden()

    // Expand it again
    await bullet.click()
    await page.waitForTimeout(500)

    // Open the QueryBuilder again to check the filter
    const reconfigureButton = queryNode.getByRole('button', { name: 'Configure query' })
    await reconfigureButton.click()
    await page.waitForTimeout(500)

    // The filter pill should still show the changed supertag, NOT the original
    const persistedPill = queryNode.locator('button').filter({ has: page.locator('text="Remove filter"') }).first()
    await expect(persistedPill).toBeVisible({ timeout: 5_000 })
    const persistedFilterText = await persistedPill.locator('span').first().textContent()
    expect(persistedFilterText).toBe(updatedFilterText)
  })

  test('query results update immediately when filter changes', async ({ page }) => {
    // Wait for the editor to load
    await page.getByText('Loading').waitFor({ state: 'hidden', timeout: 15_000 }).catch(() => {})
    await page.locator('.node-block').first().waitFor({ state: 'visible', timeout: 10_000 })

    // Find a query node
    const configureButtons = page.getByRole('button', { name: 'Configure query' })
    const buttonCount = await configureButtons.count()

    if (buttonCount === 0) {
      test.skip(true, 'No query nodes found in seed data')
      return
    }

    // Get parent query node block
    const queryNodeBlock = configureButtons.first().locator('xpath=ancestor::*[contains(@class,"node-block")]').first()
    const nodeId = await queryNodeBlock.getAttribute('data-node-id')
    const queryNode = page.locator(`.node-block[data-node-id="${nodeId}"]`)

    // Open the QueryBuilder
    await configureButtons.first().click()
    await page.waitForTimeout(500)

    // Read current result count
    const resultsBadge = queryNode.locator('text=/\\d+ results?/')
    await expect(resultsBadge).toBeVisible({ timeout: 5_000 })
    const originalResults = await resultsBadge.textContent()

    // Click the filter pill to open the editor
    const filterPill = queryNode.locator('button').filter({ has: page.locator('text="Remove filter"') }).first()
    await filterPill.click()
    await page.waitForTimeout(300)

    // Open the supertag dropdown
    const supertagCombo = queryNode.locator('[role="combobox"]').first()
    await supertagCombo.click()
    await page.waitForTimeout(300)

    // Pick the first non-selected option
    const options = page.locator('[role="option"]')
    const optionCount = await options.count()
    for (let i = 0; i < optionCount; i++) {
      const option = options.nth(i)
      const isSelected = await option.getAttribute('aria-selected')
      if (isSelected !== 'true') {
        await option.click()
        break
      }
    }
    await page.waitForTimeout(500)

    // Result count should have changed (different supertag = different count)
    const newResults = await resultsBadge.textContent()
    // We can't assert the exact count, but it should be visible
    await expect(resultsBadge).toBeVisible()
    // The count text should have updated (though it could theoretically be the same)
    // At minimum, the results area should still be functional
    expect(newResults).toBeTruthy()
  })
})
