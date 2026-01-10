import { createFileRoute, Link } from '@tanstack/react-router'
import React, { useState } from 'react'
import {
  GearIcon,
  KeyboardIcon,
  CubeIcon,
  ArrowLeftIcon,
  MagnifyingGlassIcon,
} from '@phosphor-icons/react'
import { Input } from '@/components/ui/input'
import { ThemeChooser } from '@/components/features/settings/theme-chooser'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Field, FieldLabel } from '@/components/ui/field'
import { useSettingsStore, type ThemeSetting } from '@/stores/settings.store'
import { useToolConfigStore } from '@/services/state/tool-config-state'
import { appRegistryService } from '@/services/apps/registry.service'
import type { ToolApp } from '@/types/app'

export const Route = createFileRoute('/settings')({ component: SettingsPage })

type SettingsSection = 'general' | 'keyboard' | 'apps'

function SettingsPage() {
  const [activeSection, setActiveSection] = useState<SettingsSection>('general')
  const [searchQuery, setSearchQuery] = useState('')

  const sections = [
    { id: 'general' as const, label: 'General', icon: GearIcon },
    {
      id: 'keyboard' as const,
      label: 'Keyboard Shortcuts',
      icon: KeyboardIcon,
    },
    { id: 'apps' as const, label: 'App Configurations', icon: CubeIcon },
  ]

  return (
    <div className="flex h-screen flex-col">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center gap-4">
            <Link
              to="/"
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeftIcon className="h-4 w-4" />
              <span className="text-sm">Back</span>
            </Link>
            <h1 className="text-2xl font-bold">Settings</h1>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-64 border-r bg-muted/30 p-4 space-y-1">
          <div className="relative mb-4">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search settings..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9"
            />
          </div>

          {sections.map((section) => (
            <button
              key={section.id}
              onClick={() => setActiveSection(section.id)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                activeSection === section.id
                  ? 'bg-primary text-primary-foreground'
                  : 'hover:bg-muted'
              }`}
            >
              <section.icon className="h-4 w-4" />
              {section.label}
            </button>
          ))}
        </aside>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-2xl">
            {activeSection === 'general' && <GeneralSettings />}
            {activeSection === 'keyboard' && <KeyboardSettings />}
            {activeSection === 'apps' && (
              <AppConfigSettings searchQuery={searchQuery} />
            )}
          </div>
        </main>
      </div>
    </div>
  )
}

function GeneralSettings() {
  const theme = useSettingsStore((s) => s.general.theme)
  const defaultInstallPath = useSettingsStore(
    (s) => s.general.defaultInstallPath,
  )
  const setTheme = useSettingsStore((s) => s.setTheme)
  const setDefaultInstallPath = useSettingsStore((s) => s.setDefaultInstallPath)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-4">General</h2>
        <p className="text-muted-foreground mb-6">
          Configure general application settings.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Appearance</CardTitle>
          <CardDescription>Choose your preferred theme</CardDescription>
        </CardHeader>
        <CardContent>
          <ThemeChooser />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Defaults</CardTitle>
          <CardDescription>Default paths and behaviors</CardDescription>
        </CardHeader>
        <CardContent>
          <Field>
            <FieldLabel>Default Install Path</FieldLabel>
            <Input
              value={defaultInstallPath}
              onChange={(e) => setDefaultInstallPath(e.target.value)}
              placeholder="~/Projects"
            />
          </Field>
        </CardContent>
      </Card>
    </div>
  )
}

function KeyboardSettings() {
  const commandPalette = useSettingsStore((s) => s.keybindings.commandPalette)
  const setKeybinding = useSettingsStore((s) => s.setKeybinding)
  const [editing, setEditing] = useState<string | null>(null)

  const handleKeyDown = (e: React.KeyboardEvent, key: 'commandPalette') => {
    e.preventDefault()
    const parts: string[] = []
    if (e.ctrlKey) parts.push('Ctrl')
    if (e.shiftKey) parts.push('Shift')
    if (e.altKey) parts.push('Alt')
    if (e.metaKey) parts.push('Meta')

    // Add the key if it's not a modifier
    if (!['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) {
      parts.push(e.key.toUpperCase())
      setKeybinding(key, parts.join('+'))
      setEditing(null)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-4">Keyboard Shortcuts</h2>
        <p className="text-muted-foreground mb-6">
          Customize keyboard shortcuts for quick actions.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Global Shortcuts</CardTitle>
          <CardDescription>App-wide keyboard shortcuts</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="font-medium">Command Palette</p>
              <p className="text-sm text-muted-foreground">
                Open the command palette
              </p>
            </div>
            {editing === 'commandPalette' ? (
              <Input
                autoFocus
                placeholder="Press keys..."
                className="w-40 text-center"
                onKeyDown={(e) => handleKeyDown(e, 'commandPalette')}
                onBlur={() => setEditing(null)}
              />
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditing('commandPalette')}
                className="font-mono"
              >
                {commandPalette}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function AppConfigSettings({ searchQuery }: { searchQuery: string }) {
  // Memoize apps to prevent recalculation on every render
  const configurableApps = React.useMemo(() => {
    const appsResult = appRegistryService.getAllApps()
    const apps = appsResult.success ? appsResult.data : []
    return apps.filter(
      (app): app is ToolApp =>
        app.type === 'tool' && !!(app as ToolApp).configSchema,
    )
  }, [])

  const filteredApps = configurableApps.filter(
    (app) =>
      !searchQuery ||
      app.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      app.id.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-4">App Configurations</h2>
        <p className="text-muted-foreground mb-6">
          Configure settings for individual apps.
        </p>
      </div>

      {filteredApps.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No configurable apps found
          </CardContent>
        </Card>
      ) : (
        filteredApps.map((app) => <AppConfigCard key={app.id} app={app} />)
      )}
    </div>
  )
}

// Stable empty object to prevent infinite re-renders
const EMPTY_CONFIG = {}

function AppConfigCard({ app }: { app: ToolApp }) {
  const config = useToolConfigStore((s) => s.configs[app.id]) || EMPTY_CONFIG

  const handleChange = (key: string, value: string) => {
    useToolConfigStore.getState().actions.setConfig(app.id, key, value)
  }

  if (!app.configSchema) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{app.name}</CardTitle>
        <CardDescription>{app.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {app.configSchema.fields.map((field) => (
          <Field key={field.key}>
            <FieldLabel>
              {field.label}
              {field.required && (
                <span className="text-destructive ml-1">*</span>
              )}
            </FieldLabel>
            <Input
              type={field.type === 'password' ? 'password' : 'text'}
              value={config[field.key] ?? field.defaultValue ?? ''}
              onChange={(e) => handleChange(field.key, e.target.value)}
              placeholder={field.placeholder}
            />
          </Field>
        ))}
      </CardContent>
    </Card>
  )
}
