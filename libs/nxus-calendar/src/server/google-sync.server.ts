/**
 * google-sync.server.ts - Server functions for Google Calendar synchronization
 *
 * Provides server-side functions for:
 * - OAuth authorization flow
 * - Token management
 * - Syncing events to Google Calendar
 * - Sync status queries
 */

import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import {
  SYSTEM_FIELDS,
  SYSTEM_SUPERTAGS,
  getProperty,
  nodeFacade,
  FIELD_NAMES,
  type AssembledNode,
} from '@nxus/db/server'
import {
  generateAuthUrl,
  exchangeCodeForTokens,
  ensureValidTokens,
  isTokenExpired,
  syncEventsToGoogle,
  listCalendars,
  isAuthError,
  getGoogleErrorMessage,
} from '../lib/google-calendar.js'
import {
  GoogleCallbackInputSchema,
  SyncToGoogleInputSchema,
  type GoogleTokens,
  type SyncStatusInfo,
  type SyncResult,
  type GetGoogleAuthUrlResponse,
  type HandleGoogleCallbackResponse,
  type GetSyncStatusResponse,
  type SyncToGoogleResponse,
  type GetGoogleCalendarsResponse,
} from '../types/google-sync.js'
import type { CalendarEvent, ServerResponse } from '../types/calendar-event.js'
import { buildPendingSyncQuery } from '../lib/query-builder.js'

// ============================================================================
// Constants
// ============================================================================

/**
 * System ID for the Google Calendar settings node
 */
const GCAL_SETTINGS_NODE_ID = 'item:google-calendar-settings'

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Find the Google Calendar settings node by systemId
 */
async function findSettingsNode(): Promise<AssembledNode | null> {
  return await nodeFacade.findNodeBySystemId(GCAL_SETTINGS_NODE_ID)
}

/**
 * Find or create the Google Calendar settings node
 */
async function getOrCreateSettingsNode(): Promise<string> {
  const existingNode = await findSettingsNode()

  if (existingNode) {
    return existingNode.id
  }

  // Create new settings node
  const nodeId = await nodeFacade.createNode({
    content: 'Google Calendar Settings',
    systemId: GCAL_SETTINGS_NODE_ID,
    supertagId: SYSTEM_SUPERTAGS.SYSTEM,
  })

  return nodeId
}

/**
 * Get stored Google tokens from settings node
 */
async function getStoredTokens(): Promise<GoogleTokens | null> {
  const node = await findSettingsNode()

  if (!node) {
    return null
  }

  const accessToken = getProperty<string>(node, FIELD_NAMES.GCAL_ACCESS_TOKEN)
  const refreshToken = getProperty<string>(node, FIELD_NAMES.GCAL_REFRESH_TOKEN)
  const tokenExpiry = getProperty<string>(node, FIELD_NAMES.GCAL_TOKEN_EXPIRY)

  if (!accessToken || !refreshToken) {
    return null
  }

  return {
    accessToken,
    refreshToken,
    expiresAt: tokenExpiry ? new Date(tokenExpiry) : new Date(Date.now() + 3600000),
    scope: 'https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/userinfo.email',
  }
}

/**
 * Store Google tokens in settings node
 */
async function storeTokens(tokens: GoogleTokens, email?: string): Promise<void> {
  const nodeId = await getOrCreateSettingsNode()

  await nodeFacade.setProperty(nodeId, SYSTEM_FIELDS.GCAL_ACCESS_TOKEN, tokens.accessToken)
  await nodeFacade.setProperty(nodeId, SYSTEM_FIELDS.GCAL_REFRESH_TOKEN, tokens.refreshToken)
  await nodeFacade.setProperty(
    nodeId,
    SYSTEM_FIELDS.GCAL_TOKEN_EXPIRY,
    tokens.expiresAt.toISOString()
  )

  if (email) {
    await nodeFacade.setProperty(nodeId, SYSTEM_FIELDS.GCAL_USER_EMAIL, email)
  }
}

/**
 * Clear stored Google tokens (disconnect)
 */
