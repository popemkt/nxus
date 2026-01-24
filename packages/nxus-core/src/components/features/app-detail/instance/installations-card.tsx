import * as React from 'react'
import {
  FolderIcon,
  TrashIcon,
  PlusIcon,
  DownloadIcon,
  WarningIcon,
} from '@phosphor-icons/react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@nxus/ui'
import { Button } from '@nxus/ui'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@nxus/ui'
import { Checkbox } from '@nxus/ui'
import {
  useAppInstallations,
  appStateService,
  type InstalledAppRecord,
} from '@/services/state/app-state'
import { uninstallAppServerFn } from '@/services/apps/uninstall.server'

import { openPathServerFn } from '@/services/shell/open-path.server'

interface InstallationsCardProps {
  appId: string
  canInstall: boolean
  onInstallClick: () => void
  isInstalling?: boolean
}

export function InstallationsCard({
  appId,
  canInstall,
  onInstallClick,
  isInstalling,
}: InstallationsCardProps) {
  const installations = useAppInstallations(appId)
  const [removingId, setRemovingId] = React.useState<string | null>(null)

  if (installations.length === 0 && !canInstall) {
    return null
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Installations{' '}
          {installations.length > 0 && (
            <span className="text-muted-foreground font-normal">
              ({installations.length})
            </span>
          )}
        </CardTitle>
        <CardDescription>
          {installations.length === 0
            ? 'No installations yet'
            : 'Manage your local installations'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {installations.map((installation) => (
          <InstallationItem
            key={installation.id}
            installation={installation}
            isRemoving={removingId === installation.id}
            onRemoveStart={() => setRemovingId(installation.id)}
            onRemoveEnd={() => setRemovingId(null)}
          />
        ))}

        {canInstall && (
          <Button
            variant="outline"
            className="w-full justify-start"
            onClick={onInstallClick}
            disabled={isInstalling}
          >
            {installations.length === 0 ? (
              <>
                <DownloadIcon data-icon="inline-start" />
                Install Locally
              </>
            ) : (
              <>
                <PlusIcon data-icon="inline-start" />
                Install Another Copy
              </>
            )}
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

interface InstallationItemProps {
  installation: InstalledAppRecord
  isRemoving: boolean
  onRemoveStart: () => void
  onRemoveEnd: () => void
}

function InstallationItem({
  installation,
  isRemoving,
  onRemoveStart,
  onRemoveEnd,
}: InstallationItemProps) {
  const [deleteFromDisk, setDeleteFromDisk] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const handleOpenFolder = async () => {
    try {
      const result = await openPathServerFn({
        data: { path: installation.installPath },
      })
      if (!result.success) {
        setError(result.error || 'Failed to open folder')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    }
  }

  const handleRemove = async () => {
    onRemoveStart()
    setError(null)

    try {
      if (deleteFromDisk) {
        const result = await uninstallAppServerFn({
          data: {
            installPath: installation.installPath,
            deleteFromDisk: true,
          },
        })

        if (!result.success) {
          setError(result.error || 'Failed to delete files')
          onRemoveEnd()
          return
        }
      }

      // Remove from state
      await appStateService.removeInstallation(
        installation.appId,
        installation.id,
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      onRemoveEnd()
      setDeleteFromDisk(false)
    }
  }

  const installedDate = new Date(installation.installedAt).toLocaleDateString(
    undefined,
    {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    },
  )

  return (
    <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 ring-1 ring-border">
      <FolderIcon className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-mono break-all">
          {installation.installPath}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Installed {installedDate}
        </p>
        {error && <p className="text-xs text-destructive mt-1">{error}</p>}
      </div>
      <div className="flex gap-1 shrink-0">
        <Button
          variant="ghost"
          size="icon"
          onClick={handleOpenFolder}
          title="Open folder"
        >
          <FolderIcon className="h-4 w-4" />
        </Button>

        <AlertDialog>
          <AlertDialogTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                className="text-destructive hover:text-destructive"
                disabled={isRemoving}
                title="Remove installation"
              />
            }
          >
            <TrashIcon className="h-4 w-4" />
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogMedia className="bg-destructive/10 text-destructive">
                <WarningIcon className="h-5 w-5" />
              </AlertDialogMedia>
              <AlertDialogTitle>Remove Installation</AlertDialogTitle>
              <AlertDialogDescription>
                <span className="font-mono text-xs break-all block mb-3">
                  {installation.installPath}
                </span>
                Choose how to remove this installation.
              </AlertDialogDescription>
            </AlertDialogHeader>

            <div className="flex items-center gap-2 py-2">
              <Checkbox
                id="delete-from-disk"
                checked={deleteFromDisk}
                onCheckedChange={(checked: boolean) =>
                  setDeleteFromDisk(checked)
                }
              />
              <label
                htmlFor="delete-from-disk"
                className="text-sm cursor-pointer select-none"
              >
                Also delete files from disk
              </label>
            </div>

            {deleteFromDisk && (
              <p className="text-xs text-destructive">
                ⚠️ This will permanently delete all files in this folder!
              </p>
            )}

            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleRemove}
                variant={deleteFromDisk ? 'destructive' : 'default'}
              >
                {deleteFromDisk ? 'Delete from Disk' : 'Forget Installation'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  )
}
