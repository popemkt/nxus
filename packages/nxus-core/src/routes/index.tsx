import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { MagnifyingGlassIcon, GearIcon } from '@phosphor-icons/react'
import type { App } from '@/types/app'
import { AppGallery } from '@/components/app/app-gallery'
import { Input } from '@/components/ui/input'
import { useAppRegistry } from '@/hooks/use-app-registry'
import { OsBadge } from '@/components/os-badge'
import { DevModeBadge } from '@/components/dev-mode-badge'
import { ThemeToggle } from '@/components/theme-toggle'
import { openApp } from '@/lib/app-actions'
import { useToolHealthCheck } from '@/hooks/use-tool-health-check'
import { GlitchText } from '@/components/ui/glitch-text'
import { DecodeText } from '@/components/ui/decode-text'

export const Route = createFileRoute('/')({ component: AppManager })

function AppManager() {
  const [searchQuery, setSearchQuery] = useState('')
  const { apps, loading, error } = useAppRegistry({ searchQuery })

  // Trigger health checks for all tools
  useToolHealthCheck(apps)

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
    <div className="flex h-screen flex-col">
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 py-6">
          <div className="mb-6 flex items-start justify-between">
            <div>
              <GlitchText
                text="> nXus_"
                className="text-4xl font-mono text-green-500 
                    [text-shadow:0_0_8px_rgba(34,197,94,0.4),2px_0_rgba(239,68,68,0.7),-2px_0_rgba(59,130,246,0.7)] 
                    tracking-tight hover:text-white transition-colors cursor-default select-none font-bold"
              />
              <DecodeText
                text="Command the chaos"
                className="text-muted-foreground mt-2 font-medium tracking-wide font-mono"
              />
            </div>
            <div className="flex items-center gap-2">
              <DevModeBadge />
              <OsBadge />
              <ThemeToggle />
              <Link
                to="/settings"
                className="rounded-md p-2 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              >
                <GearIcon className="h-5 w-5" />
              </Link>
            </div>
          </div>

          <div className="relative">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search apps by name, description, or tags..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="container mx-auto px-4 py-6">
          {apps.length === 0 ? (
            <div className="flex min-h-[400px] items-center justify-center">
              <div className="text-center">
                <p className="text-lg font-medium text-muted-foreground">
                  No apps found
                </p>
                <p className="text-sm text-muted-foreground">
                  {searchQuery
                    ? 'Try adjusting your search query'
                    : 'Add apps to get started'}
                </p>
              </div>
            </div>
          ) : (
            <AppGallery
              apps={apps}
              onOpen={handleOpen}
              onInstall={handleInstall}
              groupByType={false}
            />
          )}
        </div>
      </div>
    </div>
  )
}
