import { createFileRoute } from '@tanstack/react-router'
import { CalendarRoute } from '@nxus/calendar'
// Import Google sync hook from server entry to avoid bundling googleapis on client
import { useGoogleCalendarSync } from '@nxus/calendar/server'

export const Route = createFileRoute('/calendar')({
  component: CalendarPage,
})

function CalendarPage() {
  // Google Calendar sync integration
  const {
    isConnected,
    isSyncing,
    pendingCount,
    connectedEmail,
    statusError,
    sync,
    connect,
  } = useGoogleCalendarSync({
    onSyncSuccess: (result) => {
      console.log('Sync completed:', result.syncedCount, 'events synced')
    },
    onSyncError: (error) => {
      console.error('Sync failed:', error.message)
    },
  })

  // Handle sync button click
  const handleSyncClick = async () => {
    if (isConnected) {
      await sync()
    } else {
      await connect()
    }
  }

  return (
    <CalendarRoute
      showBackButton
      backUrl="/"
      // Google sync props
      isGoogleConnected={isConnected}
      isSyncing={isSyncing}
      onSyncClick={handleSyncClick}
      // onSettingsClick={() => console.log('Settings clicked')}
    />
  )
}
