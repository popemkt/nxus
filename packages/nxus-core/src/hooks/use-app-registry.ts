import { useState, useEffect, useMemo } from "react";
import type { App, AppType, AppStatus } from "../types/app";
import { appRegistryService } from "../services/app-registry.service";

interface UseAppRegistryOptions {
  searchQuery?: string;
  filterType?: AppType;
  filterStatus?: AppStatus;
  filterCategory?: string;
  filterTags?: string[];
}

interface UseAppRegistryReturn {
  apps: App[];
  loading: boolean;
  error: Error | null;
  categories: string[];
  tags: string[];
  refetch: () => void;
}

/**
 * React hook for accessing and filtering the app registry
 */
export function useAppRegistry(
  options: UseAppRegistryOptions = {}
): UseAppRegistryReturn {
  const [apps, setApps] = useState<App[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);

  const loadApps = () => {
    setLoading(true);
    setError(null);

    const result = appRegistryService.getAllApps();

    if (!result.success) {
      setError(result.error);
      setApps([]);
      setLoading(false);
      return;
    }

    setApps(result.data);

    const categoriesResult = appRegistryService.getCategories();
    if (categoriesResult.success) {
      setCategories(categoriesResult.data);
    }

    const tagsResult = appRegistryService.getTags();
    if (tagsResult.success) {
      setTags(tagsResult.data);
    }

    setLoading(false);
  };

  useEffect(() => {
    loadApps();
  }, []);

  const filteredApps = useMemo(() => {
    let filtered = apps;

    if (options.searchQuery) {
      const result = appRegistryService.searchApps(options.searchQuery);
      if (result.success) {
        filtered = result.data;
      }
    }

    if (options.filterType) {
      filtered = filtered.filter((app) => app.type === options.filterType);
    }

    if (options.filterStatus) {
      filtered = filtered.filter((app) => app.status === options.filterStatus);
    }

    if (options.filterCategory) {
      filtered = filtered.filter(
        (app) => app.metadata.category === options.filterCategory
      );
    }

    if (options.filterTags && options.filterTags.length > 0) {
      filtered = filtered.filter((app) =>
        options.filterTags!.some((tag) => app.metadata.tags.includes(tag))
      );
    }

    return filtered;
  }, [
    apps,
    options.searchQuery,
    options.filterType,
    options.filterStatus,
    options.filterCategory,
    options.filterTags,
  ]);

  return {
    apps: filteredApps,
    loading,
    error,
    categories,
    tags,
    refetch: loadApps,
  };
}

/**
 * Hook to get a single app by ID
 */
export function useApp(id: string) {
  const [app, setApp] = useState<App | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    const result = appRegistryService.getAppById(id);

    if (!result.success) {
      setError(result.error);
      setApp(null);
    } else {
      setApp(result.data);
    }

    setLoading(false);
  }, [id]);

  return { app, loading, error };
}
