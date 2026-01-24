/**
 * registry.service.ts - App registry service using SQLite backend
 *
 * Apps are loaded from SQLite via apps.server.ts and cached here.
 * The Vite glob import has been removed - SQLite is the only source.
 */

import type { Item, ItemRegistry, ItemStatus, ItemType, Result } from '@nxus/db'

/**
 * Service for managing the app registry
 * Handles loading, filtering, and searching apps
 *
 * Note: Apps must be loaded via setApps() from apps.server.ts.
 * This is a client-side cache/service layer.
 */
export class AppRegistryService {
  private registry: ItemRegistry | null = null
  private apps: Item[] = []

  /**
   * Set apps from SQLite (called after server function returns)
   */
  setApps(apps: Item[]): void {
    this.apps = apps
    this.registry = {
      version: '1.0.0',
      items: apps,
    }
  }

  /**
   * Check if apps have been loaded
   */
  isLoaded(): boolean {
    return this.apps.length > 0
  }

  /**
   * Get all apps from the registry
   * Note: Returns empty if apps haven't been loaded via setApps() yet
   */
  getAllApps(): Result<Array<Item>> {
    return {
      success: true,
      data: this.apps,
    }
  }

  /**
   * Get app by ID
   */
  getAppById(id: string): Result<Item> {
    const appsResult = this.getAllApps()
    if (!appsResult.success) {
      return appsResult
    }

    const app = appsResult.data.find((a) => a.id === id)
    if (!app) {
      return {
        success: false,
        error: new Error(`App with id ${id} not found`),
      }
    }

    return { success: true, data: app }
  }

  /**
   * Search apps by name, description, or tags
   */
  searchApps(query: string): Result<Array<Item>> {
    const appsResult = this.getAllApps()
    if (!appsResult.success) {
      return appsResult
    }

    const lowerQuery = query.toLowerCase().trim()
    if (!lowerQuery) {
      return appsResult
    }

    const filtered = appsResult.data.filter((app) => {
      const nameMatch = app.name.toLowerCase().includes(lowerQuery)
      const descMatch = app.description.toLowerCase().includes(lowerQuery)
      const tagMatch = app.metadata.tags.some((tag) =>
        tag.name.toLowerCase().includes(lowerQuery),
      )
      const categoryMatch = app.metadata.category
        .toLowerCase()
        .includes(lowerQuery)

      return nameMatch || descMatch || tagMatch || categoryMatch
    })

    return { success: true, data: filtered }
  }

  /**
   * Filter apps by type
   */
  filterByType(type: ItemType): Result<Array<Item>> {
    const appsResult = this.getAllApps()
    if (!appsResult.success) {
      return appsResult
    }

    const filtered = appsResult.data.filter((app) => app.type === type)
    return { success: true, data: filtered }
  }

  /**
   * Filter apps by status
   */
  filterByStatus(status: ItemStatus): Result<Array<Item>> {
    const appsResult = this.getAllApps()
    if (!appsResult.success) {
      return appsResult
    }

    const filtered = appsResult.data.filter((app) => app.status === status)
    return { success: true, data: filtered }
  }

  /**
   * Filter apps by category
   */
  filterByCategory(category: string): Result<Array<Item>> {
    const appsResult = this.getAllApps()
    if (!appsResult.success) {
      return appsResult
    }

    const filtered = appsResult.data.filter(
      (app) => app.metadata.category === category,
    )
    return { success: true, data: filtered }
  }

  /**
   * Filter apps by tags
   */
  filterByTags(tags: Array<string>): Result<Array<Item>> {
    const appsResult = this.getAllApps()
    if (!appsResult.success) {
      return appsResult
    }

    const filtered = appsResult.data.filter((app) =>
      tags.some((tag) => app.metadata.tags.some((t) => t.name === tag)),
    )
    return { success: true, data: filtered }
  }

  /**
   * Get all unique categories
   */
  getCategories(): Result<Array<string>> {
    const appsResult = this.getAllApps()
    if (!appsResult.success) {
      return appsResult
    }

    const categories = new Set(
      appsResult.data.map((app) => app.metadata.category),
    )
    return { success: true, data: Array.from(categories).sort() }
  }

  /**
   * Get all unique tags
   */
  getTags(): Result<Array<string>> {
    const appsResult = this.getAllApps()
    if (!appsResult.success) {
      return appsResult
    }

    const tags = new Set(
      appsResult.data.flatMap((app) => app.metadata.tags.map((t) => t.name)),
    )
    return { success: true, data: Array.from(tags).sort() }
  }

  /**
   * Get all tool-type items
   */
  getTools(): Result<Array<Item>> {
    const appsResult = this.getAllApps()
    if (!appsResult.success) {
      return appsResult
    }

    const tools = appsResult.data.filter((app) => app.type === 'tool')
    return { success: true, data: tools }
  }

  /**
   * Get all non-tool items (repos/apps)
   */
  getRepos(): Result<Array<Item>> {
    const appsResult = this.getAllApps()
    if (!appsResult.success) {
      return appsResult
    }

    const repos = appsResult.data.filter((app) => app.type !== 'tool')
    return { success: true, data: repos }
  }

  /**
   * Get dependencies for an item
   */
  getDependencies(itemId: string): Result<Array<Item>> {
    const itemResult = this.getAppById(itemId)
    if (!itemResult.success) {
      return itemResult
    }

    const item = itemResult.data
    if (!item.dependencies || item.dependencies.length === 0) {
      return { success: true, data: [] }
    }

    const deps: Item[] = []
    for (const depId of item.dependencies) {
      const depResult = this.getAppById(depId)
      if (depResult.success) {
        deps.push(depResult.data)
      } else {
        console.warn(`Dependency ${depId} not found for item ${itemId}`)
      }
    }

    return { success: true, data: deps }
  }

  /**
   * Get dependency tree (recursive)
   */
  getDependencyTree(
    itemId: string,
    visited = new Set<string>(),
  ): Result<Array<Item>> {
    if (visited.has(itemId)) {
      return { success: true, data: [] } // Circular dependency protection
    }

    visited.add(itemId)

    const depsResult = this.getDependencies(itemId)
    if (!depsResult.success) {
      return depsResult
    }

    const allDeps: Item[] = [...depsResult.data]

    for (const dep of depsResult.data) {
      const nestedResult = this.getDependencyTree(dep.id, visited)
      if (nestedResult.success) {
        allDeps.push(...nestedResult.data)
      }
    }

    // Remove duplicates
    const unique = Array.from(new Map(allDeps.map((d) => [d.id, d])).values())
    return { success: true, data: unique }
  }
}

/**
 * Singleton instance of the app registry service
 */
export const appRegistryService = new AppRegistryService()
