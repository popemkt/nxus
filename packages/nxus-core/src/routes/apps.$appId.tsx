import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import {
  ArrowLeftIcon,
  FolderOpenIcon,
  FolderIcon,
  GithubLogoIcon,
  CalendarIcon,
  TagIcon,
  UserIcon,
  GlobeIcon,
  PlayIcon,
  ImageIcon,
  WarningIcon,
  CodeIcon,
  CheckCircleIcon,
  XCircleIcon,
  ArrowsClockwiseIcon,
  PencilSimpleIcon,
  BookOpenIcon,
} from '@phosphor-icons/react'
import { useAppRegistry } from '@/hooks/use-app-registry'
import { appRegistryService } from '@/services/apps/registry.service'
import { DependencyList } from '@/components/app/dependency-list'
import { useToolHealth } from '@/services/state/tool-health-state'
import { useSingleToolHealthCheck } from '@/hooks/use-tool-health-check'
import { useTerminalStore } from '@/stores/terminal.store'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { InstanceSelector } from '@/components/app/instance-selector'
import { InstanceActionsPanel } from '@/components/app/instance-actions-panel'
import { AppActionsPanel } from '@/components/app/app-actions-panel'
import { DocViewer } from '@/components/app/doc-viewer'
import { InstallModal } from '@/components/app/install-modal'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { getAppManifestPathServerFn } from '@/services/apps/docs.server'
import { openPathServerFn } from '@/services/shell/open-path.server'
import {
  useAppCheck,
  type InstalledAppRecord,
} from '@/services/state/app-state'
import { toolHealthService } from '@/services/state/tool-health-state'
import { installModalService } from '@/stores/install-modal.store'
import {
  APP_TYPE_ICONS,
  APP_TYPE_LABELS_LONG,
  STATUS_VARIANTS,
} from '@/lib/app-constants'
import { openApp } from '@/lib/app-actions'

// Component that tries to load thumbnail from registry or fallback paths
// Compact design - small square next to title
function DetailThumbnail({
  appId,
  appName,
  registryThumbnail,
}: {
  appId: string
  appName: string
  registryThumbnail?: string
}) {
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>(
    'loading',
  )
  const [src, setSrc] = useState(
    registryThumbnail || `/thumbnails/${appId}.svg`,
  )

  // Common styles for the container
  const containerClass =
    'w-32 aspect-[16/9] rounded-md overflow-hidden bg-muted shrink-0 ring-2 ring-border'

  // If registry has thumbnail, show it directly (no loading needed)
  if (registryThumbnail) {
    return (
      <div className={containerClass}>
        <img
          src={registryThumbnail}
          alt={appName}
          className="w-full h-full object-cover"
          style={{ viewTransitionName: `app-thumbnail-${appId}` }}
        />
      </div>
    )
  }

  // Loading state - render a placeholder with the transition name to prevent flash
  if (status === 'loading') {
    return (
      <div
        className={containerClass}
        style={{ viewTransitionName: `app-thumbnail-${appId}` }}
      >
        <img
          src={src}
          alt={appName}
          className="w-full h-full object-cover"
          onLoad={() => setStatus('loaded')}
          onError={() => {
            if (src.endsWith('.svg')) {
              setSrc(`/thumbnails/${appId}.png`)
            } else {
              setStatus('error')
            }
          }}
        />
      </div>
    )
  }

  // Error state - hide completely
  if (status === 'error') {
    return null
  }

  // Loaded state
  return (
    <div className={containerClass}>
      <img
        src={src}
        alt={appName}
        className="w-full h-full object-cover"
        style={{ viewTransitionName: `app-thumbnail-${appId}` }}
      />
    </div>
  )
}

/**
 * Generate Thumbnail button with dependency checking
 * Disabled with warning if Gemini CLI is not installed
 */
