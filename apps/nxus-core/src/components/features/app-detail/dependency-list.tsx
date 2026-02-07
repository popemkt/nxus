import { Link } from '@tanstack/react-router'
import { CheckCircle, XCircle } from '@phosphor-icons/react'
import { LoadingSpinner } from '@nxus/ui'
import type { Item } from '@nxus/db'
import { useAppCheck } from '@/services/state/app-state'
import { useToolHealth } from '@/hooks/use-tool-health'

interface DependencyListProps {
  dependencies: Array<Item>
  onInstall?: (app: Item) => void
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
  dependency: Item
  onInstall?: (app: Item) => void
}

function DependencyItem({ dependency, onInstall }: DependencyItemProps) {
  const isTool = dependency.types?.includes('tool') ?? false
  const { isInstalled: isRepoInstalled } = useAppCheck(dependency.id)

  // Health check for tools - uses TanStack Query via domain hook
  const healthCheck = useToolHealth(dependency, isTool)

  // Determine loading state - for tools, we need to wait for health check
  const isCheckingHealth = isTool && healthCheck.isLoading
  const isInstalled = isTool ? healthCheck.isInstalled : isRepoInstalled

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
