/**
 * use-google-sync.ts - React hooks for Google Calendar sync operations
 *
 * Provides TanStack Query-based hooks for:
 * - Checking Google Calendar connection status
 * - Connecting/disconnecting Google account
 * - Syncing events to Google Calendar
 * - Selecting target calendar
 *
 * All operations use the server functions from google-sync.server.ts
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo } from 'react'
// Import directly from the google-sync server file to avoid
// bundling googleapis (Node.js-only) into the client bundle.
// These hooks should only be imported from the server entry point.
import {
  getGoogleAuthUrlServerFn,
  handleGoogleCallbackServerFn,
  getGoogleSyncStatusServerFn,
  syncToGoogleCalendarServerFn,
  disconnectGoogleCalendarServerFn,
  getGoogleCalendarsServerFn,
  setGoogleCalendarIdServerFn,
} from '../server/google-sync.server.js'
import type {
  SyncStatusInfo,
  SyncResult,
  GoogleCalendarInfo,
  CalendarSyncStatus,
} from '../types/google-sync.js'

// ============================================================================
// Query Keys
// ============================================================================

export const googleSyncKeys = {
  all: ['google-sync'] as const,
  status: () => [...googleSyncKeys.all, 'status'] as const,
  calendars: () => [...googleSyncKeys.all, 'calendars'] as const,
  authUrl: () => [...googleSyncKeys.all, 'auth-url'] as const,
}

// ============================================================================
// Types
// ============================================================================

export interface UseGoogleSyncStatusOptions {
  /** Whether to enable the query */
  enabled?: boolean

  /** Polling interval in milliseconds (0 = no polling) */
  pollInterval?: number
}

export interface UseGoogleSyncStatusResult {
  /** Current sync status info */
  status: SyncStatusInfo | null

  /** Whether connected to Google */
  isConnected: boolean

  /** Connected Google email */
  connectedEmail: string | undefined

  /** Current sync state */
  syncState: CalendarSyncStatus

  /** Number of events pending sync */
  pendingCount: number

  /** Error message if any */
  errorMessage: string | undefined

  /** Whether the query is loading */
  isLoading: boolean

  /** Whether the query is fetching (including background refetch) */
  isFetching: boolean

  /** Whether the query errored */
  isError: boolean

  /** Query error */
  error: Error | null

  /** Refetch the status */
  refetch: () => void
}

export interface UseGoogleSyncOptions {
  /** Callbacks for sync completion */
  onSuccess?: (result: SyncResult) => void
  onError?: (error: Error) => void
}

export interface UseGoogleSyncResult {
  /** Sync events to Google Calendar */
  sync: (options?: {
    eventIds?: string[]
    calendarId?: string
    force?: boolean
  }) => Promise<SyncResult>

  /** Whether a sync is in progress */
  isSyncing: boolean

  /** Last sync result */
  lastResult: SyncResult | null

  /** Sync error */
  error: Error | null

  /** Reset the mutation state */
  reset: () => void
}

export interface UseGoogleConnectResult {
  /** Start OAuth flow - returns URL to redirect to. Generates and stores a CSRF state token in localStorage. */
  getAuthUrl: () => Promise<string | null>

  /** Complete OAuth flow with authorization code */
  completeAuth: (code: string) => Promise<{ email?: string } | null>

  /** Disconnect Google account */
  disconnect: () => Promise<void>

  /** Whether any operation is in progress */
  isLoading: boolean

  /** Whether getting auth URL */
  isGettingAuthUrl: boolean

  /** Whether completing auth */
  isCompletingAuth: boolean

  /** Whether disconnecting */
  isDisconnecting: boolean

  /** Error from operations */
  error: Error | null
}

export interface UseGoogleCalendarsResult {
  /** List of available calendars */
  calendars: GoogleCalendarInfo[]

  /** Set the target calendar for sync */
  setCalendar: (calendarId: string) => Promise<void>

  /** Whether the query is loading */
  isLoading: boolean

  /** Whether setting calendar */
  isSetting: boolean

  /** Query/mutation error */
  error: Error | null

