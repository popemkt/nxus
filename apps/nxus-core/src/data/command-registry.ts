import { COMMAND_IDS, COMMAND_CATEGORIES, type Command } from '@nxus/db'
import { DEPENDENCY_IDS } from '@/types/dependency'

/**
 * Command registry - all known commands with their configurations
 *
 * To add a new command:
 * 1. Add the ID to COMMAND_IDS in types/command.ts
 * 2. Add the configuration here
 */
export const commandRegistry: Command[] = [
  {
    id: COMMAND_IDS.GENERATE_THUMBNAIL,
    name: 'Generate Thumbnail',
    description: 'Generate an SVG thumbnail for an app using AI',
    category: COMMAND_CATEGORIES.THUMBNAILS,
    icon: 'Image',
    dependencies: [DEPENDENCY_IDS.GEMINI_CLI],
  },
]

/**
 * Get a command by ID
 */
export function getCommand(id: string): Command | undefined {
  return commandRegistry.find((c) => c.id === id)
}

/**
 * Search commands by query (name, description, category)
 */
export function searchCommands(query: string): Command[] {
  const lowerQuery = query.toLowerCase()
  return commandRegistry.filter(
    (c) =>
      c.name.toLowerCase().includes(lowerQuery) ||
      c.description.toLowerCase().includes(lowerQuery) ||
      c.category.toLowerCase().includes(lowerQuery),
  )
}

/**
 * Get commands by category
 */
export function getCommandsByCategory(category: string): Command[] {
  return commandRegistry.filter((c) => c.category === category)
}
