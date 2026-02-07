import { describe, it, expect } from 'vitest'
import {
  GoogleAuthStateSchema,
  EventSyncStatusSchema,
  CalendarSyncStatusSchema,
  isGoogleConnected,
  isSyncing,
  hasPendingSync,
  createDefaultSyncStatus,
  getSyncStatusMessage,
} from './google-sync.js'
import type { SyncStatusInfo } from './google-sync.js'

// ============================================================================
// Zod Schema Validations
// ============================================================================

describe('GoogleAuthStateSchema', () => {
  it('accepts valid auth states', () => {
    expect(GoogleAuthStateSchema.parse('disconnected')).toBe('disconnected')
    expect(GoogleAuthStateSchema.parse('connecting')).toBe('connecting')
    expect(GoogleAuthStateSchema.parse('connected')).toBe('connected')
    expect(GoogleAuthStateSchema.parse('expired')).toBe('expired')
    expect(GoogleAuthStateSchema.parse('error')).toBe('error')
  })

  it('rejects invalid states', () => {
    expect(() => GoogleAuthStateSchema.parse('unknown')).toThrow()
  })
})

describe('EventSyncStatusSchema', () => {
  it('accepts valid sync statuses', () => {
    expect(EventSyncStatusSchema.parse('not_synced')).toBe('not_synced')
    expect(EventSyncStatusSchema.parse('synced')).toBe('synced')
    expect(EventSyncStatusSchema.parse('pending')).toBe('pending')
    expect(EventSyncStatusSchema.parse('syncing')).toBe('syncing')
    expect(EventSyncStatusSchema.parse('error')).toBe('error')
  })
})

describe('CalendarSyncStatusSchema', () => {
  it('accepts valid calendar sync statuses', () => {
    expect(CalendarSyncStatusSchema.parse('idle')).toBe('idle')
    expect(CalendarSyncStatusSchema.parse('syncing')).toBe('syncing')
    expect(CalendarSyncStatusSchema.parse('success')).toBe('success')
    expect(CalendarSyncStatusSchema.parse('partial')).toBe('partial')
    expect(CalendarSyncStatusSchema.parse('error')).toBe('error')
  })
})

// ============================================================================
// Type Guards
// ============================================================================

describe('isGoogleConnected', () => {
  it('returns true when connected with email', () => {
    const status: SyncStatusInfo = {
      status: 'idle',
      connectedEmail: 'user@gmail.com',
    }
    expect(isGoogleConnected(status)).toBe(true)
  })

  it('returns false when no email', () => {
    const status: SyncStatusInfo = {
      status: 'idle',
    }
    expect(isGoogleConnected(status)).toBe(false)
  })

  it('returns false when status is error', () => {
    const status: SyncStatusInfo = {
      status: 'error',
      connectedEmail: 'user@gmail.com',
    }
    expect(isGoogleConnected(status)).toBe(false)
  })
})

describe('isSyncing', () => {
  it('returns true when syncing', () => {
    expect(isSyncing({ status: 'syncing' })).toBe(true)
  })

  it('returns false when idle', () => {
    expect(isSyncing({ status: 'idle' })).toBe(false)
  })
})

describe('hasPendingSync', () => {
  it('returns true when pendingCount > 0', () => {
    expect(hasPendingSync({ status: 'idle', pendingCount: 5 })).toBe(true)
  })

  it('returns false when pendingCount is 0', () => {
    expect(hasPendingSync({ status: 'idle', pendingCount: 0 })).toBe(false)
  })

  it('returns false when pendingCount is undefined', () => {
    expect(hasPendingSync({ status: 'idle' })).toBe(false)
  })
})

// ============================================================================
// Helper Functions
// ============================================================================

describe('createDefaultSyncStatus', () => {
  it('returns idle status', () => {
    const status = createDefaultSyncStatus()
    expect(status.status).toBe('idle')
    expect(status.connectedEmail).toBeUndefined()
  })
})

describe('getSyncStatusMessage', () => {
  it('returns disconnected message when no email', () => {
    const msg = getSyncStatusMessage({ status: 'idle' })
    expect(msg).toBe('Not connected to Google Calendar')
  })

  it('returns "Ready to sync" when connected but never synced', () => {
    const msg = getSyncStatusMessage({
      status: 'idle',
      connectedEmail: 'user@gmail.com',
    })
    expect(msg).toBe('Ready to sync')
  })

  it('returns relative time when last synced', () => {
    const recentDate = new Date(Date.now() - 5 * 60 * 1000) // 5 minutes ago
    const msg = getSyncStatusMessage({
      status: 'idle',
      connectedEmail: 'user@gmail.com',
      lastSyncAt: recentDate,
    })
    expect(msg).toContain('Last synced')
    expect(msg).toContain('minutes ago')
  })

  it('returns syncing message', () => {
    expect(getSyncStatusMessage({ status: 'syncing' })).toBe('Syncing...')
  })

  it('returns success message with count', () => {
    const msg = getSyncStatusMessage({ status: 'success', lastSyncCount: 10 })
    expect(msg).toBe('Synced 10 events')
  })

  it('returns partial failure message', () => {
    expect(getSyncStatusMessage({ status: 'partial' })).toBe(
      'Some events failed to sync',
    )
  })

  it('returns error message', () => {
    const msg = getSyncStatusMessage({
      status: 'error',
      errorMessage: 'Auth failed',
    })
    expect(msg).toBe('Auth failed')
  })

  it('returns generic error when no errorMessage', () => {
    const msg = getSyncStatusMessage({ status: 'error' })
    expect(msg).toBe('Sync failed')
  })
})
