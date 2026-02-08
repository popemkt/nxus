import { createFileRoute } from '@tanstack/react-router'
import { CalendarRoute } from '@nxus/calendar'
// Import Google sync hook from server entry to avoid bundling googleapis on client
import { useGoogleCalendarSync } from '@nxus/calendar/server'
import { HouseIcon } from '@phosphor-icons/react'

export const Route = createFileRoute('/')({
  component: CalendarPage,
})

function CalendarPage() {
  // Google Calendar sync integration
  const {
    isConnected,
    isSyncing,
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
    <div className="relative">
      {/* Home button - navigates to gateway (cross-app, uses <a> not <Link>) */}
      <a
        href="/"
        className="fixed top-4 left-4 z-50 flex size-9 items-center justify-center rounded-full bg-background/85 backdrop-blur-xl border border-foreground/10 text-muted-foreground hover:text-foreground hover:bg-background transition-colors shadow-sm no-underline"
        title="Home"
      >
        <HouseIcon className="size-4" />
      </a>
      <CalendarRoute
        showBackButton={false}
        // Google sync props
        isGoogleConnected={isConnected}
        isSyncing={isSyncing}
        onSyncClick={handleSyncClick}
      />
    </div>
  )
}
