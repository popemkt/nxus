import * as React from 'react'
import { FolderIcon, CodeIcon, DownloadIcon } from '@phosphor-icons/react'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field, FieldLabel } from '@/components/ui/field'
import { useInstallModalStore } from '@/stores/install-modal.store'
import { useTerminalStore } from '@/stores/terminal.store'
import { useInstallPath } from '@/hooks/use-install-path'
import { useDevInfo, appStateService } from '@/services/state/app-state'
import { openFolderPickerServerFn } from '@/services/shell/folder-picker.server'
import { executeCommandServerFn } from '@/services/shell/command.server'

/**
 * Install Modal for cloning remote repositories
 * Opens from command palette or "Add Instance" button
 */
export function InstallModal() {
  const { isOpen, app, close } = useInstallModalStore()
  const { createTab, addLog, setStatus } = useTerminalStore()
  const devInfo = useDevInfo()

  // Get persisted install path for this app
  const { installPath, setInstallPath } = useInstallPath(app?.id ?? '')

  // Folder name defaults to app name
  const defaultFolderName =
    app?.name.toLowerCase().replace(/\s+/g, '-') || 'app'
  const [folderName, setFolderName] = React.useState(defaultFolderName)

  // Reset folder name when app changes
  React.useEffect(() => {
    if (app) {
      setFolderName(app.name.toLowerCase().replace(/\s+/g, '-'))
    }
  }, [app])

  const handleInstall = async () => {
    if (!app) return

    const fullPath = `${installPath}/${folderName}`
    close()

    // Create terminal tab for installation
    const tabId = createTab(`Installing ${app.name}`)
    setStatus(tabId, 'running')

    addLog(tabId, {
      timestamp: Date.now(),
      type: 'info',
      message: `$ git clone ${app.path} ${fullPath}\n`,
    })

    try {
      const result = await executeCommandServerFn({
        data: {
          command: 'git',
          args: ['clone', app.path!, fullPath],
        },
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

        if (result.data.exitCode === 0) {
          setStatus(tabId, 'success')
          addLog(tabId, {
            timestamp: Date.now(),
            type: 'success',
            message: '\n✓ Repository cloned successfully\n',
          })

          // Register the installation
          await appStateService.addInstallation(app.id, fullPath)
        } else {
          setStatus(tabId, 'error')
          addLog(tabId, {
            timestamp: Date.now(),
            type: 'error',
            message: `\n✗ Clone failed with exit code: ${result.data.exitCode}\n`,
          })
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

  if (!app) return null

  return (
    <AlertDialog open={isOpen} onOpenChange={(open) => !open && close()}>
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <div className="flex items-center gap-2">
            <DownloadIcon className="h-5 w-5 text-primary" />
            <AlertDialogTitle>Install {app.name}</AlertDialogTitle>
          </div>
          <AlertDialogDescription>
            Clone this repository to your local machine.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-4 py-4">
          <Field>
            <FieldLabel htmlFor="install-path">Installation Path</FieldLabel>
            <div className="flex gap-2">
              <Input
                id="install-path"
                value={installPath}
                onChange={(e) => setInstallPath(e.target.value)}
                placeholder="/path/to/projects"
                className="flex-1"
              />
              {devInfo?.isDevMode && devInfo.devReposPath && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setInstallPath(devInfo.devReposPath!)}
                  title="Use dev repos folder"
                >
                  <CodeIcon className="h-4 w-4" />
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                onClick={async () => {
                  const result = await openFolderPickerServerFn({
                    data: {
                      startPath: installPath,
                      title: 'Select Installation Folder',
                    },
                  })
                  if (result.success && result.path) {
                    setInstallPath(result.path)
                  }
                }}
                aria-label="Browse for folder"
              >
                <FolderIcon className="h-4 w-4" />
              </Button>
            </div>
          </Field>

          <Field>
            <FieldLabel htmlFor="folder-name">Folder Name</FieldLabel>
            <Input
              id="folder-name"
              value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
              placeholder={defaultFolderName}
            />
            <p className="text-xs text-muted-foreground mt-1">
              The name of the folder git will clone into
            </p>
          </Field>

          <div className="text-xs text-muted-foreground font-mono bg-muted rounded p-2 break-all">
            {installPath}/{folderName}
          </div>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <Button
            onClick={handleInstall}
            disabled={!installPath || !folderName}
          >
            <DownloadIcon className="h-4 w-4 mr-1" />
            Start Installation
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
