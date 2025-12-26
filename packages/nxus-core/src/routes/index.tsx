import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import type { App } from '@/types/app'
import { AppGalleryWithSearch } from '@/components/app/app-gallery'
import { useAppRegistry } from '@/hooks/use-app-registry'
import { OsBadge } from '@/components/os-badge'
import { ThemeToggle } from '@/components/theme-toggle'
import { openApp } from '@/lib/app-actions'

export const Route = createFileRoute('/')({ component: AppManager })

function AppManager() {
  const [searchQuery, setSearchQuery] = useState('')
  const { apps, loading, error } = useAppRegistry({ searchQuery })

  const handleOpen = (app: App) => {
    openApp(app)
  }

  const handleInstall = (app: App) => {
    console.log('Install app:', app)
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-lg text-muted-foreground">Loading apps...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <p className="text-lg font-medium text-destructive">
            Error loading apps
          </p>
          <p className="text-sm text-muted-foreground">{error.message}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <header className="mb-8 flex items-start justify-between">
        <div>
          <h1
            className="text-4xl font-mono text-green-500 
                [text-shadow:0_0_8px_rgba(34,197,94,0.4),2px_0_rgba(239,68,68,0.7),-2px_0_rgba(59,130,246,0.7)] 
                tracking-tight hover:text-white transition-colors cursor-default select-none"
          >
            &gt; nXus_
          </h1>
          <p className="text-muted-foreground mt-2 font-medium tracking-wide">
            Command the chaos
          </p>
        </div>
        <div className="flex items-center gap-2">
          <OsBadge />
          <ThemeToggle />
        </div>
      </header>

      <AppGalleryWithSearch
        apps={apps}
        onOpen={handleOpen}
        onInstall={handleInstall}
        onSearchChange={setSearchQuery}
      />
    </div>
  )
}