  /** Refetch calendars */
  refetch: () => void
}

// ============================================================================
// useGoogleSyncStatus Hook
// ============================================================================

/**
 * Hook for monitoring Google Calendar sync status
 *
 * @param options - Query options
 * @returns Sync status and helper flags
 *
 * @example
 * ```tsx
 * const { isConnected, syncState, pendingCount } = useGoogleSyncStatus()
 *
 * if (!isConnected) {
 *   return <ConnectGoogleButton />
 * }
 *
 * return <div>Pending: {pendingCount} events</div>
 * ```
 */
export function useGoogleSyncStatus(
  options: UseGoogleSyncStatusOptions = {}
): UseGoogleSyncStatusResult {
  const { enabled = true, pollInterval = 0 } = options

  const query = useQuery({
    queryKey: googleSyncKeys.status(),
    queryFn: async () => {
      const result = await getGoogleSyncStatusServerFn()
      if (!result.success) {
        throw new Error(result.error ?? 'Failed to get sync status')
      }
      return result.data ?? null
    },
    enabled,
    refetchInterval: pollInterval > 0 ? pollInterval : false,
    staleTime: 30000, // Consider data stale after 30 seconds
  })

  const status = query.data ?? null

  return {
    status,
    isConnected: !!status?.connectedEmail && status.status !== 'error',
    connectedEmail: status?.connectedEmail,
    syncState: status?.status ?? 'idle',
    pendingCount: status?.pendingCount ?? 0,
    errorMessage: status?.errorMessage,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error as Error | null,
    refetch: query.refetch,
  }
}

// ============================================================================
// useGoogleSync Hook
// ============================================================================

/**
 * Hook for syncing events to Google Calendar
 *
 * @param options - Sync callbacks
 * @returns Sync function and state
 *
 * @example
 * ```tsx
 * const { sync, isSyncing } = useGoogleSync({
 *   onSuccess: (result) => toast.success(`Synced ${result.syncedCount} events`),
 * })
 *
 * <Button onClick={() => sync()} disabled={isSyncing}>
 *   {isSyncing ? 'Syncing...' : 'Sync'}
 * </Button>
 * ```
 */
export function useGoogleSync(
  options: UseGoogleSyncOptions = {}
): UseGoogleSyncResult {
  const { onSuccess, onError } = options
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (params?: {
      eventIds?: string[]
      calendarId?: string
      force?: boolean
    }) => {
      const result = await syncToGoogleCalendarServerFn({
        data: {
          eventIds: params?.eventIds,
          calendarId: params?.calendarId,
          force: params?.force,
        },
      })

      if (!result.success || !result.data) {
        throw new Error(result.error ?? 'Sync failed')
      }

      return result.data
    },
    onSuccess: (data) => {
      // Invalidate sync status to show updated counts
      queryClient.invalidateQueries({
        queryKey: googleSyncKeys.status(),
      })

      // Invalidate calendar events to refresh sync indicators
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey
          return Array.isArray(key) && key[0] === 'calendar-events'
        },
      })

      onSuccess?.(data)
    },
    onError: (error) => {
      onError?.(error as Error)
    },
  })

  return {
    sync: mutation.mutateAsync,
    isSyncing: mutation.isPending,
    lastResult: mutation.data ?? null,
    error: mutation.error as Error | null,
    reset: mutation.reset,
  }
}

// ============================================================================
// useGoogleConnect Hook
// ============================================================================

/**
 * Hook for connecting/disconnecting Google account
 *
 * @returns Connection functions and state
 *
 * @example
 * ```tsx
 * const { getAuthUrl, disconnect, isLoading } = useGoogleConnect()
 *
 * const handleConnect = async () => {
 *   const url = await getAuthUrl()
 *   if (url) window.location.href = url
 * }
 * ```
 */
