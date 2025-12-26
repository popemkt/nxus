import type { App } from '@/types/app'

/**
 * Opens an app based on its type.
 * Pure utility function with no side effects except for window.open.
 *
 * @param app - The app to open
 *
 * Current implementation:
 * - HTML apps: Opens in a new browser tab/window
 * - Other types: No action (for future extension)
 */
export function openApp(app: App): void {
  if (app.type === 'html') {
    window.open(app.path, '_blank')
  }
  // Future: Add handlers for other app types
  // - TypeScript: Launch dev server?
  // - Remote repo: Open in file manager?
  // - Script tool: Execute script?
}
