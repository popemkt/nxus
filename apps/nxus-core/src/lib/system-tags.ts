/**
 * System Tags - Predefined tags that are essential for app functionality
 *
 * These tags are:
 * - Seeded during database initialization
 * - Used throughout the app for specific functionality
 * - Should not be deleted by users
 */

export interface TagConfigField {
  key: string
  label: string
  type: 'text' | 'password' | 'boolean' | 'number' | 'select'
  required?: boolean
  default?: string | number | boolean
  placeholder?: string
  options?: Array<string>
}

export interface SystemTag {
  id: string
  name: string
  description: string
  /** Whether this tag has a configuration schema */
  configurable?: boolean
  /** Schema defining the configuration fields for this tag */
  schema?: { fields: Array<TagConfigField> }
}

/**
 * Dictionary of system tags with their IDs and metadata
 * IDs are stable system identifiers used to look up or create the corresponding node.
 */
export const SYSTEM_TAGS = {
  AI_PROVIDER: {
    id: 'system:ai-provider',
    name: 'AI CLI Provider',
    description: 'AI tools that can be configured to provide AI capabilities',
    configurable: true,
    schema: {
      fields: [
        {
          key: 'cliCommand',
          label: 'CLI Command',
          type: 'text',
          required: true,
          placeholder: 'e.g., claude, gemini, opencode',
        },
        {
          key: 'promptFormat',
          label: 'Prompt Format',
          type: 'select',
          options: ['direct', 'file', 'stdin'],
          default: 'direct',
        },
        {
          key: 'supportsInteractive',
          label: 'Supports Interactive Mode',
          type: 'boolean',
          default: true,
        },
      ],
    },
  },
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
export function isSystemTag(tagId: string): boolean {
  return Object.values(SYSTEM_TAGS).some((t) => t.id === tagId)
}
