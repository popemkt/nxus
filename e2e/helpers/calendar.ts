import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'

/**
 * Ensure the calendar is showing the full calendar view (not empty state).
 * If the empty state is shown, creates a quick event so the full calendar renders.
 * Also handles transient error states by retrying once.
 */
export async function ensureCalendarVisible(page: Page) {
  const calendarContainer = page.locator('.nxus-calendar')
  const emptyState = page.locator('.calendar-empty')
  const errorState = page.getByText('Error loading calendar')

  await expect(calendarContainer.or(emptyState).or(errorState)).toBeVisible({
    timeout: 15000,
  })

  // If error state, reload and retry once
  if (await errorState.isVisible()) {
    await page.reload()
    await page.waitForLoadState('domcontentloaded')
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

  await waitForCalendarReady(page)
}

/**
 * Wait for the calendar loading overlay to disappear.
 */
export async function waitForCalendarReady(page: Page) {
  const loadingOverlay = page.locator('.nxus-calendar .absolute.inset-0.z-10')
  // Wait for it to disappear (it may not be present at all — that's fine)
  await expect(loadingOverlay).toBeHidden({ timeout: 15000 }).catch(() => {
    // Overlay was never present — that's OK
  })
}

/**
 * Format today's date as YYYY-MM-DD.
 */
export function todayDateString(): string {
  const now = new Date()
  const yyyy = now.getFullYear()
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

/**
 * Create an event on the calendar and return its title.
 * Assumes the calendar is already visible. Leaves the page on the calendar view.
 */
export async function createEvent(
  page: Page,
  options: {
    title: string
    startTime?: string
    endTime?: string
    isTask?: boolean
  }
) {
  const { title, startTime = '10:00', endTime = '11:00', isTask = false } = options

  await page.getByRole('button', { name: 'New Event' }).click()

  const titleInput = page.locator('#event-title')
  await expect(titleInput).toBeVisible({ timeout: 5000 })

  if (isTask) {
    await page.getByRole('button', { name: 'Task', exact: true }).click()
  }

  await titleInput.fill(title)

  const today = todayDateString()
  await page.locator('#event-start-date').fill(today)
  await page.locator('#event-start-time').fill(startTime)
  await page.locator('#event-end-time').fill(endTime)

  const submitButton = page.getByRole('button', {
    name: isTask ? /Create Task/i : /Create Event/i,
  })
  await expect(submitButton).toBeVisible()
  await submitButton.click()

  // Wait for modal to close (confirms creation succeeded)
  await expect(titleInput).toBeHidden({ timeout: 10000 })

  // Wait for calendar to stabilize after mutation refetch
  await ensureCalendarVisible(page)
}

/**
 * Navigate to Day view and find an event by title. Returns the event locator.
 */
export async function findEventOnDayView(page: Page, title: string) {
  await page.getByRole('button', { name: 'Day', exact: true }).click()
  await waitForCalendarReady(page)

  const eventOnCalendar = page.locator('.rbc-event').filter({ hasText: title })
  await expect(eventOnCalendar.first()).toBeVisible({ timeout: 10000 })
  return eventOnCalendar
}