async function clearTokens(): Promise<void> {
  const settingsNode = await findSettingsNode()

  if (!settingsNode) {
    return
  }

  await nodeFacade.setProperty(settingsNode.id, SYSTEM_FIELDS.GCAL_ACCESS_TOKEN, null)
  await nodeFacade.setProperty(settingsNode.id, SYSTEM_FIELDS.GCAL_REFRESH_TOKEN, null)
  await nodeFacade.setProperty(settingsNode.id, SYSTEM_FIELDS.GCAL_TOKEN_EXPIRY, null)
  await nodeFacade.setProperty(settingsNode.id, SYSTEM_FIELDS.GCAL_USER_EMAIL, null)
}

/**
 * Get connected email from settings
 */
async function getConnectedEmail(): Promise<string | undefined> {
  const node = await findSettingsNode()

  if (!node) {
    return undefined
  }

  return getProperty<string>(node, FIELD_NAMES.GCAL_USER_EMAIL) ?? undefined
}

/**
 * Get configured calendar ID from settings
 */
async function getConfiguredCalendarId(): Promise<string> {
  const node = await findSettingsNode()

  if (!node) {
    return 'primary'
  }

  return getProperty<string>(node, FIELD_NAMES.GCAL_CALENDAR_ID) ?? 'primary'
}

/**
 * Convert assembled node to CalendarEvent for sync
 */
function nodeToCalendarEvent(node: AssembledNode): CalendarEvent {
  const startDateStr = getProperty<string>(node, FIELD_NAMES.START_DATE)
  const endDateStr = getProperty<string>(node, FIELD_NAMES.END_DATE)
  const allDay = getProperty<boolean>(node, FIELD_NAMES.ALL_DAY) ?? false
  const rrule = getProperty<string>(node, FIELD_NAMES.RRULE)
  const reminder = getProperty<number>(node, FIELD_NAMES.REMINDER)
  const gcalEventId = getProperty<string>(node, FIELD_NAMES.GCAL_EVENT_ID)
  const gcalSyncedAtStr = getProperty<string>(node, FIELD_NAMES.GCAL_SYNCED_AT)
  const status = getProperty<string>(node, FIELD_NAMES.STATUS)
  const description = getProperty<string>(node, FIELD_NAMES.DESCRIPTION)

  const isTask = node.supertags.some(
    (st) => st.systemId === SYSTEM_SUPERTAGS.TASK
  )

  const doneStatuses = ['done', 'completed', 'finished', 'closed']
  const isCompleted =
    isTask && status ? doneStatuses.includes(status.toLowerCase()) : false

  const start = startDateStr ? new Date(startDateStr) : new Date()
  let end = endDateStr ? new Date(endDateStr) : new Date(start)

  if (!endDateStr && !allDay) {
    end = new Date(start.getTime() + 60 * 60 * 1000)
  }

  if (allDay && !endDateStr) {
    end = start
  }

  return {
    id: node.id,
    nodeId: node.id,
    title: node.content || 'Untitled',
    start,
    end,
    allDay,
    isTask,
    isCompleted,
    rrule: rrule || undefined,
    hasReminder: reminder !== undefined && reminder !== null,
    reminderMinutes: reminder,
    gcalEventId: gcalEventId || undefined,
    gcalSyncedAt: gcalSyncedAtStr ? new Date(gcalSyncedAtStr) : undefined,
    description: description || undefined,
  }
}

// ============================================================================
// Server Functions
// ============================================================================

/**
 * Get Google OAuth authorization URL
 *
 * Returns a URL that the user should be redirected to for OAuth consent.
 */