function GenerateThumbnailButton({
  appId,
  appName,
  appDescription,
  isGenerating,
  onGenerate,
}: {
  appId: string
  appName: string
  appDescription: string
  isGenerating: boolean
  onGenerate: (command: string, args: string[]) => Promise<void>
}) {
  const geminiTool = appRegistryService.getAppById('gemini-cli')
  const tool = geminiTool.success ? geminiTool.data : null

  useSingleToolHealthCheck(tool!, !!tool)
  const health = useToolHealth('gemini-cli')

  const handleClick = async () => {
    const thumbnailsDir = 'nxus-core/public/thumbnails'
    const safeDescription = appDescription
      .replace(/[()]/g, '')
      .replace(/"/g, '')
      .replace(/'/g, '')
    const prompt = `"Generate an SVG image for this application thumbnail. App: ${appName}. Description: ${safeDescription}. Style: Modern, vibrant colors, simple iconic design representing the app concept. Make it 800x450 aspect ratio. No text or labels. Save it as an SVG file named ${appId}.svg in the directory ${thumbnailsDir}."`

    await onGenerate('gemini', ['-y', prompt])
  }

  const isLoading = !health
  const allMet = health?.isInstalled
  const isDisabled = isLoading || !allMet || isGenerating

  if (!isLoading && !allMet && tool) {
    return (
      <div className="space-y-2">
        <Button
          variant="outline"
          className="w-full justify-start opacity-50"
          disabled
        >
          <ImageIcon data-icon="inline-start" />
          Generate Thumbnail
        </Button>
        <div className="flex items-start gap-2 text-sm text-amber-600 dark:text-amber-500 bg-amber-50 dark:bg-amber-950/30 rounded-md p-3">
          <WarningIcon className="h-4 w-4 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="font-medium">Missing: {tool.name}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {tool.type === 'tool' && tool.installInstructions}
            </p>
            {tool.homepage && (
              <a
                href={tool.homepage}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-primary hover:underline mt-2 inline-block"
              >
                View installation guide →
              </a>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <Button
      variant="outline"
      className="w-full justify-start"
      onClick={handleClick}
      disabled={isDisabled}
    >
      <ImageIcon data-icon="inline-start" />
      {isLoading
        ? 'Checking...'
        : isGenerating
          ? 'Generating...'
          : 'Generate Thumbnail'}
    </Button>
  )
}

/**
 * OverviewContent component - the main overview section for app detail page
 * Simplified - uses install modal and terminal panel for command output
 */
function OverviewContent({
  app,
  appId,
  effectiveStatus,
  selectedInstance,
  setSelectedInstance,
  handleOpen,
  setGitStatusRefreshKey,
}: {
  app: ReturnType<typeof useAppRegistry>['apps'][0]
  appId: string
  effectiveStatus: string
  selectedInstance: InstalledAppRecord | null
  setSelectedInstance: (instance: InstalledAppRecord | null) => void
  handleOpen: () => void
  setGitStatusRefreshKey: (fn: (k: number) => number) => void
}) {
  return (
    <>
      {/* Instance Selector */}
      <InstanceSelector
        appId={appId}
        canAddInstance={app.type === 'remote-repo'}
        onAddInstanceClick={() => installModalService.open(app)}
        isAddingInstance={false}
        onInstanceSelect={setSelectedInstance}
      />

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
          <CardDescription>Interact with this application</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Primary Actions */}
          {effectiveStatus === 'installed' && app.type === 'html' && (
            <Button onClick={handleOpen} className="w-full justify-start">
              <PlayIcon data-icon="inline-start" />
              Open Application
            </Button>
          )}

          {/* Refresh Status button for tools */}
          {app.type === 'tool' && (
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => toolHealthService.clearHealthCheck(app.id)}
            >
              <ArrowsClockwiseIcon data-icon="inline-start" />
              Refresh Status
            </Button>
          )}

          {/* Refresh Git Status button for remote repos */}
          {app.type === 'remote-repo' && selectedInstance && (
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => setGitStatusRefreshKey((k) => k + 1)}
            >
              <ArrowsClockwiseIcon data-icon="inline-start" />
              Refresh Git Status
            </Button>
          )}

          {/* Secondary Actions - compact row */}
          <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
            {app.homepage && (
              <Button
                variant="ghost"
                size="sm"
                render={
                  <a href={app.homepage} target="_blank" rel="noreferrer" />
                }
              >
                <GithubLogoIcon data-icon="inline-start" />
                GitHub
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                const paths = await getAppManifestPathServerFn({
                  data: { appId },
                })
                await openPathServerFn({ data: { path: paths.manifestPath } })
              }}
            >
              <PencilSimpleIcon data-icon="inline-start" />
              Manifest
            </Button>
            {app.docs && app.docs.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={async () => {
                  const paths = await getAppManifestPathServerFn({
                    data: { appId },
                  })
                  await openPathServerFn({ data: { path: paths.docsPath } })
                }}
              >
                <BookOpenIcon data-icon="inline-start" />
                Docs
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Unified Requirements List */}
      <Card>
        <CardHeader>
          <CardTitle>Requirements & Dependencies</CardTitle>
          <CardDescription>
            Everything needed to run or use this item
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            {/* Platforms */}
            {app.installConfig && (
              <div className="flex items-center justify-between pb-4 border-b border-border">
                <div className="flex items-center gap-2">
                  <GlobeIcon className="h-5 w-5 text-muted-foreground" />
                  <span className="text-sm font-medium">Platforms</span>
                </div>
                <div className="flex gap-1">
                  {app.installConfig.platform.map((p) => (
                    <Badge key={p} variant="outline" className="capitalize">
                      {p}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Dependencies List */}
            <DependencyList
              dependencies={
                appRegistryService.getDependencies(app.id).success
                  ? appRegistryService.getDependencies(app.id).data
                  : []
              }
            />
          </div>
        </CardContent>
      </Card>
    </>
  )
}

export const Route = createFileRoute('/apps/$appId')({
  component: AppDetailPage,
})

function AppDetailPage() {
  const { appId } = Route.useParams()
  const { apps, loading } = useAppRegistry({})
  const app = apps.find((a) => a.id === appId)
  const { isInstalled } = useAppCheck(appId)

  // Health check for the tool itself
  const isTool = app?.type === 'tool'
  useSingleToolHealthCheck(app!, isTool)
  const healthCheck = useToolHealth(app?.id ?? '')

  const [selectedInstance, setSelectedInstance] =
    useState<InstalledAppRecord | null>(null)

  // Refresh key for git status - increment to trigger re-check
  const [gitStatusRefreshKey, setGitStatusRefreshKey] = useState(0)

  // Terminal store for running commands
  const { createTab, addLog, setStatus } = useTerminalStore()

  // Execute command in terminal panel
  const executeInstanceCommand = async (
    command: string,
    args: string[],
    options?: { cwd?: string },
  ) => {
    const tabId = createTab(`${command} ${args.join(' ')}`)
    setStatus(tabId, 'running')

    addLog(tabId, {
      timestamp: Date.now(),
      type: 'info',
      message: `$ ${command} ${args.join(' ')}\n`,
    })

    try {
      const { executeCommandServerFn } = await import(
        '@/services/shell/command.server'
      )
      const result = await executeCommandServerFn({
        data: { command, args, cwd: options?.cwd },
      })

      if (result.success) {
        if (result.data.stdout) {
          addLog(tabId, {
            timestamp: Date.now(),
            type: 'stdout',
            message: result.data.stdout,
          })
        }
        if (result.data.stderr) {
          addLog(tabId, {
            timestamp: Date.now(),
            type: 'stderr',
            message: result.data.stderr,
          })
        }
        setStatus(tabId, result.data.exitCode === 0 ? 'success' : 'error')
        addLog(tabId, {
          timestamp: Date.now(),
          type: result.data.exitCode === 0 ? 'success' : 'error',
          message: `\n${result.data.exitCode === 0 ? '✓' : '✗'} Exit code: ${result.data.exitCode}\n`,
        })

        // Clear health check cache if this is a tool
        if (app?.type === 'tool') {
          toolHealthService.clearHealthCheck(app.id)
        }
        // Increment git status refresh key for remote repos
        if (app?.type === 'remote-repo') {
          setGitStatusRefreshKey((k) => k + 1)
        }
      } else {
        setStatus(tabId, 'error')
        addLog(tabId, {
          timestamp: Date.now(),
          type: 'error',
          message: `\n✗ ${result.error}\n`,
        })
      }
    } catch (error) {
      setStatus(tabId, 'error')
      addLog(tabId, {
        timestamp: Date.now(),
        type: 'error',
        message: `\n✗ ${error instanceof Error ? error.message : 'Unknown error'}\n`,
      })
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-lg text-muted-foreground">Loading...</p>
      </div>
    )
  }

  if (!app) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <p className="text-lg font-medium text-destructive">App not found</p>
          <Link to="/">
            <Button variant="outline" className="mt-4">
              <ArrowLeftIcon data-icon="inline-start" />
              Back to Gallery
            </Button>
          </Link>
        </div>
      </div>
    )
  }

  const TypeIcon = APP_TYPE_ICONS[app.type]
  const effectiveStatus = isInstalled ? 'installed' : app.status

  const handleOpen = () => {
    openApp(app)
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      {/* Header */}
      <div className="mb-8">
        {/* TODO: viewTransition disabled due to white flash issues */}
        <Link to="/">
          <Button variant="ghost" className="mb-4 -ml-2">
            <ArrowLeftIcon data-icon="inline-start" />
            Back to Gallery
          </Button>
        </Link>

        {/* Header with thumbnail, title, and description */}
        <div className="flex items-start gap-5 mb-4">
          {/* Compact thumbnail - inline with title */}
          <DetailThumbnail
            appId={appId}
            appName={app.name}
            registryThumbnail={app.thumbnail}
          />

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-4">
              <h1
                className="text-3xl font-bold mb-2"
                style={{ viewTransitionName: `app-title-${appId}` }}
              >
                {app.name}
              </h1>
              <TypeIcon className="h-7 w-7 text-muted-foreground shrink-0" />
            </div>
            <p className="text-muted-foreground line-clamp-2">
              {app.description}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mb-6">
          <Badge variant={STATUS_VARIANTS[effectiveStatus]}>
            {effectiveStatus.replace('-', ' ')}
          </Badge>
          <Badge variant="secondary">{APP_TYPE_LABELS_LONG[app.type]}</Badge>

          {/* Health check status for tools in header */}
          {isTool && healthCheck && (
            <Badge
              variant={healthCheck.isInstalled ? 'default' : 'destructive'}
              className="flex items-center gap-1"
            >
              {healthCheck.isInstalled ? (
                <>
                  <CheckCircleIcon className="h-3 w-3" weight="fill" />
                  Installed
                </>
              ) : (
                <>
                  <XCircleIcon className="h-3 w-3" weight="fill" />
                  Not Found
                </>
              )}
            </Badge>
          )}

          {isTool && healthCheck?.isInstalled && healthCheck.version && (
            <Badge variant="outline" className="font-mono">
              {healthCheck.version}
            </Badge>
          )}

          {app.metadata.tags.map((tag) => (
            <Badge key={tag} variant="outline">
              {tag}
            </Badge>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Only show tabs if there are docs, otherwise just render overview directly */}
          {app.docs && app.docs.length > 0 ? (
            <Tabs defaultValue="overview">
              <TabsList className="mb-4">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                {app.docs.map((doc) => (
                  <TabsTrigger key={doc.id} value={doc.id}>
                    {doc.title}
                  </TabsTrigger>
                ))}
              </TabsList>

              {/* Overview Tab */}
              <TabsContent value="overview" className="space-y-6">
                <OverviewContent
                  app={app}
                  appId={appId}
                  effectiveStatus={effectiveStatus}
                  selectedInstance={selectedInstance}
                  setSelectedInstance={setSelectedInstance}
                  handleOpen={handleOpen}
                  setGitStatusRefreshKey={setGitStatusRefreshKey}
                />
              </TabsContent>

              {/* Documentation Tabs */}
              {app.docs.map((doc) => (
                <TabsContent key={doc.id} value={doc.id}>
                  <Card>
                    <CardHeader>
                      <CardTitle>{doc.title}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <DocViewer
                        appId={appId}
                        fileName={doc.file}
                        app={app}
                        onExecuteCommand={(command) => {
                          const parts = command.split(' ')
                          const cmd = parts[0]
                          const args = parts.slice(1)
                          executeInstanceCommand(cmd, args)
                        }}
                      />
                    </CardContent>
                  </Card>
                </TabsContent>
              ))}
            </Tabs>
          ) : (
            <div className="space-y-6">
              {/* No tabs - just render overview content directly */}
              <OverviewContent
                app={app}
                appId={appId}
                effectiveStatus={effectiveStatus}
                selectedInstance={selectedInstance}
                setSelectedInstance={setSelectedInstance}
                handleOpen={handleOpen}
                setGitStatusRefreshKey={setGitStatusRefreshKey}
              />
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* App Actions Panel (for tools) */}
          {app.type === 'tool' && (
            <AppActionsPanel
              app={app}
              onRunCommand={async (command) => {
                // Parse command into parts for executeCommand
                const parts = command.split(' ')
                const cmd = parts[0]
                const args = parts.slice(1)
                await executeInstanceCommand(cmd, args)
              }}
            />
          )}

          {/* Instance Actions Panel */}
          <InstanceActionsPanel
            instance={selectedInstance}
            app={app}
            gitStatusRefreshKey={gitStatusRefreshKey}
            onRunCommand={async (command, cwd) => {
              // Parse command into parts for executeCommand
              const parts = command.split(' ')
              const cmd = parts[0]
              const args = parts.slice(1)
              await executeInstanceCommand(cmd, args, { cwd })
            }}
          />

          {/* Metadata */}
          <Card>
            <CardHeader>
              <CardTitle>Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {app.metadata.author && (
                <div className="flex items-start gap-3">
                  <UserIcon className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-sm font-medium">Author</p>
                    <p className="text-sm text-muted-foreground">
                      {app.metadata.author}
                    </p>
                  </div>
                </div>
              )}

              {app.metadata.version && (
                <div className="flex items-start gap-3">
                  <TagIcon className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-sm font-medium">Version</p>
                    <p className="text-sm text-muted-foreground">
                      {app.metadata.version}
                    </p>
                  </div>
                </div>
              )}

              <div className="flex items-start gap-3">
                <CalendarIcon className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-sm font-medium">Created</p>
                  <p className="text-sm text-muted-foreground">
                    {new Date(app.metadata.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <CalendarIcon className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-sm font-medium">Updated</p>
                  <p className="text-sm text-muted-foreground">
                    {new Date(app.metadata.updatedAt).toLocaleDateString()}
                  </p>
                </div>
              </div>

              {app.metadata.category && (
                <div className="flex items-start gap-3">
                  <FolderOpenIcon className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-sm font-medium">Category</p>
                    <p className="text-sm text-muted-foreground capitalize">
                      {app.metadata.category.replace('-', ' ')}
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Repository Info for remote repos */}
          {app.type === 'remote-repo' && (
            <Card>
              <CardHeader>
                <CardTitle>Repository</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <p className="text-sm font-medium mb-1">URL</p>
                  <p className="text-sm text-muted-foreground font-mono break-all">
                    {app.path}
                  </p>
                </div>
                {app.branch && (
                  <div>
                    <p className="text-sm font-medium mb-1">Branch</p>
                    <Badge variant="outline">{app.branch}</Badge>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Install Modal */}
      <InstallModal />
    </div>
  )
}
