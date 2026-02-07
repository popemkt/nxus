/**
 * calendar-settings.store.ts - Zustand store for calendar preferences
 *
 * Persisted store for user's calendar configuration including:
 * - Default view and display settings
 * - Task/event supertag configuration
 * - Status field configuration for task completion
 * - Google Calendar sync settings
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  CalendarView,
  WeekStart,
  TimeFormat,
  CompletedTaskStyle,
} from '../types/calendar-event.js'

// ============================================================================
// Types
// ============================================================================

/**
 * Task completion configuration
 *
 * Defines how tasks are identified as completed based on status field values.
 */
export interface TaskCompletionConfig {
  /** System field ID for status (e.g., 'field:status') */
  statusField: string

  /** Status values that indicate completion */
  doneStatuses: string[]
}

/**
 * Supertag configuration for calendar events
 *
 * Allows users to specify which supertags should appear as tasks or events
 * in addition to the system Task/Event supertags.
 */
export interface SupertagConfig {
  /** Additional supertag IDs to treat as tasks */
  taskSupertags: string[]

  /** Additional supertag IDs to treat as events */
  eventSupertags: string[]
}

/**
 * Google Calendar sync configuration
 */
export interface GoogleSyncConfig {
  /** Whether sync is enabled */
  syncEnabled: boolean

  /** Target Google Calendar ID */
  googleCalendarId: string | null

  /** Whether to sync automatically on changes */
  autoSync: boolean
}

/**
 * Display preferences for the calendar
 */
export interface DisplayConfig {
  /** Default calendar view */
  defaultView: CalendarView

  /** First day of the week */
  weekStartsOn: WeekStart

  /** Time display format */
  timeFormat: TimeFormat

  /** Working hours start (0-23) */
  workingHoursStart: number

  /** Working hours end (0-23) */
  workingHoursEnd: number

  /** Whether to show completed tasks */
  showCompletedTasks: boolean

  /** How to display completed tasks */
  completedTaskStyle: CompletedTaskStyle
}

/**
 * Complete calendar settings state
 */
interface CalendarSettingsState {
  display: DisplayConfig
  supertags: SupertagConfig
  taskCompletion: TaskCompletionConfig
  googleSync: GoogleSyncConfig
}

/**
 * Calendar settings actions
 */
interface CalendarSettingsActions {
  // Display settings
  setDefaultView: (view: CalendarView) => void
  setWeekStartsOn: (day: WeekStart) => void
  setTimeFormat: (format: TimeFormat) => void
  setWorkingHours: (start: number, end: number) => void
  setShowCompletedTasks: (show: boolean) => void
  setCompletedTaskStyle: (style: CompletedTaskStyle) => void

  // Supertag settings
  setTaskSupertags: (supertags: string[]) => void
  setEventSupertags: (supertags: string[]) => void
  addTaskSupertag: (supertagId: string) => void
  addEventSupertag: (supertagId: string) => void
  removeTaskSupertag: (supertagId: string) => void
  removeEventSupertag: (supertagId: string) => void

  // Task completion settings
  setStatusField: (fieldId: string) => void
  setDoneStatuses: (statuses: string[]) => void
  addDoneStatus: (status: string) => void
  removeDoneStatus: (status: string) => void

  // Google sync settings
  setGoogleSyncEnabled: (enabled: boolean) => void
  setGoogleCalendarId: (calendarId: string | null) => void
  setAutoSync: (autoSync: boolean) => void

  // Reset
  resetToDefaults: () => void
}

// ============================================================================
// Default Values
// ============================================================================

const defaultDisplayConfig: DisplayConfig = {
  defaultView: 'week',
  weekStartsOn: 1, // Monday
  timeFormat: '24h',
  workingHoursStart: 9,
  workingHoursEnd: 18,
  showCompletedTasks: true,
  completedTaskStyle: 'muted',
}

const defaultSupertagConfig: SupertagConfig = {
  taskSupertags: [],
  eventSupertags: [],
}

const defaultTaskCompletionConfig: TaskCompletionConfig = {
  statusField: 'field:status',
  doneStatuses: ['done', 'completed', 'finished', 'closed'],
}

const defaultGoogleSyncConfig: GoogleSyncConfig = {
  syncEnabled: false,
  googleCalendarId: null,
  autoSync: false,
}

const defaultSettings: CalendarSettingsState = {
  display: defaultDisplayConfig,
  supertags: defaultSupertagConfig,
  taskCompletion: defaultTaskCompletionConfig,
  googleSync: defaultGoogleSyncConfig,
}

// ============================================================================
// Store
// ============================================================================

export const useCalendarSettingsStore = create<
  CalendarSettingsState & CalendarSettingsActions
