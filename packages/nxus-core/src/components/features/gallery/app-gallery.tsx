import { useState } from 'react'
import { MagnifyingGlassIcon } from '@phosphor-icons/react'
import { AppCard } from './app-card'
import type { App } from '@/types/app'
import { Input } from '@/components/ui/input'

interface AppGalleryProps {
  apps: Array<App>
  onOpen?: (app: App) => void
  onInstall?: (app: App) => void
  groupByType?: boolean
}

export function AppGallery({
  apps,
  onOpen,
  onInstall,
  groupByType = false,
}: AppGalleryProps) {
  if (!groupByType) {
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
    )
  }

  const tools = apps.filter((app) => app.type === 'tool')
  const repos = apps.filter((app) => app.type !== 'tool')

  return (
    <div className="space-y-8">
      {tools.length > 0 && (
        <section>
          <h2 className="mb-4 text-xl font-semibold">Tools & Dependencies</h2>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {tools.map((app) => (
              <AppCard
                key={app.id}
                app={app}
                onOpen={onOpen}
                onInstall={onInstall}
              />
            ))}
          </div>
        </section>
      )}

      {repos.length > 0 && (
        <section>
          <h2 className="mb-4 text-xl font-semibold">Applications</h2>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {repos.map((app) => (
              <AppCard
                key={app.id}
                app={app}
                onOpen={onOpen}
                onInstall={onInstall}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

interface AppGalleryWithSearchProps extends AppGalleryProps {
  onSearchChange?: (query: string) => void
}

export function AppGalleryWithSearch({
  apps,
  onOpen,
  onInstall,
  onSearchChange,
  groupByType = false,
}: AppGalleryWithSearchProps) {
  const [searchQuery, setSearchQuery] = useState('')

  const handleSearchChange = (value: string) => {
    setSearchQuery(value)
    onSearchChange?.(value)
  }

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
                ? 'Try adjusting your search query'
                : 'Add apps to get started'}
            </p>
          </div>
        </div>
      ) : (
        <AppGallery
          apps={apps}
          onOpen={onOpen}
          onInstall={onInstall}
          groupByType={groupByType}
        />
      )}
    </div>
  )
}
