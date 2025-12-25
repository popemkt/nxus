import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import {
  ArrowLeftIcon,
  CodeIcon,
  DownloadIcon,
  FileIcon,
  FolderOpenIcon,
  GithubLogoIcon,
  TerminalWindowIcon,
  TrashIcon,
  CheckCircleIcon,
  XCircleIcon,
  ActivityIcon,
  CalendarIcon,
  TagIcon,
  UserIcon,
  GlobeIcon,
  PackageIcon,
  PlayIcon,
  FolderIcon,
} from '@phosphor-icons/react'
import { useAppRegistry } from '@/hooks/use-app-registry'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Field, FieldLabel } from '@/components/ui/field'
import { installAppServerFn } from '@/services/install.server'
import { useAppCheck, appStateService } from '@/services/app-state'
import type { App } from '@/types/app'

export const Route = createFileRoute('/apps/$appId')({
  component: AppDetailPage,
})

const APP_TYPE_ICONS = {
  html: FileIcon,
  typescript: CodeIcon,
  'remote-repo': FolderOpenIcon,
  'script-tool': TerminalWindowIcon,
}

const APP_TYPE_LABELS = {
  html: 'HTML Application',
  typescript: 'TypeScript Application',
  'remote-repo': 'Remote Repository',
  'script-tool': 'Script Tool',
}

const STATUS_VARIANTS = {
  installed: 'default',
  'not-installed': 'secondary',
  available: 'outline',
} as const

type InstallStep = 'idle' | 'configuring' | 'installing' | 'success' | 'error'

