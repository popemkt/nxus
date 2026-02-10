import type { ReactNode } from 'react'
import { Badge } from '@nxus/ui'
import { CheckCircle, FolderOpen, XCircle } from '@phosphor-icons/react'
import type { Item } from '@nxus/db'
import { useToolHealth } from '@/hooks/use-tool-health'
import { useAppCheck } from '@/services/state/app-state'
import { hasCheckCommand } from '@/lib/app-constants'

interface ItemHealthBadgeProps {
  app: Item
  compact?: boolean
  /** Rendered when no dynamic check is available */
  fallbackStatusBadge?: ReactNode
}

function ToolHealthBadges({ app, compact }: { app: Item; compact: boolean }) {
  const canCheck = hasCheckCommand(app)
  const healthCheck = useToolHealth(app, canCheck)

  if (!canCheck) return null

  if (healthCheck.isLoading) {
    return (
      <Badge variant="outline" className="flex items-center gap-1.5 animate-pulse">
        <span className="h-2 w-2 rounded-full bg-muted-foreground/50 animate-ping" />
        {!compact && 'Checking'}
      </Badge>
    )
  }

  return (
    <>
      <Badge
        variant={healthCheck.isInstalled ? 'default' : 'destructive'}
        className="flex items-center gap-1 animate-fade-in"
      >
        {healthCheck.isInstalled ? (
          <>
            <CheckCircle className="h-3 w-3" weight="fill" />
            {!compact && 'Installed'}
          </>
        ) : (
          <>
            <XCircle className="h-3 w-3" weight="fill" />
            {!compact && 'Not Found'}
          </>
        )}
      </Badge>

      {healthCheck.isInstalled && healthCheck.version && !compact && (
        <Badge variant="outline" className="font-mono text-xs animate-fade-in">
          {healthCheck.version}
        </Badge>
      )}
    </>
  )
}

function RepoHealthBadge({ app, compact }: { app: Item; compact: boolean }) {
  const isRepo = app.types?.includes('remote-repo') ?? false
  const repoCheck = useAppCheck(app.id)

  if (!isRepo) return null

  if (repoCheck.isInstalled) {
    return (
      <Badge variant="default" className="flex items-center gap-1">
        <FolderOpen className="h-3 w-3" weight="fill" />
        {!compact && (repoCheck.installationCount > 1
          ? `${repoCheck.installationCount} clones`
          : 'Cloned')}
      </Badge>
    )
  }

  return (
    <Badge variant="secondary" className="flex items-center gap-1">
      <XCircle className="h-3 w-3" />
      {!compact && 'Not Cloned'}
    </Badge>
  )
}

export function ItemHealthBadge({ app, compact = false, fallbackStatusBadge }: ItemHealthBadgeProps) {
  const isRepo = app.types?.includes('remote-repo') ?? false
  const hasDynamicCheck = hasCheckCommand(app) || isRepo

  if (!hasDynamicCheck) return fallbackStatusBadge ?? null

  return (
    <>
      <ToolHealthBadges app={app} compact={compact} />
      <RepoHealthBadge app={app} compact={compact} />
    </>
  )
}