>()(
  persist(
    (set) => ({
      ...defaultSettings,

      // Display settings
      setDefaultView: (view) =>
        set((state) => ({
          display: { ...state.display, defaultView: view },
        })),

      setWeekStartsOn: (day) =>
        set((state) => ({
          display: { ...state.display, weekStartsOn: day },
        })),

      setTimeFormat: (format) =>
        set((state) => ({
          display: { ...state.display, timeFormat: format },
        })),

      setWorkingHours: (start, end) =>
        set((state) => ({
          display: {
            ...state.display,
            workingHoursStart: start,
            workingHoursEnd: end,
          },
        })),

      setShowCompletedTasks: (show) =>
        set((state) => ({
          display: { ...state.display, showCompletedTasks: show },
        })),

      setCompletedTaskStyle: (style) =>
        set((state) => ({
          display: { ...state.display, completedTaskStyle: style },
        })),

      // Supertag settings
      setTaskSupertags: (supertags) =>
        set((state) => ({
          supertags: { ...state.supertags, taskSupertags: supertags },
        })),

      setEventSupertags: (supertags) =>
        set((state) => ({
          supertags: { ...state.supertags, eventSupertags: supertags },
        })),

      addTaskSupertag: (supertagId) =>
        set((state) => ({
          supertags: {
            ...state.supertags,
            taskSupertags: state.supertags.taskSupertags.includes(supertagId)
              ? state.supertags.taskSupertags
              : [...state.supertags.taskSupertags, supertagId],
          },
        })),

      addEventSupertag: (supertagId) =>
        set((state) => ({
          supertags: {
            ...state.supertags,
            eventSupertags: state.supertags.eventSupertags.includes(supertagId)
              ? state.supertags.eventSupertags
              : [...state.supertags.eventSupertags, supertagId],
          },
        })),

      removeTaskSupertag: (supertagId) =>
        set((state) => ({
          supertags: {
            ...state.supertags,
            taskSupertags: state.supertags.taskSupertags.filter(
              (id) => id !== supertagId
            ),
          },
        })),

      removeEventSupertag: (supertagId) =>
        set((state) => ({
          supertags: {
            ...state.supertags,
            eventSupertags: state.supertags.eventSupertags.filter(
              (id) => id !== supertagId
            ),
          },
        })),

      // Task completion settings
      setStatusField: (fieldId) =>
        set((state) => ({
          taskCompletion: { ...state.taskCompletion, statusField: fieldId },
        })),

      setDoneStatuses: (statuses) =>
        set((state) => ({
          taskCompletion: { ...state.taskCompletion, doneStatuses: statuses },
        })),

      addDoneStatus: (status) =>
        set((state) => ({
          taskCompletion: {
            ...state.taskCompletion,
            doneStatuses: state.taskCompletion.doneStatuses.includes(status)
              ? state.taskCompletion.doneStatuses
              : [...state.taskCompletion.doneStatuses, status],
          },
        })),

      removeDoneStatus: (status) =>
        set((state) => ({
          taskCompletion: {
            ...state.taskCompletion,
            doneStatuses: state.taskCompletion.doneStatuses.filter(
              (s) => s !== status
            ),
          },
        })),

      // Google sync settings
      setGoogleSyncEnabled: (enabled) =>
        set((state) => ({
          googleSync: { ...state.googleSync, syncEnabled: enabled },
        })),

      setGoogleCalendarId: (calendarId) =>
        set((state) => ({
          googleSync: { ...state.googleSync, googleCalendarId: calendarId },
        })),

      setAutoSync: (autoSync) =>
        set((state) => ({
          googleSync: { ...state.googleSync, autoSync },
        })),

      // Reset
      resetToDefaults: () => set(defaultSettings),
    }),
    {
      name: 'nxus-calendar-settings',
      version: 1,
    }
  )
)

// ============================================================================
// Service (Imperative Access)
// ============================================================================

/**
 * Service for imperative access to calendar settings
 * Use this when you need to access settings outside of React components
 */
export const calendarSettingsService = {
  // Getters
  getDisplay: () => useCalendarSettingsStore.getState().display,
  getSupertags: () => useCalendarSettingsStore.getState().supertags,
  getTaskCompletion: () => useCalendarSettingsStore.getState().taskCompletion,
  getGoogleSync: () => useCalendarSettingsStore.getState().googleSync,

  // Convenience getters
  getDefaultView: () => useCalendarSettingsStore.getState().display.defaultView,
  getWeekStartsOn: () => useCalendarSettingsStore.getState().display.weekStartsOn,
  getTimeFormat: () => useCalendarSettingsStore.getState().display.timeFormat,
  is24HourFormat: () =>
    useCalendarSettingsStore.getState().display.timeFormat === '24h',
  getTaskSupertags: () =>
    useCalendarSettingsStore.getState().supertags.taskSupertags,
  getEventSupertags: () =>
    useCalendarSettingsStore.getState().supertags.eventSupertags,
  getDoneStatuses: () =>
    useCalendarSettingsStore.getState().taskCompletion.doneStatuses,
  isGoogleSyncEnabled: () =>
    useCalendarSettingsStore.getState().googleSync.syncEnabled,

  // Setters (delegate to store actions)
  setDefaultView: (view: CalendarView) =>
    useCalendarSettingsStore.getState().setDefaultView(view),
  setTimeFormat: (format: TimeFormat) =>
    useCalendarSettingsStore.getState().setTimeFormat(format),
  setWeekStartsOn: (day: WeekStart) =>
    useCalendarSettingsStore.getState().setWeekStartsOn(day),
}
