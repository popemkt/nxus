import { createFileRoute } from '@tanstack/react-router'
import { CalendarRoute } from '@nxus/calendar'

export const Route = createFileRoute('/calendar')({
  component: CalendarPage,
})

function CalendarPage() {
  // For now, we render the CalendarRoute without create/edit modals
  // Those will be added in the "Event Creation Modal" and "Event Detail Modal" steps
  return (
    <CalendarRoute
      showBackButton
      backUrl="/"
      // Placeholder handlers - will be implemented in later steps
      // onCreateEvent={(slot) => console.log('Create event at:', slot)}
      // onSelectEvent={(event) => console.log('Selected event:', event)}
      // onSettingsClick={() => console.log('Settings clicked')}
      // onSyncClick={() => console.log('Sync clicked')}
    />
  )
}
