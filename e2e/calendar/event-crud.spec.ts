import { test, expect } from '../fixtures/base.fixture.js'
import type { Page } from '@playwright/test'

const isGraphMode = process.env.ARCHITECTURE_TYPE === 'graph'

/**
 * Helper: ensure the calendar is showing the full calendar view (not empty state).
 * If the empty state is shown, creates a quick event so the full calendar renders.
 * Also handles transient error states by retrying via page reload.
 */
async function ensureCalendarVisible(page: Page) {
  const calendarContainer = page.locator('.nxus-calendar')
  const emptyState = page.locator('.calendar-empty')
  const errorState = page.getByText('Error loading calendar')

  await expect(calendarContainer.or(emptyState).or(errorState)).toBeVisible({
    timeout: 15000,
  })

  // If error state, retry by reloading
  if (await errorState.isVisible()) {
    await page.getByRole('button', { name: 'Try Again' }).click()
    await expect(calendarContainer.or(emptyState)).toBeVisible({ timeout: 15000 })
  }

  if (await emptyState.isVisible()) {
    await page.getByRole('button', { name: /New Event|Create Event/ }).first().click()
    const titleInput = page.locator('#event-title')
    await expect(titleInput).toBeVisible({ timeout: 5000 })
    await titleInput.fill('Bootstrap Event')
    await titleInput.press('Enter')
    await expect(titleInput).toBeHidden({ timeout: 10000 })
    await expect(calendarContainer).toBeVisible({ timeout: 15000 })
  }

  // Wait for loading overlay to disappear
  await waitForCalendarReady(page)
}

/**
 * Helper: wait for the calendar loading overlay to disappear
 */
async function waitForCalendarReady(page: Page) {
  const loadingOverlay = page.locator('.nxus-calendar .absolute.inset-0.z-10')
  // Wait for it to disappear (it may not be present at all — that's fine)
  await expect(loadingOverlay).toBeHidden({ timeout: 15000 }).catch(() => {
    // Overlay was never present — that's OK
  })
}

/**
 * Helper: format today's date as YYYY-MM-DD
 */
