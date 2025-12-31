import type { App } from '@/types/app'
import { Link } from '@tanstack/react-router'
import { useAppCheck } from '@/services/state/app-state'
import { CheckCircle, XCircle } from '@phosphor-icons/react'
import { useToolHealth } from '@/services/state/tool-health-state'
import { useSingleToolHealthCheck } from '@/hooks/use-tool-health-check'

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

  const isInstalled = isTool ? healthCheck?.isInstalled : isRepoInstalled

  return (
    <li className="flex items-center justify-between rounded-md border border-border bg-card p-3">
      <div className="flex items-center gap-3">
        {isInstalled ? (
          <CheckCircle className="h-5 w-5 text-green-500" weight="fill" />
        ) : (
          <XCircle className="h-5 w-5 text-destructive" weight="fill" />
        )}
        <div className="flex flex-col">
          <Link
            to="/apps/$appId"
            params={{ appId: dependency.id }}
            className="text-sm font-medium text-primary hover:underline"
          >
            {dependency.name}
          </Link>
          {isTool && healthCheck?.version && (
            <span className="text-[10px] font-mono text-muted-foreground">
              {healthCheck.version}
            </span>
          )}
        </div>
      </div>
      {!isInstalled && onInstall && (
        <button
          onClick={() => onInstall(dependency)}
          className="rounded-md bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground transition-colors hover:bg-secondary/80"
        >
          Install
        </button>
      )}
    </li>
  )
}