export function useGoogleConnect(): UseGoogleConnectResult {
  const queryClient = useQueryClient()

  // Get auth URL mutation
  const authUrlMutation = useMutation({
    mutationFn: async () => {
      // Generate CSRF state token and store in localStorage for validation on callback
      const state = crypto.randomUUID()
      localStorage.setItem('oauth_state', state)

      const result = await getGoogleAuthUrlServerFn({ data: { state } })
      if (!result.success) {
        localStorage.removeItem('oauth_state')
        throw new Error(result.error ?? 'Failed to get auth URL')
      }
      return result.url ?? null
    },
  })

  // Complete auth mutation
  const completeAuthMutation = useMutation({
    mutationFn: async (code: string) => {
      const result = await handleGoogleCallbackServerFn({ data: { code } })
      if (!result.success) {
        throw new Error(result.error ?? 'Failed to complete authentication')
      }
      return { email: result.email }
    },
    onSuccess: () => {
      // Invalidate sync status to reflect connected state
      queryClient.invalidateQueries({
        queryKey: googleSyncKeys.status(),
      })
      // Also fetch calendars list
      queryClient.invalidateQueries({
        queryKey: googleSyncKeys.calendars(),
      })
    },
  })

  // Disconnect mutation
  const disconnectMutation = useMutation({
    mutationFn: async () => {
      const result = await disconnectGoogleCalendarServerFn()
      if (!result.success) {
        throw new Error(result.error ?? 'Failed to disconnect')
      }
    },
    onSuccess: () => {
      // Invalidate sync status to reflect disconnected state
      queryClient.invalidateQueries({
        queryKey: googleSyncKeys.status(),
      })
      // Clear calendars cache
      queryClient.removeQueries({
        queryKey: googleSyncKeys.calendars(),
      })
    },
  })

  const error =
    (authUrlMutation.error as Error | null) ??
    (completeAuthMutation.error as Error | null) ??
    (disconnectMutation.error as Error | null)

  return {
    getAuthUrl: authUrlMutation.mutateAsync,
    completeAuth: completeAuthMutation.mutateAsync,
    disconnect: disconnectMutation.mutateAsync,
    isLoading:
      authUrlMutation.isPending ||
      completeAuthMutation.isPending ||
      disconnectMutation.isPending,
    isGettingAuthUrl: authUrlMutation.isPending,
    isCompletingAuth: completeAuthMutation.isPending,
    isDisconnecting: disconnectMutation.isPending,
    error,
  }
}

// ============================================================================
// useGoogleCalendars Hook
// ============================================================================

/**
 * Hook for listing and selecting Google Calendars
 *
 * @returns Calendars list and selection function
 *
 * @example
 * ```tsx
 * const { calendars, setCalendar, isLoading } = useGoogleCalendars()
 *
 * return (
 *   <select onChange={(e) => setCalendar(e.target.value)}>
 *     {calendars.map((cal) => (
 *       <option key={cal.id} value={cal.id}>{cal.summary}</option>
 *     ))}
 *   </select>
 * )
 * ```
 */
export function useGoogleCalendars(): UseGoogleCalendarsResult {
  const queryClient = useQueryClient()

  // Query for calendars list
  const query = useQuery({
    queryKey: googleSyncKeys.calendars(),
    queryFn: async () => {
      const result = await getGoogleCalendarsServerFn()
      if (!result.success) {
        throw new Error(result.error ?? 'Failed to get calendars')
      }
      return result.calendars ?? []
    },
    staleTime: 60000, // Calendars don't change often
  })

  // Mutation for setting calendar
  const setCalendarMutation = useMutation({
    mutationFn: async (calendarId: string) => {
      const result = await setGoogleCalendarIdServerFn({ data: { calendarId } })
      if (!result.success) {
        throw new Error(result.error ?? 'Failed to set calendar')
      }
    },
    onSuccess: () => {
      // Invalidate sync status to reflect new calendar
      queryClient.invalidateQueries({
        queryKey: googleSyncKeys.status(),
      })
    },
  })

  return {
    calendars: query.data ?? [],
    setCalendar: setCalendarMutation.mutateAsync,
    isLoading: query.isLoading,
    isSetting: setCalendarMutation.isPending,
    error:
      (query.error as Error | null) ??
      (setCalendarMutation.error as Error | null),
    refetch: query.refetch,
  }
}

// ============================================================================
// Combined Hook
// ============================================================================

