/**
 * System Tags - Predefined tags that are essential for app functionality
 *
 * These tags are:
 * - Seeded during database initialization
 * - Used throughout the app for specific functionality
 * - Should not be deleted by users
 */

export interface SystemTag {
  id: number
  name: string
  description: string
  /** Whether this tag has a configuration schema */
  configurable?: boolean
}

/**
 * Dictionary of system tags with their IDs and metadata
 * IDs are stable - do not change them once assigned!
 */
export const SYSTEM_TAGS = {
  AI_PROVIDER: {
    id: 14,
    name: 'AI CLI Provider',
    description: 'AI tools that can be configured to provide AI capabilities',
    configurable: true,
  },
  // Add more system tags here as needed
  // Example:
  // INSTALLED: {
  //   id: 13,
  //   name: 'Installed',
  //   description: 'Apps/tools that have been installed on this system',
  // },
} as const satisfies Record<string, SystemTag>

/**
 * Get system tag by name (case-insensitive)
 */
export function getSystemTag(name: string): SystemTag | undefined {
  const key = Object.keys(SYSTEM_TAGS).find(
    (k) =>
      SYSTEM_TAGS[k as keyof typeof SYSTEM_TAGS].name.toLowerCase() ===
      name.toLowerCase(),
  )
  return key ? SYSTEM_TAGS[key as keyof typeof SYSTEM_TAGS] : undefined
}

/**
 * Get all system tags as an array
 */
export function getAllSystemTags(): Array<SystemTag> {
  return Object.values(SYSTEM_TAGS)
}

/**
 * Check if a tag ID is a system tag
 */
export function isSystemTag(tagId: number): boolean {
  return Object.values(SYSTEM_TAGS).some((t) => t.id === tagId)
}
