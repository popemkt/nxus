/**
 * Example: Integrating Command Streaming into App Detail Page
 *
 * This file shows how to replace the current installation flow
 * with the new streaming log viewer.
 */

import { useState, useEffect } from 'react'
import { Button } from '@nxus/ui'
import { Input } from '@nxus/ui'
import { Field, FieldLabel } from '@nxus/ui'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@nxus/ui'
import { CommandLogViewer } from '@/components/features/app-detail/commands/command-log-viewer'
import { useCommandExecution } from '@/hooks/use-command-execution'
import { appStateService } from '@/services/state/app-state'
import type { Item } from '@nxus/db'
import { usePath } from '@/hooks/use-paths'

interface StreamingInstallationProps {
  app: Item
  onComplete?: () => void
}

export function StreamingInstallation({
  app,
  onComplete,
}: StreamingInstallationProps) {
  const defaultAppInstallRoot = usePath('defaultAppInstallRoot')
  const [installPath, setInstallPath] = useState('')
  const [showLogs, setShowLogs] = useState(false)

  // Set install path once the path is loaded from server
  useEffect(() => {
    if (defaultAppInstallRoot && !installPath) {
      setInstallPath(defaultAppInstallRoot)
    }
  }, [defaultAppInstallRoot, installPath])

  const { logs, isRunning, executeCommand, clearLogs } = useCommandExecution({
    onComplete: async () => {
      // Mark as installed in app state
      const fullPath = `${installPath}/${app.name.toLowerCase().replace(/\s+/g, '-')}`
      await appStateService.markAsInstalled(app.id, fullPath)
      onComplete?.()
    },
    onError: (error) => {
      console.error('Installation failed:', error)
    },
  })

  const handleInstall = async () => {
    setShowLogs(true)

    // Execute git clone with streaming logs
    const repoName = app.name.toLowerCase().replace(/\s+/g, '-')
    await executeCommand('git', [
      'clone',
      app.path,
      `${installPath}/${repoName}`,
    ])

    // Optionally run post-install commands
    if (app.installConfig?.postInstallCommands) {
      for (const cmd of app.installConfig.postInstallCommands) {
        await executeCommand('sh', ['-c', cmd], {
          cwd: `${installPath}/${repoName}`,
        })
      }
    }
  }

  const handleClose = () => {
    setShowLogs(false)
    clearLogs()
  }

  return (
    <div className="space-y-4">
      {/* Configuration Card */}
      {!showLogs && (
        <Card className="border-primary">
          <CardHeader>
            <CardTitle>Install {app.name}</CardTitle>
            <CardDescription>
              Clone the repository and set up locally
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field>
              <FieldLabel htmlFor="install-path">Installation Path</FieldLabel>
              <Input
                id="install-path"
                value={installPath}
                onChange={(e) => setInstallPath(e.target.value)}
                placeholder="/path/to/apps"
                disabled={isRunning}
              />
            </Field>
            <Button
              onClick={handleInstall}
              disabled={isRunning}
              className="w-full"
            >
              {isRunning ? 'Installing...' : 'Start Installation'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Log Viewer */}
      {showLogs && (
        <CommandLogViewer
          title={`Installing ${app.name}`}
          logs={logs}
          isRunning={isRunning}
          onClose={!isRunning ? handleClose : undefined}
        />
      )}
    </div>
  )
}

/**
 * Example: Running Scripts with Streaming Logs
 */
interface StreamingScriptRunnerProps {
  scriptName: string
  scriptPath: string
  scriptArgs?: string[]
  workingDir?: string
}

export function StreamingScriptRunner({
  scriptName,
  scriptPath,
  scriptArgs = [],
  workingDir,
}: StreamingScriptRunnerProps) {
  const [showLogs, setShowLogs] = useState(false)
  const { logs, isRunning, executeCommand, clearLogs } = useCommandExecution()

  const handleRun = async () => {
    setShowLogs(true)
    await executeCommand(scriptPath, scriptArgs, { cwd: workingDir })
  }

  const handleClose = () => {
    setShowLogs(false)
    clearLogs()
  }

  return (
    <div className="space-y-4">
      <Button
        onClick={handleRun}
        disabled={isRunning}
        className="w-full justify-start"
      >
        {isRunning ? 'Running...' : `Run ${scriptName}`}
      </Button>

      {showLogs && (
        <CommandLogViewer
          title={`${scriptName} - Execution Logs`}
          logs={logs}
          isRunning={isRunning}
          onClose={!isRunning ? handleClose : undefined}
        />
      )}
    </div>
  )
}

/**
 * Example: Build Process with Streaming
 */
export function StreamingBuildProcess({
  projectPath,
}: {
  projectPath: string
}) {
  const [showLogs, setShowLogs] = useState(false)
  const { logs, isRunning, executeCommand, clearLogs } = useCommandExecution()

  const handleBuild = async () => {
    setShowLogs(true)

    // Multi-step build process
    await executeCommand('npm', ['install'], { cwd: projectPath })
    await executeCommand('npm', ['run', 'build'], { cwd: projectPath })
  }

  return (
    <div className="space-y-4">
      <Button onClick={handleBuild} disabled={isRunning} className="w-full">
        {isRunning ? 'Building...' : 'Build Project'}
      </Button>

      {showLogs && (
        <CommandLogViewer
          title="Build Process"
          logs={logs}
          isRunning={isRunning}
          onClose={
            !isRunning
              ? () => {
                  setShowLogs(false)
                  clearLogs()
                }
              : undefined
          }
        />
      )}
    </div>
  )
}
