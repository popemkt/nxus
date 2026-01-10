import { useState } from 'react'
import {
  PlayIcon,
  StopIcon,
  TrashIcon,
  TerminalWindowIcon,
} from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Field, FieldLabel } from '@/components/ui/field'
import { CommandLogViewer } from '../commands/command-log-viewer'
import { useCommandExecution } from '@/hooks/use-command-execution'

interface ActionWithLogsProps {
  title: string
  description: string
  buttonLabel: string
  buttonIcon?: React.ReactNode
  command: string
  args?: string[]
  cwd?: string
  onComplete?: () => void
  onError?: (error: Error) => void
}

/**
 * A reusable component for actions that execute commands with live log streaming
 * This demonstrates the pattern for integrating command execution with log viewing
 */
export function ActionWithLogs({
  title,
  description,
  buttonLabel,
  buttonIcon,
  command,
  args = [],
  cwd,
  onComplete,
  onError,
}: ActionWithLogsProps) {
  const [showLogs, setShowLogs] = useState(false)
  const { logs, isRunning, executeCommand, clearLogs } = useCommandExecution({
    onComplete: () => {
      onComplete?.()
    },
    onError: (error) => {
      onError?.(error)
    },
  })

  const handleExecute = async () => {
    setShowLogs(true)
    await executeCommand(command, args, { cwd })
  }

  const handleClose = () => {
    setShowLogs(false)
    clearLogs()
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            onClick={handleExecute}
            disabled={isRunning}
            className="w-full justify-start"
          >
            {buttonIcon || <PlayIcon data-icon="inline-start" />}
            {isRunning ? 'Running...' : buttonLabel}
          </Button>
        </CardContent>
      </Card>

      {showLogs && (
        <CommandLogViewer
          title={`${title} - Logs`}
          logs={logs}
          isRunning={isRunning}
          onClose={handleClose}
        />
      )}
    </div>
  )
}

interface InstallActionWithLogsProps {
  appName: string
  repoUrl: string
  onComplete?: (path: string) => void
  onError?: (error: Error) => void
}

/**
 * Example: Installation action with streaming logs
 */
export function InstallActionWithLogs({
  appName,
  repoUrl,
  onComplete,
  onError,
}: InstallActionWithLogsProps) {
  const [installPath, setInstallPath] = useState('/home/popemkt/nxus-apps')
  const [showLogs, setShowLogs] = useState(false)
  const { logs, isRunning, executeCommand, clearLogs } = useCommandExecution({
    onComplete: () => {
      onComplete?.(installPath)
    },
    onError,
  })

  const handleInstall = async () => {
    setShowLogs(true)
    // Clone the repository
    await executeCommand('git', ['clone', repoUrl, `${installPath}/${appName}`])
  }

  const handleClose = () => {
    setShowLogs(false)
    clearLogs()
  }

  return (
    <div className="space-y-4">
      <Card className="border-primary">
        <CardHeader>
          <CardTitle>Install {appName}</CardTitle>
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
            <PlayIcon data-icon="inline-start" />
            {isRunning ? 'Installing...' : 'Start Installation'}
          </Button>
        </CardContent>
      </Card>

      {showLogs && (
        <CommandLogViewer
          title={`Installing ${appName}`}
          logs={logs}
          isRunning={isRunning}
          onClose={handleClose}
        />
      )}
    </div>
  )
}

interface ScriptActionWithLogsProps {
  scriptName: string
  scriptPath: string
  scriptArgs?: string[]
  cwd?: string
  onComplete?: () => void
  onError?: (error: Error) => void
}

/**
 * Example: Script execution with streaming logs
 */
export function ScriptActionWithLogs({
  scriptName,
  scriptPath,
  scriptArgs = [],
  cwd,
  onComplete,
  onError,
}: ScriptActionWithLogsProps) {
  const [showLogs, setShowLogs] = useState(false)
  const { logs, isRunning, executeCommand, clearLogs } = useCommandExecution({
    onComplete,
    onError,
  })

  const handleRun = async () => {
    setShowLogs(true)
    await executeCommand(scriptPath, scriptArgs, { cwd })
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
        <TerminalWindowIcon data-icon="inline-start" />
        {isRunning ? 'Running...' : `Run ${scriptName}`}
      </Button>

      {showLogs && (
        <CommandLogViewer
          title={`${scriptName} - Execution Logs`}
          logs={logs}
          isRunning={isRunning}
          onClose={handleClose}
        />
      )}
    </div>
  )
}
