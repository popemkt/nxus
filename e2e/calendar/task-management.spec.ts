import { test, expect } from '../fixtures/base.fixture.js'
import type { Page } from '@playwright/test'

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

test.describe.serial('Calendar Task Management (CA8-CA9)', () => {
  const taskTitle = `E2E Task ${Date.now()}`

  test.beforeEach(async ({ navigateToApp }) => {
    await navigateToApp('calendar')
  })

  test('CA8 — Create task via New Event button with Task toggle', async ({ page }) => {
    await ensureCalendarVisible(page)

    // Open the create modal
    await page.getByRole('button', { name: 'New Event' }).click()

    // Wait for the modal to appear
    const titleInput = page.locator('#event-title')
    await expect(titleInput).toBeVisible({ timeout: 5000 })

    // Verify the modal defaults to "New Event" mode
    await expect(page.getByText('New Event').first()).toBeVisible()

    // Click the "Task" toggle button to switch to task mode
    await page.getByRole('button', { name: 'Task', exact: true }).click()

    // Verify modal title changes to "New Task"
    await expect(page.getByText('New Task').first()).toBeVisible()

    // Verify the placeholder changes for task mode
    await expect(titleInput).toHaveAttribute('placeholder', 'Task title...')

    // Fill in the task title
    await titleInput.fill(taskTitle)

    // Set the start date to today
    const today = todayDateString()
    await page.locator('#event-start-date').fill(today)

    // Set start time and end time
    await page.locator('#event-start-time').fill('09:00')
    await page.locator('#event-end-time').fill('10:00')

    // Verify the submit button says "Create Task"
    const submitButton = page.getByRole('button', { name: /Create Task/i })
    await expect(submitButton).toBeVisible()

    // Submit the form
    await submitButton.click()

    // Wait for modal to close (confirms creation succeeded)
    await expect(titleInput).toBeHidden({ timeout: 10000 })

    // Wait for the calendar to stabilize after the mutation refetch
    await ensureCalendarVisible(page)

    // Switch to Day view to ensure our task is visible on today's date
    await page.getByRole('button', { name: 'Day', exact: true }).click()
    await waitForCalendarReady(page)

    // Verify the task appears on the calendar with the task data attribute
    const taskOnCalendar = page.locator('.rbc-event').filter({ hasText: taskTitle })
    await expect(taskOnCalendar.first()).toBeVisible({ timeout: 10000 })

    // Verify it's marked as a task (data-event-type="task" on .rbc-event-content)
    const taskContent = taskOnCalendar.first().locator('[data-event-type="task"]')
    await expect(taskContent).toBeVisible()

    // Verify the task checkbox is present within the event
    const taskCheckbox = taskOnCalendar.first().locator('.task-checkbox')
    await expect(taskCheckbox).toBeVisible()
  })

  test('CA9 — Complete task via event detail modal', async ({ page }) => {
    await ensureCalendarVisible(page)

    // Switch to Day view to find the task
    await page.getByRole('button', { name: 'Day', exact: true }).click()
    await waitForCalendarReady(page)

    // Find and click the task event to open the detail modal
    const taskOnCalendar = page.locator('.rbc-event').filter({ hasText: taskTitle })
    await expect(taskOnCalendar.first()).toBeVisible({ timeout: 10000 })
    await taskOnCalendar.first().click()

    // Wait for the event detail modal to open
    const modalTitle = page.locator('h2').filter({ hasText: taskTitle })
    await expect(modalTitle).toBeVisible({ timeout: 5000 })

    // The modal should show a task completion checkbox — a <button> element
    // sitting to the left of the h2 title in the modal. It's a plain button
    // styled as a rounded checkbox, not role="checkbox".
    const titleContainer = modalTitle.locator('..')
    const modalCheckbox = titleContainer.locator('button').first()
    await expect(modalCheckbox).toBeVisible()

    // The title should NOT have strikethrough yet (task not completed)
    await expect(modalTitle).not.toHaveClass(/line-through/)

    // Click the modal checkbox to complete the task
    await modalCheckbox.click()

    // Close the modal — the modal event state may not refresh immediately
    // after the mutation, so we verify completion on the calendar instead.
    await page.getByRole('button', { name: 'Close' }).click()

    // Wait for the calendar to refetch and update
    await waitForCalendarReady(page)

    // Verify the task on the calendar now has the completed data attribute
    const completedTask = page
      .locator('.rbc-event')
      .filter({ hasText: taskTitle })
      .first()
      .locator('[data-completed="true"]')
    await expect(completedTask).toBeVisible({ timeout: 15000 })

    // Also verify the inline checkbox is now checked
    const inlineCheckbox = page
      .locator('.rbc-event')
      .filter({ hasText: taskTitle })
      .first()
      .locator('.task-checkbox[data-checked="true"]')
    await expect(inlineCheckbox).toBeVisible({ timeout: 5000 })
  })
})

