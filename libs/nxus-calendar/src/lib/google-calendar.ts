/**
 * google-calendar.ts - Google Calendar API client wrapper
 *
 * Provides functions for interacting with the Google Calendar API.
 * Handles OAuth token management, event CRUD operations, and error handling.
 *
 * IMPORTANT: This module uses dynamic imports for 'googleapis' to prevent
 * bundling Node.js-only code into the client bundle. The googleapis library
 * accesses Node.js-specific APIs (like process.stdout) at module load time,
 * which causes errors in the browser.
 */

import type { calendar_v3 } from 'googleapis'

// OAuth2Client type - we can't use typeof google.auth.OAuth2 with dynamic imports
// so we define the interface we need
type OAuth2Client = {
  setCredentials(credentials: {
    access_token?: string | null
    refresh_token?: string | null
    expiry_date?: number | null
    scope?: string | null
  }): void
  generateAuthUrl(options: {
    access_type?: string
    prompt?: string
    scope?: string[]
    state?: string
  }): string
  getToken(code: string): Promise<{
    tokens: {
      access_token?: string | null
      refresh_token?: string | null
      expiry_date?: number | null
      scope?: string | null
    }
  }>
  refreshAccessToken(): Promise<{
    credentials: {
      access_token?: string | null
      refresh_token?: string | null
      expiry_date?: number | null
      scope?: string | null
    }
  }>
}

/**
 * Lazily load the googleapis module
 * This ensures the module is only loaded when actually needed (on the server)
 */
async function getGoogleApis() {
  const { google } = await import('googleapis')
  return google
}
import type {
  GoogleTokens,
  GoogleCalendarEvent,
  GoogleCalendarInfo,
  EventSyncResult,
} from '../types/google-sync.js'
import type { CalendarEvent } from '../types/calendar-event.js'

// ============================================================================
// Constants
// ============================================================================

/**
 * Required OAuth scopes for Google Calendar access
 */
export const GOOGLE_CALENDAR_SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/userinfo.email',
]

/**
 * OAuth redirect URI (should match Google Cloud Console config)
 */
export const GOOGLE_REDIRECT_URI = '/api/google/callback'

// ============================================================================
// OAuth2 Client Factory
// ============================================================================

/**
 * Creates an OAuth2 client for Google API interactions
 *
 * Requires environment variables:
 * - GOOGLE_CLIENT_ID
 * - GOOGLE_CLIENT_SECRET
 * - GOOGLE_REDIRECT_URL (optional, defaults to GOOGLE_REDIRECT_URI)
 */
export async function createOAuth2Client(): Promise<OAuth2Client> {
  const google = await getGoogleApis()
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const redirectUrl = process.env.GOOGLE_REDIRECT_URL || GOOGLE_REDIRECT_URI

  if (!clientId || !clientSecret) {
    throw new Error(
      'Missing Google OAuth credentials. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables.'
    )
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUrl) as unknown as OAuth2Client
}

/**
 * Creates an OAuth2 client with existing tokens
 */
export async function createAuthenticatedClient(tokens: GoogleTokens): Promise<OAuth2Client> {
  const client = await createOAuth2Client()
  client.setCredentials({
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
    expiry_date: tokens.expiresAt.getTime(),
    scope: tokens.scope,
  })
  return client
}

/**
 * Generate OAuth authorization URL for user consent
 */
