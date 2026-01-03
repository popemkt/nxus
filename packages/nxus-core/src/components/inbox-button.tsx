import { Link } from '@tanstack/react-router'
import { TrayIcon } from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import { getPendingInboxItemsServerFn } from '@/services/inbox/inbox.server'

/**
 * Inbox button with badge showing pending item count
 * Used in the header for quick access to inbox
 */
export function InboxButton() {
  const { data: result, isLoading } = useQuery({
    queryKey: ['inbox-pending-count'],
    queryFn: async () => {
      return await getPendingInboxItemsServerFn()
    },
    staleTime: 30000, // 30 seconds
    refetchInterval: 60000, // 1 minute
  })

  const pendingCount = result?.success ? result.data.length : 0

  return (
    <Link
      to="/inbox"
      className="relative rounded-md p-2 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
      title={`Inbox${pendingCount > 0 ? ` (${pendingCount} pending)` : ''}`}
    >
      <TrayIcon className="h-5 w-5" />

      {/* Loading pulse indicator */}
      {isLoading && (
        <span className="absolute -top-0.5 -right-0.5 flex h-3 w-3">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-muted-foreground/40" />
          <span className="relative inline-flex rounded-full h-3 w-3 bg-muted-foreground/30" />
        </span>
      )}

      {/* Pending count badge */}
      {!isLoading && pendingCount > 0 && (
        <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground px-1 animate-fade-in">
          {pendingCount > 9 ? '9+' : pendingCount}
        </span>
      )}
    </Link>
  )
}