function AppDetailPage() {
  const { appId } = Route.useParams()
  const navigate = useNavigate()
  const { apps, loading } = useAppRegistry({})
  const app = apps.find((a) => a.id === appId)
  const { isInstalled, path: savedPath } = useAppCheck(appId)

  const [installStep, setInstallStep] = useState<InstallStep>('idle')
  const [installPath, setInstallPath] = useState(
    savedPath || '/home/popemkt/nxus-apps',
  )
  const [installMessage, setInstallMessage] = useState('')

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

  const handleInstall = async () => {
    setInstallStep('installing')

    try {
      const result = await installAppServerFn({
        data: {
          id: app.id,
          name: app.name,
          url: app.path,
          targetPath: installPath,
        },
      })

      if (result.success) {
        setInstallMessage(result.data.message)
        await appStateService.markAsInstalled(app.id, result.data.path)
        setInstallStep('success')
      } else {
        setInstallMessage(result.error)
        setInstallStep('error')
      }
    } catch (error) {
      setInstallMessage(
        error instanceof Error
          ? error.message
          : 'Unexpected error during installation',
      )
      setInstallStep('error')
    }
  }

  const handleUninstall = async () => {
    if (
      confirm(
        'Are you sure you want to forget this installation? (Files will remain on disk)',
      )
    ) {
      await appStateService.removeInstallation(app.id)
      setInstallStep('idle')
    }
  }

  const handleOpen = () => {
    if (app.type === 'html') {
      window.open(app.path, '_blank')
    }
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      {/* Header */}
      <div className="mb-8">
        <Link to="/">
          <Button variant="ghost" className="mb-4 -ml-2">
            <ArrowLeftIcon data-icon="inline-start" />
            Back to Gallery
          </Button>
        </Link>

        <div className="flex items-start gap-6">
          {app.thumbnail && (
            <div className="w-32 h-32 rounded-lg overflow-hidden bg-muted shrink-0 ring-2 ring-border">
              <img
                src={app.thumbnail}
                alt={app.name}
                className="w-full h-full object-cover"
              />
            </div>
          )}

          <div className="flex-1">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-4xl font-bold mb-2">{app.name}</h1>
                <p className="text-lg text-muted-foreground mb-4">
                  {app.description}
                </p>
              </div>
              <TypeIcon className="h-8 w-8 text-muted-foreground shrink-0" />
            </div>

            <div className="flex flex-wrap gap-2">
              <Badge variant={STATUS_VARIANTS[effectiveStatus]}>
                {effectiveStatus.replace('-', ' ')}
              </Badge>
              <Badge variant="secondary">{APP_TYPE_LABELS[app.type]}</Badge>
              {app.metadata.tags.map((tag) => (
                <Badge key={tag} variant="outline">
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
              <CardDescription>
                Manage and interact with this application
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {effectiveStatus === 'installed' && app.type === 'html' && (
                <Button onClick={handleOpen} className="w-full justify-start">
                  <PlayIcon data-icon="inline-start" />
                  Open Application
                </Button>
              )}

              {effectiveStatus === 'installed' && savedPath && (
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => {
                    // Open file manager at path
                    window.open(`file://${savedPath}`, '_blank')
                  }}
                >
                  <FolderIcon data-icon="inline-start" />
                  Open in File Manager
                </Button>
              )}

              {app.type === 'remote-repo' &&
                effectiveStatus !== 'installed' && (
                  <Button
                    onClick={() => setInstallStep('configuring')}
                    className="w-full justify-start"
                    disabled={installStep === 'installing'}
                  >
                    <DownloadIcon data-icon="inline-start" />
                    Install Locally
                  </Button>
                )}

              {effectiveStatus === 'installed' && (
                <Button
                  onClick={handleUninstall}
                  variant="outline"
                  className="w-full justify-start text-destructive hover:text-destructive"
                >
                  <TrashIcon data-icon="inline-start" />
                  Forget Installation
                </Button>
              )}

              {app.homepage && (
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  render={
                    <a href={app.homepage} target="_blank" rel="noreferrer" />
                  }
                >
                  <GithubLogoIcon data-icon="inline-start" />
                  View on GitHub
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Installation Panel */}
          {installStep === 'configuring' && (
            <Card className="border-primary">
              <CardHeader>
                <CardTitle>Configure Installation</CardTitle>
                <CardDescription>
                  Choose where you want to clone this repository
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Field>
                  <FieldLabel htmlFor="install-path">
                    Installation Path
                  </FieldLabel>
                  <Input
                    id="install-path"
                    value={installPath}
                    onChange={(e) => setInstallPath(e.target.value)}
                    placeholder="/path/to/apps"
                  />
                </Field>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setInstallStep('idle')}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button onClick={handleInstall} className="flex-1">
                    Start Installation
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {installStep === 'installing' && (
            <Card className="border-primary">
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <ActivityIcon className="h-16 w-16 animate-spin text-primary mb-4" />
                <h3 className="text-xl font-semibold mb-2">
                  Installing {app.name}...
                </h3>
                <p className="text-muted-foreground">
                  Cloning repository and preparing files. This might take a
                  moment.
                </p>
              </CardContent>
            </Card>
          )}

          {installStep === 'success' && (
            <Card className="border-green-500">
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <CheckCircleIcon className="h-16 w-16 text-green-500 mb-4" />
                <h3 className="text-xl font-semibold mb-2">
                  Installation Complete
                </h3>
                <p className="text-muted-foreground italic">{installMessage}</p>
                <Button onClick={() => setInstallStep('idle')} className="mt-4">
                  Done
                </Button>
              </CardContent>
            </Card>
          )}

          {installStep === 'error' && (
            <Card className="border-destructive">
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <XCircleIcon className="h-16 w-16 text-destructive mb-4" />
                <h3 className="text-xl font-semibold mb-2">
                  Installation Failed
                </h3>
                <p className="text-muted-foreground italic">{installMessage}</p>
                <Button
                  onClick={() => setInstallStep('idle')}
                  variant="outline"
                  className="mt-4"
                >
                  Close
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Installation Configuration */}
          {app.installConfig && (
            <Card>
              <CardHeader>
                <CardTitle>Installation Requirements</CardTitle>
                <CardDescription>
                  System requirements and dependencies
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                    <GlobeIcon className="h-4 w-4" />
                    Supported Platforms
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {app.installConfig.platform.map((platform) => (
                      <Badge key={platform} variant="outline">
                        {platform}
                      </Badge>
                    ))}
                  </div>
                </div>

                {app.installConfig.dependencies &&
                  app.installConfig.dependencies.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                        <PackageIcon className="h-4 w-4" />
                        Dependencies
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {app.installConfig.dependencies.map((dep) => (
                          <Badge key={dep} variant="outline">
                            {dep}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
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

              {savedPath && (
                <div className="flex items-start gap-3">
                  <FolderIcon className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-sm font-medium">Installed At</p>
                    <p className="text-sm text-muted-foreground font-mono break-all">
                      {savedPath}
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
    </div>
  )
}
