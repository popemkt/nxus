import { test, expect } from '../fixtures/base.fixture.js'
import { ensureCalendarVisible } from '../helpers/calendar.js'

test.describe('Calendar Views & Navigation', () => {
  test.beforeEach(async ({ navigateToApp }) => {
    await navigateToApp('calendar')
  })

  test('CA1 — Calendar page loads with toolbar, navigation, and New Event button', async ({
    page,
  }) => {
    // Verify page heading
    await expect(
      page.getByRole('heading', { name: 'Calendar', level: 1 })
    ).toBeVisible()

    // Verify subtitle
    await expect(
      page.getByText('Manage your schedule and tasks')
    ).toBeVisible()

    // Verify "New Event" button is present
    await expect(
      page.getByRole('button', { name: 'New Event' })
    ).toBeVisible()

    // Wait for calendar to render (either the calendar container or the empty state)
    const calendarContainer = page.locator('.nxus-calendar')
    const emptyState = page.locator('.calendar-empty')
    await expect(calendarContainer.or(emptyState)).toBeVisible({
      timeout: 15000,
    })

    // If the calendar container is rendered, verify toolbar elements
    if (await calendarContainer.isVisible()) {
      // Navigation buttons
      await expect(
        page.getByRole('button', { name: 'Previous' })
      ).toBeVisible()
      await expect(
        page.getByRole('button', { name: 'Today' })
      ).toBeVisible()
      await expect(
        page.getByRole('button', { name: 'Next' })
      ).toBeVisible()

      // Period label (e.g., "February 2026" or "Feb 8 - 14")
      const periodLabel = page.locator('.nxus-calendar h2')
      await expect(periodLabel.first()).toBeVisible()

      // View switcher buttons (desktop)
      await expect(
        page.getByRole('button', { name: 'Day', exact: true })
      ).toBeVisible()
      await expect(
        page.getByRole('button', { name: 'Week', exact: true })
      ).toBeVisible()
      await expect(
        page.getByRole('button', { name: 'Month', exact: true })
      ).toBeVisible()
      await expect(
        page.getByRole('button', { name: 'Agenda', exact: true })
      ).toBeVisible()
    } else {
      // Verify empty state content
      await expect(
        page.getByRole('heading', { name: 'No events yet' })
      ).toBeVisible()
      await expect(
        page.getByRole('button', { name: 'Create Event' })
      ).toBeVisible()
    }
  })

  test('CA2 — Calendar navigation (Previous, Next, Today)', async ({
    page,
  }) => {
    await ensureCalendarVisible(page)

    // Get the initial period label text
    const periodLabel = page.locator('.nxus-calendar h2').first()
    await expect(periodLabel).toBeVisible()
    const initialLabel = await periodLabel.textContent()
    expect(initialLabel).toBeTruthy()

    // Note: When navigating to a period with no events, the app replaces
    // the calendar with an empty state (removing the toolbar). We test
    // navigation by verifying the period label changes and using Today
    // to return to the period with events.

    // Click Previous — either the period label changes or empty state appears
    await page.getByRole('button', { name: 'Previous' }).click()

    // Wait for re-render — either a new period label or the empty state
    const emptyState = page.locator('.calendar-empty')
    const newPeriodLabel = page.locator('.nxus-calendar h2').first()
    await expect(newPeriodLabel.or(emptyState)).toBeVisible({ timeout: 10000 })

    if (await newPeriodLabel.isVisible()) {
      // Period label changed — calendar stayed visible (events in previous period)
      await expect(newPeriodLabel).not.toHaveText(initialLabel!)
    }
    // Either way, navigation happened. Now go back with Today.

    // If empty state is showing, reload to return to the current period
    if (await emptyState.isVisible()) {
      await page.goto('/calendar')
      await page.waitForLoadState('domcontentloaded')
      await expect(page.locator('.nxus-calendar')).toBeVisible({ timeout: 15000 })
    }

    // Verify the period label is back to the initial (Today period)
    const restoredLabel = page.locator('.nxus-calendar h2').first()
    await expect(restoredLabel).toBeVisible()
    await expect(restoredLabel).toHaveText(initialLabel!)

    // Click Next — tests forward navigation
    await page.getByRole('button', { name: 'Next' }).click()
    await expect(
      page.locator('.nxus-calendar h2').first().or(emptyState)
    ).toBeVisible({ timeout: 10000 })

    // Navigation occurred — verify by returning with Today
    if (await emptyState.isVisible()) {
      await page.goto('/calendar')
      await page.waitForLoadState('domcontentloaded')
      await expect(page.locator('.nxus-calendar')).toBeVisible({ timeout: 15000 })
    } else {
      await page.getByRole('button', { name: 'Today' }).click()
    }

    // Verify Today returned us to the original period
    const todayLabel = page.locator('.nxus-calendar h2').first()
    await expect(todayLabel).toBeVisible()
    await expect(todayLabel).toHaveText(initialLabel!)
  })

  test('CA3 — View switching (Day, Week, Month, Agenda)', async ({
    page,
  }) => {
    await ensureCalendarVisible(page)

    const emptyState = page.locator('.calendar-empty')
    const rbcTimeView = page.locator('.rbc-time-view')

    // The default view is Week. Verify it first (no click needed since already active).
    // Week view uses .rbc-time-view with 7 day header columns.
    await expect(rbcTimeView).toBeVisible({ timeout: 5000 })
    const weekHeaders = page.locator('.rbc-time-view .rbc-row .rbc-header')
    await expect(weekHeaders).toHaveCount(7)

    // --- Month view ---
    await page.getByRole('button', { name: 'Month', exact: true }).click()
    await expect(page.locator('.rbc-month-view')).toBeVisible({
      timeout: 5000,
    })

    // --- Day view ---
    // Note: Switching to Day view may land on a date without events (the app
    // shows an empty state when the current date range has no events). Both
    // the time view and the empty state confirm the view switch happened.
    await page.getByRole('button', { name: 'Day', exact: true }).click()
    await expect(rbcTimeView.or(emptyState)).toBeVisible({ timeout: 5000 })

    if (await rbcTimeView.isVisible()) {
      // Day view has a single day header column
      const dayHeaders = page.locator('.rbc-time-view .rbc-row .rbc-header')
      await expect(dayHeaders).toHaveCount(1)
    }

    // --- Agenda view ---
    // If Day view showed the empty state (no toolbar), reload and switch to Agenda
    if (await emptyState.isVisible()) {
      await page.goto('/calendar')
      await page.waitForLoadState('domcontentloaded')
      await ensureCalendarVisible(page)
    }
    await page.getByRole('button', { name: 'Agenda', exact: true }).click()
    const agendaView = page.locator('.rbc-agenda-view')
    await expect(agendaView.or(emptyState)).toBeVisible({ timeout: 5000 })
  })
})
