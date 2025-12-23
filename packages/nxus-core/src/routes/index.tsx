import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppGalleryWithSearch } from "@/components/app/app-gallery";
import { useAppRegistry } from "@/hooks/use-app-registry";
import type { App } from "@/types/app";

export const Route = createFileRoute("/")({ component: AppManager });

function AppManager() {
  const [searchQuery, setSearchQuery] = useState("");
  const { apps, loading, error } = useAppRegistry({ searchQuery });

  const handleOpen = (app: App) => {
    if (app.type === "html") {
      window.open(app.path, "_blank");
    }
  };

  const handleInstall = (app: App) => {
    console.log("Install app:", app);
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-lg text-muted-foreground">Loading apps...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <p className="text-lg font-medium text-destructive">Error loading apps</p>
          <p className="text-sm text-muted-foreground">{error.message}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <header className="mb-8">
        <h1 className="text-4xl font-bold">Nxus</h1>
        <p className="text-muted-foreground">Manage your generated apps</p>
      </header>

      <AppGalleryWithSearch
        apps={apps}
        onOpen={handleOpen}
        onInstall={handleInstall}
        onSearchChange={setSearchQuery}
      />
    </div>
  );
}