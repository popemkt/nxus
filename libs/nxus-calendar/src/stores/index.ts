/**
 * stores/index.ts - Zustand store exports for @nxus/calendar
 *
 * Re-exports all calendar-related Zustand stores and their types.
 */

export {
  useCalendarSettingsStore,
  calendarSettingsService,
  type TaskCompletionConfig,
  type SupertagConfig,
  type GoogleSyncConfig,
  type DisplayConfig,
} from './calendar-settings.store.js'
