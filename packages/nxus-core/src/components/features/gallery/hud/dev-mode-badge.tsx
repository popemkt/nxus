import { useDevInfo } from '@/services/state/app-state'
import { Badge } from '@/components/ui/badge'
import { CodeIcon } from '@phosphor-icons/react'

export function DevModeBadge() {
  const devInfo = useDevInfo()

  if (!devInfo?.isDevMode) return null

  return (
    <Badge
      variant="outline"
      className="flex items-center gap-1.5 px-3 py-1 bg-primary/10 backdrop-blur-sm border-primary/30 text-primary radius-button font-bold"
      title={devInfo.devReposPath || 'Dev mode active'}
    >
      <CodeIcon className="size-3.5" weight="fill" />
      <span>Dev Mode</span>
    </Badge>
  )
}
