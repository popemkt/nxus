import { useDevInfo } from '@/services/state/app-state'
import { Badge } from '@/components/ui/badge'
import { CodeIcon } from '@phosphor-icons/react'

export function DevModeBadge() {
  const devInfo = useDevInfo()

  if (!devInfo?.isDevMode) return null

  return (
    <Badge
      variant="outline"
      className="flex items-center gap-1.5 px-3 py-1 bg-amber-50/50 dark:bg-amber-950/30 backdrop-blur-sm border-amber-500/50 text-amber-700 dark:text-amber-300"
      title={devInfo.devReposPath || 'Dev mode active'}
    >
      <CodeIcon className="size-3.5" weight="fill" />
      <span>Dev Mode</span>
    </Badge>
  )
}
