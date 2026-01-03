import type { App } from '@/types/app'
import { Link } from '@tanstack/react-router'
import { useAppCheck } from '@/services/state/app-state'
import { CheckCircle, XCircle } from '@phosphor-icons/react'
import { useToolHealth } from '@/services/state/item-status-state'
import { useSingleToolHealthCheck } from '@/hooks/use-tool-health-check'
import { LoadingSpinner } from '@/components/ui/loading-spinner'

interface DependencyListProps {
  dependencies: App[]
  onInstall?: (app: App) => void
}

export function DependencyList({
  dependencies,
  onInstall,
}: DependencyListProps) {
  if (dependencies.length === 0) {
    return (
      <div className="text-sm text-muted-foreground">
        No dependencies required
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium">Dependencies</h4>
      <ul className="space-y-2">
        {dependencies.map((dep) => (
          <DependencyItem key={dep.id} dependency={dep} onInstall={onInstall} />
        ))}
      </ul>
    </div>
  )
}

interface DependencyItemProps {
  dependency: App
  onInstall?: (app: App) => void
}

function DependencyItem({ dependency, onInstall }: DependencyItemProps) {
  const isTool = dependency.type === 'tool'
  const { isInstalled: isRepoInstalled } = useAppCheck(dependency.id)

  // Health check for tools
  useSingleToolHealthCheck(dependency, isTool)
  const healthCheck = useToolHealth(dependency.id)

  // Determine loading state - for tools, we need to wait for health check
  const isCheckingHealth =
    isTool &&
    !healthCheck?.isInstalled &&
    healthCheck?.isInstalled === undefined
  const isInstalled = isTool ? healthCheck?.isInstalled : isRepoInstalled

  // Render status icon with smooth transitions
  const renderStatusIcon = () => {
    if (isCheckingHealth) {
      return <LoadingSpinner size="sm" className="shrink-0" />
    }

    if (isInstalled) {
      return (
        <CheckCircle
          className="h-5 w-5 text-green-500 shrink-0 animate-fade-in"
          weight="fill"
        />
      )
    }

    return (
      <XCircle
        className="h-5 w-5 text-destructive shrink-0 animate-fade-in"
        weight="fill"
      />
    )
  }

  return (
    <li className="flex items-center justify-between rounded-md border border-border bg-card p-3 status-transition">
      <div className="flex items-center gap-3">
        {renderStatusIcon()}
        <div className="flex flex-col">
          <Link
            to="/apps/$appId"
            params={{ appId: dependency.id }}
            className="text-sm font-medium text-primary hover:underline"
          >
            {dependency.name}
          </Link>
          {isTool && healthCheck?.version && (
            <span className="text-[10px] font-mono text-muted-foreground animate-fade-in">
              {healthCheck.version}
            </span>
          )}
        </div>
      </div>
      {!isInstalled && !isCheckingHealth && onInstall && (
        <button
          onClick={() => onInstall(dependency)}
          className="rounded-md bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground transition-colors hover:bg-secondary/80 animate-fade-in"
        >
          Install
        </button>
      )}
    </li>
  )
}
