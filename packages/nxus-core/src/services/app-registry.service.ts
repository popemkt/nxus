import type {
  App,
  AppRegistry,
  Result,
  AppType,
  AppStatus,
} from "../types/app";
import { parseAppRegistry } from "../types/app";
import appRegistryData from "../data/app-registry.json";

/**
 * Service for managing the app registry
 * Handles loading, filtering, and searching apps
 */
export class AppRegistryService {
  private registry: AppRegistry | null = null;

  /**
   * Load and parse the app registry
   */
  loadRegistry(): Result<AppRegistry> {
    const result = parseAppRegistry(appRegistryData);
    if (result.success) {
      this.registry = result.data;
    }
    return result;
  }

  /**
   * Get all apps from the registry
   */
  getAllApps(): Result<App[]> {
    if (!this.registry) {
      const loadResult = this.loadRegistry();
      if (!loadResult.success) {
        return loadResult;
      }
    }

    return {
      success: true,
      data: this.registry!.apps,
    };
  }

  /**
   * Get app by ID
   */
  getAppById(id: string): Result<App> {
    const appsResult = this.getAllApps();
    if (!appsResult.success) {
      return appsResult;
    }

    const app = appsResult.data.find((a) => a.id === id);
    if (!app) {
      return {
        success: false,
        error: new Error(`App with id ${id} not found`),
      };
    }

    return { success: true, data: app };
  }

  /**
   * Search apps by name, description, or tags
   */
  searchApps(query: string): Result<App[]> {
    const appsResult = this.getAllApps();
    if (!appsResult.success) {
      return appsResult;
    }

    const lowerQuery = query.toLowerCase().trim();
    if (!lowerQuery) {
      return appsResult;
    }

    const filtered = appsResult.data.filter((app) => {
      const nameMatch = app.name.toLowerCase().includes(lowerQuery);
      const descMatch = app.description.toLowerCase().includes(lowerQuery);
      const tagMatch = app.metadata.tags.some((tag) =>
        tag.toLowerCase().includes(lowerQuery)
      );
      const categoryMatch = app.metadata.category
        .toLowerCase()
        .includes(lowerQuery);

      return nameMatch || descMatch || tagMatch || categoryMatch;
    });

    return { success: true, data: filtered };
  }

  /**
   * Filter apps by type
   */
  filterByType(type: AppType): Result<App[]> {
    const appsResult = this.getAllApps();
    if (!appsResult.success) {
      return appsResult;
    }

    const filtered = appsResult.data.filter((app) => app.type === type);
    return { success: true, data: filtered };
  }

  /**
   * Filter apps by status
   */
  filterByStatus(status: AppStatus): Result<App[]> {
    const appsResult = this.getAllApps();
    if (!appsResult.success) {
      return appsResult;
    }

    const filtered = appsResult.data.filter((app) => app.status === status);
    return { success: true, data: filtered };
  }

  /**
   * Filter apps by category
   */
  filterByCategory(category: string): Result<App[]> {
    const appsResult = this.getAllApps();
    if (!appsResult.success) {
      return appsResult;
    }

    const filtered = appsResult.data.filter(
      (app) => app.metadata.category === category
    );
    return { success: true, data: filtered };
  }

  /**
   * Filter apps by tags
   */
  filterByTags(tags: string[]): Result<App[]> {
    const appsResult = this.getAllApps();
    if (!appsResult.success) {
      return appsResult;
    }

    const filtered = appsResult.data.filter((app) =>
      tags.some((tag) => app.metadata.tags.includes(tag))
    );
    return { success: true, data: filtered };
  }

  /**
   * Get all unique categories
   */
  getCategories(): Result<string[]> {
    const appsResult = this.getAllApps();
    if (!appsResult.success) {
      return appsResult;
    }

    const categories = new Set(
      appsResult.data.map((app) => app.metadata.category)
    );
    return { success: true, data: Array.from(categories).sort() };
  }

  /**
   * Get all unique tags
   */
  getTags(): Result<string[]> {
    const appsResult = this.getAllApps();
    if (!appsResult.success) {
      return appsResult;
    }

    const tags = new Set(
      appsResult.data.flatMap((app) => app.metadata.tags)
    );
    return { success: true, data: Array.from(tags).sort() };
  }
}

/**
 * Singleton instance of the app registry service
 */
export const appRegistryService = new AppRegistryService();