export async function generateAuthUrl(state?: string): Promise<string> {
  const client = await createOAuth2Client()

  return client.generateAuthUrl({
    access_type: 'offline', // Get refresh token
    prompt: 'consent', // Always show consent screen to get refresh token
    scope: GOOGLE_CALENDAR_SCOPES,
    state: state,
  })
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeCodeForTokens(
  code: string
): Promise<{ tokens: GoogleTokens; email: string }> {
  const google = await getGoogleApis()
  const client = await createOAuth2Client()
  const { tokens } = await client.getToken(code)

  if (!tokens.access_token || !tokens.refresh_token) {
    throw new Error('Failed to obtain access or refresh token from Google')
  }

  // Get user email
  client.setCredentials(tokens)
  const oauth2 = google.oauth2({ version: 'v2', auth: client as any })
  const userInfo = await oauth2.userinfo.get()

  const googleTokens: GoogleTokens = {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: new Date(tokens.expiry_date || Date.now() + 3600 * 1000),
    scope: tokens.scope || GOOGLE_CALENDAR_SCOPES.join(' '),
  }

  return {
    tokens: googleTokens,
    email: userInfo.data.email || 'unknown',
  }
}

/**
 * Refresh expired tokens
 */
export async function refreshTokens(
  tokens: GoogleTokens
): Promise<GoogleTokens> {
  const client = await createAuthenticatedClient(tokens)
  const { credentials } = await client.refreshAccessToken()

  return {
    accessToken: credentials.access_token || tokens.accessToken,
    refreshToken: credentials.refresh_token || tokens.refreshToken,
    expiresAt: new Date(
      credentials.expiry_date || Date.now() + 3600 * 1000
    ),
    scope: credentials.scope || tokens.scope,
  }
}

/**
 * Check if tokens are expired or about to expire (within 5 minutes)
 */
export function isTokenExpired(tokens: GoogleTokens): boolean {
  const expirationBuffer = 5 * 60 * 1000 // 5 minutes
  return tokens.expiresAt.getTime() - Date.now() < expirationBuffer
}

/**
 * Ensure tokens are valid, refreshing if needed
 */
export async function ensureValidTokens(
  tokens: GoogleTokens
): Promise<GoogleTokens> {
  if (isTokenExpired(tokens)) {
    return refreshTokens(tokens)
  }
  return tokens
}

// ============================================================================
// Google Calendar API Client
// ============================================================================

/**
 * Create a Google Calendar API client instance
 */
export async function createCalendarClient(
  tokens: GoogleTokens
): Promise<calendar_v3.Calendar> {
  const google = await getGoogleApis()
  const auth = await createAuthenticatedClient(tokens)
  return google.calendar({ version: 'v3', auth: auth as any })
}

// ============================================================================
// Calendar List Operations
// ============================================================================

/**
 * Get list of user's calendars
 */
export async function listCalendars(
  tokens: GoogleTokens
): Promise<GoogleCalendarInfo[]> {
  const calendar = await createCalendarClient(tokens)
  const response = await calendar.calendarList.list({
    minAccessRole: 'writer', // Only calendars we can write to
  })

  const calendars: GoogleCalendarInfo[] = (response.data.items || []).map(
    (item) => ({
      id: item.id || '',
      summary: item.summary || 'Unnamed Calendar',
      primary: item.primary || false,
      backgroundColor: item.backgroundColor || undefined,
      accessRole: (item.accessRole as GoogleCalendarInfo['accessRole']) || 'reader',
    })
  )

  return calendars
}

/**
 * Get the primary calendar ID
 */
export async function getPrimaryCalendarId(
  tokens: GoogleTokens
): Promise<string> {
  const calendars = await listCalendars(tokens)
  const primary = calendars.find((c) => c.primary)
  return primary?.id || 'primary'
}

// ============================================================================
// Event Conversion
// ============================================================================

/**
 * Convert CalendarEvent to Google Calendar event format
 */
export function toGoogleCalendarEvent(
  event: CalendarEvent
): calendar_v3.Schema$Event {
  const googleEvent: calendar_v3.Schema$Event = {
    summary: event.title,
    description: event.description || undefined,
    status: 'confirmed',
  }

  // Handle all-day vs timed events
  if (event.allDay) {
    // Google Calendar expects dates in YYYY-MM-DD format for all-day events
    const startDate = event.start.toISOString().split('T')[0]
    // For all-day events, end date is exclusive, so add 1 day
    const endDate = new Date(event.end)
    endDate.setDate(endDate.getDate() + 1)
    const endDateStr = endDate.toISOString().split('T')[0]

    googleEvent.start = { date: startDate }
    googleEvent.end = { date: endDateStr }
  } else {
    googleEvent.start = {
      dateTime: event.start.toISOString(),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }
    googleEvent.end = {
      dateTime: event.end.toISOString(),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }
  }

  // Handle recurrence
  if (event.rrule) {
    // Google Calendar expects RRULE without the "RRULE:" prefix if using recurrence array
    const rruleValue = event.rrule.startsWith('RRULE:')
      ? event.rrule
      : `RRULE:${event.rrule}`
    googleEvent.recurrence = [rruleValue]
  }

  // Add reminder if set
  if (event.hasReminder && event.reminderMinutes !== undefined) {
    googleEvent.reminders = {
      useDefault: false,
      overrides: [{ method: 'popup', minutes: event.reminderMinutes }],
    }
  }

  return googleEvent
}

/**
 * Convert Google Calendar event to our CalendarEvent format (partial, for comparison)
 */
export function fromGoogleCalendarEvent(
  googleEvent: calendar_v3.Schema$Event
): GoogleCalendarEvent {
  return {
    id: googleEvent.id || '',
    summary: googleEvent.summary || 'Untitled',
    description: googleEvent.description || undefined,
    start: {
      dateTime: googleEvent.start?.dateTime || undefined,
      date: googleEvent.start?.date || undefined,
      timeZone: googleEvent.start?.timeZone || undefined,
    },
    end: {
      dateTime: googleEvent.end?.dateTime || undefined,
      date: googleEvent.end?.date || undefined,
      timeZone: googleEvent.end?.timeZone || undefined,
    },
    recurrence: googleEvent.recurrence || undefined,
    status: googleEvent.status as GoogleCalendarEvent['status'],
    htmlLink: googleEvent.htmlLink || undefined,
    created: googleEvent.created || undefined,
    updated: googleEvent.updated || undefined,
  }
}

// ============================================================================
// Event CRUD Operations
// ============================================================================

/**
 * Create a new event in Google Calendar
 */
export async function createGoogleEvent(
  tokens: GoogleTokens,
  event: CalendarEvent,
  calendarId: string = 'primary'
): Promise<EventSyncResult> {
  try {
    const calendar = await createCalendarClient(tokens)
    const googleEvent = toGoogleCalendarEvent(event)

    const response = await calendar.events.insert({
      calendarId,
      requestBody: googleEvent,
    })

    return {
      eventId: event.nodeId,
      success: true,
      gcalEventId: response.data.id || undefined,
      operation: 'created',
    }
  } catch (error) {
    return {
      eventId: event.nodeId,
      success: false,
      error: error instanceof Error ? error.message : String(error),
      operation: 'created',
    }
  }
}

/**
 * Update an existing event in Google Calendar
 */
export async function updateGoogleEvent(
  tokens: GoogleTokens,
  event: CalendarEvent,
  gcalEventId: string,
  calendarId: string = 'primary'
): Promise<EventSyncResult> {
  try {
    const calendar = await createCalendarClient(tokens)
    const googleEvent = toGoogleCalendarEvent(event)

    await calendar.events.update({
      calendarId,
      eventId: gcalEventId,
      requestBody: googleEvent,
    })

    return {
      eventId: event.nodeId,
      success: true,
      gcalEventId,
      operation: 'updated',
    }
  } catch (error) {
    // If event not found, try to create it instead
    if (
      error instanceof Error &&
      error.message.includes('404')
    ) {
      return createGoogleEvent(tokens, event, calendarId)
    }

    return {
      eventId: event.nodeId,
      success: false,
      gcalEventId,
      error: error instanceof Error ? error.message : String(error),
      operation: 'updated',
    }
  }
}

/**
 * Delete an event from Google Calendar
 */
export async function deleteGoogleEvent(
  tokens: GoogleTokens,
  gcalEventId: string,
  calendarId: string = 'primary'
): Promise<EventSyncResult> {
  try {
    const calendar = await createCalendarClient(tokens)

    await calendar.events.delete({
      calendarId,
      eventId: gcalEventId,
    })

    return {
      eventId: gcalEventId,
      success: true,
      gcalEventId,
      operation: 'deleted',
    }
  } catch (error) {
    // If event not found, consider it a success (already deleted)
    if (
      error instanceof Error &&
      error.message.includes('404')
    ) {
      return {
        eventId: gcalEventId,
        success: true,
        gcalEventId,
        operation: 'deleted',
      }
    }

    return {
      eventId: gcalEventId,
      success: false,
      gcalEventId,
      error: error instanceof Error ? error.message : String(error),
      operation: 'deleted',
    }
  }
}

/**
 * Get a single event from Google Calendar
 */
export async function getGoogleEvent(
  tokens: GoogleTokens,
  gcalEventId: string,
  calendarId: string = 'primary'
): Promise<GoogleCalendarEvent | null> {
  try {
    const calendar = await createCalendarClient(tokens)

    const response = await calendar.events.get({
      calendarId,
      eventId: gcalEventId,
    })

    return fromGoogleCalendarEvent(response.data)
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes('404')
    ) {
      return null
    }
    throw error
  }
}