function todayDateString(): string {
  const now = new Date()
  const yyyy = now.getFullYear()
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

test.describe.serial('Calendar Event CRUD (CA4-CA7)', () => {
  test.skip(isGraphMode, 'Calendar tests require seed data (not available in graph mode)')
  const eventTitle = `E2E CRUD Event ${Date.now()}`
  const editedTitle = `${eventTitle} (edited)`

  test.beforeEach(async ({ navigateToApp }) => {
    await navigateToApp('calendar')
  })

  test('CA4 — Create event via New Event button', async ({ page }) => {
    // Ensure calendar is visible (may need to bootstrap)
    await ensureCalendarVisible(page)

    // Click the "New Event" header button to open create modal
    await page.getByRole('button', { name: 'New Event' }).click()

    // Wait for the create modal to open — title input visible
    const titleInput = page.locator('#event-title')
    await expect(titleInput).toBeVisible({ timeout: 5000 })

    // Verify modal has the expected title
    await expect(page.getByText('New Event').first()).toBeVisible()

    // Fill in the event title
    await titleInput.fill(eventTitle)

    // Set the start date to today
    const today = todayDateString()
    const startDateInput = page.locator('#event-start-date')
    await startDateInput.fill(today)

    // Set start time (10:00) and end time (11:00)
    const startTimeInput = page.locator('#event-start-time')
    const endTimeInput = page.locator('#event-end-time')

    await startTimeInput.fill('10:00')
    await endTimeInput.fill('11:00')

    // Click the "Create Event" submit button
    const submitButton = page.getByRole('button', { name: /Create Event/i })
    await expect(submitButton).toBeVisible()
    await submitButton.click()

    // Wait for modal to close (confirms creation succeeded)
    await expect(titleInput).toBeHidden({ timeout: 10000 })

    // Wait for the calendar to stabilize after the mutation refetch
    await ensureCalendarVisible(page)

    // Switch to Day view to ensure our event is visible on today's date
    await page.getByRole('button', { name: 'Day', exact: true }).click()

    // Wait for any loading overlay to clear after view switch
    await waitForCalendarReady(page)

    // Wait for the calendar to re-render and find the event
    const eventOnCalendar = page.locator('.rbc-event').filter({ hasText: eventTitle })
    await expect(eventOnCalendar.first()).toBeVisible({ timeout: 10000 })
  })

  test('CA5 — View event details', async ({ page }) => {
    // Navigate to Day view to find the event
    await ensureCalendarVisible(page)
    await page.getByRole('button', { name: 'Day', exact: true }).click()
    await waitForCalendarReady(page)

    // Find and click the event on the calendar
    const eventOnCalendar = page.locator('.rbc-event').filter({ hasText: eventTitle })
    await expect(eventOnCalendar.first()).toBeVisible({ timeout: 10000 })
    await eventOnCalendar.first().click()

    // Wait for the event detail modal to open
    // The modal shows the event title as an h2
    const modalTitle = page.locator('h2').filter({ hasText: eventTitle })
    await expect(modalTitle).toBeVisible({ timeout: 5000 })

    // Verify the modal shows time information (clock icon + date range text)
    // The date range format is "EEE, MMM d, yyyy · h:mm a - h:mm a"
    await expect(page.getByText(/10:00\s*AM\s*-\s*11:00\s*AM/i)).toBeVisible()

    // Verify action buttons are present
    await expect(
      page.getByRole('button', { name: /Delete/i })
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: /Edit/i })
    ).toBeVisible()

    // Close the modal by clicking the close button (X)
    await page.getByRole('button', { name: 'Close' }).click()
  })

  test('CA6 — Edit event', async ({ page }) => {
    // Navigate to Day view to find the event
    await ensureCalendarVisible(page)
    await page.getByRole('button', { name: 'Day', exact: true }).click()
    await waitForCalendarReady(page)

    // Find and click the event on the calendar
    const eventOnCalendar = page.locator('.rbc-event').filter({ hasText: eventTitle })
    await expect(eventOnCalendar.first()).toBeVisible({ timeout: 10000 })
    await eventOnCalendar.first().click()

    // Wait for the event detail modal to open (view mode)
    const modalTitle = page.locator('h2').filter({ hasText: eventTitle })
    await expect(modalTitle).toBeVisible({ timeout: 5000 })

    // Click the Edit button to switch to edit mode
    await page.getByRole('button', { name: /Edit/i }).click()

    // Verify the modal switches to edit mode — title input becomes visible
    const titleInput = page.locator('#event-title')
    await expect(titleInput).toBeVisible({ timeout: 5000 })

    // Verify the input is pre-populated with the current title
    await expect(titleInput).toHaveValue(eventTitle)

    // Clear and type a new title
    await titleInput.clear()
    await titleInput.fill(editedTitle)

    // Click "Save Changes"
    const saveButton = page.getByRole('button', { name: /Save Changes/i })
    await expect(saveButton).toBeVisible()
    await saveButton.click()

    // Wait for the modal to return to view mode (the edit form disappears)
    // After saving, the modal switches back to view mode
    await expect(titleInput).toBeHidden({ timeout: 10000 })

    // Close the modal — the selectedEvent prop in the parent may still hold
    // stale data until the query refetch completes, so verify on the calendar instead
    await page.getByRole('button', { name: 'Close' }).click()

    // Wait for any refetch to complete
    await waitForCalendarReady(page)

    // Verify the updated title appears on the calendar grid
    const updatedEventOnCalendar = page.locator('.rbc-event').filter({ hasText: editedTitle })
    await expect(updatedEventOnCalendar.first()).toBeVisible({ timeout: 15000 })
  })

  test('CA7 — Delete event', async ({ page }) => {
    // Navigate to Day view to find the edited event
    await ensureCalendarVisible(page)
    await page.getByRole('button', { name: 'Day', exact: true }).click()
    await waitForCalendarReady(page)

    // Find and click the event on the calendar (using the edited title)
    const eventOnCalendar = page.locator('.rbc-event').filter({ hasText: editedTitle })
    await expect(eventOnCalendar.first()).toBeVisible({ timeout: 10000 })
    await eventOnCalendar.first().click()

    // Wait for the event detail modal to open
    const modalTitle = page.locator('h2').filter({ hasText: editedTitle })
    await expect(modalTitle).toBeVisible({ timeout: 5000 })

    // Click the Delete button (this shows the confirmation overlay)
    await page.getByRole('button', { name: /Delete/i }).first().click()

    // Verify the delete confirmation overlay appears
    await expect(page.getByText(/Delete Event\?/i)).toBeVisible({ timeout: 5000 })
    // Confirmation message includes the event title in quotes
    await expect(
      page.getByText(new RegExp(`Are you sure you want to delete.*${editedTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`))
    ).toBeVisible()

    // Confirm deletion by clicking the destructive "Delete" button in the overlay
    // The overlay has Cancel and Delete buttons — click the destructive Delete
    const deleteConfirmButton = page
      .getByRole('button', { name: 'Delete', exact: true })
      .last()
    await deleteConfirmButton.click()

    // Wait for the modal to close (confirms deletion succeeded)
    await expect(modalTitle).toBeHidden({ timeout: 10000 })

    // Verify the event is removed from the calendar
    // After deletion the page might show calendar or empty state
    const calendarContainer = page.locator('.nxus-calendar')
    const emptyState = page.locator('.calendar-empty')
    await expect(calendarContainer.or(emptyState)).toBeVisible({ timeout: 15000 })

    // If calendar is still visible, the deleted event should not be on it
    if (await calendarContainer.isVisible()) {
      const removedEvent = page.locator('.rbc-event').filter({ hasText: editedTitle })
      await expect(removedEvent).toHaveCount(0, { timeout: 10000 })
    }
    // If empty state is visible, that also confirms the event was deleted
  })
})