export const getGoogleAuthUrlServerFn = createServerFn({ method: 'GET' }).handler(
  async (): Promise<GetGoogleAuthUrlResponse> => {
    try {
      // Check if required environment variables are set
      if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
        return {
          success: false,
          error:
            'Google Calendar integration not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables.',
        }
      }

      const url = await generateAuthUrl()
      console.log('[getGoogleAuthUrlServerFn] Generated auth URL')

      return { success: true, url }
    } catch (error) {
      console.error('[getGoogleAuthUrlServerFn] Error:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }
)

/**
 * Handle Google OAuth callback
 *
 * Exchanges the authorization code for tokens and stores them.
 */
export const handleGoogleCallbackServerFn = createServerFn({ method: 'POST' })
  .inputValidator(GoogleCallbackInputSchema)
  .handler(async ({ data }): Promise<HandleGoogleCallbackResponse> => {
    try {
      console.log('[handleGoogleCallbackServerFn] Processing callback')
      const { code } = data

      // Exchange code for tokens
      const { tokens, email } = await exchangeCodeForTokens(code)

      // Store tokens in database
      await nodeFacade.init()
      await storeTokens(tokens, email)
      await nodeFacade.save()

      console.log('[handleGoogleCallbackServerFn] Connected:', email)
      return { success: true, email }
    } catch (error) {
      console.error('[handleGoogleCallbackServerFn] Error:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  })

/**
 * Get current Google Calendar sync status
 *
 * Returns connection status, last sync time, and pending sync count.
 */
export const getGoogleSyncStatusServerFn = createServerFn({ method: 'GET' }).handler(
  async (): Promise<GetSyncStatusResponse> => {
    try {
      await nodeFacade.init()

      // Check if connected
      const tokens = await getStoredTokens()
      const email = await getConnectedEmail()
      const calendarId = await getConfiguredCalendarId()

      if (!tokens) {
        return {
          success: true,
          data: {
            status: 'idle',
            connectedEmail: undefined,
            calendarId: undefined,
          },
        }
      }

      // Check if token is expired
      const isExpired = isTokenExpired(tokens)

      // Count pending sync events (events without gcal_event_id)
      const pendingQuery = buildPendingSyncQuery()
      const pendingResult = await nodeFacade.evaluateQuery(pendingQuery)

      const syncStatus: SyncStatusInfo = {
        status: isExpired ? 'error' : 'idle',
        connectedEmail: email,
        calendarId,
        pendingCount: pendingResult.totalCount,
        errorMessage: isExpired ? 'Token expired. Please reconnect.' : undefined,
      }

      return { success: true, data: syncStatus }
    } catch (error) {
      console.error('[getGoogleSyncStatusServerFn] Error:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }
)

/**
 * Sync events to Google Calendar
 *
 * Pushes events to Google Calendar, creating new events or updating existing ones.
 */
export const syncToGoogleCalendarServerFn = createServerFn({ method: 'POST' })
  .inputValidator(SyncToGoogleInputSchema)
  .handler(async ({ data }): Promise<SyncToGoogleResponse> => {
    try {
      console.log('[syncToGoogleCalendarServerFn] Starting sync:', data)
      const { eventIds, calendarId = 'primary', force = false } = data

      await nodeFacade.init()

      // Get stored tokens
      let tokens = await getStoredTokens()
      if (!tokens) {
        return {
          success: false,
          error: 'Not connected to Google Calendar. Please connect first.',
        }
      }

      // Ensure tokens are valid (refresh if needed)
      try {
        tokens = await ensureValidTokens(tokens)
        // Update stored tokens if they were refreshed
        await storeTokens(tokens)
      } catch (error) {
        if (isAuthError(error)) {
          await clearTokens()
          await nodeFacade.save()
          return {
            success: false,
            error: 'Google Calendar authentication expired. Please reconnect.',
          }
        }
        throw error
      }

      // Get events to sync
      let eventsToSync: CalendarEvent[]

      if (eventIds && eventIds.length > 0) {
        // Sync specific events
        const assembledNodes = await Promise.all(
          eventIds.map((id) => nodeFacade.assembleNode(id))
        )
        eventsToSync = assembledNodes
          .filter((node): node is AssembledNode => node !== null)
          .map(nodeToCalendarEvent)
      } else {
        // Sync all events that need syncing (pending or force all)
        const query = buildPendingSyncQuery()
        const result = await nodeFacade.evaluateQuery(query)
        eventsToSync = result.nodes.map(nodeToCalendarEvent)

        // If force, include already synced events too
        if (force) {
          // Query for synced events as well (have gcal_event_id)
          const syncedQuery = {
            filters: [
              {
                type: 'or' as const,
                filters: [
                  { type: 'supertag' as const, supertagId: SYSTEM_SUPERTAGS.TASK },
                  { type: 'supertag' as const, supertagId: SYSTEM_SUPERTAGS.EVENT },
                ],
              },
              { type: 'hasField' as const, fieldId: SYSTEM_FIELDS.START_DATE },
              { type: 'hasField' as const, fieldId: SYSTEM_FIELDS.GCAL_EVENT_ID },
            ],
            limit: 1000,
          }
          const syncedResult = await nodeFacade.evaluateQuery(syncedQuery)
          const syncedEvents = syncedResult.nodes.map(nodeToCalendarEvent)

          // Merge without duplicates
          const syncedIds = new Set(syncedEvents.map((e) => e.id))
          eventsToSync = [
            ...eventsToSync.filter((e) => !syncedIds.has(e.id)),
            ...syncedEvents,
          ]
        }
      }

      if (eventsToSync.length === 0) {
        return {
          success: true,
          data: {
            success: true,
            syncedCount: 0,
            failedCount: 0,
            skippedCount: 0,
            results: [],
          },
        }
      }

      console.log('[syncToGoogleCalendarServerFn] Syncing', eventsToSync.length, 'events')

      // Sync to Google Calendar
      const results = await syncEventsToGoogle(tokens, eventsToSync, calendarId)

      // Update local nodes with Google Calendar IDs
      for (const result of results) {
        if (result.success && result.gcalEventId) {
          await nodeFacade.setProperty(
            result.eventId,
            SYSTEM_FIELDS.GCAL_EVENT_ID,
            result.gcalEventId
          )
          await nodeFacade.setProperty(
            result.eventId,
            SYSTEM_FIELDS.GCAL_SYNCED_AT,
            new Date().toISOString()
          )
        }
      }

      await nodeFacade.save()

      const syncResult: SyncResult = {
        success: results.every((r) => r.success),
        syncedCount: results.filter((r) => r.success).length,
        failedCount: results.filter((r) => !r.success).length,
        skippedCount: results.filter((r) => r.operation === 'skipped').length,
        results,
      }

      console.log(
        '[syncToGoogleCalendarServerFn] Sync complete:',
        syncResult.syncedCount,
        'synced,',
        syncResult.failedCount,
        'failed'
      )

      return { success: true, data: syncResult }
    } catch (error) {
      console.error('[syncToGoogleCalendarServerFn] Error:', error)
      return {
        success: false,
        error: getGoogleErrorMessage(error),
      }
    }
  })

/**
 * Disconnect Google Calendar account
 *
 * Clears stored tokens and disconnects the Google account.
 */
export const disconnectGoogleCalendarServerFn = createServerFn({
  method: 'POST',
}).handler(async (): Promise<ServerResponse<void>> => {
  try {
    console.log('[disconnectGoogleCalendarServerFn] Disconnecting')
    await nodeFacade.init()
    await clearTokens()
    await nodeFacade.save()

    return { success: true }
  } catch (error) {
    console.error('[disconnectGoogleCalendarServerFn] Error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
})

/**
 * Get list of user's Google Calendars
 *
 * Returns calendars the user has write access to.
 */
export const getGoogleCalendarsServerFn = createServerFn({ method: 'GET' }).handler(
  async (): Promise<GetGoogleCalendarsResponse> => {
    try {
      await nodeFacade.init()

      let tokens = await getStoredTokens()
      if (!tokens) {
        return {
          success: false,
          error: 'Not connected to Google Calendar.',
        }
      }

      // Ensure tokens are valid
      try {
        tokens = await ensureValidTokens(tokens)
        await storeTokens(tokens)
        await nodeFacade.save()
      } catch (error) {
        if (isAuthError(error)) {
          return {
            success: false,
            error: 'Google Calendar authentication expired. Please reconnect.',
          }
        }
        throw error
      }

      const calendars = await listCalendars(tokens)

      return { success: true, calendars }
    } catch (error) {
      console.error('[getGoogleCalendarsServerFn] Error:', error)
      return {
        success: false,
        error: getGoogleErrorMessage(error),
      }
    }
  }
)

/**
 * Set target Google Calendar for sync
 *
 * Stores the calendar ID to sync events to.
 */
export const setGoogleCalendarIdServerFn = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ calendarId: z.string() }))
  .handler(async ({ data }): Promise<ServerResponse<void>> => {
    try {
      console.log('[setGoogleCalendarIdServerFn] Setting calendar:', data.calendarId)
      await nodeFacade.init()

      const nodeId = await getOrCreateSettingsNode()
      await nodeFacade.setProperty(nodeId, SYSTEM_FIELDS.GCAL_CALENDAR_ID, data.calendarId)
      await nodeFacade.save()

      return { success: true }
    } catch (error) {
      console.error('[setGoogleCalendarIdServerFn] Error:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  })
