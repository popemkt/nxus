import { useOsInfo } from '@/services/state/app-state'
import { Badge } from '@/components/ui/badge'
import {
  WindowsLogo,
  AppleLogo,
  LinuxLogo,
  Desktop,
} from '@phosphor-icons/react'

export function OsBadge() {
  const osInfo = useOsInfo()

  if (!osInfo) return null

  const getIcon = () => {
    switch (osInfo.platform) {
      case 'windows':
        return <WindowsLogo className="size-3.5" weight="fill" />
      case 'macos':
        return <AppleLogo className="size-3.5" weight="fill" />
      case 'linux':
        return <LinuxLogo className="size-3.5" weight="fill" />
      default:
        return <Desktop className="size-3.5" weight="fill" />
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
      <span>{getLabel()}</span>
    </Badge>
  )
}
