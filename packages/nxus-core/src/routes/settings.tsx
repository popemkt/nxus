import { ThemeChooser } from '@/components/features/settings/theme-chooser'
import { Button } from '@nxus/ui'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@nxus/ui'
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
} from '@nxus/ui'
import { Field, FieldLabel } from '@nxus/ui'
import { Input } from '@nxus/ui'
import { useAppRegistry } from '@/hooks/use-app-registry'
import { appRegistryService } from '@/services/apps/registry.service'
import {
  getAliasesServerFn,
  removeAliasServerFn,
  setAliasServerFn,
} from '@/services/command-palette/alias.server'
import { commandRegistry } from '@/services/command-palette/registry'
import { useToolConfigStore } from '@/services/state/tool-config-state'
import { useSettingsStore } from '@/stores/settings.store'
import type { ToolItem } from '@nxus/db'
import {
  ArrowLeftIcon,
  CommandIcon,
  CubeIcon,
  GearIcon,
  KeyboardIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  TrashIcon,
} from '@phosphor-icons/react'
import { createFileRoute, Link } from '@tanstack/react-router'
import React, { useEffect, useState } from 'react'

export const Route = createFileRoute('/settings')({ component: SettingsPage })

type SettingsSection = 'general' | 'keyboard' | 'aliases' | 'apps'

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
    { id: 'aliases' as const, label: 'Command Aliases', icon: CommandIcon },
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
            {activeSection === 'aliases' && <AliasSettings />}
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
  const defaultInstallPath = useSettingsStore(
    (s) => s.general.defaultInstallPath,
  )
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

function AliasSettings() {
  const [aliases, setAliases] = useState<Record<string, string>>({})
  const [newAlias, setNewAlias] = useState('')
  const [selectedCommand, setSelectedCommand] = useState('')
  const [isLoading, setIsLoading] = useState(true)

  // Ensure apps are loaded - this hook triggers app loading and syncs with appRegistryService
  const { allApps } = useAppRegistry({})

  // Get all available commands for the dropdown
  const allCommands = React.useMemo(() => {
    const generic = commandRegistry.getGenericCommands()
    const apps = commandRegistry.getAllAppCommands()
    return [
      ...generic.map((c) => ({ id: c.id, name: c.name, type: 'action' })),
      ...apps.map((c) => ({
        id: c.id,
        name: `${c.app.name}: ${c.command.name}`,
        type: 'app',
      })),
    ]
  }, [allApps]) // Re-compute when apps are loaded

  // Load aliases on mount
  useEffect(() => {
    getAliasesServerFn().then((data) => {
      setAliases(data)
      setIsLoading(false)
    })
  }, [])

  const handleAddAlias = async () => {
    if (!newAlias.trim() || !selectedCommand) return

    await setAliasServerFn({
      data: { commandId: selectedCommand, alias: newAlias.trim() },
    })
    const updated = await getAliasesServerFn()
    setAliases(updated)
    setNewAlias('')
    setSelectedCommand('')
  }

  const handleRemoveAlias = async (commandId: string) => {
    await removeAliasServerFn({ data: { commandId } })
    const updated = await getAliasesServerFn()
    setAliases(updated)
  }

  // Invert aliases map: alias → commandId becomes commandId → alias
  const commandToAlias = React.useMemo(() => {
    const map: Record<string, string> = {}
    for (const [alias, commandId] of Object.entries(aliases)) {
      map[commandId] = alias
    }
    return map
  }, [aliases])

  const aliasedCommands = Object.entries(commandToAlias).map(
    ([commandId, alias]) => {
      const cmd = allCommands.find((c) => c.id === commandId)
      return { commandId, alias, name: cmd?.name || commandId }
    },
  )

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-4">Command Aliases</h2>
        <p className="text-muted-foreground mb-6">
          Create short aliases for commands. Type the alias in the command
          palette to quickly find commands.
        </p>
      </div>

      {/* Add new alias */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add Alias</CardTitle>
          <CardDescription>
            Create a new alias for a command. After typing the alias, press
            space to auto-advance to target selection.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <Input
              placeholder="Alias (e.g., g)"
              value={newAlias}
              onChange={(e) => setNewAlias(e.target.value)}
              className="w-24 h-9"
            />
            <div className="flex-1">
              <Combobox
                value={selectedCommand}
                onValueChange={(val) => setSelectedCommand(val as string)}
              >
                <ComboboxInput
                  placeholder="Search commands..."
                  className="h-9"
                />
                <ComboboxContent>
                  <ComboboxList>
                    <ComboboxEmpty>No commands found</ComboboxEmpty>
                    <ComboboxGroup>
                      <ComboboxLabel>Actions</ComboboxLabel>
                      {allCommands
                        .filter((c) => c.type === 'action')
                        .map((c) => (
                          <ComboboxItem key={c.id} value={c.id}>
                            {c.name}
                          </ComboboxItem>
                        ))}
                    </ComboboxGroup>
                    <ComboboxGroup>
                      <ComboboxLabel>App Commands</ComboboxLabel>
                      {allCommands
                        .filter((c) => c.type === 'app')
                        .map((c) => (
                          <ComboboxItem key={c.id} value={c.id}>
                            {c.name}
                          </ComboboxItem>
                        ))}
                    </ComboboxGroup>
                  </ComboboxList>
                </ComboboxContent>
              </Combobox>
            </div>
            <Button
              onClick={handleAddAlias}
              disabled={!newAlias.trim() || !selectedCommand}
              className="h-9"
            >
              <PlusIcon className="h-4 w-4 mr-1" />
              Add
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Existing aliases */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Configured Aliases</CardTitle>
          <CardDescription>Your command aliases</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground text-sm">Loading...</p>
          ) : aliasedCommands.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No aliases configured yet.
            </p>
          ) : (
            <div className="space-y-2">
              {aliasedCommands.map(({ commandId, alias, name }) => (
                <div
                  key={commandId}
                  className="flex items-center justify-between py-2 px-3 rounded-md bg-muted/50"
                >
                  <div className="flex items-center gap-3">
                    <code className="px-2 py-0.5 rounded bg-primary/10 text-primary font-mono text-sm">
                      {alias}
                    </code>
                    <span className="text-sm">{name}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemoveAlias(commandId)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
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
      (app): app is ToolItem =>
        app.type === 'tool' && !!(app as ToolItem).configSchema,
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

function AppConfigCard({ app }: { app: ToolItem }) {
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
              value={(config as any)[field.key] ?? field.defaultValue ?? ''}
              onChange={(e) => handleChange(field.key, e.target.value)}
              placeholder={field.placeholder}
            />
          </Field>
        ))}
      </CardContent>
    </Card>
  )
}
