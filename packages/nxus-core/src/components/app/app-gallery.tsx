import { useState } from "react";
import type { App } from "@/types/app";
import { AppCard } from "./app-card";
import { Input } from "@/components/ui/input";
import { MagnifyingGlassIcon } from "@phosphor-icons/react";

interface AppGalleryProps {
  apps: App[];
  onOpen?: (app: App) => void;
  onInstall?: (app: App) => void;
}

export function AppGallery({ apps, onOpen, onInstall }: AppGalleryProps) {
  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {apps.map((app) => (
        <AppCard
          key={app.id}
          app={app}
          onOpen={onOpen}
          onInstall={onInstall}
        />
      ))}
    </div>
  );
}

interface AppGalleryWithSearchProps extends AppGalleryProps {
  onSearchChange?: (query: string) => void;
}

export function AppGalleryWithSearch({
  apps,
  onOpen,
  onInstall,
  onSearchChange,
}: AppGalleryWithSearchProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    onSearchChange?.(value);
  };

  return (
    <div className="space-y-6">
      <div className="relative">
        <MagnifyingGlassIcon className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Search apps by name, description, or tags..."
          value={searchQuery}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="pl-10"
        />
      </div>

      {apps.length === 0 ? (
        <div className="flex min-h-[400px] items-center justify-center">
          <div className="text-center">
            <p className="text-lg font-medium text-muted-foreground">
              No apps found
            </p>
            <p className="text-sm text-muted-foreground">
              {searchQuery
                ? "Try adjusting your search query"
                : "Add apps to get started"}
            </p>
          </div>
        </div>
      ) : (
        <AppGallery apps={apps} onOpen={onOpen} onInstall={onInstall} />
      )}
    </div>
  );
}