// ============================================================================
// Batch Operations
// ============================================================================

/**
 * Sync multiple events to Google Calendar
 *
 * Creates new events or updates existing ones based on gcalEventId
 */
export async function syncEventsToGoogle(
  tokens: GoogleTokens,
  events: CalendarEvent[],
  calendarId: string = 'primary'
): Promise<EventSyncResult[]> {
  const results: EventSyncResult[] = []

  // Process events sequentially to avoid rate limiting
  // Could be optimized with batching API in the future
  for (const event of events) {
    let result: EventSyncResult

    if (event.gcalEventId) {
      // Update existing event
      result = await updateGoogleEvent(
        tokens,
        event,
        event.gcalEventId,
        calendarId
      )
    } else {
      // Create new event
      result = await createGoogleEvent(tokens, event, calendarId)
    }

    results.push(result)

    // Small delay between requests to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 100))
  }

  return results
}

// ============================================================================
// Error Handling
// ============================================================================

/**
 * Check if an error is a Google API authentication error
 */
export function isAuthError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase()
    return (
      message.includes('invalid_grant') ||
      message.includes('token has been expired') ||
      message.includes('invalid credentials') ||
      message.includes('401')
    )
  }
  return false
}

/**
 * Check if an error is a Google API rate limit error
 */
export function isRateLimitError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase()
    return (
      message.includes('rate limit') ||
      message.includes('quota exceeded') ||
      message.includes('429')
    )
  }
  return false
}

/**
 * Get a user-friendly error message for Google API errors
 */
export function getGoogleErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    if (isAuthError(error)) {
      return 'Google Calendar authentication expired. Please reconnect your account.'
    }
    if (isRateLimitError(error)) {
      return 'Too many requests to Google Calendar. Please try again in a moment.'
    }
    return error.message
  }
  return 'An unknown error occurred with Google Calendar'
}