test.describe('Calendar Recurring Events (CA10)', () => {
  const recurringTitle = `E2E Recurring ${Date.now()}`

  test.beforeEach(async ({ navigateToApp }) => {
    await navigateToApp('calendar')
  })

  test('CA10 — Create recurring event with daily preset', async ({ page }) => {
    await ensureCalendarVisible(page)

    // Open the create modal
    await page.getByRole('button', { name: 'New Event' }).click()

    const titleInput = page.locator('#event-title')
    await expect(titleInput).toBeVisible({ timeout: 5000 })

    // Fill in the event title
    await titleInput.fill(recurringTitle)

    // Set the start date to today
    const today = todayDateString()
    await page.locator('#event-start-date').fill(today)

    // Set start time and end time
    await page.locator('#event-start-time').fill('14:00')
    await page.locator('#event-end-time').fill('15:00')

    // Find the Repeat / recurrence dropdown — it defaults to "Does not repeat"
    // The recurrence selector is labelled "Repeat" and contains a Select with
    // a trigger that shows the current value
    const repeatSection = page.getByText('Repeat').locator('..')
    const repeatTrigger = repeatSection.locator('[role="combobox"]')
    await expect(repeatTrigger).toBeVisible()

    // Open the recurrence preset dropdown
    await repeatTrigger.click()

    // Select "Daily" from the dropdown options
    await page.getByRole('option', { name: 'Daily' }).click()

    // Verify the dropdown now shows "Daily"
    await expect(repeatTrigger).toHaveText(/Daily/)

    // Create the event
    const submitButton = page.getByRole('button', { name: /Create Event/i })
    await expect(submitButton).toBeVisible()
    await submitButton.click()

    // Wait for modal to close
    await expect(titleInput).toBeHidden({ timeout: 10000 })

    // Wait for calendar to stabilize
    await ensureCalendarVisible(page)

    // Switch to Day view to verify the event appears today
    await page.getByRole('button', { name: 'Day', exact: true }).click()
    await waitForCalendarReady(page)

    // Verify the recurring event appears on the calendar
    const eventOnCalendar = page.locator('.rbc-event').filter({ hasText: recurringTitle })
    await expect(eventOnCalendar.first()).toBeVisible({ timeout: 10000 })

    // Verify it has the recurring data attribute (confirms rrule was saved)
    const recurringContent = eventOnCalendar.first().locator('[data-recurring="true"]')
    await expect(recurringContent).toBeVisible()

    // Switch to Agenda view — it shows all events in a flat list without
    // overflow truncation, making it reliable for counting recurring instances.
    await page.getByRole('button', { name: 'Agenda', exact: true }).click()
    await waitForCalendarReady(page)

    // Wait for the agenda view to render
    const agendaView = page.locator('.rbc-agenda-view')
    await expect(agendaView).toBeVisible({ timeout: 10000 })

    // In agenda view, a daily recurring event should appear on multiple days.
    // The agenda shows events as rows with text content.
    const agendaEvents = agendaView.getByText(recurringTitle)
    const eventCount = await agendaEvents.count()
    expect(eventCount).toBeGreaterThan(1)
  })
})
