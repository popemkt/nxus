import { useOsInfo } from '@/services/state/app-state'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  WindowsLogo,
  AppleLogo,
  LinuxLogo,
  Desktop,
} from '@phosphor-icons/react'

export function OsBadge() {
  const osInfo = useOsInfo()

  // Show skeleton while loading
  if (!osInfo) {
    return (
      <Badge
        variant="outline"
        className="flex items-center gap-1.5 px-3 py-1 bg-background/50 backdrop-blur-sm"
      >
        <Skeleton className="h-3.5 w-3.5 rounded" />
        <Skeleton className="h-3 w-16" />
      </Badge>
    )
  }

  const getIcon = () => {
    switch (osInfo.platform) {
      case 'windows':
        return (
          <WindowsLogo className="size-3.5 animate-fade-in" weight="fill" />
        )
      case 'macos':
        return <AppleLogo className="size-3.5 animate-fade-in" weight="fill" />
      case 'linux':
        return <LinuxLogo className="size-3.5 animate-fade-in" weight="fill" />
      default:
        return <Desktop className="size-3.5 animate-fade-in" weight="fill" />
    }
  }

  const getLabel = () => {
    const arch = osInfo.arch === 'x64' ? '64-bit' : osInfo.arch
    const platformName =
      osInfo.platform.charAt(0).toUpperCase() + osInfo.platform.slice(1)
    return `${platformName} (${arch})`
  }

  return (
    <Badge
      variant="outline"
      className="flex items-center gap-1.5 px-3 py-1 bg-background/50 backdrop-blur-sm"
    >
      {getIcon()}
      <span className="animate-fade-in">{getLabel()}</span>
    </Badge>
  )
}
