import * as React from 'react'
import {
  ActivityIcon,
  CheckCircleIcon,
  DownloadIcon,
  EyeIcon,
  GithubLogoIcon,
  XCircleIcon,
  TrashIcon,
} from '@phosphor-icons/react'
import type { App } from '@/types/app'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field, FieldLabel } from '@/components/ui/field'
import { installAppServerFn } from '@/services/install.server'
import {
  useAppCheck,
  appStateService,
  useOsInfo,
} from '@/services/app-state'

interface AppActionsDialogProps {
  app: App
  trigger: React.ReactNode
  onOpen?: (app: App) => void
}

type DialogStep = 'actions' | 'configure-install' | 'installing' | 'result'

export function AppActionsDialog({
  app,
  trigger,
  onOpen,
}: AppActionsDialogProps) {
  const [step, setStep] = React.useState<DialogStep>('actions')
  const { isInstalled, path: savedPath } = useAppCheck(app.id)
  const osInfo = useOsInfo()

  const getDefaultPath = () => {
    if (savedPath) return savedPath
    if (!osInfo) return '/home/popemkt/nxus-apps'

    if (osInfo.platform === 'windows') {
      return 'C:\\workspace\\_playground'
    }
    // Linux/MacOS
    return '/stuff/WorkSpace'
  }

  const [installPath, setInstallPath] = React.useState(getDefaultPath())
  const [installResult, setInstallResult] = React.useState<{
    success: boolean
    message: string
  } | null>(null)

  // Update default path if saved path exists or osInfo loads
  React.useEffect(() => {
    if (savedPath) {
      setInstallPath(savedPath)
    } else if (osInfo && installPath === '/home/popemkt/nxus-apps') {
      setInstallPath(getDefaultPath())
    }
  }, [savedPath, osInfo])

  const handleInstall = async () => {
    setStep('installing')

    try {
      const result = await installAppServerFn({
        data: {
          id: app.id,
          name: app.name,
          url: app.path,
          targetPath: installPath,
        },
      })

      if (result.success && result.data) {
        setInstallResult({ success: true, message: result.data.message })
        // Persist to store
        if (result.data.path) {
          await appStateService.markAsInstalled(app.id, result.data.path)
        }
      } else {
        let message = 'Unknown error'
        if (!result.success) {
          message = result.error ?? 'Unknown error'
        }
        setInstallResult({
          success: false,
          message,
        })
      }
    } catch (error) {
      setInstallResult({
        success: false,
        message:
          error instanceof Error
            ? error.message
            : 'Unexpected error during installation',
      })
    }

    setStep('result')
  }

  const handleUninstall = async () => {
    if (
      confirm(
        'Are you sure you want to forget this installation? (Files will remain on disk)',
      )
    ) {
      await appStateService.removeInstallation(app.id)
    }
  }

  const resetDialog = () => {
    setStep('actions')
    setInstallResult(null)
  }

  const effectiveStatus = isInstalled ? 'installed' : app.status

  return (
    <AlertDialog onOpenChange={(open) => !open && resetDialog()}>
      <AlertDialogTrigger>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        {step === 'actions' && (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>{app.name}</AlertDialogTitle>
              <AlertDialogDescription>{app.description}</AlertDialogDescription>
            </AlertDialogHeader>
            <div className="grid gap-2 py-4">
              {effectiveStatus === 'installed' && onOpen && (
                <Button
                  onClick={() => onOpen(app)}
                  className="w-full justify-start"
                >
                  <EyeIcon data-icon="inline-start" />
                  Open Application
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

              {app.type === 'remote-repo' &&
                effectiveStatus !== 'installed' && (
                  <Button
                    onClick={() => setStep('configure-install')}
                    className="w-full justify-start"
                  >
                    <DownloadIcon data-icon="inline-start" />
                    Install locally
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
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel>Close</AlertDialogCancel>
            </AlertDialogFooter>
          </>
        )}

        {step === 'configure-install' && (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>Configure Installation</AlertDialogTitle>
              <AlertDialogDescription>
                Choose where you want to clone this repository.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="py-4">
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
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setStep('actions')}>
                Back
              </AlertDialogCancel>
              <AlertDialogAction onClick={handleInstall}>
                Start Installation
              </AlertDialogAction>
            </AlertDialogFooter>
          </>
        )}

        {step === 'installing' && (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <ActivityIcon className="h-12 w-12 animate-spin text-primary mb-4" />
            <AlertDialogTitle>Installing {app.name}...</AlertDialogTitle>
            <AlertDialogDescription>
              Cloning repository and preparing files. This might take a moment.
            </AlertDialogDescription>
          </div>
        )}

        {step === 'result' && installResult && (
          <>
            <div className="flex flex-col items-center justify-center py-8 text-center">
              {installResult.success ? (
                <CheckCircleIcon className="h-12 w-12 text-green-500 mb-4" />
              ) : (
                <XCircleIcon className="h-12 w-12 text-destructive mb-4" />
              )}
              <AlertDialogTitle>
                {installResult.success
                  ? 'Installation Complete'
                  : 'Installation Failed'}
              </AlertDialogTitle>
              <AlertDialogDescription className="mt-2 px-4 italic">
                {installResult.message}
              </AlertDialogDescription>
            </div>
            <AlertDialogFooter>
              <AlertDialogAction onClick={resetDialog}>Done</AlertDialogAction>
            </AlertDialogFooter>
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  )
}