export interface UseGoogleCalendarSyncOptions {
  /** Polling interval for status in milliseconds (0 = no polling) */
  statusPollInterval?: number

  /** Callbacks for sync operations */
  onSyncSuccess?: (result: SyncResult) => void
  onSyncError?: (error: Error) => void
}

export interface UseGoogleCalendarSyncResult {
  // Status
  isConnected: boolean
  connectedEmail: string | undefined
  syncState: CalendarSyncStatus
  pendingCount: number
  statusError: string | undefined

  // Sync
  sync: (options?: {
    eventIds?: string[]
    calendarId?: string
    force?: boolean
  }) => Promise<SyncResult>
  isSyncing: boolean
  lastSyncResult: SyncResult | null

  // Connection
  connect: () => Promise<void>
  disconnect: () => Promise<void>
  isConnecting: boolean
  isDisconnecting: boolean

  // Calendars
  calendars: GoogleCalendarInfo[]
  setCalendar: (calendarId: string) => Promise<void>
  calendarsLoading: boolean

  // General
  isLoading: boolean
  error: Error | null
  refetch: () => void
}

/**
 * Combined hook for all Google Calendar sync operations
 *
 * Provides a unified interface for status, sync, connection, and calendar selection.
 *
 * @param options - Configuration options
 * @returns All Google sync functionality
 *
 * @example
 * ```tsx
 * const {
 *   isConnected,
 *   connect,
 *   sync,
 *   isSyncing,
 *   pendingCount,
 * } = useGoogleCalendarSync({
 *   onSyncSuccess: (result) => toast.success(`Synced ${result.syncedCount} events`),
 * })
 *
 * if (!isConnected) {
 *   return <Button onClick={connect}>Connect Google Calendar</Button>
 * }
 *
 * return (
 *   <Button onClick={() => sync()} disabled={isSyncing}>
 *     Sync ({pendingCount} pending)
 *   </Button>
 * )
 * ```
 */
export function useGoogleCalendarSync(
  options: UseGoogleCalendarSyncOptions = {}
): UseGoogleCalendarSyncResult {
  const { statusPollInterval = 0, onSyncSuccess, onSyncError } = options

  // Status
  const statusResult = useGoogleSyncStatus({
    pollInterval: statusPollInterval,
  })

  // Sync
  const syncResult = useGoogleSync({
    onSuccess: onSyncSuccess,
    onError: onSyncError,
  })

  // Connection
  const connectResult = useGoogleConnect()

  // Calendars
  const calendarsResult = useGoogleCalendars()

  // Connect handler - opens OAuth URL in new window or redirects
  const connect = useCallback(async () => {
    const url = await connectResult.getAuthUrl()
    if (url) {
      // Redirect to Google OAuth
      window.location.href = url
    }
  }, [connectResult])

  // Combined error
  const error = useMemo(() => {
    return (
      statusResult.error ??
      syncResult.error ??
      connectResult.error ??
      calendarsResult.error
    )
  }, [
    statusResult.error,
    syncResult.error,
    connectResult.error,
    calendarsResult.error,
  ])

  // Combined loading
  const isLoading =
    statusResult.isLoading ||
    connectResult.isLoading ||
    calendarsResult.isLoading

  return {
    // Status
    isConnected: statusResult.isConnected,
    connectedEmail: statusResult.connectedEmail,
    syncState: statusResult.syncState,
    pendingCount: statusResult.pendingCount,
    statusError: statusResult.errorMessage,

    // Sync
    sync: syncResult.sync,
    isSyncing: syncResult.isSyncing,
    lastSyncResult: syncResult.lastResult,

    // Connection
    connect,
    disconnect: connectResult.disconnect,
    isConnecting: connectResult.isGettingAuthUrl,
    isDisconnecting: connectResult.isDisconnecting,

    // Calendars
    calendars: calendarsResult.calendars,
    setCalendar: calendarsResult.setCalendar,
    calendarsLoading: calendarsResult.isLoading,

    // General
    isLoading,
    error,
    refetch: statusResult.refetch,
  }
}
